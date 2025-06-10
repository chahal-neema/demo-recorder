const { ipcRenderer } = require('electron');
const { config } = require('./config.js');
const { FormFieldDetector, ButtonDetector } = require('./uiDetection.js');

class MouseTracker {
    constructor() {
        this.mouseTrackingInterval = null;
        this.mouseClickInterval = null;
        this.lastMouseCheck = { x: 0, y: 0, time: 0 };
        this.streamProcessor = null;
        this.isTracking = false;
        
        // Click detection state
        this.ignoreNextClick = false;
        
        // Cursor state tracking
        this.cursorHistory = [];
        this.lastCursorState = null;
        this.cursorTrackingInterval = null;
        
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
        
        this.startPositionTracking();
        this.startClickDetection();
        this.startCursorStateTracking();
        this.formFieldDetector.startDetection();
        this.buttonDetector.startDetection();
    }

    // Stop mouse tracking
    stopTracking() {
        if (!this.isTracking) return;
        
        this.isTracking = false;
        console.log('🖱️ Stopping mouse tracking...');
        
        this.stopPositionTracking();
        this.stopClickDetection();
        this.stopCursorStateTracking();
        this.formFieldDetector.stopDetection();
        this.buttonDetector.stopDetection();
    }

    // Start real-time mouse position tracking
    startPositionTracking() {
        if (this.mouseTrackingInterval) clearInterval(this.mouseTrackingInterval);
        
        const interval = config.mouse.trackingInterval;
        this.mouseTrackingInterval = setInterval(async () => {
            if (!this.streamProcessor || !this.isTracking) return;
            
            try {
                const pos = await ipcRenderer.invoke('get-cursor-position');
                
                // Calculate relative position based on recording bounds
                const recordingBounds = this.streamProcessor.recordingBounds;
                if (recordingBounds) {
                    const relativePos = {
                        x: pos.x,
                        y: pos.y,
                        relativeX: (pos.x - recordingBounds.x) / recordingBounds.width,
                        relativeY: (pos.y - recordingBounds.y) / recordingBounds.height
                    };
                    
                    this.streamProcessor.updateMousePosition(relativePos);
                }
            } catch (error) {
                console.error('Error tracking mouse position:', error);
            }
        }, interval);
    }

    // Stop position tracking
    stopPositionTracking() {
        if (this.mouseTrackingInterval) {
            clearInterval(this.mouseTrackingInterval);
            this.mouseTrackingInterval = null;
        }
    }

    // Start enhanced click detection
    startClickDetection() {
        if (this.mouseClickInterval) clearInterval(this.mouseClickInterval);
        
        console.log('🖱️ Starting enhanced click detection...');
        
        const interval = config.mouse.clickInterval;
        this.mouseClickInterval = setInterval(async () => {
            if (!this.streamProcessor || !this.isTracking) return;
            
            try {
                const pos = await ipcRenderer.invoke('get-cursor-position');
                const now = Date.now();
                
                // Detect potential clicks by mouse position stability
                const dx = Math.abs(pos.x - this.lastMouseCheck.x);
                const dy = Math.abs(pos.y - this.lastMouseCheck.y);
                const dt = now - this.lastMouseCheck.time;
                
                // Detect potential clicks by mouse behavior patterns
                const isStable = dx < 2 && dy < 2; // Very stable position
                const timingGood = dt > 80 && dt < 400; // Good click timing
                const notTooFrequent = now - (this.lastMouseCheck.lastDetectedClick || 0) > 1000; // Debounce
                
                if (isStable && timingGood && notTooFrequent) {
                    console.log('🖱️ Enhanced click detected via mouse analysis at:', pos.x, pos.y);
                    console.log('   Movement delta:', dx, dy, 'Time delta:', dt);
                    console.log('   Position stability: excellent (<2px movement)');
                    
                    // Mark this detection
                    this.lastMouseCheck.lastDetectedClick = now;
                    
                    // Trigger click in StreamProcessor
                    this.streamProcessor.onMouseClick();
                }
                
                this.lastMouseCheck = { x: pos.x, y: pos.y, time: now };
                
            } catch (error) {
                console.error('Error in enhanced click detection:', error);
            }
        }, interval);
    }

    // Stop click detection
    stopClickDetection() {
        if (this.mouseClickInterval) {
            clearInterval(this.mouseClickInterval);
            this.mouseClickInterval = null;
            console.log('🖱️ Enhanced click detection stopped');
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

    // Start cursor state tracking
    startCursorStateTracking() {
        if (this.cursorTrackingInterval) clearInterval(this.cursorTrackingInterval);
        
        console.log('🖱️ Starting cursor state tracking...');
        
        // Poll cursor state at 10fps (less frequent than position tracking)
        this.cursorTrackingInterval = setInterval(async () => {
            if (!this.isTracking) return;
            
            try {
                const cursorInfo = await ipcRenderer.invoke('get-cursor-info');
                
                // Store cursor state in history
                this.cursorHistory.push(cursorInfo);
                
                // Keep only last 50 cursor states (5 seconds at 10fps)
                if (this.cursorHistory.length > 50) {
                    this.cursorHistory.shift();
                }
                
                // Detect cursor type changes
                if (this.lastCursorState && this.lastCursorState.type !== cursorInfo.type) {
                    console.log('🖱️ Cursor type changed:', this.lastCursorState.type, '->', cursorInfo.type, 'confidence:', cursorInfo.confidence);
                    
                    // Notify StreamProcessor about cursor type change
                    if (this.streamProcessor) {
                        this.streamProcessor.onCursorTypeChange(cursorInfo);
                    }
                }
                
                // Analyze cursor state for UI element detection
                const mousePosition = await ipcRenderer.invoke('get-cursor-position');
                
                // Calculate mouse velocity
                let mouseVelocity = 0;
                if (this.cursorHistory.length > 1) {
                    const prev = this.cursorHistory[this.cursorHistory.length - 2];
                    const curr = cursorInfo;
                    const dx = curr.x - prev.x;
                    const dy = curr.y - prev.y;
                    const dt = curr.timestamp - prev.timestamp;
                    mouseVelocity = dt > 0 ? Math.sqrt(dx * dx + dy * dy) / (dt / 1000) : 0; // pixels per second
                }
                
                this.lastMouseVelocity = mouseVelocity;
                
                // Form field detection
                const textFieldDetection = this.formFieldDetector.analyzeCursorState(cursorInfo, mousePosition);
                
                if (textFieldDetection && textFieldDetection.fieldConfidence > 0.8) {
                    console.log('📝 High-confidence text field detected via cursor analysis');
                    
                    // Notify StreamProcessor about text field detection
                    if (this.streamProcessor) {
                        this.streamProcessor.onUIElementDetected('text-field', textFieldDetection);
                    }
                }
                
                // Button detection
                const buttonDetection = this.buttonDetector.analyzeCursorState(cursorInfo, mousePosition, mouseVelocity);
                
                if (buttonDetection && buttonDetection.buttonConfidence > 0.8) {
                    console.log('🔘 High-confidence button detected via cursor analysis');
                    
                    // Notify StreamProcessor about button detection
                    if (this.streamProcessor) {
                        this.streamProcessor.onUIElementDetected('button', buttonDetection);
                    }
                }
                
                this.lastCursorState = cursorInfo;
                
            } catch (error) {
                console.error('Error tracking cursor state:', error);
            }
        }, 100); // 10fps
    }

    // Stop cursor state tracking
    stopCursorStateTracking() {
        if (this.cursorTrackingInterval) {
            clearInterval(this.cursorTrackingInterval);
            this.cursorTrackingInterval = null;
            console.log('🖱️ Cursor state tracking stopped');
        }
        this.cursorHistory = [];
        this.lastCursorState = null;
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
            hasPositionTracking: !!this.mouseTrackingInterval,
            hasClickDetection: !!this.mouseClickInterval,
            hasCursorTracking: !!this.cursorTrackingInterval,
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
        if (this.mouseTrackingInterval) {
            clearInterval(this.mouseTrackingInterval);
            this.mouseTrackingInterval = null;
        }
        if (this.mouseClickInterval) {
            clearInterval(this.mouseClickInterval);
            this.mouseClickInterval = null;
        }
        if (this.cursorTrackingInterval) {
            clearInterval(this.cursorTrackingInterval);
            this.cursorTrackingInterval = null;
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
}

module.exports = MouseTracker;
