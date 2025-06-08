const { desktopCapturer, ipcMain, dialog, app } = require('electron');
const fs = require('fs');

let recording = false;

function registerHandlers(mainWindow) {
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
    recording = true;
  });

  ipcMain.on('recording-stopped', () => {
    recording = false;
  });
}

function isRecording() {
  return recording;
}

module.exports = { registerHandlers, isRecording };
