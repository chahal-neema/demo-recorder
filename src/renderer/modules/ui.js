const { config } = require('./config.js');

let domElements = {};

function cacheDOMElements() {
    domElements = {
        // Source Selection
        sourceGrid: document.getElementById('source-grid'),
        refreshSourcesBtn: document.getElementById('refresh-sources'),
        sourceTypeBtns: document.querySelectorAll('.source-type-btn'),

        // Recording Options
        includeAudioCheck: document.getElementById('include-audio'),
        includeMicrophoneCheck: document.getElementById('include-microphone'),
        qualitySelect: document.getElementById('quality-select'),
        framerateSelect: document.getElementById('framerate-select'),

        // Zoom & Mouse
        enableZoomCheck: document.getElementById('enable-zoom'),
        zoomSettings: document.getElementById('zoom-settings'),
        zoomLevelSlider: document.getElementById('zoom-level'),
        zoomLevelValue: document.getElementById('zoom-level-value'),
        zoomSpeedSlider: document.getElementById('zoom-speed'),
        zoomSpeedValue: document.getElementById('zoom-speed-value'),
        zoomTriggerSelect: document.getElementById('zoom-trigger'),
        zoomSensitivitySlider: document.getElementById('zoom-sensitivity'),
        zoomSensitivityValue: document.getElementById('zoom-sensitivity-value'),

        enableMouseTrackingCheck: document.getElementById('enable-mouse-tracking'),
        mouseSettings: document.getElementById('mouse-settings'),
        mouseHighlightCheck: document.getElementById('mouse-highlight'),
        highlightSizeSlider: document.getElementById('highlight-size'),
        highlightSizeValue: document.getElementById('highlight-size-value'),
        highlightColorPicker: document.getElementById('highlight-color'),
        highlightColorLabel: document.querySelector('.color-label'),
        clickEffectsCheck: document.getElementById('click-effects'),
        clickAnimationSelect: document.getElementById('click-animation'),

        // Recording Controls
        startBtn: document.getElementById('start-recording'),
        pauseBtn: document.getElementById('pause-recording'),
        stopBtn: document.getElementById('stop-recording'),

        // Status
        statusIndicator: document.getElementById('status-indicator'),
        statusText: document.getElementById('status-text'),
        timer: document.getElementById('recording-timer'),
        
        // Preview
        previewVideo: document.getElementById('preview-video'),
        previewPlaceholder: document.getElementById('preview-placeholder'),
        previewContainer: document.querySelector('.preview-container'),
    };
    return domElements;
}

function updateButtonStates(isRecording, isPaused) {
    domElements.startBtn.disabled = isRecording;
    domElements.pauseBtn.disabled = !isRecording || isPaused;
    domElements.stopBtn.disabled = !isRecording;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function updateTimer(time) {
    domElements.timer.textContent = formatTime(time);
}

function updateStatus(text, color) {
    domElements.statusText.textContent = text;
    if (color) {
        domElements.statusIndicator.style.background = color;
    }
}

function updateZoomLevelLabel(value) {
    domElements.zoomLevelValue.textContent = `${value}x`;
}

function updateZoomSpeedLabel(value) {
    const labels = ['Slowest', 'Slow', 'Medium', 'Fast', 'Fastest'];
    domElements.zoomSpeedValue.textContent = labels[value - 1];
}

function updateZoomSensitivityLabel(value) {
    const levels = ['Very Low', 'Low', 'Low-Med', 'Medium', 'Med-High', 'High', 'Higher', 'Very High', 'Maximum', 'Ultra'];
    domElements.zoomSensitivityValue.textContent = levels[value - 1];
}

function updateHighlightSizeLabel(value) {
    const labels = ['Tiny', 'Small', 'Medium', 'Large', 'Extra Large'];
    domElements.highlightSizeValue.textContent = labels[value - 1];
}

function updateColorLabel(color) {
    const colorName = getColorName(color);
    domElements.highlightColorLabel.textContent = colorName;
    domElements.highlightColorLabel.style.color = color;
}

function getColorName(hex) {
    // This is a simplified map. A more robust solution might use a library.
    const colorMap = {
        '#1db954': 'Green',
        '#ff4500': 'OrangeRed',
        '#1e90ff': 'DodgerBlue',
        '#ffff00': 'Yellow',
        '#ff0000': 'Red',
    };
    return colorMap[hex.toLowerCase()] || hex;
}

function setupEventListeners(handlers) {
    console.log('🎯 UI.setupEventListeners called with handlers:', Object.keys(handlers));
    console.log('🎯 Source type buttons found:', domElements.sourceTypeBtns.length);
    
    // Source selection
    domElements.sourceTypeBtns.forEach((btn, index) => {
        console.log(`🎯 Setting up listener for button ${index}:`, btn.dataset.type);
        btn.addEventListener('click', () => {
            console.log('🔥 Source type button clicked:', btn.dataset.type);
            domElements.sourceTypeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            handlers.onSourceTypeChange(btn.dataset.type);
        });
    });
    domElements.refreshSourcesBtn.addEventListener('click', handlers.onRefreshSources);

    // Recording options
    domElements.includeAudioCheck.addEventListener('change', (e) => config.recording.includeAudio = e.target.checked);
    domElements.includeMicrophoneCheck.addEventListener('change', (e) => config.recording.includeMicrophone = e.target.checked);
    domElements.qualitySelect.addEventListener('change', (e) => config.recording.quality = e.target.value);
    domElements.framerateSelect.addEventListener('change', (e) => config.recording.framerate = parseInt(e.target.value, 10));

    // Zoom settings
    domElements.enableZoomCheck.addEventListener('change', (e) => {
        config.zoom.enabled = e.target.checked;
        domElements.zoomSettings.classList.toggle('disabled', !config.zoom.enabled);
    });
    domElements.zoomLevelSlider.addEventListener('input', (e) => {
        config.zoom.level = parseFloat(e.target.value);
        updateZoomLevelLabel(config.zoom.level);
    });
    domElements.zoomSpeedSlider.addEventListener('input', (e) => {
        config.zoom.speed = parseInt(e.target.value, 10);
        updateZoomSpeedLabel(config.zoom.speed);
    });
    domElements.zoomTriggerSelect.addEventListener('change', (e) => {
        config.zoom.trigger = e.target.value;
    });
    domElements.zoomSensitivitySlider.addEventListener('input', (e) => {
        config.zoom.sensitivity = parseInt(e.target.value, 10);
        updateZoomSensitivityLabel(config.zoom.sensitivity);
    });

    // Mouse settings
    domElements.enableMouseTrackingCheck.addEventListener('change', (e) => {
        config.mouse.enabled = e.target.checked;
        domElements.mouseSettings.classList.toggle('disabled', !config.mouse.enabled);
    });
    domElements.mouseHighlightCheck.addEventListener('change', (e) => config.mouse.highlight = e.target.checked);
    domElements.clickEffectsCheck.addEventListener('change', (e) => config.mouse.clickEffects = e.target.checked);
    domElements.highlightSizeSlider.addEventListener('input', (e) => {
        config.mouse.highlightSize = parseInt(e.target.value, 10);
        updateHighlightSizeLabel(config.mouse.highlightSize);
    });
    domElements.highlightColorPicker.addEventListener('input', (e) => {
        config.mouse.highlightColor = e.target.value;
        updateColorLabel(config.mouse.highlightColor);
    });
    domElements.clickAnimationSelect.addEventListener('change', (e) => config.mouse.clickAnimation = e.target.value);

    // Recording controls
    domElements.startBtn.addEventListener('click', handlers.onStartRecording);
    domElements.pauseBtn.addEventListener('click', handlers.onPauseRecording);
    domElements.stopBtn.addEventListener('click', handlers.onStopRecording);
    
    console.log('✅ All event listeners attached');
}

module.exports = {
    cacheDOMElements,
    updateButtonStates,
    formatTime,
    updateTimer,
    updateStatus,
    updateZoomLevelLabel,
    updateZoomSpeedLabel,
    updateZoomSensitivityLabel,
    updateHighlightSizeLabel,
    updateColorLabel,
    setupEventListeners
}; 