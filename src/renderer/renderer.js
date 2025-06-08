const { ipcRenderer } = require('electron');

let mediaRecorder;
let recordedChunks = [];
let selectedSourceId = null;
let currentStream = null;
let selectedSourceType = 'screen';
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

  document.getElementById('start-recording').disabled = false;
  updatePreviewStatus();
}

function startRecording() {
  if (!mediaRecorder) return;
  console.log('Recording Configuration:', config);
  mediaRecorder.start();
  document.getElementById('status-text').textContent = 'Recording';
  document.getElementById('pause-recording').disabled = false;
  document.getElementById('stop-recording').disabled = false;
}

function pauseRecording() {
  if (mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    document.getElementById('status-text').textContent = 'Paused';
  } else if (mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    document.getElementById('status-text').textContent = 'Recording';
  }
}

function stopRecording() {
  mediaRecorder.stop();
  document.getElementById('status-text').textContent = 'Processing...';
  document.getElementById('pause-recording').disabled = true;
  document.getElementById('stop-recording').disabled = true;
}

async function handleStop() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const buffer = Buffer.from(await blob.arrayBuffer());
  await ipcRenderer.invoke('save-recording', buffer, `Recording-${Date.now()}.webm`);
  document.getElementById('status-text').textContent = 'Ready';
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

loadSources();
initializeZoomMouseSettings();
updatePreviewStatus();
