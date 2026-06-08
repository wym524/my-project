// Electron 主进程：把你服务器上的网站包装成 Windows 桌面 App
// 功能：开机自启 + 关闭最小化到托盘 + 摄像头权限自动授予
const { app, BrowserWindow, Menu, Tray, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== 基础配置 ==========
const TARGET_URL = 'http://124.223.86.48:3000/';
const isDev = !app.isPackaged;
const APP_NAME = '雅思学习空间';

// 单实例：只允许运行一个窗口
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) { app.quit(); }

let mainWindow = null;
let tray = null;

// ========== 创建主窗口 ==========
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#f5f7fa',
    title: APP_NAME,
    icon: getIconPath('icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // 摄像头权限自动通过（用户首次使用时会弹出系统授权）
      webSecurity: true,
    },
  });

  // 菜单：刷新 / 返回首页 / 在浏览器打开 / 退出
  const template = [
    {
      label: '菜单',
      submenu: [
        { label: '返回首页', accelerator: 'Alt+Home', click: () => mainWindow && mainWindow.loadURL(TARGET_URL) },
        { label: '刷新', accelerator: 'F5', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        { label: '在浏览器中打开', click: () => shell.openExternal(TARGET_URL) },
        { label: '退出', accelerator: 'Ctrl+Q', click: () => quitApp() },
      ],
    },
  ];
  if (isDev) {
    template[0].submenu.push({ label: '开发者工具', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.toggleDevTools() });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ✅ 自动授予摄像头/麦克风权限（应用内）
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    // media: videoCamera / audioCapture —— 全部允许
    if (permission === 'media' || permission === 'videoCapture' || permission === 'audioCapture' || permission === 'camera' || permission === 'microphone') {
      return callback(true);
    }
    callback(false);
  });

  // 兼容新版 Electron（不同版本字段名不同）
  try {
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
      if (['media', 'videoCapture', 'audioCapture', 'camera', 'microphone'].includes(permission)) return true;
      return true;
    });
  } catch (e) {}

  mainWindow.loadURL(TARGET_URL);

  // ✅ 关闭按钮 → 最小化到托盘（不退出）
  let willQuit = false;
  mainWindow.on('close', (e) => {
    if (!willQuit) {
      e.preventDefault();
      if (mainWindow) mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  // 公开给托盘菜单用的退出函数
  mainWindow._quitApp = () => { willQuit = true; app.quit(); };
}

// ========== 创建系统托盘 ==========
function createTray() {
  const iconPath = getIconPath('tray.png');
  let image;
  try {
    image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) image = nativeImage.createEmpty();
  } catch (e) {
    image = nativeImage.createEmpty();
  }

  tray = new Tray(image);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 ' + APP_NAME, click: () => showMainWindow() },
    { label: '刷新', click: () => mainWindow && mainWindow.reload() },
    { type: 'separator' },
    { label: '开机自启', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin, click: (item) => toggleAutoStart(item.checked) },
    { type: 'separator' },
    { label: '退出', click: () => quitApp() },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) mainWindow.hide();
    else showMainWindow();
  });
}

function showMainWindow() {
  if (!mainWindow) return createWindow();
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function quitApp() {
  if (mainWindow && mainWindow._quitApp) mainWindow._quitApp();
  else app.quit();
}

// ========== 开机自启开关 ==========
function toggleAutoStart(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: process.execPath,
    args: isDev ? [] : ['--opened-as-hidden'],
  });
}

// ========== 图标路径（开发/打包都兼容） ==========
function getIconPath(filename) {
  const devPath = path.join(__dirname, 'assets', filename);
  if (fs.existsSync(devPath)) return devPath;
  // 打包后 resources/app/assets/xxx
  const buildPath = path.join(process.resourcesPath, 'app', 'assets', filename);
  if (fs.existsSync(buildPath)) return buildPath;
  return devPath; // 不存在则返回占位路径，Electron 会用默认图标
}

// ========== 应用启动 ==========
app.whenReady().then(() => {
  // 安装后默认开启「开机自启」（首次运行时开启）
  const settings = app.getLoginItemSettings();
  if (!settings.wasOpenedAtLogin && !settings.openAtLogin) {
    // 默认开启（如果你不想默认开启，删除这两行即可）
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  }

  createWindow();
  createTray();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => showMainWindow());

app.on('window-all-closed', () => {
  // 不要在所有窗口关闭时退出 app —— 托盘图标仍在
  if (process.platform === 'darwin') return;
});
