# drone_manager.py
import time
import threading
from pymavlink import mavutil

class DroneManager:
    def __init__(self, callback):
        self.running = False
        self.master = None
        self.connected = False
        self.conn_str = "udp:0.0.0.0:14560"
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

            while self.running and self.connected:
                # blocking=True 와 timeout을 주어 메시지가 밀리는 현상(딜레이) 완벽 방지
                msg = self.master.recv_match(blocking=True, timeout=0.1)
                
                if not msg:
                    continue
                    
                msg_type = msg.get_type()
                
                # 깨진 데이터는 무시
                if msg_type == 'BAD_DATA':
                    continue
                    
                if msg_type == 'HEARTBEAT':
                    self.callback("STATUS", True)
                    flight_mode = mavutil.mode_string_v10(msg)
                    self.callback("MODE", flight_mode)
                
                elif msg_type == 'GLOBAL_POSITION_INT':
                    lat = msg.lat / 1e7
                    lon = msg.lon / 1e7
                    alt = msg.relative_alt / 1000.0
                    self.callback("GPS", {"lat": lat, "lon": lon, "alt": alt})
                
                # 👇 [새로 추가된 부분] 드론의 배터리 상태 읽기
                elif msg_type == 'SYS_STATUS':
                    # battery_remaining은 0~100 사이의 % 값입니다 (-1은 센서 없음/측정 불가)
                    if msg.battery_remaining >= 0:
                        self.callback("BATTERY", msg.battery_remaining)
                    
        except Exception as e:
            self.callback("LOG", f"❌ 연결 실패: {str(e)}")
            self.callback("STATUS", False)
            self.connected = False

    def send_command(self, command_name):
        if not self.master:
            self.callback("LOG", "명령 불가: 드론이 연결되지 않았습니다.")
            return

        if command_name == "ARM":
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 1, 0, 0, 0, 0, 0, 0)
            self.callback("LOG", "명령 전송: 시동 (ARM)")
        elif command_name == "DISARM":
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM, 0, 0, 0, 0, 0, 0, 0, 0)
            self.callback("LOG", "명령 전송: 시동 끄기 (DISARM)")
        elif command_name == "TAKEOFF":
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_NAV_TAKEOFF, 0, 0, 0, 0, 0, 0, 0, 10)
            self.callback("LOG", "명령 전송: 이륙 (TAKEOFF 10m)")
        elif command_name == "LAND":
            self.master.mav.command_long_send(self.master.target_system, self.master.target_component, mavutil.mavlink.MAV_CMD_NAV_LAND, 0, 0, 0, 0, 0, 0, 0, 0)
            self.callback("LOG", "명령 전송: 착륙 (LAND)")

    def stop(self):
        self.running = False
        if self.master:
            try:
                self.master.close()
                self.master = None
            except Exception:
                pass