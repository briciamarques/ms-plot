@echo off
cd /d "%~dp0"
python scripts\start_pdms.py
if errorlevel 1 pause
