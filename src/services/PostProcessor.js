const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomBytes } = require('crypto');

class PostProcessor {
  constructor(recording) {
    this.recording = recording;
  }

  async processBuffer(buffer) {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `rec-${randomBytes(6).toString('hex')}.webm`);
    const outputPath = path.join(tmpDir, `proc-${randomBytes(6).toString('hex')}.mp4`);

    fs.writeFileSync(inputPath, buffer);

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions([
          '-c:v libx264',
          '-preset veryfast',
          '-crf 23',
          '-movflags +faststart'
        ])
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    const processed = fs.readFileSync(outputPath);
    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    return processed;
  }

  process() {
    // 1. Detect UI elements in each frame
    const ui = this.detectUIElements();
    // 2. Analyze mouse movement to infer intent
    const intents = this.analyzeMovementIntent();
    // 3. Create heatmap of user activity
    const heatmap = this.createActivityHeatmap();
    // 4. Plan optimal camera path
    return this.generateCameraWork(ui, intents, heatmap);
  }

  detectUIElements() {
    // Placeholder universal detection logic
    return this.recording.frames.map(frame => ({
      buttons: this._findRectangles(frame),
      textFields: this._findInputAreas(frame),
      menus: this._findMenus(frame),
      text: this._findText(frame)
    }));
  }

  analyzeMovementIntent() {
    const trail = this.recording.mouseTrail;
    const intents = [];
    // Direct linear movement with slowdown
    if (this._isDirect(trail) && this._slowsDown(trail)) {
      intents.push({ intent: 'targeting', confidence: 0.9 });
    }
    // Multiple direction changes at constant speed
    if (this._directionChanges(trail) > 2) {
      intents.push({ intent: 'exploring', confidence: 0.8 });
    }
    return intents;
  }

  createActivityHeatmap() {
    const zones = {};
    this.recording.frames.forEach(frame => {
      const zone = this._zoneFor(frame.mousePosition);
      zones[zone] = zones[zone] || { time: 0, activity: 0 };
      zones[zone].time += frame.duration;
      zones[zone].activity += frame.clickCount + frame.scrollAmount;
    });
    return zones;
  }

  classifyFrame(frame) {
    if (frame.keyPressCount > 0 || frame.focusedInput) return 'typing';
    if (frame.clickCount > 0) return 'clicking';
    if (frame.menuOpened || frame.sectionChanged) return 'navigating';
    if (frame.viewingText || frame.scrollAmount > 0) return 'viewing';
    if (frame.scanMovement > 3) return 'lost';
    return 'idle';
  }

  zoomForAction(action, lastZoom) {
    switch (action) {
      case 'typing':
        return 2.0;               // Close zoom for typing clarity
      case 'clicking':
        return 1.5;               // Moderate zoom on clicks
      case 'viewing':
        return 1.5;               // Stable moderate zoom for text
      case 'navigating':
        return lastZoom > 1.0 ? 1.0 : 1.5; // Zoom out then back in
      case 'lost':
        return 1.0;               // Show big picture
      default:
        return lastZoom;
    }
  }

  generateCameraWork(ui, intents, heatmap) {
    const cameraPath = [];
    let lastZoom = 1.0;

    this.recording.frames.forEach((frame, index) => {
      const action = this.classifyFrame(frame);
      let zoom = this.zoomForAction(action, lastZoom);

      if (action === 'navigating') {
        if (lastZoom !== 1.0) {
          cameraPath.push({ frame: index, zoom: 1.0, reason: 'navigate-out' });
        }
        cameraPath.push({ frame: index + 1, zoom: 1.5, reason: 'navigate-in' });
        lastZoom = 1.5;
        return;
      }

      if (zoom !== lastZoom) {
        cameraPath.push({ frame: index, zoom, reason: action });
        lastZoom = zoom;
      }
    });

    return { ui, intents, heatmap, cameraPath };
  }

  // --- Internal helpers (placeholders) ---
  _findRectangles(frame) { return []; }
  _findInputAreas(frame) { return []; }
  _findMenus(frame) { return []; }
  _findText(frame) { return []; }
  _isDirect(trail) { return false; }
  _slowsDown(trail) { return false; }
  _directionChanges(trail) { return 0; }
  _zoneFor(pos) { return `${Math.floor(pos.x/100)}x${Math.floor(pos.y/100)}`; }
}

module.exports = PostProcessor;
