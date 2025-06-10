const { desktopCapturer, ipcMain, dialog, app, screen, globalShortcut, shell } = require('electron');
const fs = require('fs');

let recording = false;
let clickTrackingInterval = null;
let lastClickTime = 0;
let mainWindow = null;
let mouseHistory = [];
// Cursor state tracking
let cursorHistory = [];
let lastCursorCheck = { x: 0, y: 0, timestamp: 0 };

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

  ipcMain.handle('open-recordings-folder', async () => {
    const dir = app.getPath('videos');
    await shell.openPath(dir);
    return dir;
  });

  ipcMain.on('recording-started', () => {
    recording = true;
    startAdvancedClickTracking();
  });

  ipcMain.on('recording-stopped', () => {
    recording = false;
    stopAdvancedClickTracking();
  });

  // System-level mouse tracking for real zoom functionality
  ipcMain.handle('get-cursor-position', () => {
    const point = screen.getCursorScreenPoint();
    return { x: point.x, y: point.y };
  });

  // Advanced cursor information including type and state
  ipcMain.handle('get-cursor-info', () => {
    const point = screen.getCursorScreenPoint();
    
    // Note: Electron doesn't provide direct cursor type detection
    // We'll need to implement heuristic-based detection
    const cursorInfo = {
      x: point.x,
      y: point.y,
      timestamp: Date.now(),
      // Will be enhanced with type detection logic
      type: 'default', // default, pointer, text, crosshair, etc.
      confidence: 0.0  // confidence in type detection (0-1)
    };
    
    return cursorInfo;
  });

  // Get display information
  ipcMain.handle('get-display-info', () => {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    return {
      displays: displays,
      primary: primaryDisplay
    };
  });

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
}

function startAdvancedClickTracking() {
  console.log('🖱️ Starting advanced global click tracking...');
  
  // Clear any existing tracking
  if (clickTrackingInterval) {
    clearInterval(clickTrackingInterval);
  }
  
  mouseHistory = [];
  cursorHistory = [];
  
  clickTrackingInterval = setInterval(() => {
    try {
      const currentPos = screen.getCursorScreenPoint();
      const now = Date.now();
      
      // Detect cursor type through heuristic analysis
      const cursorType = detectCursorType(currentPos, now);
      
      // Add current position and cursor state to history
      const cursorState = {
        x: currentPos.x,
        y: currentPos.y,
        timestamp: now,
        type: cursorType.type,
        confidence: cursorType.confidence
      };
      
      mouseHistory.push({
        x: currentPos.x,
        y: currentPos.y,
        timestamp: now
      });
      
      cursorHistory.push(cursorState);
      
      // Keep only last 20 cursor states (about 320ms of history at 60fps)
      if (cursorHistory.length > 20) {
        cursorHistory.shift();
      }
      
      // Keep only last 10 positions (about 160ms of history at 60fps)
      if (mouseHistory.length > 10) {
        mouseHistory.shift();
      }
      
      lastCursorCheck = { x: currentPos.x, y: currentPos.y, timestamp: now };
      
      // Detect clicks using improved analysis including cursor state
      if (mouseHistory.length >= 5) {
        const clickDetected = analyzeForClicks();
        if (clickDetected) {
          console.log('🖱️ GLOBAL CLICK DETECTED at:', currentPos.x, currentPos.y, 'cursor type:', cursorType.type);
          lastClickTime = now;
          
          // Notify renderer immediately with cursor state
          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log('📡 SENDING IPC to renderer:', { x: currentPos.x, y: currentPos.y, cursorType: cursorType.type });
            mainWindow.webContents.send('global-click', { 
              x: currentPos.x, 
              y: currentPos.y, 
              timestamp: now,
              source: 'advanced-detection',
              cursorType: cursorType.type,
              cursorConfidence: cursorType.confidence
            });
            console.log('📡 IPC SENT successfully');
          } else {
            console.log('❌ Cannot send IPC - mainWindow invalid:', {
              exists: !!mainWindow,
              destroyed: mainWindow ? mainWindow.isDestroyed() : 'N/A'
            });
          }
        }
      }
      
    } catch (error) {
      console.error('Error in advanced click tracking:', error);
    }
  }, 16); // ~60fps
}

// Heuristic cursor type detection
function detectCursorType(currentPos, timestamp) {
  // Since Electron doesn't provide direct cursor type detection,
  // we use movement patterns and timing to infer cursor state
  
  const result = {
    type: 'default',
    confidence: 0.5
  };
  
  if (cursorHistory.length < 3) {
    return result;
  }
  
  const recent = cursorHistory.slice(-5);
  const timeDiff = timestamp - recent[0].timestamp;
  
  // Calculate movement patterns
  let totalMovement = 0;
  let movements = [];
  
  for (let i = 1; i < recent.length; i++) {
    const dx = recent[i].x - recent[i-1].x;
    const dy = recent[i].y - recent[i-1].y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    movements.push(distance);
    totalMovement += distance;
  }
  
  const avgMovement = totalMovement / movements.length;
  const maxMovement = Math.max(...movements);
  
  // Cursor type detection heuristics:
  
  // 1. Text cursor (I-beam): Very slow, precise movements with long pauses
  if (avgMovement < 0.5 && maxMovement < 2 && timeDiff > 100) {
    result.type = 'text';
    result.confidence = 0.7;
  }
  
  // 2. Pointer cursor: Medium movements with acceleration/deceleration patterns
  else if (avgMovement > 2 && avgMovement < 8 && movements.length >= 3) {
    const hasPointerPattern = movements[0] < movements[1] && movements[1] > movements[2];
    if (hasPointerPattern) {
      result.type = 'pointer';
      result.confidence = 0.8;
    }
  }
  
  // 3. Default cursor: Steady, consistent movements
  else if (avgMovement >= 1 && avgMovement <= 5) {
    result.type = 'default';
    result.confidence = 0.6;
  }
  
  // 4. Dragging/grabbing: Fast, sustained movement
  else if (avgMovement > 8 && timeDiff < 200) {
    result.type = 'grabbing';
    result.confidence = 0.75;
  }
  
  return result;
}

function analyzeForClicks() {
  if (mouseHistory.length < 5) return false;
  
  const recent = mouseHistory.slice(-5); // Last 5 positions
  const now = Date.now();
  
  // Calculate movement patterns
  let totalMovement = 0;
  let maxMovement = 0;
  let movements = [];
  
  for (let i = 1; i < recent.length; i++) {
    const dx = recent[i].x - recent[i-1].x;
    const dy = recent[i].y - recent[i-1].y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    movements.push(distance);
    totalMovement += distance;
    maxMovement = Math.max(maxMovement, distance);
  }
  
  const avgMovement = totalMovement / movements.length;
  const timeSpan = recent[recent.length - 1].timestamp - recent[0].timestamp;
  
  // Click detection criteria:
  // 1. Very small average movement (mouse is stable)
  // 2. No sudden large movements (not dragging)
  // 3. Recent enough to be meaningful
  // 4. Not too frequent (debounce)
  
  const isStable = avgMovement < 1.5; // Very stable cursor
  const noDragging = maxMovement < 5; // No sudden jumps
  const goodTiming = timeSpan > 30 && timeSpan < 200; // Good click duration
  const notTooFrequent = now - lastClickTime > 200; // Debounce 200ms
  
  // Enhanced detection: Look for brief pause followed by small movement
  const hasClickPattern = movements.length >= 3 && 
                         movements[0] < 1 && 
                         movements[1] < 1 && 
                         movements[2] < 2;
  
  return isStable && noDragging && goodTiming && notTooFrequent && hasClickPattern;
}

function stopAdvancedClickTracking() {
  console.log('🖱️ Stopping advanced global click tracking...');
  if (clickTrackingInterval) {
    clearInterval(clickTrackingInterval);
    clickTrackingInterval = null;
  }
  mouseHistory = [];
  cursorHistory = [];
}

function isRecording() {
  return recording;
}

module.exports = { registerHandlers, isRecording };
