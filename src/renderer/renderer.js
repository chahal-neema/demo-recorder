const { ipcRenderer } = require('electron');
const { config } = require('./modules/config.js');
const UI = require('./modules/ui.js');
const Preview = require('./modules/preview.js');
const SourceManager = require('./modules/sources.js');

console.log('✅ Modules imported successfully');
console.log('✅ Config:', config);
console.log('✅ SourceManager:', SourceManager);

// --- State Management ---
let isRecording = false;
let isPaused = false;
let mediaRecorder;
let recordedChunks = [];
let timerInterval;
let seconds = 0;
let selectedSource = null;
let currentSourceType = 'screen';

let dom;

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM loaded, initializing...');
    dom = UI.cacheDOMElements();
    console.log('✅ DOM elements cached:', dom);
    
    initializeUI();
    loadSources();

    const handlers = {
        onSourceTypeChange: (type) => {
            console.log('🔄 Source type changed to:', type);
            currentSourceType = type;
            loadSources();
        },
        onRefreshSources: () => {
            console.log('🔄 Refreshing sources...');
            loadSources();
        },
        onStartRecording: startRecording,
        onPauseRecording: pauseRecording,
        onStopRecording: stopRecording,
    };
    
    console.log('🎯 Setting up event listeners...');
    UI.setupEventListeners(handlers);
    console.log('✅ Event listeners setup complete');
});

function initializeUI() {
    console.log('🎨 Initializing UI...');
    UI.updateButtonStates(isRecording, isPaused);
    UI.updateStatus('Ready', '#b3b3b3');
    UI.updateTimer(0);
    
    // Ensure proper initial preview state
    dom.previewVideo.style.display = 'none';
    dom.previewPlaceholder.style.display = 'flex';
    dom.startBtn.disabled = true;
    
    // Initialize labels for sliders
    if(dom.zoomLevelSlider) UI.updateZoomLevelLabel(dom.zoomLevelSlider.value);
    if(dom.zoomSpeedSlider) UI.updateZoomSpeedLabel(dom.zoomSpeedSlider.value);
    if(dom.highlightSizeSlider) UI.updateHighlightSizeLabel(dom.highlightSizeSlider.value);
    if(dom.highlightColorPicker) UI.updateColorLabel(dom.highlightColorPicker.value);
    console.log('✅ UI initialized');
}


// --- Source Handling ---
async function loadSources() {
    console.log('📺 Loading sources for type:', currentSourceType);
    try {
        // Clear previous sources and reset preview
        dom.sourceGrid.innerHTML = '';
        dom.previewVideo.style.display = 'none';
        dom.previewPlaceholder.style.display = 'flex';
        dom.startBtn.disabled = true;
        selectedSource = null;
        Preview.stopPreview();

        console.log('🔄 Calling getSources...');
        const sources = await SourceManager.getSources(currentSourceType);
        console.log('📋 Sources received:', sources.length, 'sources');
        console.log('📋 Sources:', sources);
        
        SourceManager.renderSources(sources, dom.sourceGrid, selectSource);
        console.log('✅ Sources rendered');
    } catch (error) {
        console.error('❌ Error loading sources:', error);
    }
}

async function selectSource(source) {
    console.log('🎯 Source selected:', source);
    selectedSource = source;
    dom.startBtn.disabled = false;
    dom.previewPlaceholder.style.display = 'none';
    dom.previewVideo.style.display = 'block';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id,
                },
            },
        });
        
        console.log('📹 Stream obtained:', stream);
        console.log('📹 Video tracks:', stream.getVideoTracks());
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            const settings = videoTrack.getSettings();
            console.log('📹 Video track settings:', settings);
            console.log('📹 Resolution:', settings.width + 'x' + settings.height);
            console.log('📹 Aspect ratio:', (settings.width / settings.height).toFixed(2));
        }
        
        dom.previewVideo.srcObject = stream;
        
        // Add debug logging when video loads
        dom.previewVideo.addEventListener('loadedmetadata', () => {
            console.log('📺 Video loaded - dimensions:', dom.previewVideo.videoWidth + 'x' + dom.previewVideo.videoHeight);
            console.log('📺 Video aspect ratio:', (dom.previewVideo.videoWidth / dom.previewVideo.videoHeight).toFixed(2));
            console.log('📺 Container dimensions:', dom.previewContainer.offsetWidth + 'x' + dom.previewContainer.offsetHeight);
            console.log('📺 Container aspect ratio:', (dom.previewContainer.offsetWidth / dom.previewContainer.offsetHeight).toFixed(2));
        });
        
        // Always re-initialize the preview on source selection
        await Preview.initializePreview(dom, selectedSource);

    } catch (e) {
        console.error('❌ Error selecting source:', e);
    }
}


// --- Recording Lifecycle ---
function startRecording() {
    if (!selectedSource) {
        alert('Please select a recording source first!');
        return;
    }
    isRecording = true;
    isPaused = false;
    UI.updateButtonStates(isRecording, isPaused);
    UI.updateStatus('Recording', '#e22134');
    
    recordedChunks = [];
    const stream = dom.previewVideo.srcObject;
    const mimeType = 'video/webm; codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        console.error(`${mimeType} is not supported`);
        alert(`Error: The required video codec (${mimeType}) is not supported on your system.`);
        isRecording = false;
        UI.updateButtonStates(isRecording, isPaused);
        UI.updateStatus('Error', 'red');
        return;
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
    mediaRecorder.onstop = handleStop;
    mediaRecorder.start();

    startTimer();
}

function pauseRecording() {
    if (!isRecording) return;
    isPaused = !isPaused;
    if (isPaused) {
        mediaRecorder.pause();
        clearInterval(timerInterval);
        UI.updateStatus('Paused', '#ffa500');
    } else {
        mediaRecorder.resume();
        startTimer();
        UI.updateStatus('Recording', '#e22134');
    }
    dom.pauseBtn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

async function handleStop() {
    isRecording = false;
    isPaused = false;
    clearInterval(timerInterval);
    seconds = 0;
    
    UI.updateButtonStates(isRecording, isPaused);
    UI.updateStatus('Ready', '#b3b3b3');
    UI.updateTimer(0);
    dom.pauseBtn.textContent = '⏸️ Pause';

    Preview.stopPreview();

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    if (blob.size > 0) {
        const buffer = Buffer.from(await blob.arrayBuffer());
        ipcRenderer.invoke('save-recording', buffer);
    }
    
    recordedChunks = [];
}


// --- Timer ---
function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        seconds++;
        UI.updateTimer(seconds);
    }, 1000);
}

// --- IPC Listeners ---
ipcRenderer.on('recording-saved', (event, path) => {
    if (path) {
        alert(`Recording saved to ${path}`);
    } else {
        console.log('Save was cancelled.');
    }
});
