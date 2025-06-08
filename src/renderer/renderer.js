const { ipcRenderer } = require('electron');

let mediaRecorder;
let recordedChunks = [];
let selectedSourceId = null;
let currentStream = null;
let selectedSourceType = 'screen';

const RecordingState = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PAUSED: 'paused'
};

let recordingState = RecordingState.IDLE;
let timerInterval = null;
let elapsedSeconds = 0;
const config = {
  zoom: {
    enabled: false,
    level: 1.5,
    speed: 3,
    trigger: 'click',
    sensitivity: 5
  },
  mouse: {
    enabled: true,
    highlight: true,
    clickEffects: false,
    highlightSize: 3,
    highlightColor: '#1db954',
    clickAnimation: 'ripple'
  }
};

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
}

function updateTimer() {
  const timer = document.getElementById('recording-timer');
  timer.textContent = formatTime(elapsedSeconds);
}

function updateUI() {
  const startBtn = document.getElementById('start-recording');
  const pauseBtn = document.getElementById('pause-recording');
  const stopBtn = document.getElementById('stop-recording');
  const statusText = document.getElementById('status-text');
  const indicator = document.getElementById('status-indicator');

  switch (recordingState) {
    case RecordingState.RECORDING:
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      pauseBtn.textContent = '⏸️ Pause';
      stopBtn.disabled = false;
      statusText.textContent = 'Recording';
      indicator.style.background = '#fa3c4c';
      updateTimer();
      break;
    case RecordingState.PAUSED:
      startBtn.disabled = true;
      pauseBtn.disabled = false;
      pauseBtn.textContent = '▶️ Resume';
      stopBtn.disabled = false;
      statusText.textContent = 'Paused';
      indicator.style.background = '#ffa500';
      updateTimer();
      break;
    default:
      startBtn.disabled = !mediaRecorder;
      pauseBtn.disabled = true;
      pauseBtn.textContent = '⏸️ Pause';
      stopBtn.disabled = true;
      statusText.textContent = 'Ready';
      indicator.style.background = '#b3b3b3';
      elapsedSeconds = 0;
      updateTimer();
  }
}

async function loadSources() {
  const sources = await ipcRenderer.invoke('get-sources', selectedSourceType);
  const grid = document.getElementById('source-grid');
  grid.innerHTML = '';
  sources.forEach((source) => {
    const btn = document.createElement('button');
    btn.classList.add('source-item');
    btn.innerHTML = `<img src="${source.thumbnail.toDataURL()}" />${source.name}`;
    btn.addEventListener('click', () => selectSource(source.id));
    grid.appendChild(btn);
  });
}

async function selectSource(sourceId) {
  selectedSourceId = sourceId;
  const includeSystemAudio = document.getElementById('include-audio').checked;
  const includeMic = document.getElementById('include-microphone').checked;

  const screenConstraints = {
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId
      }
    },
    audio: includeSystemAudio
      ? {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        }
      : false
  };

  const screenStream = await navigator.mediaDevices.getUserMedia(screenConstraints);

  const tracks = [
    ...screenStream.getVideoTracks(),
    ...(includeSystemAudio ? screenStream.getAudioTracks() : [])
  ];

  if (includeMic) {
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      tracks.push(...micStream.getAudioTracks());
    } catch (err) {
      console.error('Error accessing microphone:', err);
    }
  }

  const stream = new MediaStream(tracks);
  currentStream = stream;

  const video = document.getElementById('preview-video');
  video.srcObject = stream;
  video.play();

  const options = { mimeType: 'video/webm; codecs=vp9,opus' };
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, options);
  mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
  mediaRecorder.onstop = handleStop;

  updatePreviewStatus();
  updateUI();
}

function startRecording() {
  if (!mediaRecorder || recordingState !== RecordingState.IDLE) return;
  console.log('Recording Configuration:', config);
  mediaRecorder.start();
  ipcRenderer.send('recording-started');
  recordingState = RecordingState.RECORDING;
  elapsedSeconds = 0;
  timerInterval = setInterval(() => {
    if (recordingState === RecordingState.RECORDING) {
      elapsedSeconds += 1;
      updateTimer();
    }
  }, 1000);
  updateUI();
}

function pauseRecording() {
  if (!mediaRecorder) return;
  if (recordingState === RecordingState.RECORDING) {
    mediaRecorder.pause();
    recordingState = RecordingState.PAUSED;
  } else if (recordingState === RecordingState.PAUSED) {
    mediaRecorder.resume();
    recordingState = RecordingState.RECORDING;
  }
  updateUI();
}

function stopRecording() {
  if (!mediaRecorder || recordingState === RecordingState.IDLE) return;
  mediaRecorder.stop();
  ipcRenderer.send('recording-stopped');
  clearInterval(timerInterval);
  recordingState = RecordingState.IDLE;
  document.getElementById('status-text').textContent = 'Processing...';
  updateUI();
}

async function handleStop() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const buffer = Buffer.from(await blob.arrayBuffer());
  await ipcRenderer.invoke('save-recording', buffer, `Recording-${Date.now()}.webm`);
  document.getElementById('status-text').textContent = 'Ready';
  updateUI();
}

function updatePreviewStatus() {
  const preview = document.getElementById('zoom-preview');
  if (!selectedSourceId) {
    preview.classList.remove('active');
    return;
  }
  const zoomText = config.zoom.enabled ? `Zoom: ${config.zoom.level}x` : 'Zoom: OFF';
  const mouseText = config.mouse.enabled ? 'Mouse Tracking: ON' : 'Mouse Tracking: OFF';
  preview.textContent = `${zoomText} | ${mouseText}`;
  preview.classList.add('active');
}

function initializeZoomMouseSettings() {
  const enableZoom = document.getElementById('enable-zoom');
  const zoomSettings = document.getElementById('zoom-settings');
  const enableMouse = document.getElementById('enable-mouse-tracking');
  const mouseSettings = document.getElementById('mouse-settings');

  enableZoom.addEventListener('change', function () {
    config.zoom.enabled = this.checked;
    zoomSettings.classList.toggle('disabled', !this.checked);
    updatePreviewStatus();
  });

  enableMouse.addEventListener('change', function () {
    config.mouse.enabled = this.checked;
    mouseSettings.classList.toggle('disabled', !this.checked);
    updatePreviewStatus();
  });

  document.getElementById('zoom-level').addEventListener('input', function () {
    config.zoom.level = parseFloat(this.value);
    document.getElementById('zoom-level-value').textContent = `${this.value}x`;
    updatePreviewStatus();
  });

  document.getElementById('zoom-speed').addEventListener('input', function () {
    config.zoom.speed = parseInt(this.value, 10);
  });

  document.getElementById('zoom-trigger').addEventListener('change', function () {
    config.zoom.trigger = this.value;
  });

  document.getElementById('zoom-sensitivity').addEventListener('input', function () {
    config.zoom.sensitivity = parseInt(this.value, 10);
  });

  document.getElementById('mouse-highlight').addEventListener('change', function () {
    config.mouse.highlight = this.checked;
  });

  document.getElementById('click-effects').addEventListener('change', function () {
    config.mouse.clickEffects = this.checked;
  });

  document.getElementById('highlight-size').addEventListener('input', function () {
    config.mouse.highlightSize = parseInt(this.value, 10);
  });

  document.getElementById('highlight-color').addEventListener('change', function () {
    config.mouse.highlightColor = this.value;
  });

  document.getElementById('click-animation').addEventListener('change', function () {
    config.mouse.clickAnimation = this.value;
  });
}

document.getElementById('refresh-sources').addEventListener('click', loadSources);
document.getElementById('start-recording').addEventListener('click', startRecording);
document.getElementById('pause-recording').addEventListener('click', pauseRecording);
document.getElementById('stop-recording').addEventListener('click', stopRecording);
document.getElementById('include-audio').addEventListener('change', () => {
  if (selectedSourceId) selectSource(selectedSourceId);
});
document.getElementById('include-microphone').addEventListener('change', () => {
  if (selectedSourceId) selectSource(selectedSourceId);
});

document.querySelectorAll('.source-type-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document
      .querySelectorAll('.source-type-btn')
      .forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSourceType = btn.getAttribute('data-type');
    loadSources();
  });
});

ipcRenderer.on('menu-start-recording', startRecording);
ipcRenderer.on('menu-stop-recording', stopRecording);
ipcRenderer.on('menu-pause-recording', pauseRecording);

loadSources();
initializeZoomMouseSettings();
updatePreviewStatus();
updateUI();
