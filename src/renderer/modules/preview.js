const { ipcRenderer } = require('electron');
const { config } = require('./config.js');
const { renderMouseEffects, renderZoomIndicators, renderUIDetectionOverlay, renderPerformanceOverlay } = require('./effects.js');

let previewCanvas = null;
let previewCtx = null;
let realMousePosition = { x: 0, y: 0, relativeX: -1, relativeY: -1 };
let mouseVelocity = { x: 0, y: 0 };
let lastMouseTime = 0;
let lastClickTime = 0;
let animationFrameId = null;
let mouseTrackingInterval = null;
let displayInfo = null;
let recordingBounds = null;

// UI Detection integration
let uiDetectionData = null;
let performanceData = null;
let uiDataRequestInterval = null;

let dom = {};

async function initializePreview(domElements, selectedSource) {
    console.log('Initializing preview effects...');
    dom = domElements;

    if (!dom.previewContainer || !dom.previewVideo) {
        console.error('Preview container or video not found');
        return;
    }

    displayInfo = await ipcRenderer.invoke('get-display-info');
    await setupRecordingBounds(selectedSource);
    
    setupCanvases();
    startRealMouseTracking();
    startUIDetectionTracking();
    
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    renderPreviewEffects();
    
    dom.previewContainer.addEventListener('click', () => lastClickTime = Date.now());
}

function updateRecordingBounds(selectedSource) {
    setupRecordingBounds(selectedSource);
}

function setupCanvases() {
    if (!previewCanvas) {
        previewCanvas = document.createElement('canvas');
        previewCanvas.style.position = 'absolute';
        previewCanvas.style.pointerEvents = 'none';
        previewCanvas.style.zIndex = '10';
        dom.previewContainer.appendChild(previewCanvas);
        previewCtx = previewCanvas.getContext('2d');
    }
    
    const resizeCanvas = () => {
        const containerRect = dom.previewContainer.getBoundingClientRect();
        const video = dom.previewVideo;
        if (!video.videoWidth || !video.videoHeight) return;

        const videoAspect = video.videoWidth / video.videoHeight;
        const containerAspect = containerRect.width / containerRect.height;
        
        let displayWidth, displayHeight, offsetX = 0, offsetY = 0;
        
        // Since we're using object-fit: contain, calculate the actual display size
        if (videoAspect > containerAspect) {
            // Video is wider - fit to container width
            displayWidth = containerRect.width;
            displayHeight = containerRect.width / videoAspect;
            offsetY = (containerRect.height - displayHeight) / 2;
        } else {
            // Video is taller - fit to container height
            displayHeight = containerRect.height;
            displayWidth = containerRect.height * videoAspect;
            offsetX = (containerRect.width - displayWidth) / 2;
        }
        
        // Set canvas to match the actual video display area
        previewCanvas.width = displayWidth;
        previewCanvas.height = displayHeight;
        previewCanvas.style.width = `${displayWidth}px`;
        previewCanvas.style.height = `${displayHeight}px`;
        previewCanvas.style.left = `${offsetX}px`;
        previewCanvas.style.top = `${offsetY}px`;
        
        console.log(`Canvas resized: ${displayWidth}x${displayHeight} at offset (${offsetX}, ${offsetY})`);
        console.log(`Video dimensions: ${video.videoWidth}x${video.videoHeight}, aspect: ${videoAspect}`);
        console.log(`Container dimensions: ${containerRect.width}x${containerRect.height}, aspect: ${containerAspect}`);
    };

    dom.previewVideo.addEventListener('loadedmetadata', resizeCanvas);
    dom.previewVideo.addEventListener('resize', resizeCanvas);
    window.addEventListener('resize', resizeCanvas);
    if (dom.previewVideo.videoWidth > 0) resizeCanvas();
}

async function setupRecordingBounds(selectedSource) {
    if (!selectedSource || !displayInfo) return;
    
    if (selectedSource.type === 'screen') {
        const display = displayInfo.displays.find(d => d.id.toString() === selectedSource.id.split('-')[1]) || displayInfo.primary;
        recordingBounds = display.bounds;
    } else {
        // Fallback for window for now
        recordingBounds = displayInfo.primary.bounds;
    }
}

function startRealMouseTracking() {
    if (mouseTrackingInterval) clearInterval(mouseTrackingInterval);
    
    mouseTrackingInterval = setInterval(async () => {
        try {
            const now = Date.now();
            const pos = await ipcRenderer.invoke('get-cursor-position');
            
            if (lastMouseTime > 0) {
                const dt = (now - lastMouseTime) / 1000;
                mouseVelocity.x = (pos.x - realMousePosition.x) / dt;
                mouseVelocity.y = (pos.y - realMousePosition.y) / dt;
            }
            
            realMousePosition = pos;
            lastMouseTime = now;
            
            if (recordingBounds) {
                realMousePosition.relativeX = (pos.x - recordingBounds.x) / recordingBounds.width;
                realMousePosition.relativeY = (pos.y - recordingBounds.y) / recordingBounds.height;
            }
        } catch (error) {
            console.error('Error tracking mouse:', error);
        }
    }, 16); // ~60fps
}

function startUIDetectionTracking() {
    if (uiDataRequestInterval) clearInterval(uiDataRequestInterval);
    
    // Request UI detection data at 10fps (performance optimized)
    uiDataRequestInterval = setInterval(async () => {
        try {
            // Get current UI detection state from MouseTracker
            const mouseTracker = require('./mouseTracker.js');
            if (mouseTracker && typeof mouseTracker.getUIDetectionData === 'function') {
                uiDetectionData = mouseTracker.getUIDetectionData();
            }
            
            // Get performance metrics
            if (mouseTracker && typeof mouseTracker.getPerformanceMetrics === 'function') {
                performanceData = mouseTracker.getPerformanceMetrics();
            }
        } catch (error) {
            console.error('Error fetching UI detection data:', error);
        }
    }, 100); // 10fps for performance
}

function renderPreviewEffects() {
    if (!previewCtx) return;
    
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    
    const effectData = {
        ctx: previewCtx,
        canvas: previewCanvas,
        mousePos: realMousePosition,
        velocity: mouseVelocity,
        lastClick: lastClickTime,
    };

    if (config.mouse.enabled) {
        renderMouseEffects(effectData);
    }
    
    if (config.zoom.enabled) {
        renderZoomIndicators(effectData);
    }
    
    // Render UI detection overlays
    if (uiDetectionData && config.debug && config.debug.showUIDetections) {
        renderUIDetectionOverlay({
            ctx: previewCtx,
            canvas: previewCanvas,
            uiDetections: uiDetectionData,
            recordingBounds: recordingBounds
        });
    }
    
    // Render performance overlay (optional - can be toggled)
    if (performanceData && config.debug && config.debug.showPerformance) {
        renderPerformanceOverlay({
            ctx: previewCtx,
            canvas: previewCanvas,
            performanceData: performanceData
        });
    }
    
    animationFrameId = requestAnimationFrame(renderPreviewEffects);
}

function stopPreview() {
    if (mouseTrackingInterval) clearInterval(mouseTrackingInterval);
    if (uiDataRequestInterval) clearInterval(uiDataRequestInterval);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if(previewCanvas && previewCanvas.parentElement) {
        previewCanvas.parentElement.removeChild(previewCanvas);
    }
    previewCanvas = null;
    previewCtx = null;
    mouseTrackingInterval = null;
    uiDataRequestInterval = null;
    animationFrameId = null;
    uiDetectionData = null;
    performanceData = null;
}

module.exports = {
    initializePreview,
    updateRecordingBounds,
    stopPreview
}; 