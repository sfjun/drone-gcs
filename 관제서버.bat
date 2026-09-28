@echo off
title 소방 관제 서버
echo =======================================
echo  소방 관제 시스템 서버를 시작합니다...
echo =======================================

:: 현재 파일이 있는 폴더로 이동
cd /d "%~dp0"

:: 가상환경(venv) 활성화 (이전 에러 로그 경로 반영)
if exist "..\venv\Scripts\activate.bat" (
    call "..\venv\Scripts\activate.bat"
) else if exist "venv\Scripts\activate.bat" (
    call "venv\Scripts\activate.bat"
)

:: 서버 실행
python main.py

pause