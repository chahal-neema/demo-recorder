const { ipcRenderer } = require('electron');

let mediaRecorder;
let recordedChunks = [];
let selectedSourceId = null;
let isRecording = false;

const settings = {
  highlightClicks: true,
  zoomOnClicks: false,
  zoomScale: 2
};

const highlightSize = 40;
const highlightDuration = 600;

async function loadSources() {
  const sources = await ipcRenderer.invoke('get-sources');
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
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId
      }
    }
  });
  const video = document.getElementById('preview-video');
  video.srcObject = stream;
  video.play();

  const options = { mimeType: 'video/webm; codecs=vp9' };
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, options);
  mediaRecorder.ondataavailable = (e) => recordedChunks.push(e.data);
  mediaRecorder.onstop = handleStop;

  document.getElementById('start-recording').disabled = false;
}

function startRecording() {
  if (!mediaRecorder) return;
  mediaRecorder.start();
  document.getElementById('status-text').textContent = 'Recording';
  document.getElementById('pause-recording').disabled = false;
  document.getElementById('stop-recording').disabled = false;
  isRecording = true;
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
  isRecording = false;
}

async function handleStop() {
  const blob = new Blob(recordedChunks, { type: 'video/webm' });
  const buffer = Buffer.from(await blob.arrayBuffer());
  await ipcRenderer.invoke('save-recording', buffer, `Recording-${Date.now()}.webm`);
  document.getElementById('status-text').textContent = 'Ready';
}

document.getElementById('refresh-sources').addEventListener('click', loadSources);
document.getElementById('start-recording').addEventListener('click', startRecording);
document.getElementById('pause-recording').addEventListener('click', pauseRecording);
document.getElementById('stop-recording').addEventListener('click', stopRecording);

document.getElementById('highlight-clicks').addEventListener('change', (e) => {
  settings.highlightClicks = e.target.checked;
});
document.getElementById('zoom-clicks').addEventListener('change', (e) => {
  settings.zoomOnClicks = e.target.checked;
});
document.getElementById('zoom-scale').addEventListener('change', (e) => {
  settings.zoomScale = parseFloat(e.target.value) || 2;
});

document.addEventListener('click', (e) => {
  if (!isRecording) return;
  if (settings.highlightClicks) showClickHighlight(e.clientX, e.clientY);
  if (settings.zoomOnClicks) applyZoom(e.clientX, e.clientY);
});

function showClickHighlight(x, y) {
  const div = document.createElement('div');
  div.className = 'click-highlight';
  div.style.left = `${x - highlightSize / 2}px`;
  div.style.top = `${y - highlightSize / 2}px`;
  div.style.width = `${highlightSize}px`;
  div.style.height = `${highlightSize}px`;
  document.body.appendChild(div);
  setTimeout(() => div.remove(), highlightDuration);
}

function applyZoom(x, y) {
  const html = document.documentElement;
  html.style.transition = 'transform 0.2s ease';
  html.style.transformOrigin = `${x}px ${y}px`;
  html.style.transform = `scale(${settings.zoomScale})`;
  setTimeout(() => {
    html.style.transform = '';
  }, highlightDuration);
}

loadSources();
