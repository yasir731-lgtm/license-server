@echo off
title Hassan AutoFarm - License Authorization Server
cd /d "%~dp0"
echo ======================================================================
echo           HASSAN AUTOFARM - REMOTE LICENSE WEB SERVER
echo ======================================================================
echo Starting Web Admin Portal on http://127.0.0.1:8000 ...
echo Default Login: admin / Hassan@AutoFarm2026!
echo.
python app.py
pause
