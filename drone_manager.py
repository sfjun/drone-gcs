# drone_manager.py
import time
import threading
import math
import requests
from pymavlink import mavutil

def get_distance_metres(lat1, lon1, lat2, lon2):
    """두 위경도 좌표 간의 거리를 미터(m) 단위로 계산"""
    if lat1 is None or lon1 is None: return 9999.0
    R = 6371e3
    rad_lat1 = math.radians(lat1)
    rad_lat2 = math.radians(lat2)
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = math.sin(d_lat/2) * math.sin(d_lat/2) + math.cos(rad_lat1) * math.cos(rad_lat2) * math.sin(d_lon/2) * math.sin(d_lon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

class DroneManager:
    def __init__(self, callback):
        self.running = False
        self.master = None
        self.connected = False
        self.conn_str = "udpin:0.0.0.0:14550" 
        self.callback = callback
        
        # [지형 고도 UI 표시용] 관련 변수 (비행 제어에는 개입하지 않음)
        self.last_terrain_lat = 0.0
        self.last_terrain_lon = 0.0
        self.current_terrain_alt = 25.0 
        self.home_terrain_alt = 25.0     
        self.home_terrain_set = False    
        self.is_fetching_terrain = False
        self.last_target_rel_alt = None 
        self.current_mode = ""           # 현재 비행 모드 실시간 추적용
        
        # [수평 이동 유지 보정] 활성 타겟 좌표
        self.active_target_lat = None
        self.active_target_lon = None

    def set_connection_string(self, conn_str):
        self.conn_str = conn_str

    def fetch_terrain_elevation(self, lat, lon):
        def _fetch():
            try:
                self.is_fetching_terrain = True
                api_key = "146276DC-08A0-4AEB-8B6B-191171FECE2A" 
                url = f"https://api.vworld.kr/req/data?service=data&request=GetFeature&data=DEM&geomFilter=POINT({lon} {lat})&key={api_key}&domain=http://127.0.0.1:8000"
                
                response = requests.get(url, timeout=3)
                
                if response.status_code == 200:
                    data = response.json()
                    features = data.get('response', {}).get('result', {}).get('featureCollection', {}).get('features', [])
                    if features and 'z' in features[0].get('properties', {}):
                        new_alt = float(features[0]['properties']['z'])
                    else:
                        raise Exception("고도 데이터 없음")
                else:
                    raise Exception("API 응답 오류")
                    
                self.current_terrain_alt = round(new_alt, 1)
                
                if not getattr(self, 'home_terrain_set', False):
                    self.home_terrain_alt = self.current_terrain_alt
                    self.home_terrain_set = True
                    self.callback("LOG", f"🌐 이륙지 지형 고도 기준점 확인(표시용): {self.home_terrain_alt}m")
                    
            except Exception as e:
                if not getattr(self, 'home_terrain_set', False): 
                    self.home_terrain_alt = self.current_terrain_alt
                    self.home_terrain_set = True
            finally:
                self.is_fetching_terrain = False
                
        threading.Thread(target=_fetch, daemon=True).start()

    def _adjust_target_altitude(self):
        """지형 해발고도 무시 -> 순수 상대고도로만 비행하므로 고도 강제 변경 안 함"""
        pass

    def start(self):
        if not self.running:
            self.running = True
            threading.Thread(target=self.run, daemon=True).start()

    def run(self):
        self.connected = False
        self.callback("LOG", f"[{self.conn_str}] 드론 MAVLink 연결 시도 중...")
        
        try:
            if "," in self.conn_str:
                port, baud = self.conn_str.split(",")
                self.master = mavutil.mavlink_connection(port, baud=int(baud))
            else:
                self.master = mavutil.mavlink_connection(self.conn_str, baud=57600)
            
            hb = self.master.wait_heartbeat(timeout=10)
                        
            if hb is None:
                raise Exception("10초 이내에 Heartbeat 응답 없음")

            self.connected = True
            self.callback("STATUS", True)
            self.callback("LOG", "🟢 MAVLink 통신 연결 성공!")

            self.initial_zeroing_done = False

            while self.running and self.connected:
                if getattr(self, 'is_uploading', False):
                    time.sleep(0.05)
                    continue
                msg = self.master.recv_match(blocking=True, timeout=0.1)
                
                if not msg:
                    continue
                    
                msg_type = msg.get_type()
                
                if msg_type == 'BAD_DATA':
                    continue
                    
                if msg_type == 'HEARTBEAT':
                    self.callback("STATUS", True)
                    flight_mode = mavutil.mode_string_v10(msg)
                    self.current_mode = flight_mode
                    self.callback("MODE", flight_mode)

                elif msg_type == 'GPS_RAW_INT':
                    self.callback("GPS_SAT", msg.satellites_visible)
                
                elif msg_type == 'GLOBAL_POSITION_INT':
                    lat = msg.lat / 1e7
                    lon = msg.lon / 1e7
                    alt = msg.relative_alt / 1000.0   
                    hdg = msg.hdg / 100.0  
                    
                    self.current_lat = lat
                    self.current_lon = lon
                    self.current_alt = alt
                    
                    if lat != 0.0 and lon != 0.0:
                        if getattr(self, 'last_terrain_lat', 0.0) == 0.0:
                            self.last_terrain_lat = lat
                            self.last_terrain_lon = lon
                            self.fetch_terrain_elevation(lat, lon)
                        else:
                            dist = get_distance_metres(self.last_terrain_lat, self.last_terrain_lon, lat, lon)
                            if dist >= 30.0 and not getattr(self, 'is_fetching_terrain', False):
                                self.last_terrain_lat = lat
                                self.last_terrain_lon = lon
                                self.fetch_terrain_elevation(lat, lon)
                    
                    current_terrain = getattr(self, 'current_terrain_alt', 25.0)
                    home_terrain = getattr(self, 'home_terrain_alt', 25.0)
                    drone_msl = home_terrain + alt

                    self.callback("GPS", {
                        "lat": lat, 
                        "lon": lon, 
                        "alt": alt, 
                        "terrain_msl": current_terrain,
                        "drone_msl": drone_msl,
                        "hdg": hdg
                    })
                    
                    if not getattr(self, 'home_saved', False) and lat != 0.0 and lon != 0.0:
                        self.home_saved = True
                        self.callback("LOG", "🔧 GPS 수신 완료: 홈 위치 저장을 위해 GUIDED 모드로 자동 전환합니다.")
                        self.master.mav.set_mode_send(
                            self.master.target_system,
                            mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED,
                            4 
                        )
                
                elif msg_type == 'SYS_STATUS':
                    if msg.battery_remaining >= 0:
                        self.callback("BATTERY", msg.battery_remaining)
                    
                    sensors_health = msg.onboard_control_sensors_health
                    is_ready_to_arm = bool(sensors_health & 4194304)
                    is_armed = self.master.motors_armed()
                    
                    current_sys_status = "READY" if (is_ready_to_arm or is_armed) else "CAUTION"
                    self.callback("EKF_STATUS", current_sys_status)
                    
        except Exception as e:
            self.callback("LOG", f"❌ 연결 실패: {str(e)}")
            self.callback("STATUS", False)
            self.connected = False

    def _ensure_guided_mode(self):
        """현재 GUIDED 모드가 아니면 GUIDED로 전환 후 명령이 씹히지 않게 0.1초 대기"""
        if getattr(self, 'current_mode', '') != "GUIDED":
            self.master.mav.set_mode_send(
                self.master.target_system, 
                mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 
                4
            )
            self.current_mode = "GUIDED"
            time.sleep(0.1)

    def _send_velocity(self, vx, vy, vz, yaw_rate):
        if not self.master: return
        # MAV_FRAME_BODY_OFFSET_NED (9): 기수 방향을 따르되 지면과 수평으로 이동 (고도 치솟음 방지)
        # 0b0000010111000111 (0x05C7): 위치(X,Y,Z), 가속도(Ax,Ay,Az), 절대 Yaw 무시 -> 속도(Vx,Vy,Vz)와 Yaw Rate만 사용
        self.master.mav.set_position_target_local_ned_send(
            0, self.master.target_system, self.master.target_component,
            mavutil.mavlink.MAV_FRAME_BODY_OFFSET_NED,
            0b0000010111000111, 
            0, 0, 0, float(vx), float(vy), float(vz), 0, 0, 0, 0, float(yaw_rate)
        )

    def send_command(self, command_name):
        if not self.master:
            self.callback("LOG", "명령 불가: 드론이 연결되지 않았습니다.")
            return

        if command_name in ["BRAKE", "RC_STOP"]:
            self.cancel_mission = True
            self.active_target_lat = None
            self.active_target_lon = None

        if command_name.startswith("JOY_MOVE:"):
            try:
                parts = command_name.split("JOY_MOVE:")[1].split(",")
                vx, vy, vz, yaw_rate = map(float, parts)
                self.active_target_lat = None
                self.active_target_lon = None
                self._ensure_guided_mode()
                self._send_velocity(vx, vy, vz, yaw_rate)
            except Exception as e:
                pass

        elif command_name == "GUIDED":
            self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
            self.current_mode = "GUIDED"
            self.callback("LOG", "명령 전송: GUIDED 모드 전환")

        elif command_name == "ARM":
            if getattr(self, 'current_lat', 0.0) != 0.0:
                self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
                self.current_mode = "GUIDED"
                time.sleep(0.5) 
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 21196, 0, 0, 0, 0, 0)
            self.callback("LOG", "명령 전송: 시동 (ARM)")
            
        elif command_name == "DISARM":
            self.cancel_mission = True
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 0, 0, 0, 0, 0, 0)
            self.callback("LOG", "명령 전송: 시동 끄기 (DISARM)")

        elif command_name == "EMERGENCY_KILL":
            self.cancel_mission = True
            self.active_target_lat = None
            self.active_target_lon = None
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 21196, 0, 0, 0, 0, 0)
            self.callback("LOG", "🚨 [비상 정지] 모터 강제 차단(KILL) 명령 전송!")
            
        elif command_name == "TAKEOFF":
            self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
            self.current_mode = "GUIDED"
            time.sleep(0.5) 
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, 0, 3.0)
            self.callback("LOG", "명령 전송: 안전 고도(3m)로 수직 상승 (TAKEOFF)")
            
        elif command_name == "LAND":
            self.cancel_mission = True
            self.active_target_lat = None
            self.active_target_lon = None
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_NAV_LAND, 0, 0, 0, 0, 0, 0, 0, 0)
            self.callback("LOG", "명령 전송: 착륙 (LAND)")

        elif command_name == "BRAKE":
            self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 17)
            self.current_mode = "BRAKE"
            self.callback("LOG", "🛑 긴급 정지: 진행 중인 비행을 취소하고 제동합니다.")
            
        elif command_name == "RTH":
            self.cancel_mission = True
            self.active_target_lat = None
            self.active_target_lon = None
            self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 6)
            self.current_mode = "RTL"
            self.callback("LOG", "명령 전송: 자동 복귀 (RTH 모드)")
            
        elif command_name == "RC_STOP":
            self._ensure_guided_mode()
            self._send_velocity(0.0, 0.0, 0.0, 0.0)
            self.callback("LOG", "🛑 제자리 정지: 호버링을 유지합니다.")

        elif command_name.startswith("FLY_TO:"):
            try:
                self._ensure_guided_mode()
                coords = command_name.split("FLY_TO:")[1].split(",")
                tgt_lat = float(coords[0])
                tgt_lon = float(coords[1])
                
                self.active_target_lat = tgt_lat
                self.active_target_lon = tgt_lon
                
                # 지면 해발고도 무시: 순수 상대고도 3.0m 고정
                target_rel_alt = 3.0

                self.master.mav.set_position_target_global_int_send(
                    0, self.master.target_system, self.master.target_component,
                    mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT,
                    0b110111111000, 
                    int(tgt_lat * 1e7), int(tgt_lon * 1e7), target_rel_alt,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
                self.callback("LOG", f"명령 전송: 목표 지점으로 이동 ({tgt_lat:.5f}, {tgt_lon:.5f} / 상대고도 {target_rel_alt:.1f}m)")
            except Exception as e:
                self.callback("LOG", f"목표 지점 이동 오류: {e}")

        elif command_name.startswith("MISSION:"):
            if getattr(self, 'mission_thread_running', False):
                self.callback("LOG", "⏳ 진행 중인 비행이 있습니다. 정지(BRAKE) 후 새 임무를 할당하세요.")
                return

            coords_str = command_name.split("MISSION:")[1].split("|")
            waypoints = []
            for pt in coords_str:
                lat, lon = map(float, pt.split(","))
                waypoints.append((lat, lon))

            def run_guided_mission():
                nonlocal waypoints  
                try:
                    self.mission_thread_running = True
                    self.cancel_mission = False
                    
                    self.callback("LOG", "🚀 [관제 출동] 다중 경로 비행을 시작합니다.")
                    
                    is_flying = False
                    for attempt in range(10):
                        if not self.running or not self.connected or self.cancel_mission: return
                        
                        if getattr(self, 'current_alt', 0) > 1.5:
                            is_flying = True
                            break
                            
                        self.callback("LOG", f"⚙️ 기체 이륙 시도 중... (시도 {attempt+1}/10)")
                        self.send_command("ARM")
                        time.sleep(2.0)
                        self.send_command("TAKEOFF")
                        time.sleep(4.0)
                        
                    if not is_flying:
                        self.callback("LOG", "❌ 이륙 실패: 기체가 고도를 확보하지 못했습니다.")
                        return
                        
                    if getattr(self, 'current_alt', 0) < 2.5:
                        self.callback("LOG", "🔄 안전 고도 확보를 위해 제자리 3m로 (재)상승합니다.")
                        c_lat = getattr(self, 'current_lat', None)
                        c_lon = getattr(self, 'current_lon', None)
                        if c_lat and c_lon:
                            self._ensure_guided_mode()
                            self.master.mav.set_position_target_global_int_send(
                                0, self.master.target_system, self.master.target_component,
                                mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT,
                                0b110111111000, 
                                int(c_lat * 1e7), int(c_lon * 1e7), 3.0,
                                0, 0, 0, 0, 0, 0, 0, 0
                            )
                            
                    self.callback("LOG", "⏳ 안전 고도(2.5m) 도달을 대기 중입니다...")
                    while getattr(self, 'current_alt', 0) < 2.5:
                        if not self.running or not self.connected or self.cancel_mission: return
                        time.sleep(1.0)
                        
                    self.callback("LOG", "✅ 고도 확보 완료! 경로 분석을 개시합니다.")
                    
                    for i, (tgt_lat, tgt_lon) in enumerate(waypoints):
                        if self.cancel_mission: break 
                                
                        self.callback("LOG", f"🎯 [{i+1}/{len(waypoints)}] 웨이포인트로 이동 중...")
                        
                        self.active_target_lat = tgt_lat
                        self.active_target_lon = tgt_lon
                        
                        target_rel_alt = 3.0
                        self.last_target_rel_alt = target_rel_alt
                        
                        self._ensure_guided_mode()
                        self.master.mav.set_position_target_global_int_send(
                            0, self.master.target_system, self.master.target_component,
                            mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT,
                            0b110111111000, 
                            int(tgt_lat * 1e7), int(tgt_lon * 1e7), target_rel_alt,
                            0, 0, 0, 0, 0, 0, 0, 0
                        )
                        
                        while True:
                            if not self.running or not self.connected or self.cancel_mission: break
                            
                            cur_lat = getattr(self, 'current_lat', None)
                            cur_lon = getattr(self, 'current_lon', None)
                            
                            if get_distance_metres(cur_lat, cur_lon, tgt_lat, tgt_lon) < 5.0:
                                break
                            
                            time.sleep(0.5)
                            
                    if self.cancel_mission:
                        self.callback("LOG", "⚠️ 사용자에 의해 경로 비행이 취소되었습니다.")
                    else:
                        self.callback("LOG", "🏁 모든 웨이포인트 경로 비행을 완수했습니다!")
                        
                    self.active_target_lat = None
                    self.active_target_lon = None
                    
                except Exception as e:
                    self.callback("LOG", f"❌ 자동 출동 오류: {e}")
                finally:
                    self.mission_thread_running = False

            threading.Thread(target=run_guided_mission, daemon=True).start()

        elif command_name.startswith("RC_"):
            v_speed = 2.0  
            z_speed = 1.0  
            y_rate = 0.5   
            
            vx = vy = vz = yaw_rate = 0.0
            action_desc = ""
            
            if command_name == "RC_PITCH_DOWN": 
                vx = v_speed
                action_desc = "전진 (▲)"
            elif command_name == "RC_PITCH_UP": 
                vx = -v_speed
                action_desc = "후진 (▼)"
            elif command_name == "RC_ROLL_LEFT": 
                vy = -v_speed
                action_desc = "좌측 이동 (◀)"
            elif command_name == "RC_ROLL_RIGHT": 
                vy = v_speed
                action_desc = "우측 이동 (▶)"
            elif command_name == "RC_THROTTLE_UP": 
                vz = -z_speed
                action_desc = "고도 상승 (▲)"
            elif command_name == "RC_THROTTLE_DOWN": 
                vz = z_speed
                action_desc = "고도 하강 (▼)"
            elif command_name == "RC_YAW_LEFT": 
                yaw_rate = -y_rate
                action_desc = "기수 좌회전 (◀)"
            elif command_name == "RC_YAW_RIGHT": 
                yaw_rate = y_rate
                action_desc = "기수 우회전 (▶)"
            
            if vx != 0.0 or vy != 0.0 or vz != 0.0 or yaw_rate != 0.0:
                self.cancel_mission = True
                self.active_target_lat = None
                self.active_target_lon = None
                self._ensure_guided_mode()
                self._send_velocity(vx, vy, vz, yaw_rate)
                self.callback("LOG", f"🕹️ 조종패드 입력: {action_desc}")

    def stop(self):
        self.running = False
        if self.master:
            try:
                self.master.close()
                self.master = None
            except Exception:
                pass