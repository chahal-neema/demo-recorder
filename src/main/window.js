const { BrowserWindow } = require('electron');
const path = require('path');
const buildMenu = require('./menu');

function createWindow(app) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
    show: false
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  buildMenu(win, app);

  return win;
}

module.exports = createWindow;
