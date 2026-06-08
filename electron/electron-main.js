// Electron 主进程：仅作为一个窗口外壳，页面内容直接加载服务器上的网站
// 数据仍存在你的腾讯云服务器上，本文件只是把浏览器包装成桌面 App
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

// 你服务器上的地址，打包成软件后直接打开这里
const TARGET_URL = 'http://124.223.86.48:3000/';

// 开发模式下可以在控制台按 F12 打开 DevTools
const isDev = !app.isPackaged;

// 单实例：只允许运行一个窗口
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 680,
    backgroundColor: '#f5f7fa',
    title: '雅思学习空间',
    icon: path.join(__dirname, 'assets', 'icon.png'), // 打包时会用到
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // 菜单简化：保留基本刷新/打印/退出，外部链接用系统浏览器打开
  const template = [
    {
      label: '菜单',
      submenu: [
        { label: '返回首页', accelerator: 'Alt+Home', click: () => mainWindow && mainWindow.loadURL(TARGET_URL) },
        { label: '刷新', accelerator: 'F5', click: () => mainWindow && mainWindow.reload() },
        { type: 'separator' },
        { label: '在浏览器中打开', click: () => shell.openExternal(TARGET_URL) },
        { label: '退出', accelerator: 'Ctrl+Q', click: () => app.quit() },
      ],
    },
  ];

  if (isDev) {
    template[0].submenu.push({ label: '开发者工具', accelerator: 'F12', click: () => mainWindow && mainWindow.webContents.toggleDevTools() });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  // 打开首页
  mainWindow.loadURL(TARGET_URL);

  // 所有外链用系统默认浏览器打开，避免跳走
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
