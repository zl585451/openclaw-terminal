@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

set BACKEND=resources\nocturne_memory\backend
set OUTPUT=resources\nocturne_server

echo === Nocturne exe Build ===

:: Check Python 3.10+
where py >nul 2>&1 && (py -3 --version 2>nul | findstr "Python 3" >nul && set PY=py -3)
if not defined PY where python >nul 2>&1 && (python --version 2>nul | findstr "Python 3" >nul && set PY=python)
if not defined PY (
    echo Error: Python 3.10+ required. Install from python.org
    exit /b 1
)
echo Using Python: %PY%

cd %BACKEND%

echo.
echo [1/3] Installing dependencies...
%PY% -m pip install -r requirements.txt pyinstaller -q
if errorlevel 1 (
    echo pip install failed
    exit /b 1
)

if exist dist rmdir /s /q dist
if exist build rmdir /s /q build

echo.
echo [2/3] PyInstaller packaging...
%PY% -m PyInstaller nocturne_server.spec --noconfirm
if errorlevel 1 (
    echo PyInstaller failed
    exit /b 1
)

if exist "..\..\..\%OUTPUT%" rmdir /s /q "..\..\..\%OUTPUT%"
xcopy /e /i /y "dist\nocturne_server" "..\..\..\%OUTPUT%"

echo.
echo [3/3] Output: %OUTPUT%
for %%F in ("..\..\..\%OUTPUT%\nocturne_server.exe") do (
    if exist "%%F" echo exe size: %%~zF bytes
)

cd ..\..
echo.
echo Done. Run npm run electron:build:win to include this exe.
exit /b 0
