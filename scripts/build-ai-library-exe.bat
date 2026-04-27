@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0.."

set BACKEND=resources\ai_library
set OUTPUT=resources\ai_library_server
set BUILD_VENV=.build-venv

echo === AI.library exe Build ===

where py >nul 2>&1 && (py -3 --version 2>nul | findstr "Python 3" >nul && set PY=py -3)
if not defined PY where python >nul 2>&1 && (python --version 2>nul | findstr "Python 3" >nul && set PY=python)
if not defined PY (
    echo Error: Python 3.10+ required. Install from python.org
    exit /b 1
)
echo Using Python: %PY%

cd %BACKEND%

echo.
echo [1/4] Preparing isolated build venv...
if not exist "%BUILD_VENV%\Scripts\python.exe" (
    %PY% -m venv %BUILD_VENV%
    if errorlevel 1 (
        echo venv creation failed
        exit /b 1
    )
)
set VPY=%CD%\%BUILD_VENV%\Scripts\python.exe

echo.
echo [2/4] Installing dependencies...
"%VPY%" -m pip install --upgrade pip -q
if errorlevel 1 (
    echo pip upgrade failed
    exit /b 1
)
"%VPY%" -m pip install -r requirements.txt pyinstaller -q
if errorlevel 1 (
    echo pip install failed
    exit /b 1
)

if exist dist rmdir /s /q dist
if exist build rmdir /s /q build

echo.
echo [3/4] PyInstaller packaging...
"%VPY%" -m PyInstaller ai_library_server.spec --noconfirm
if errorlevel 1 (
    echo PyInstaller failed
    exit /b 1
)

if exist "..\..\%OUTPUT%" rmdir /s /q "..\..\%OUTPUT%"
xcopy /e /i /y "dist\ai_library_server" "..\..\%OUTPUT%"

echo.
echo [4/4] Output: %OUTPUT%
for %%F in ("..\..\%OUTPUT%\ai_library_server.exe") do (
    if exist "%%F" echo exe size: %%~zF bytes
)

cd ..\..
echo.
echo Done. Run npm run electron:build:win to include this exe.
exit /b 0
