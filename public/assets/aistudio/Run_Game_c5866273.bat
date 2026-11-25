@echo off
title 3D PvP Sword Combat - YOLO Vision Server Runner
color 0A
echo ========================================================
echo   MENJALANKAN YOLOSERVER & 3D PVP SWORD COMBAT
echo ========================================================
echo.
echo Memeriksa dependensi Python...
python -m pip install -r requirements.txt >nul 2>&1
echo.
python yolo_server.py
pause
