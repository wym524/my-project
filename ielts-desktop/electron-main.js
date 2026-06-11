const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let serverProcess = null;
let serverReady = false;
let willQuit = false;

const SERVER_PORT = 3847;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

function getIconPath() {
  try {
    if (process.platform === 'win32') {
      return path.join(__dirname, 'assets', 'icon.ico');
    } else if (process.platform === 'darwin') {
      return path.join(__dirname, 'assets', 'icon.png');
    }
    return path.join(__dirname, 'assets', 'icon.png');
  } catch (e) {
    return '';
  }
}

function startBackendServer() {
  return new Promise((resolve, reject) => {
    if (serverProcess && !serverProcess.killed) {
      resolve(true);
      return;
    }

    const serverScript = path.join(__dirname, 'server.js');

    try {
      serverProcess = spawn('node', [serverScript], {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: Object.assign({}, process.env, {
          NODE_ENV: 'production',
          IELTS_APP_MODE: 'electron'
        })
      });

      let started = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';

      serverProcess.stdout.on('data', (data) => {
        const text = data.toString();
        stdoutBuffer += text;
        console.log('[server]', text);

        if (!started && (text.includes('3847') || text.includes('listen') || text.includes('Server') || stdoutBuffer.length > 200)) {
          started = true;
          serverReady = true;
          setTimeout(() => resolve(true), 800);
        }
      });

      serverProcess.stderr.on('data', (data) => {
        const text = data.toString();
        stderrBuffer += text;
        console.error('[server-err]', text);

        if (!started && text.includes('EADDRINUSE')) {
          started = true;
          serverReady = true;
          resolve(true);
        }
      });

      serverProcess.on('close', (code) => {
        console.log(`Backend server exited with code ${code}`);
        serverProcess = null;
        serverReady = false;
      });

      serverProcess.on('error', (err) => {
        console.error('Failed to start server:', err);
        if (!started) {
          started = true;
          reject(err);
        }
      });

      setTimeout(() => {
        if (!started) {
          started = true;
          serverReady = true;
          resolve(true);
        }
      }, 4000);

    } catch (err) {
      reject(err);
    }
  });
}

function createMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'IELTS 学习空间',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webviewTag: false,
      sandbox: false
    }
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('页面加载失败:', errorDescription);
    if (errorCode !== -3) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(SERVER_URL);
        }
      }, 1000);
    }
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.key.toLowerCase() === 'f12') {
      if (mainWindow && mainWindow.webContents) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      }
    }
  });

  mainWindow.on('close', (event) => {
    if (!willQuit) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  try {
    let trayImage;
    try {
      const iconPath = getIconPath();
      if (iconPath && require('fs').existsSync(iconPath)) {
        trayImage = nativeImage.createFromPath(iconPath);
      } else {
        trayImage = nativeImage.createEmpty();
      }
    } catch (e) {
      trayImage = nativeImage.createEmpty();
    }

    if (trayImage.isEmpty()) {
      try {
        const fs = require('fs');
        const assetsDir = path.join(__dirname, 'assets');
        const iconPng = path.join(assetsDir, 'icon.png');
        if (fs.existsSync(iconPng)) {
          trayImage = nativeImage.createFromPath(iconPng);
        }
      } catch (e) {
        // ignore, use empty
      }
    }

    tray = new Tray(trayImage);
    tray.setToolTip('IELTS 学习空间');

    const contextMenu = Menu.buildFromTemplate([
      { label: '打开 IELTS 学习空间', click: () => createMainWindow() },
      { type: 'separator' },
      {
        label: '开发者工具 (F12)',
        click: () => {
          if (mainWindow && mainWindow.webContents) {
            if (mainWindow.webContents.isDevToolsOpened()) {
              mainWindow.webContents.closeDevTools();
            } else {
              mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
          } else {
            createMainWindow();
            setTimeout(() => {
              if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.openDevTools({ mode: 'detach' });
              }
            }, 1000);
          }
        }
      },
      {
        label: '刷新页面',
        click: () => {
          if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
            mainWindow.webContents.reload();
          }
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          willQuit = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
      } else {
        createMainWindow();
      }
    });

    tray.on('double-click', () => {
      createMainWindow();
    });

  } catch (err) {
    console.error('创建系统托盘失败:', err);
  }
}

function stopBackendServer() {
  if (serverProcess && !serverProcess.killed) {
    try {
      serverProcess.kill('SIGTERM');
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
      }, 1500);
    } catch (err) {
      console.error('停止后端服务器失败:', err);
    }
  }
}

app.on('before-quit', (event) => {
  willQuit = true;
  stopBackendServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    willQuit = true;
    setTimeout(() => {
      app.quit();
    }, 300);
  }
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
  } else {
    createMainWindow();
  }
});

(async () => {
  try {
    await app.whenReady();

    if (process.platform === 'darwin') {
      app.dock && app.dock.show && app.dock.show();
    }

    console.log('启动后端服务器...');
    await startBackendServer();
    console.log('后端服务器已就绪。');

    createTray();
    createMainWindow();

  } catch (err) {
    console.error('应用启动失败:', err);
    dialog.showErrorBox(
      'IELTS 学习空间 启动失败',
      '无法启动后端服务: ' + (err && err.message ? err.message : String(err))
    );
    willQuit = true;
    app.quit();
  }
})();

ipcMain.handle('get-server-url', () => SERVER_URL);
ipcMain.handle('get-server-port', () => SERVER_PORT);
