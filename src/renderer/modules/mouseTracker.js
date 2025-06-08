const { ipcRenderer } = require('electron');

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
        }, 16); // ~60fps
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
        }, 50); // Check every 50ms
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
        console.log('🌍 Global click received:', clickData);
        
        if (this.streamProcessor && this.isTracking) {
            console.log('   Forwarding global click to StreamProcessor...');
            this.streamProcessor.onMouseClick();
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