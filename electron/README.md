# 雅思学习空间 · Windows 桌面版 打包说明

> 功能：把你服务器上的网站（http://124.223.86.48:3000/）包装成一个 Windows 桌面软件，数据仍存在服务器上。

## 📦 目录结构

```
electron/
├── electron-main.js      # 主进程（必须）
├── preload.js           # 预加载脚本（空文件，必须存在）
├── package.json         # 依赖与打包配置
├── assets/
│   └── icon.png         # 应用图标（建议 256×256 PNG）
└── README.md
```

## 🛠️ 在 Windows 上打包步骤（一次操作，约 10 分钟）

### 1. 安装 Node.js
打开 https://nodejs.org/ ，下载 **LTS 版本（例如 18 或 20），双击安装，一路 Next。

安装完成后在 PowerShell 中确认：
```powershell
node -v   # 应输出 v18.x.x 或 v20.x.x
npm -v
```

### 2. 准备本文件夹
把整个 `electron/` 文件夹拷贝到你的 Windows 电脑上任意目录，例如 `C:\ielts-app\electron\

### 3. 安装依赖

打开 PowerShell，进入该目录：
```powershell
cd C:\ielts-app\electron
npm install
```
> 这一步会下载 Electron 与 electron-builder，约 5 分钟（首次要下载 ~200MB 左右，耐心等）。

### 4. 先本地跑一下看效果
```powershell
npm start
```
会弹出一个窗口，里面是你的学习空间，确认能正常打开登录。

### 5. 打包成安装包
```powershell
npm run dist:win
```
大约 2-5 分钟后，在 `dist/` 目录里会出现：
```
雅思学习空间-Setup-1.0.0.exe
```
这就是用户可以下载的安装包了！双击它就能像普通软件一样安装到 Windows。

## 🎨 换个图标（可选）

把一张 256×256 的 PNG 图标放到 `assets/icon.png` 即可。
如果没有，Electron-builder 会使用默认图标。

## 🚢 发布给用户

把生成的 `雅思学习空间-Setup-1.0.0.exe 上传到你网站、百度网盘、微信传给学生...任何方式让用户下载都可以。

## 🔧 想改内容怎么办？

- 换服务器地址 → 打开 `electron-main.js`，找到第 7 行：
  ```js
  const TARGET_URL = 'http://124.223.86.48:3000/';
  ```
  把它换成你的新地址即可。

- 想改软件名称 → 打开 `package.json` 的 `productName` 字段。

- 想改窗口大小 → `electron-main.js` 中的 `width` / `height`。

## ⚠️ 注意事项

1. **必须在 Windows 电脑上打包才能生成 `.exe`（Mac 打包 Mac 的）。
2. 用户安装后第一次打开会弹「Windows Defender 提示未知发布者」，这是正常的。
   - 花几百块买个代码签名证书就能解决，或者用户点击「仍要运行」即可。
3. 用户运行软件必须能上网（因为数据在服务器上）。
4. 打包的安装包大约 **80-120 MB（Electron 自带 Chromium，这是正常大小）。
