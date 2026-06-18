@echo off
echo ========================================
echo    华硕计算器 - Windows打包脚本
echo ========================================
echo.

echo 正在检查Python环境...
python --version >nul 2>&1
if errorlevel 1 (
    echo 错误: 未安装Python
    echo 请从 https://www.python.org/downloads/ 下载并安装Python
    pause
    exit /b 1
)

echo 正在安装PyInstaller...
pip install pyinstaller

echo.
echo 正在打包计算器...
echo 这可能需要几分钟时间，请耐心等待...
echo.

pyinstaller --onefile --windowed --name Calculator --add-data "calculator.py;." calculator.py

echo.
echo ========================================
echo    打包完成！
echo ========================================
echo.
echo EXE文件位置: dist\Calculator.exe
echo.
echo 是否删除打包过程中产生的临时文件? (Y/N)
set /p choice=
if /i "%choice%"=="Y" rmdir /s /q build __pycache__ 2>nul
if /i "%choice%"=="Y" del calculator.spec 2>nul

echo.
echo 按任意键退出...
pause >nul