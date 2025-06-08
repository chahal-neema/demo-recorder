const { ipcRenderer } = require('electron');
const { config } = require('./modules/config.js');
const UI = require('./modules/ui.js');
const RecordingStateMachine = require('./modules/stateMachine.js');
const ScreenTracker = require('./modules/screenTracker.js');
const MouseTracker = require('./modules/mouseTracker.js');
const StreamProcessor = require('./modules/streamProcessor.js');

// Create logging system that saves to file
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', '..', 'debug.log');
const originalConsoleLog = console.log;

console.log = function(...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    const logEntry = `[${timestamp}] ${message}\n`;
    
    // Write to file
    try {
        fs.appendFileSync(logFile, logEntry);
    } catch (error) {
        // Fallback to original console.log if file write fails
    }
    
    // Also output to original console
    originalConsoleLog.apply(console, args);
};

// Clear previous log file
try {
    fs.writeFileSync(logFile, '=== DEMO RECORDER DEBUG LOG ===\n');
} catch (error) {
    // Ignore if can't clear
}

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
    console.log('🎯 Window focused - recording continues normally');
    
    const state = recordingStateMachine.getState();
    if (state.isRecording) {
        UI.updateStatus('Recording', '#e22134');
    }
});

window.addEventListener('blur', () => {
    isWindowFocused = false;
    console.log('⚠️ Window lost focus - maintaining recording');
    
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
    console.log('✅ DOM loaded, initializing...');
    initializeApp();
});

async function initializeApp() {
    try {
        // Cache DOM elements
        dom = UI.cacheDOMElements();
        console.log('✅ DOM elements cached');
        
        // Initialize modules
        await initializeModules();
        
        // Setup UI
        initializeUI();
        
        // Load initial sources
        await screenTracker.loadSources();
        
        console.log('✅ App initialization complete');
        
    } catch (error) {
        console.error('❌ Error initializing app:', error);
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
    
    console.log('✅ Modules initialized');
}

function initializeUI() {
    console.log('🎨 Initializing UI...');
    
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
    
    console.log('✅ UI initialized');
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
    console.log('🎯 Source selected:', source.name);
    // Source selection handled by ScreenTracker
}

function handlePreviewReady(stream) {
    console.log('📺 Preview ready with stream');
    // Preview setup handled by ScreenTracker
}

function handleRecordingError(message, error) {
    console.error('❌ Recording error:', message, error);
    UI.updateStatus('Recording Error', 'red');
    alert(`${message}: ${error.message}`);
}

function handleScreenError(message, error) {
    console.error('❌ Screen error:', message, error);
    alert(`${message}: ${error.message}`);
}

async function handleRecordingComplete(buffer) {
    console.log('✅ Recording completed, saving...');
    
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
        console.log('🎬 Starting recording...');
        
        // Get original stream
        const originalStream = screenTracker.getCurrentStream();
        if (!originalStream) {
            throw new Error('No stream available from selected source');
        }
        
        // Determine if we need processing (zoom or mouse effects enabled)
        const needsProcessing = config.zoom.enabled || config.mouse.enabled;
        
        console.log('📊 Recording start analysis:');
        console.log('   Zoom enabled:', config.zoom.enabled);
        console.log('   Mouse enabled:', config.mouse.enabled);
        console.log('   Needs processing:', needsProcessing);
        
        let recordingStream;
        
        if (needsProcessing) {
            console.log('🎛️ Creating StreamProcessor for processing...');
            
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
            console.log('📹 Using original stream (no processing needed)');
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
        
        console.log('✅ Recording started successfully');
        
    } catch (error) {
        console.error('❌ Error starting recording:', error);
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
            alert(`Recording saved to ${path}`);
        } else {
            console.log('Save was cancelled.');
        }
    });

    ipcRenderer.on('global-click', (event, clickData) => {
        mouseTracker.handleGlobalClick(clickData);
    });
}

// --- Debug Functions ---
window.debugZoom = function() {
    console.log('🔧 Debug Zoom Function Called');
    console.log('   Config:', config.zoom);
    console.log('   StreamProcessor exists:', !!streamProcessor);
    
    if (streamProcessor) {
        console.log('   Current zoom level:', streamProcessor.zoomLevel);
        console.log('   Target zoom level:', streamProcessor.targetZoomLevel);
        console.log('   Zoom transition active:', streamProcessor.zoomTransition.active);
        
        streamProcessor.lastClickTime = Date.now();
        streamProcessor.handleZoomTrigger();
        console.log('   Manual zoom trigger sent');
    } else {
        console.log('   No StreamProcessor available');
    }
};

window.forceZoom = function(level = 2.0) {
    console.log('🚀 Force Zoom to level:', level);
    if (streamProcessor) {
        streamProcessor.targetZoomLevel = level;
        streamProcessor.startZoomTransition();
        console.log('   Force zoom applied');
    } else {
        console.log('   No StreamProcessor available');
    }
};

window.testZoom = () => {
    if (streamProcessor) {
        streamProcessor.testZoom();
    } else {
        console.log('❌ No StreamProcessor available');
    }
};

window.debugStreamProcessor = () => {
    if (streamProcessor) {
        console.log('🔍 StreamProcessor Debug Info:');
        console.log('   Zoom enabled:', config.zoom.enabled);
        console.log('   Current zoom level:', streamProcessor.zoomLevel);
        console.log('   Last click time:', streamProcessor.lastClickTime);
        console.log('   Time since last click:', Date.now() - streamProcessor.lastClickTime);
        console.log('   Zoom transition active:', streamProcessor.zoomTransition?.active);
    } else {
        console.log('❌ No StreamProcessor available');
    }
};

// Make modules available globally for debugging
window.getStreamProcessor = () => streamProcessor;
window.getRecordingState = () => recordingStateMachine.getState();
window.getScreenTracker = () => screenTracker;
window.getMouseTracker = () => mouseTracker;
