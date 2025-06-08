const { ipcRenderer } = require('electron');
const { config } = require('./modules/config.js');
const UI = require('./modules/ui.js');
const RecordingStateMachine = require('./modules/stateMachine.js');
const ScreenTracker = require('./modules/screenTracker.js');
const MouseTracker = require('./modules/mouseTracker.js');
const StreamProcessor = require('./modules/streamProcessor.js');
const logger = require('./modules/logger.js');

// Initialize logging system
logger.initialize('debug.log');

console.log('✅ Modules imported successfully');

// --- Global State ---
let dom;
let isWindowFocused = true;

// Module instances
const recordingStateMachine = new RecordingStateMachine();
const screenTracker = new ScreenTracker();
const mouseTracker = new MouseTracker();
let streamProcessor = null;

// --- Window Focus Handling ---
window.addEventListener('focus', () => {
    isWindowFocused = true;
    logger.info('Window focused - recording continues normally');
    
    const state = recordingStateMachine.getState();
    if (state.isRecording) {
        UI.updateStatus('Recording', '#e22134');
    }
});

window.addEventListener('blur', () => {
    isWindowFocused = false;
    logger.warn('Window lost focus - maintaining recording');
    
    const state = recordingStateMachine.getState();
    if (state.isRecording) {
        UI.updateStatus('Recording (Window Focus Lost)', '#ff8800');
    }
});

// --- Click Event Handling ---
document.addEventListener('click', (event) => {
    mouseTracker.handleDocumentClick(event);
});

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    logger.success('DOM loaded, initializing...');
    initializeApp();
});

async function initializeApp() {
    try {
        // Cache DOM elements
        dom = UI.cacheDOMElements();
        logger.success('DOM elements cached');
        
        // Initialize modules
        await initializeModules();
        
        // Setup UI
        initializeUI();
        
        // Load initial sources
        await screenTracker.loadSources();
        
        logger.success('App initialization complete');
        
    } catch (error) {
        logger.error('Error initializing app:', error);
    }
}

async function initializeModules() {
    // Initialize recording state machine
    recordingStateMachine.initialize({
        onStateChange: handleStateChange,
        onTimerUpdate: (seconds) => UI.updateTimer(seconds),
        onError: handleRecordingError,
        onRecordingComplete: handleRecordingComplete
    });
    
    // Initialize screen tracker
    screenTracker.initialize(dom, {
        onSourceSelected: handleSourceSelected,
        onPreviewReady: handlePreviewReady,
        onError: handleScreenError
    });
    
    // Setup UI event handlers
    const handlers = {
        onSourceTypeChange: (type) => screenTracker.changeSourceType(type),
        onRefreshSources: () => screenTracker.refreshSources(),
        onStartRecording: startRecording,
        onPauseRecording: () => recordingStateMachine.pauseRecording(),
        onStopRecording: () => recordingStateMachine.stopRecording(),
    };
    
    UI.setupEventListeners(handlers);
    
    // Setup IPC listeners
    setupIPCListeners();
    
    logger.success('Modules initialized');
}

function initializeUI() {
    logger.ui('Initializing UI...');
    
    const state = recordingStateMachine.getState();
    UI.updateButtonStates(state.isRecording, state.isPaused);
    UI.updateStatus('Ready', '#b3b3b3');
    UI.updateTimer(0);
    
    // Ensure proper initial preview state
    dom.previewVideo.style.display = 'none';
    dom.previewPlaceholder.style.display = 'flex';
    dom.startBtn.disabled = true;
    
    // Initialize slider labels
    if(dom.zoomLevelSlider) UI.updateZoomLevelLabel(dom.zoomLevelSlider.value);
    if(dom.zoomSpeedSlider) UI.updateZoomSpeedLabel(dom.zoomSpeedSlider.value);
    if(dom.zoomSensitivitySlider) UI.updateZoomSensitivityLabel(dom.zoomSensitivitySlider.value);
    if(dom.highlightSizeSlider) UI.updateHighlightSizeLabel(dom.highlightSizeSlider.value);
    if(dom.highlightColorPicker) UI.updateColorLabel(dom.highlightColorPicker.value);
    
    logger.ui('UI initialized');
}

// --- Event Handlers ---
function handleStateChange(state) {
    UI.updateButtonStates(state.isRecording, state.isPaused);
    
    if (state.isRecording) {
        if (state.isPaused) {
            UI.updateStatus('Paused', '#ffa500');
        } else {
            UI.updateStatus('Recording', '#e22134');
        }
    } else {
        UI.updateStatus('Ready', '#b3b3b3');
    }
    
    // Update pause button text
    dom.pauseBtn.textContent = state.isPaused ? '▶️ Resume' : '⏸️ Pause';
}

function handleSourceSelected(source, stream) {
    logger.screen('Source selected:', source.name);
    // Source selection handled by ScreenTracker
}

function handlePreviewReady(stream) {
    logger.screen('Preview ready with stream');
    // Preview setup handled by ScreenTracker
}

function handleRecordingError(message, error) {
    logger.error('Recording error:', message, error);
    UI.updateStatus('Recording Error', 'red');
    alert(`${message}: ${error.message}`);
}

function handleScreenError(message, error) {
    logger.error('Screen error:', message, error);
    alert(`${message}: ${error.message}`);
}

async function handleRecordingComplete(buffer) {
    logger.recording('Recording completed, saving...');
    
    // Cleanup
    if (streamProcessor) {
        streamProcessor.destroy();
        streamProcessor = null;
    }
    
    mouseTracker.stopTracking();
    
    // Notify main process
    ipcRenderer.send('recording-stopped');
    
    // Save recording
    await ipcRenderer.invoke('save-recording', buffer);
}

// --- Recording Functions ---
async function startRecording() {
    const sourceInfo = screenTracker.getCurrentSource();
    if (!sourceInfo.hasValidSource) {
        alert('Please select a recording source first!');
        return;
    }

    // Ignore the click that triggered the start button
    mouseTracker.setIgnoreNextClick();
    
    try {
        logger.recording('Starting recording...');
        
        // Get original stream
        const originalStream = screenTracker.getCurrentStream();
        if (!originalStream) {
            throw new Error('No stream available from selected source');
        }
        
        // Determine if we need processing (zoom or mouse effects enabled)
        const needsProcessing = config.zoom.enabled || config.mouse.enabled;
        
        logger.recording('Recording start analysis:');
        logger.recording('   Zoom enabled:', config.zoom.enabled);
        logger.recording('   Mouse enabled:', config.mouse.enabled);
        logger.recording('   Needs processing:', needsProcessing);
        
        let recordingStream;
        
        if (needsProcessing) {
            logger.recording('Creating StreamProcessor for processing...');
            
            // Create stream processor for effects
            streamProcessor = new StreamProcessor();
            const recordingBounds = await screenTracker.getRecordingBounds();
            
            // Initialize processor and get processed stream
            recordingStream = await streamProcessor.initialize(originalStream, recordingBounds);
            
            // Setup mouse tracking
            mouseTracker.setStreamProcessor(streamProcessor);
            mouseTracker.startTracking();
            
        } else {
            // Use original stream if no effects needed
            logger.recording('Using original stream (no processing needed)');
            recordingStream = originalStream;
        }
        
        // Add audio if configured
        if (config.recording.includeAudio || config.recording.includeMicrophone) {
            const audioStream = await getAudioStream();
            if (audioStream) {
                audioStream.getAudioTracks().forEach(track => {
                    recordingStream.addTrack(track);
                });
            }
        }
        
        // Notify main process
        ipcRenderer.send('recording-started');
        
        // Start recording through state machine
        await recordingStateMachine.startRecording(recordingStream);
        
        logger.success('Recording started successfully');
        
    } catch (error) {
        logger.error('Error starting recording:', error);
        alert(`Error starting recording: ${error.message}`);
    }
}

async function getAudioStream() {
    try {
        const constraints = {
            audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            }
        };
        
        if (config.recording.includeMicrophone) {
            return await navigator.mediaDevices.getUserMedia(constraints);
        }
        
        return null;
    } catch (error) {
        console.warn('Could not get audio stream:', error);
        return null;
    }
}

// --- IPC Listeners ---
function setupIPCListeners() {
    ipcRenderer.on('recording-saved', (event, path) => {
        if (path) {
            logger.success('Recording saved to:', path);
            alert(`Recording saved to ${path}`);
        } else {
            logger.info('Save was cancelled.');
        }
    });

    ipcRenderer.on('global-click', (event, clickData) => {
        mouseTracker.handleGlobalClick(clickData);
    });
}

// --- Debug Functions ---
window.debugZoom = function() {
    logger.debug('Debug Zoom Function Called');
    logger.debug('   Config:', config.zoom);
    logger.debug('   StreamProcessor exists:', !!streamProcessor);
    
    if (streamProcessor) {
        logger.debug('   Current zoom level:', streamProcessor.zoomLevel);
        logger.debug('   Target zoom level:', streamProcessor.targetZoomLevel);
        logger.debug('   Zoom transition active:', streamProcessor.zoomTransition.active);
        
        streamProcessor.lastClickTime = Date.now();
        streamProcessor.handleZoomTrigger();
        logger.debug('   Manual zoom trigger sent');
    } else {
        logger.debug('   No StreamProcessor available');
    }
};

window.forceZoom = function(level = 2.0) {
    logger.zoom('Force Zoom to level:', level);
    if (streamProcessor) {
        streamProcessor.targetZoomLevel = level;
        streamProcessor.startZoomTransition();
        logger.zoom('   Force zoom applied');
    } else {
        logger.debug('   No StreamProcessor available');
    }
};

window.testZoom = () => {
    if (streamProcessor) {
        streamProcessor.testZoom();
    } else {
        logger.debug('No StreamProcessor available');
    }
};

window.debugStreamProcessor = () => {
    if (streamProcessor) {
        logger.debug('StreamProcessor Debug Info:');
        logger.debug('   Zoom enabled:', config.zoom.enabled);
        logger.debug('   Current zoom level:', streamProcessor.zoomLevel);
        logger.debug('   Last click time:', streamProcessor.lastClickTime);
        logger.debug('   Time since last click:', Date.now() - streamProcessor.lastClickTime);
        logger.debug('   Zoom transition active:', streamProcessor.zoomTransition?.active);
    } else {
        logger.debug('No StreamProcessor available');
    }
};

// Make modules available globally for debugging
window.getStreamProcessor = () => streamProcessor;
window.getRecordingState = () => recordingStateMachine.getState();
window.getScreenTracker = () => screenTracker;
window.getMouseTracker = () => mouseTracker;
window.getLogger = () => logger;
