const { app, BrowserWindow, ipcMain, desktopCapturer, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let isRecording = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Create application menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Recording',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-recording');
          }
        },
        {
          label: 'Open Recordings Folder',
          click: () => {
            mainWindow.webContents.send('menu-open-recordings');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Recording',
      submenu: [
        {
          label: 'Start Recording',
          accelerator: 'F9',
          click: () => {
            mainWindow.webContents.send('menu-start-recording');
          }
        },
        {
          label: 'Stop Recording',
          accelerator: 'F10',
          click: () => {
            mainWindow.webContents.send('menu-stop-recording');
          }
        },
        {
          label: 'Pause/Resume',
          accelerator: 'F8',
          click: () => {
            mainWindow.webContents.send('menu-pause-recording');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Demo Recorder',
              message: 'Demo Recorder v1.0.0',
              detail: 'Free screen recording app for developers and teams\n\nBuilt with Electron and modern web technologies.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC handlers
ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 }
    });
    return sources;
  } catch (error) {
    console.error('Error getting sources:', error);
    return [];
  }
});

ipcMain.handle('save-recording', async (event, buffer, fileName) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: fileName,
      filters: [
        { name: 'Videos', extensions: ['webm', 'mp4'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (filePath) {
      fs.writeFileSync(filePath, buffer);
      return { success: true, path: filePath };
    }
    return { success: false, cancelled: true };
  } catch (error) {
    console.error('Error saving recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.on('recording-started', () => {
  isRecording = true;
});

ipcMain.on('recording-stopped', () => {
  isRecording = false;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Prevent closing during recording
app.on('before-quit', (event) => {
  if (isRecording) {
    event.preventDefault();
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Recording in Progress',
      message: 'Please stop the recording before closing the application.',
      buttons: ['OK']
    });
  }
});