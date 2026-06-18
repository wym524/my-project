# 华硕风格Windows计算器

一个使用Python和Tkinter开发的计算器应用，界面风格类似于华硕/Windows自带的计算器。

## 功能特点

### 标准模式
- ✅ 基本算术运算：加(+)、减(-)、乘(×)、除(÷)
- ✅ 小数点支持
- ✅ 正负号切换 (±)
- ✅ 删除 (⌫) 和清除 (C/CE)
- ✅ 键盘输入支持

### 科学模式
- ✅ 三角函数：sin, cos, tan, asin, acos, atan
- ✅ 对数函数：log(10为底), ln(自然对数)
- ✅ 幂运算：x², x³, xʸ, eˣ, 10ˣ
- ✅ 根运算：√x(平方根), ∛x(立方根), ¹/x(倒数)
- ✅ 其他：绝对值|x|, π, e, n!(阶乘), Mod(取模), Rand(随机数)
- ✅ 内存功能：MC(清除内存), MR(读取内存), M+(加到内存), M-(从内存减去)
- ✅ 角度/弧度切换 (deg)

## 界面预览

深色主题设计，包含标准计算器和科学计算器两种模式，可通过顶部按钮切换。

## Windows系统使用方法

### 方法一：使用打包脚本（推荐）

1. 确保已安装Python 3.x
   - 下载地址：https://www.python.org/downloads/

2. 下载本项目文件到本地

3. 双击运行 `pack_for_windows.bat`

4. 等待打包完成，EXE文件将生成在 `dist\Calculator.exe`

5. 直接双击 `Calculator.exe` 即可运行

### 方法二：手动打包

1. 安装Python 3.x

2. 安装PyInstaller：
   ```bash
   pip install pyinstaller
   ```

3. 打包应用：
   ```bash
   pyinstaller --onefile --windowed --name Calculator calculator.py
   ```

4. EXE文件位置：`dist\Calculator.exe`

## Linux/Mac系统使用方法

### 运行源代码
```bash
python3 calculator.py
```

### 打包为可执行文件
```bash
pip install pyinstaller
pyinstaller --onefile --name Calculator calculator.py
./dist/Calculator
```

## 快捷键支持

| 按键 | 功能 |
|------|------|
| 0-9 | 数字输入 |
| . | 小数点 |
| + | 加法 |
| - | 减法 |
| * | 乘法 |
| / | 除法 |
| = 或 Enter | 计算结果 |
| C | 清除全部 |
| Backspace | 删除最后一个数字 |
| Escape | 清除全部 |

## 文件结构

```
/workspace/
├── calculator.py           # 主程序源代码
├── pack_for_windows.bat    # Windows打包脚本
└── dist/                   # 打包输出目录
    └── Calculator          # Linux可执行文件
    └── Calculator.exe      # Windows可执行文件(需在Windows打包)
```

## 系统要求

- Windows 7/8/10/11 或 Linux/Mac
- Python 3.6+ (运行源代码时需要)
- 无需额外依赖库（仅使用Python内置库）

## 技术实现

- **GUI框架**: Tkinter (Python内置)
- **样式主题**: ttk (Themed Tkinter)
- **数学库**: math (Python内置)
- **打包工具**: PyInstaller

## 注意事项

1. 打包后的EXE文件不包含Python运行时，可直接在没有Python的机器上运行
2. 科学模式下的三角函数默认使用角度制，可通过deg按钮切换为弧度制
3. 计算器支持最多20位数字显示

## 许可

MIT License - 可自由使用、修改和分发
