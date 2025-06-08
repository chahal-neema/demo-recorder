const { desktopCapturer, ipcMain, dialog, app, screen, globalShortcut } = require('electron');
const fs = require('fs');

let recording = false;
let clickTrackingInterval = null;
let lastClickTime = 0;
let mainWindow = null;

function registerHandlers(window) {
  mainWindow = window;
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
    startClickTracking();
  });

  ipcMain.on('recording-stopped', () => {
    recording = false;
    stopClickTracking();
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

function startClickTracking() {
  console.log('🖱️ Starting global click tracking...');
  
  // Track mouse button state to detect clicks
  let lastMouseState = { x: 0, y: 0, buttons: 0 };
  
  clickTrackingInterval = setInterval(() => {
    try {
      // Get current mouse position and state
      const currentPos = screen.getCursorScreenPoint();
      
      // For Windows, we can track clicks by monitoring rapid position changes
      // or use a simple click detection based on cursor position changes
      const now = Date.now();
      const dx = Math.abs(currentPos.x - lastMouseState.x);
      const dy = Math.abs(currentPos.y - lastMouseState.y);
      
      // Detect potential click (small movement + time gap suggests a click)
      if ((dx < 5 && dy < 5) && (now - lastClickTime > 100)) {
        // This is a simplified click detection - in a real implementation
        // you'd use platform-specific APIs for actual click detection
        
        // For now, we'll rely on the renderer process click detection
        // but we can enhance this later with native click detection
      }
      
      lastMouseState = { x: currentPos.x, y: currentPos.y, buttons: 0 };
      
    } catch (error) {
      console.error('Error in click tracking:', error);
    }
  }, 16); // ~60fps
}

function stopClickTracking() {
  console.log('🖱️ Stopping global click tracking...');
  if (clickTrackingInterval) {
    clearInterval(clickTrackingInterval);
    clickTrackingInterval = null;
  }
}

// Handle manual click notification from renderer
ipcMain.handle('notify-click', (event, x, y) => {
  const now = Date.now();
  console.log('🖱️ Click notified from renderer at:', x, y, 'time:', now);
  lastClickTime = now;
  
  // Forward click to renderer if needed
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('global-click', { x, y, timestamp: now });
  }
});

function isRecording() {
  return recording;
}

module.exports = { registerHandlers, isRecording };
