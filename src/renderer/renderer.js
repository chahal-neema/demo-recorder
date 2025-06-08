const { ipcRenderer } = require('electron');

let mediaRecorder;
let recordedChunks = [];
let selectedSourceId = null;

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

document.getElementById('refresh-sources').addEventListener('click', loadSources);
document.getElementById('start-recording').addEventListener('click', startRecording);
document.getElementById('pause-recording').addEventListener('click', pauseRecording);
document.getElementById('stop-recording').addEventListener('click', stopRecording);

loadSources();
