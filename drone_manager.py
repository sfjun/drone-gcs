# drone_manager.py
import time
import threading
import math
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

    def set_connection_string(self, conn_str):
        self.conn_str = conn_str

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
                    self.callback("MODE", flight_mode)
                
                elif msg_type == 'GLOBAL_POSITION_INT':
                    lat = msg.lat / 1e7
                    lon = msg.lon / 1e7
                    alt = msg.relative_alt / 1000.0    # 이륙지 기준 상대 고도 (m)
                    msl_alt = msg.alt / 1000.0         # GPS 기준 해발 고도 (m)
                    hdg = msg.hdg / 100.0  
                    # 딕셔너리에 'msl_alt' 추가
                    self.callback("GPS", {"lat": lat, "lon": lon, "alt": alt, "msl_alt": msl_alt, "hdg": hdg})
                                        
                    self.current_lat = lat
                    self.current_lon = lon
                    self.current_alt = alt
                    
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

    def _send_velocity(self, vx, vy, vz, yaw_rate):
        if not self.master: return
        self.master.mav.set_position_target_local_ned_send(
            0, self.master.target_system, self.master.target_component,
            mavutil.mavlink.MAV_FRAME_BODY_NED,
            0x05C7, 0, 0, 0, vx, vy, vz, 0, 0, 0, 0, yaw_rate
        )

    def send_command(self, command_name):
        if not self.master:
            self.callback("LOG", "명령 불가: 드론이 연결되지 않았습니다.")
            return

        if command_name in ["BRAKE", "RC_STOP"]:
            self.cancel_mission = True

        if command_name == "ARM":
            self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
            time.sleep(0.5) 
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 21196, 0, 0, 0, 0, 0)
            self.callback("LOG", "명령 전송: 시동 (ARM)")
            
        elif command_name == "DISARM":
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 0, 0, 0, 0, 0, 0)
            self.callback("LOG", "명령 전송: 시동 끄기 (DISARM)")
            
        elif command_name == "TAKEOFF":
            self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, 0, 50)
            self.callback("LOG", "명령 전송: 안전 고도(50m)로 수직 상승 (TAKEOFF)")
            
        elif command_name == "LAND":
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_NAV_LAND, 0, 0, 0, 0, 0, 0, 0, 0)
            self.callback("LOG", "명령 전송: 착륙 (LAND)")

        elif command_name == "BRAKE":
            self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 17)
            self.callback("LOG", "🛑 긴급 정지: 진행 중인 비행을 취소하고 제동합니다.")
            
        elif command_name == "RTH":
            self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 6)
            self.callback("LOG", "명령 전송: 자동 복귀 (RTH 모드)")
            
        elif command_name == "RC_STOP":
            self._send_velocity(0, 0, 0, 0)
            self.callback("LOG", "🛑 제자리 정지: 호버링을 유지합니다.")

        elif command_name.startswith("FLY_TO:"):
            try:
                self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
                coords = command_name.split("FLY_TO:")[1].split(",")
                tgt_lat = float(coords[0])
                tgt_lon = float(coords[1])
                
                self.master.mav.set_position_target_global_int_send(
                    0, self.master.target_system, self.master.target_component,
                    mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT,
                    0b0000111111111000, 
                    int(tgt_lat * 1e7), int(tgt_lon * 1e7), 50.0,
                    0, 0, 0, 0, 0, 0, 0, 0
                )
                self.callback("LOG", f"명령 전송: 목표 지점으로 이동 ({tgt_lat:.5f}, {tgt_lon:.5f})")
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
                nonlocal waypoints  # 파이썬에서 외부 리스트 수정을 위한 선언
                try:
                    self.mission_thread_running = True
                    self.cancel_mission = False
                    
                    self.callback("LOG", "🚀 [관제 출동] 다중 경로 비행을 시작합니다.")
                    
                    is_flying = False
                    for attempt in range(10):
                        if not self.running or not self.connected or self.cancel_mission: return
                        
                        if getattr(self, 'current_alt', 0) > 2.0:
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
                        
                    # ✨ [핵심 수정 1] 공중에서 정지 후 재출동 시 수직 재상승 로직
                    if getattr(self, 'current_alt', 0) < 48.0:
                        self.callback("LOG", "🔄 안전 고도 확보를 위해 제자리 50m로 (재)상승합니다.")
                        c_lat = getattr(self, 'current_lat', None)
                        c_lon = getattr(self, 'current_lon', None)
                        if c_lat and c_lon:
                            self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
                            self.master.mav.set_position_target_global_int_send(
                                0, self.master.target_system, self.master.target_component,
                                mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT,
                                0b0000111111111000, 
                                int(c_lat * 1e7), int(c_lon * 1e7), 50.0,
                                0, 0, 0, 0, 0, 0, 0, 0
                            )
                            
                    self.callback("LOG", "⏳ 안전 고도(48m) 도달을 대기 중입니다...")
                    while getattr(self, 'current_alt', 0) < 48.0:
                        if not self.running or not self.connected or self.cancel_mission: return
                        time.sleep(1.0)
                        
                    self.callback("LOG", "✅ 고도 확보 완료! 경로 분석을 개시합니다.")
                    
                    # ✨ [핵심 수정 2] 백스텝 방지: 가장 가까운 최적 노드를 찾아 앞의 잉여 노드들을 잘라냄
                    c_lat = getattr(self, 'current_lat', None)
                    c_lon = getattr(self, 'current_lon', None)
                    
                    if c_lat and c_lon and len(waypoints) > 0:
                        min_dist = 999999.0
                        closest_idx = 0
                        for idx, (wp_lat, wp_lon) in enumerate(waypoints):
                            d = get_distance_metres(c_lat, c_lon, wp_lat, wp_lon)
                            if d < min_dist:
                                min_dist = d
                                closest_idx = idx
                                
                        if closest_idx > 0:
                            self.callback("LOG", f"✂️ 백스텝 방지: 뒤쳐진 {closest_idx}개 노드를 버리고 최적 경로에 합류합니다.")
                            waypoints = waypoints[closest_idx:]
                    
                    # 이제 정리된 최적 경로를 따라 비행 시작
                    for i, (tgt_lat, tgt_lon) in enumerate(waypoints):
                        if self.cancel_mission: break 
                                
                        self.callback("LOG", f"🎯 [{i+1}/{len(waypoints)}] 웨이포인트로 이동 중...")
                        
                        self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
                        self.master.mav.set_position_target_global_int_send(
                            0, self.master.target_system, self.master.target_component,
                            mavutil.mavlink.MAV_FRAME_GLOBAL_RELATIVE_ALT,
                            0b0000111111111000, 
                            int(tgt_lat * 1e7), int(tgt_lon * 1e7), 50.0,
                            0, 0, 0, 0, 0, 0, 0, 0
                        )
                        
                        while True:
                            if not self.running or not self.connected or self.cancel_mission: break
                            
                            cur_lat = getattr(self, 'current_lat', None)
                            cur_lon = getattr(self, 'current_lon', None)
                            
                            if get_distance_metres(cur_lat, cur_lon, tgt_lat, tgt_lon) < 3.0: 
                                break
                            time.sleep(1.0)
                            
                    if self.cancel_mission:
                        self.callback("LOG", "⚠️ 사용자에 의해 경로 비행이 취소되었습니다.")
                    else:
                        self.callback("LOG", "🏁 모든 웨이포인트 경로 비행을 완수했습니다!")
                    
                except Exception as e:
                    self.callback("LOG", f"❌ 자동 출동 오류: {e}")
                finally:
                    self.mission_thread_running = False

            import threading
            threading.Thread(target=run_guided_mission, daemon=True).start()

        elif command_name.startswith("RC_"):
            v_speed = 2.0  
            z_speed = 1.0  
            y_rate = 0.5   
            
            vx = vy = vz = yaw_rate = 0
            
            if command_name == "RC_PITCH_DOWN": vx = v_speed     
            elif command_name == "RC_PITCH_UP": vx = -v_speed    
            elif command_name == "RC_ROLL_LEFT": vy = -v_speed   
            elif command_name == "RC_ROLL_RIGHT": vy = v_speed   
            elif command_name == "RC_THROTTLE_UP": vz = -z_speed 
            elif command_name == "RC_THROTTLE_DOWN": vz = z_speed
            elif command_name == "RC_YAW_LEFT": yaw_rate = -y_rate 
            elif command_name == "RC_YAW_RIGHT": yaw_rate = y_rate 
            
            if vx != 0 or vy != 0 or vz != 0 or yaw_rate != 0:
                self.master.mav.set_mode_send(self.master.target_system, mavutil.mavlink.MAV_MODE_FLAG_CUSTOM_MODE_ENABLED, 4)
                self._send_velocity(vx, vy, vz, yaw_rate)

    def stop(self):
        self.running = False
        if self.master:
            try:
                self.master.close()
                self.master = None
            except Exception:
                pass