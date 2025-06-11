const { ipcRenderer } = require('electron');
const { config } = require('./config.js');
const { FormFieldDetector, ButtonDetector } = require('./uiDetection.js');

class MouseTracker {
    constructor() {
        this.trackingLoop = null;
        this.lastMouseCheck = { x: 0, y: 0, time: 0 };
        this.lastPositionTime = 0;
        this.lastClickTime = 0;
        this.lastCursorTime = 0;
        this.currentPosition = { x: 0, y: 0, relativeX: -1, relativeY: -1 };
        this.currentVelocity = { x: 0, y: 0 };
        this.streamProcessor = null;
        this.isTracking = false;
        
        // Click detection state
        this.ignoreNextClick = false;
        
        // Cursor state tracking
        this.cursorHistory = [];
        this.lastCursorState = null;
        
        // UI detection
        this.formFieldDetector = new FormFieldDetector();
        this.buttonDetector = new ButtonDetector();
        this.lastMouseVelocity = 0;
    }

    // Initialize with StreamProcessor reference
    setStreamProcessor(streamProcessor) {
        this.streamProcessor = streamProcessor;
    }

    // Start mouse tracking for recording
    startTracking() {
        if (this.isTracking) return;

        this.isTracking = true;
        console.log('🖱️ Starting mouse tracking...');

        this.formFieldDetector.startDetection();
        this.buttonDetector.startDetection();

        // Unified tracking loop
        const loopInterval = Math.min(config.mouse.trackingInterval, 20);
        this.trackingLoop = setInterval(() => this.trackingStep(), loopInterval);
    }

    // Stop mouse tracking
    stopTracking() {
        if (!this.isTracking) return;

        this.isTracking = false;
        console.log('🖱️ Stopping mouse tracking...');

        if (this.trackingLoop) {
            clearInterval(this.trackingLoop);
            this.trackingLoop = null;
        }

        this.formFieldDetector.stopDetection();
        this.buttonDetector.stopDetection();
    }

    // Unified tracking loop handler
    async trackingStep() {
        if (!this.streamProcessor || !this.isTracking) return;

        const now = Date.now();

        try {
            const pos = await ipcRenderer.invoke('get-cursor-position');

            const recordingBounds = this.streamProcessor.recordingBounds;
            if (recordingBounds && now - this.lastPositionTime >= config.mouse.trackingInterval) {
                const relativePos = {
                    x: pos.x,
                    y: pos.y,
                    relativeX: (pos.x - recordingBounds.x) / recordingBounds.width,
                    relativeY: (pos.y - recordingBounds.y) / recordingBounds.height
                };
                this.streamProcessor.updateMousePosition(relativePos);
                this.currentVelocity = {
                    x: (relativePos.x - this.currentPosition.x) / Math.max((now - this.lastPositionTime) / 1000, 0.001),
                    y: (relativePos.y - this.currentPosition.y) / Math.max((now - this.lastPositionTime) / 1000, 0.001)
                };
                this.currentPosition = relativePos;
                this.lastPositionTime = now;
            }

            if (now - this.lastClickTime >= config.mouse.clickInterval) {
                const dx = Math.abs(pos.x - this.lastMouseCheck.x);
                const dy = Math.abs(pos.y - this.lastMouseCheck.y);
                const dt = now - this.lastMouseCheck.time;
                const isStable = dx < 2 && dy < 2;
                const timingGood = dt > 80 && dt < 400;
                const notTooFrequent = now - (this.lastMouseCheck.lastDetectedClick || 0) > 1000;
                if (isStable && timingGood && notTooFrequent) {
                    this.lastMouseCheck.lastDetectedClick = now;
                    this.streamProcessor.onMouseClick();
                }
                this.lastMouseCheck = { x: pos.x, y: pos.y, time: now };
                this.lastClickTime = now;
            }

            if (now - this.lastCursorTime >= 100) {
                const cursorInfo = await ipcRenderer.invoke('get-cursor-info');
                this.cursorHistory.push(cursorInfo);
                if (this.cursorHistory.length > 50) this.cursorHistory.shift();

                if (this.lastCursorState && this.lastCursorState.type !== cursorInfo.type && this.streamProcessor) {
                    this.streamProcessor.onCursorTypeChange(cursorInfo);
                }

                const mouseVelocity = this.cursorHistory.length > 1 ?
                    Math.sqrt(Math.pow(cursorInfo.x - this.cursorHistory[this.cursorHistory.length - 2].x, 2) +
                              Math.pow(cursorInfo.y - this.cursorHistory[this.cursorHistory.length - 2].y, 2)) /
                    ((cursorInfo.timestamp - this.cursorHistory[this.cursorHistory.length - 2].timestamp) / 1000) : 0;
                this.lastMouseVelocity = mouseVelocity;

                const textFieldDetection = this.formFieldDetector.analyzeCursorState(cursorInfo, pos);
                if (textFieldDetection && textFieldDetection.fieldConfidence > 0.8 && this.streamProcessor) {
                    this.streamProcessor.onUIElementDetected('text-field', textFieldDetection);
                }

                const buttonDetection = this.buttonDetector.analyzeCursorState(cursorInfo, pos, mouseVelocity);
                if (buttonDetection && buttonDetection.buttonConfidence > 0.8 && this.streamProcessor) {
                    this.streamProcessor.onUIElementDetected('button', buttonDetection);
                }

                this.lastCursorState = cursorInfo;
                this.lastCursorTime = now;
            }

        } catch (error) {
            console.error('Error in mouse tracking loop:', error);
        }
    }

    // Handle document click events
    handleDocumentClick(event) {
        console.log('🖱️ Document click detected at:', event.clientX, event.clientY);
        console.log('   StreamProcessor exists:', !!this.streamProcessor);
        console.log('   Is tracking:', this.isTracking);
        
        // Skip if click originated from UI controls
        if (event.target.closest('.recording-controls, .source-selection, .settings-section')) {
            console.log('   Skipping UI control click');
            return;
        }
        
        if (this.streamProcessor && this.isTracking) {
            console.log('   Forwarding click to StreamProcessor...');
            this.streamProcessor.onMouseClick();
            
            // Also notify main process for logging
            ipcRenderer.invoke('notify-click', event.clientX, event.clientY);
        } else {
            console.log('   No StreamProcessor to forward click to');
        }
    }

    // Handle global click events from main process
    handleGlobalClick(clickData) {
        const now = Date.now();
        console.log('🌍 Global click received:', clickData);
        
        // Check if this click is on the recorded screen area
        if (this.streamProcessor && this.isTracking) {
            const recordingBounds = this.streamProcessor.recordingBounds;
            
            if (recordingBounds) {
                const isInRecordingArea = 
                    clickData.x >= recordingBounds.x &&
                    clickData.x <= recordingBounds.x + recordingBounds.width &&
                    clickData.y >= recordingBounds.y &&
                    clickData.y <= recordingBounds.y + recordingBounds.height;
                
                console.log('   Recording bounds:', recordingBounds);
                console.log('   Click position:', clickData.x, clickData.y);
                console.log('   Is in recording area:', isInRecordingArea);
                
                if (isInRecordingArea) {
                    console.log('✅ Global click is in recording area - triggering zoom!');
                    
                    // Calculate relative position for the click
                    const relativePos = {
                        x: clickData.x,
                        y: clickData.y,
                        relativeX: (clickData.x - recordingBounds.x) / recordingBounds.width,
                        relativeY: (clickData.y - recordingBounds.y) / recordingBounds.height
                    };
                    
                    // Update mouse position first, then trigger click
                    this.streamProcessor.updateMousePosition(relativePos);
                    this.currentPosition = relativePos;
                    this.lastPositionTime = now;
                    this.streamProcessor.onMouseClick();
                } else {
                    console.log('❌ Global click outside recording area - ignoring');
                }
            } else {
                console.log('⚠️ No recording bounds available');
            }
        } else {
            console.log('❌ No StreamProcessor or not tracking');
        }
    }

    // Set ignore flag for next click (useful for UI interactions)
    setIgnoreNextClick() {
        this.ignoreNextClick = true;
        setTimeout(() => {
            this.ignoreNextClick = false;
        }, 100); // Clear after 100ms
    }

    // Get cursor state analysis
    getCursorStateAnalysis() {
        if (this.cursorHistory.length < 5) {
            return { 
                dominantType: 'default', 
                confidence: 0.5,
                recentChanges: 0,
                stability: 'unknown'
            };
        }
        
        const recent = this.cursorHistory.slice(-10); // Last 1 second
        const typeCounts = {};
        let changes = 0;
        
        // Count cursor types and changes
        for (let i = 0; i < recent.length; i++) {
            const type = recent[i].type;
            typeCounts[type] = (typeCounts[type] || 0) + 1;
            
            if (i > 0 && recent[i].type !== recent[i-1].type) {
                changes++;
            }
        }
        
        // Find dominant type
        let dominantType = 'default';
        let maxCount = 0;
        for (const [type, count] of Object.entries(typeCounts)) {
            if (count > maxCount) {
                maxCount = count;
                dominantType = type;
            }
        }
        
        const confidence = maxCount / recent.length;
        const stability = changes <= 1 ? 'stable' : changes <= 3 ? 'moderate' : 'unstable';
        
        return {
            dominantType,
            confidence,
            recentChanges: changes,
            stability,
            typeCounts
        };
    }

    // Get form field detection at position
    getFormFieldDetectionAt(position, radius = 20) {
        return this.formFieldDetector.getTextFieldDetectionAt(position, radius);
    }

    // Get button detection at position
    getButtonDetectionAt(position, radius = 25) {
        return this.buttonDetector.getButtonDetectionAt(position, radius);
    }

    // Test form field detection accuracy
    testFormFieldDetection() {
        return this.formFieldDetector.testDetectionAccuracy();
    }

    // Test button detection accuracy
    testButtonDetection() {
        return this.buttonDetector.testDetectionAccuracy();
    }

    // Get tracking state
    getState() {
        const formFieldStats = this.formFieldDetector.getStats();
        const buttonStats = this.buttonDetector.getStats();
        
        return {
            isTracking: this.isTracking,
            hasStreamProcessor: !!this.streamProcessor,
            hasPositionTracking: !!this.trackingLoop,
            hasClickDetection: !!this.trackingLoop,
            hasCursorTracking: !!this.trackingLoop,
            cursorHistoryLength: this.cursorHistory.length,
            lastCursorType: this.lastCursorState?.type || 'unknown',
            lastMouseVelocity: this.lastMouseVelocity,
            formFieldDetection: formFieldStats,
            buttonDetection: buttonStats
        };
    }

    // Cleanup
    destroy() {
        this.stopTracking();
        this.cursorHistory = [];
        this.lastCursorState = null;
        this.formFieldDetector.destroy();
        this.buttonDetector.destroy();
        this.streamProcessor = null;
    }

    stop() {
        if (this.trackingLoop) {
            clearInterval(this.trackingLoop);
            this.trackingLoop = null;
        }
        this.cursorHistory = [];
        this.lastCursorState = null;
        console.log('MouseTracker stopped');
    }
    
    // Expose UI detection data for preview
    getUIDetectionData() {
        if (!this.formFieldDetector || !this.buttonDetector) return null;
        
        return {
            formFieldDetections: this.formFieldDetector.detections,
            buttonDetections: this.buttonDetector.detections,
            currentUIElement: this.lastCursorState,
            lastDetectionTime: this.lastMouseCheck.time
        };
    }
    
    // Expose performance metrics
    getPerformanceMetrics() {
        if (!this.formFieldDetector || !this.buttonDetector) return null;
        
        const now = Date.now();
        const recentDetections = this.cursorHistory.filter(c => now - c.timestamp < 5000);
        
        return {
            detectionFPS: this.formFieldDetector.getCurrentFPS ? this.formFieldDetector.getCurrentFPS() : 0,
            avgDetectionTime: this.formFieldDetector.getAverageDetectionTime ? this.formFieldDetector.getAverageDetectionTime() : 0,
            cacheHitRate: this.formFieldDetector.getCacheHitRate ? this.formFieldDetector.getCacheHitRate() : 0,
            totalDetections: recentDetections.length,
            activeUIElements: this.lastCursorState ? 1 : 0
        };
    }

    // Current mouse position for preview usage
    getCurrentPosition() {
        return { ...this.currentPosition };
    }

    getCurrentVelocity() {
        return { ...this.currentVelocity };
    }
}

module.exports = MouseTracker;
