const { Menu, dialog } = require('electron');

function buildMenu(mainWindow, app) {
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

module.exports = buildMenu;
