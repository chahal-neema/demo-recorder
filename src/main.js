const { app, BrowserWindow, dialog } = require('electron');
const createWindow = require('./main/window');
const { registerHandlers, isRecording } = require('./main/ipcHandlers');

let mainWindow;

function init() {
  mainWindow = createWindow(app);
  registerHandlers(mainWindow);
}

app.whenReady().then(init);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    init();
  }
});

app.on('before-quit', (event) => {
  if (isRecording()) {
    event.preventDefault();
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Recording in Progress',
      message: 'Please stop the recording before closing the application.',
      buttons: ['OK']
    });
  }
});
