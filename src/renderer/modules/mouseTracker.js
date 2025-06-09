const { ipcRenderer } = require('electron');
const { config } = require('./config.js');

class MouseTracker {
    constructor() {
        this.mouseTrackingInterval = null;
        this.mouseClickInterval = null;
        this.lastMouseCheck = { x: 0, y: 0, time: 0 };
        this.streamProcessor = null;
        this.isTracking = false;
        
        // Click detection state
        this.ignoreNextClick = false;
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
    }

    // Stop mouse tracking
    stopTracking() {
        if (!this.isTracking) return;
        
        this.isTracking = false;
        console.log('🖱️ Stopping mouse tracking...');
        
        this.stopPositionTracking();
        this.stopClickDetection();
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

    // Get tracking state
    getState() {
        return {
            isTracking: this.isTracking,
            hasStreamProcessor: !!this.streamProcessor,
            hasPositionTracking: !!this.mouseTrackingInterval,
            hasClickDetection: !!this.mouseClickInterval
        };
    }

    // Cleanup
    destroy() {
        this.stopTracking();
        this.streamProcessor = null;
    }
}

module.exports = MouseTracker;
