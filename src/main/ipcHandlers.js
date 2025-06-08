const { desktopCapturer, ipcMain, dialog, app, screen } = require('electron');
const fs = require('fs');

let recording = false;

function registerHandlers(mainWindow) {
  ipcMain.handle('get-sources', async (event, type = 'all') => {
    try {
      let types;
      switch (type) {
        case 'screen':
          types = ['screen'];
          break;
        case 'window':
          types = ['window'];
          break;
        default:
          types = ['window', 'screen'];
      }
      const sources = await desktopCapturer.getSources({
        types,
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

  // System-level mouse tracking for real zoom functionality
  ipcMain.handle('get-cursor-position', () => {
    const point = screen.getCursorScreenPoint();
    return { x: point.x, y: point.y };
  });

  ipcMain.handle('get-display-info', () => {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
      displays: displays.map(d => ({
        id: d.id,
        bounds: d.bounds,
        workArea: d.workArea,
        scaleFactor: d.scaleFactor
      })),
      primary: {
        id: primaryDisplay.id,
        bounds: primaryDisplay.bounds,
        workArea: primaryDisplay.workArea,
        scaleFactor: primaryDisplay.scaleFactor
      }
    };
  });
}

function isRecording() {
  return recording;
}

module.exports = { registerHandlers, isRecording };
