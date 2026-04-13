@echo off
chcp 65001 >nul
echo.
echo  ╔══════════════════════════════════════════════╗
echo  ║   TaskFlow v8 — Iniciar                     ║
echo  ║   Gemini AI + Google OAuth + Segurança      ║
echo  ╚══════════════════════════════════════════════╝
echo.

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] Python nao encontrado!
    echo  Instala em: https://www.python.org/downloads/
    pause & exit /b 1
)

for /f "tokens=*" %%i in ('python --version 2^>^&1') do echo  [OK] %%i encontrado

echo  [..] A instalar dependencias...
pip install flask cryptography --quiet --disable-pip-version-check
echo  [OK] Dependencias instaladas!

echo.
echo  ══════════════════════════════════════════════
echo  Abre o browser em: http://127.0.0.1:5000
echo.
echo  Contas demo:
echo    Admin   — davi.asafe385@gmail.com / admin123
echo    Manager — bruno@taskflow.io / manager123
echo    Member  — carla@taskflow.io / membro123
echo.
echo  Para parar: Ctrl+C ou fecha esta janela
echo  ══════════════════════════════════════════════
echo.

cd /d "%~dp0"
python app.py
pause
