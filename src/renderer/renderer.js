const { ipcRenderer } = require('electron');
const { config } = require('./modules/config.js');
const UI = require('./modules/ui.js');
const RecordingStateMachine = require('./modules/stateMachine.js');
const ScreenTracker = require('./modules/screenTracker.js');
const MouseTracker = require('./modules/mouseTracker.js');
const StreamProcessor = require('./modules/streamProcessor.js');
const logger = require('./modules/logger.js');
const PostProcessor = require('../services/PostProcessor.js');

// Initialize logging system only when enabled in config
if (config.debug.enableLogging) {
    logger.initialize('debug.log');
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
    if(dom.zoomGraceSlider) UI.updateZoomGraceLabel(dom.zoomGraceSlider.value);
    if(dom.highlightSizeSlider) UI.updateHighlightSizeLabel(dom.highlightSizeSlider.value);
    if(dom.highlightColorPicker) UI.updateColorLabel(dom.highlightColorPicker.value);
    if(dom.trackingIntervalSlider) UI.updateTrackingIntervalLabel(dom.trackingIntervalSlider.value);
    if(dom.clickIntervalSlider) UI.updateClickIntervalLabel(dom.clickIntervalSlider.value);
    
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
    logger.recording('Recording completed, starting post-processing...');

    let processedBuffer = buffer;
    try {
        const processor = new PostProcessor();
        processedBuffer = await processor.processBuffer(buffer);
        logger.recording('Post-processing complete');
    } catch (err) {
        logger.error('Post-processing failed, using original recording', err);
    }

    // Cleanup
    if (streamProcessor) {
        streamProcessor.destroy();
        streamProcessor = null;
    }

    mouseTracker.stopTracking();

    // Notify main process
    ipcRenderer.send('recording-stopped');

    // Save recording
    await ipcRenderer.invoke('save-recording', processedBuffer);
}

// --- Recording Functions ---
async function startRecording() {
    const sourceInfo = screenTracker.getCurrentSource();
    if (!sourceInfo.hasValidSource) {
        alert('Please select a recording source first!');
        return;
    }

    logger.recording('Starting recording...');
    logger.recording('Recording start analysis:');
    logger.recording('   Zoom enabled:', config.zoom.enabled);
    logger.recording('   Mouse enabled:', config.mouse.enabled);
    logger.recording('   Needs processing:', config.zoom.enabled || config.mouse.enabled);

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
        console.log('🌍 IPC GLOBAL CLICK RECEIVED:', clickData);
        logger.mouse('Global click IPC received:', clickData);
        mouseTracker.handleGlobalClick(clickData);
    });

    // Menu actions from the native application menu
    ipcRenderer.on('menu-start-recording', () => {
        logger.ui('Menu triggered start recording');
        startRecording();
    });

    ipcRenderer.on('menu-stop-recording', () => {
        logger.ui('Menu triggered stop recording');
        recordingStateMachine.stopRecording();
    });

    ipcRenderer.on('menu-pause-recording', () => {
        logger.ui('Menu triggered pause/resume');
        recordingStateMachine.pauseRecording();
    });

    ipcRenderer.on('menu-new-recording', () => {
        logger.ui('Menu triggered new recording');
        if (recordingStateMachine.getState().isRecording) {
            recordingStateMachine.stopRecording();
        }
        window.location.reload();
    });

    ipcRenderer.on('menu-open-recordings', async () => {
        logger.ui('Menu triggered open recordings folder');
        await ipcRenderer.invoke('open-recordings-folder');
    });
}

// --- Debug Functions ---
window.debugConfig = function() {
    logger.debug('=== Configuration Debug ===');
    logger.debug('Current config object:', config);
    
    // Check UI state
    const enableZoomCheck = document.getElementById('enable-zoom');
    logger.debug('Enable zoom checkbox element:', !!enableZoomCheck);
    logger.debug('Enable zoom checkbox checked:', enableZoomCheck ? enableZoomCheck.checked : 'N/A');
    
    // Check if UI and config are in sync
    logger.debug('Config zoom enabled:', config.zoom.enabled);
    logger.debug('UI checkbox matches config:', enableZoomCheck ? (enableZoomCheck.checked === config.zoom.enabled) : 'N/A');
    
    // Check StreamProcessor state
    logger.debug('StreamProcessor exists:', !!streamProcessor);
    if (streamProcessor) {
        logger.debug('StreamProcessor zoom level:', streamProcessor.zoomLevel);
        logger.debug('StreamProcessor target zoom:', streamProcessor.targetZoomLevel);
    }
    
    return {
        config: config,
        uiState: enableZoomCheck ? enableZoomCheck.checked : null,
        streamProcessor: streamProcessor ? {
            zoomLevel: streamProcessor.zoomLevel,
            targetZoomLevel: streamProcessor.targetZoomLevel
        } : null
    };
};

window.enableZoomForTesting = function() {
    logger.debug('=== Manually Enabling Zoom for Testing ===');
    
    // Enable zoom in config
    config.zoom.enabled = true;
    logger.debug('Config zoom enabled set to:', config.zoom.enabled);
    
    // Update UI checkbox to match
    const enableZoomCheck = document.getElementById('enable-zoom');
    if (enableZoomCheck) {
        enableZoomCheck.checked = true;
        logger.debug('UI checkbox updated to checked');
        
        // Trigger change event to ensure UI sync
        enableZoomCheck.dispatchEvent(new Event('change'));
        logger.debug('Change event dispatched');
    } else {
        logger.debug('Could not find enable-zoom checkbox element');
    }
    
    return {
        configEnabled: config.zoom.enabled,
        uiChecked: enableZoomCheck ? enableZoomCheck.checked : null
    };
};

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

window.debugRecordingBounds = async function() {
    logger.debug('=== Recording Bounds Debug ===');
    
    if (!screenTracker.selectedSource) {
        logger.debug('No source selected');
        return { error: 'No source selected' };
    }
    
    try {
        const bounds = await screenTracker.getRecordingBounds();
        logger.debug('Recording bounds:', bounds);
        
        // Test some sample click positions
        const testClicks = [
            { x: -1400, y: 400, desc: 'Screen 2 center-left' },
            { x: -800, y: 600, desc: 'Screen 2 center-right' },
            { x: 500, y: 500, desc: 'Primary screen center' }
        ];
        
        const results = testClicks.map(click => {
            const isInBounds = 
                click.x >= bounds.x && 
                click.x <= bounds.x + bounds.width &&
                click.y >= bounds.y && 
                click.y <= bounds.y + bounds.height;
            
            return {
                position: `${click.x}, ${click.y}`,
                description: click.desc,
                inBounds: isInBounds
            };
        });
        
        logger.debug('Click position tests:', results);
        
        return {
            selectedSource: screenTracker.selectedSource,
            recordingBounds: bounds,
            clickTests: results
        };
        
    } catch (error) {
        logger.debug('Error getting recording bounds:', error);
        return { error: error.message };
    }
};

window.debugGlobalClickDetection = function() {
    logger.debug('=== Global Click Detection Debug ===');
    
    const mouseState = mouseTracker.getState();
    logger.debug('MouseTracker state:', mouseState);
    
    if (streamProcessor) {
        logger.debug('StreamProcessor recording bounds:', streamProcessor.recordingBounds);
        logger.debug('StreamProcessor mouse position:', streamProcessor.mousePosition);
    }
    
    // Test by simulating a global click
    const testClick = {
        x: 960, // Middle of 1920 width
        y: 540, // Middle of 1080 height
        timestamp: Date.now(),
        source: 'debug-test'
    };
    
    logger.debug('Simulating test global click:', testClick);
    mouseTracker.handleGlobalClick(testClick);
    
    return {
        mouseState,
        streamProcessor: !!streamProcessor,
        recordingBounds: streamProcessor ? streamProcessor.recordingBounds : null
    };
};

window.debugMouseTracker = function() {
    logger.debug('=== MouseTracker Debug ===');
    return mouseTracker.getState();
};

window.testZoomCenter = function() {
    if (!streamProcessor) {
        logger.debug('No StreamProcessor available');
        return;
    }
    
    logger.debug('=== Zoom Center Test ===');
    logger.debug('Current zoom level:', streamProcessor.zoomLevel);
    logger.debug('Target zoom level:', streamProcessor.targetZoomLevel);
    logger.debug('Zoom center:', streamProcessor.zoomCenter);
    logger.debug('Zoom center target:', streamProcessor.zoomCenterTarget);
    logger.debug('Mouse position:', streamProcessor.mousePosition);
    
    // Force zoom in and set center to mouse position
    streamProcessor.targetZoomLevel = 2.0;
    streamProcessor.startZoomTransition();
    
    if (streamProcessor.mousePosition.relativeX >= 0) {
        streamProcessor.zoomCenterTarget.x = streamProcessor.mousePosition.relativeX;
        streamProcessor.zoomCenterTarget.y = streamProcessor.mousePosition.relativeY;
        logger.debug('Zoom center set to current mouse position');
    } else {
        // Set to center if no mouse position
        streamProcessor.zoomCenterTarget.x = 0.5;
        streamProcessor.zoomCenterTarget.y = 0.5;
        logger.debug('Zoom center set to screen center (no mouse position)');
    }
};

window.debugZoomTracking = function() {
    if (!streamProcessor) {
        logger.debug('No StreamProcessor available');
        return;
    }
    
    return {
        zoomLevel: streamProcessor.zoomLevel,
        targetZoomLevel: streamProcessor.targetZoomLevel,
        zoomCenter: streamProcessor.zoomCenter,
        zoomCenterTarget: streamProcessor.zoomCenterTarget,
        mousePosition: streamProcessor.mousePosition,
        isZoomedIn: streamProcessor.zoomLevel > 1.05,
        transitionActive: streamProcessor.zoomTransition.active
    };
};

// Make modules available globally for debugging
window.getStreamProcessor = () => streamProcessor;
window.getRecordingState = () => recordingStateMachine.getState();
window.getScreenTracker = () => screenTracker;
window.getMouseTracker = () => mouseTracker;
window.getLogger = () => logger;

