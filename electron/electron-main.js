// Electron 主进程：把你服务器上的网站包装成 Windows 桌面 App
// 关键点 1：--test-type 让 --unsafely-treat-insecure-origin-as-secure 真正生效
// 关键点 2：before-input-event 监听 F12
const { app, BrowserWindow, Menu, Tray, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// ========== Chromium 启动参数（必须在 app ready 之前设置）==========
const APP_URL = 'http://124.223.86.48:3000';

// 关键！--test-type 是让 unsafely-treat-insecure-origin-as-secure 生效的前置条件
app.commandLine.appendSwitch('test-type');

// 关键！让 HTTP 源被视作安全源（核心中的核心）
app.commandLine.appendSwitch(
  'unsafely-treat-insecure-origin-as-secure',
  'http://124.223.86.48:3000,http://127.0.0.1,http://localhost'
);

// 禁用各种安全限制
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('allow-running-insecure-content');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('no-user-gesture-required');
app.commandLine.appendSwitch('no-sandbox');

// 媒体流相关
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('enable-media-stream');
app.commandLine.appendSwitch('disable-features', 'MediaDeviceIdSalting,HardwareMediaKeyHandling,IsolateOrigins,site-per-process,AutoplayPolicy,MediaStreamWebCodecsVideoDecoder');

// ========== 基础配置 ==========
const TARGET_URL = APP_URL + '/';
const isDev = !app.isPackaged;
const APP_NAME = '雅思学习空间';

// 单实例
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
      contextIsolation: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      autoplayPolicy: 'no-user-gesture-required',
      images: true,
      javascript: true,
      webgl: true,
      webaudio: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 菜单
  const template = [
    {
      label: '菜单',
      submenu: [
        { label: '返回首页', accelerator: 'Alt+Home', click: () => mainWindow && mainWindow.loadURL(TARGET_URL) },
        { label: '刷新', accelerator: 'F5', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        { label: '在浏览器中打开', click: () => shell.openExternal(TARGET_URL) },
        { label: '开发者工具', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.toggleDevTools() },
        { type: 'separator' },
        { label: '退出', accelerator: 'Ctrl+Q', click: () => quitApp() },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ========== 权限处理 ==========
  const ses = mainWindow.webContents.session;
  ses.setPermissionRequestHandler((webContents, permission, callback) => { callback(true); });
  try { ses.setPermissionCheckHandler(() => true); } catch (e) {}
  try { ses.setDevicePermissionHandler(() => true); } catch (e) {}

  // 页面加载完成后注入调试信息
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.executeJavaScript(`
      try {
        Object.defineProperty(window, 'isSecureContext', { value: true, writable: true, configurable: true });
      } catch(e) {}
      window.__ELECTRON_APP__ = true;
      true;
    `).catch(() => {});
  });

  mainWindow.loadURL(TARGET_URL);

  // F12 打开开发者工具（before-input-event 最可靠）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && !input.alt && !input.control && !input.meta) {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
    if ((input.control || input.meta) && input.shift && (input.key === 'I' || input.key === 'i')) {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
    if (input.key === 'F5' && !input.alt && !input.control && !input.meta) {
      event.preventDefault();
      mainWindow.reload();
    }
  });

  // 关闭按钮 → 最小化到托盘
  let willQuit = false;
  mainWindow.on('close', (e) => {
    if (!willQuit) {
      e.preventDefault();
      if (mainWindow) mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow._quitApp = () => { willQuit = true; app.quit(); };
}

// ========== 创建系统托盘 ==========
function createTray() {
  const iconPath = getIconPath('tray.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) image = nativeImage.createEmpty();

  tray = new Tray(image);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    { label: '打开 ' + APP_NAME, click: () => showMainWindow() },
    { label: '刷新', click: () => mainWindow && mainWindow.reload() },
    { type: 'separator' },
    { label: '开机自启', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => toggleAutoStart(item.checked) },
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

function toggleAutoStart(enable) {
  app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath });
}

function getIconPath(filename) {
  const devPath = path.join(__dirname, 'assets', filename);
  if (fs.existsSync(devPath)) return devPath;
  const buildPath = path.join(process.resourcesPath, 'app', 'assets', filename);
  if (fs.existsSync(buildPath)) return buildPath;
  return devPath;
}

// ========== 应用启动 ==========
app.whenReady().then(() => {
  const settings = app.getLoginItemSettings();
  if (!settings.wasOpenedAtLogin && !settings.openAtLogin) {
    app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
  }
  createWindow();
  createTray();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => showMainWindow());
app.on('window-all-closed', () => { if (process.platform === 'darwin') return; });
