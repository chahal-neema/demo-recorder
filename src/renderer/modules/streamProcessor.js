const { config } = require('./config.js');

class StreamProcessor {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.processedStream = null;
        this.originalStream = null;
        this.animationFrameId = null;
        this.mousePosition = { x: 0, y: 0, relativeX: -1, relativeY: -1 };
        this.recordingBounds = null;
        this.lastClickTime = 0;
        this.zoomLevel = 1.0;
        this.targetZoomLevel = 1.0;
        this.zoomCenter = { x: 0.5, y: 0.5 };
        
        // Zoom animation properties
        this.zoomTransition = {
            active: false,
            startLevel: 1.0,
            targetLevel: 1.0,
            startTime: 0,
            duration: 500 // ms
        };
    }

    async initialize(originalStream, recordingBounds) {
        this.originalStream = originalStream;
        this.recordingBounds = recordingBounds;
        
        // Create processing canvas
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Get video track to determine dimensions
        const videoTrack = originalStream.getVideoTracks()[0];
        const settings = videoTrack.getSettings();
        
        this.canvas.width = settings.width || 1920;
        this.canvas.height = settings.height || 1080;
        
        // Create video element for drawing source
        this.sourceVideo = document.createElement('video');
        this.sourceVideo.srcObject = originalStream;
        this.sourceVideo.autoplay = true;
        this.sourceVideo.muted = true;
        
        await new Promise(resolve => {
            this.sourceVideo.onloadedmetadata = resolve;
        });
        
        // Create processed stream from canvas
        this.processedStream = this.canvas.captureStream(config.recording.framerate || 30);
        
        // Add audio tracks from original stream
        originalStream.getAudioTracks().forEach(track => {
            this.processedStream.addTrack(track);
        });
        
        this.startProcessing();
        return this.processedStream;
    }

    updateMousePosition(position) {
        this.mousePosition = position;
        
        // Update zoom center based on mouse position
        if (config.zoom.enabled && position.relativeX >= 0 && position.relativeY >= 0) {
            this.zoomCenter.x = position.relativeX;
            this.zoomCenter.y = position.relativeY;
            
            // Trigger zoom based on activity
            this.handleZoomTrigger();
        }
    }

    handleZoomTrigger() {
        const now = Date.now();
        let shouldZoom = false;
        
        switch (config.zoom.trigger) {
            case 'mouse':
                // Zoom on mouse movement (you'd track velocity here)
                shouldZoom = true;
                break;
            case 'click':
                // Zoom on recent clicks
                shouldZoom = now - this.lastClickTime < 2000;
                break;
            case 'both':
                shouldZoom = true;
                break;
            case 'keyboard':
                // Would need keyboard activity tracking
                break;
        }
        
        this.targetZoomLevel = shouldZoom ? config.zoom.level : 1.0;
        
        // Start zoom transition if level changed
        if (Math.abs(this.targetZoomLevel - this.zoomLevel) > 0.01) {
            this.startZoomTransition();
        }
    }

    startZoomTransition() {
        this.zoomTransition = {
            active: true,
            startLevel: this.zoomLevel,
            targetLevel: this.targetZoomLevel,
            startTime: Date.now(),
            duration: (6 - config.zoom.speed) * 100 // Convert speed to duration
        };
    }

    updateZoomLevel() {
        if (!this.zoomTransition.active) return;
        
        const now = Date.now();
        const elapsed = now - this.zoomTransition.startTime;
        const progress = Math.min(elapsed / this.zoomTransition.duration, 1);
        
        // Smooth easing function
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        this.zoomLevel = this.zoomTransition.startLevel + 
            (this.zoomTransition.targetLevel - this.zoomTransition.startLevel) * easeProgress;
        
        if (progress >= 1) {
            this.zoomTransition.active = false;
            this.zoomLevel = this.zoomTransition.targetLevel;
        }
    }

    startProcessing() {
        const processFrame = () => {
            this.updateZoomLevel();
            this.renderFrame();
            this.animationFrameId = requestAnimationFrame(processFrame);
        };
        processFrame();
    }

    renderFrame() {
        if (!this.sourceVideo || this.sourceVideo.readyState < 2) return;
        
        const { width, height } = this.canvas;
        this.ctx.clearRect(0, 0, width, height);
        
        // Calculate zoom and pan
        const zoomWidth = width / this.zoomLevel;
        const zoomHeight = height / this.zoomLevel;
        
        const sourceX = (this.zoomCenter.x * width) - (zoomWidth / 2);
        const sourceY = (this.zoomCenter.y * height) - (zoomHeight / 2);
        
        // Clamp to bounds
        const clampedX = Math.max(0, Math.min(width - zoomWidth, sourceX));
        const clampedY = Math.max(0, Math.min(height - zoomHeight, sourceY));
        
        // Draw zoomed video
        this.ctx.drawImage(
            this.sourceVideo,
            clampedX, clampedY, zoomWidth, zoomHeight,
            0, 0, width, height
        );
        
        // Render mouse effects if enabled
        if (config.mouse.enabled) {
            this.renderMouseEffects();
        }
    }

    renderMouseEffects() {
        if (this.mousePosition.relativeX < 0) return;
        
        const x = this.mousePosition.relativeX * this.canvas.width;
        const y = this.mousePosition.relativeY * this.canvas.height;
        
        // Adjust position for zoom
        const adjustedX = (x - (this.zoomCenter.x * this.canvas.width)) * this.zoomLevel + (this.canvas.width / 2);
        const adjustedY = (y - (this.zoomCenter.y * this.canvas.height)) * this.zoomLevel + (this.canvas.height / 2);
        
        if (adjustedX < 0 || adjustedX > this.canvas.width || adjustedY < 0 || adjustedY > this.canvas.height) {
            return; // Mouse is outside zoomed area
        }
        
        // Draw mouse highlight
        if (config.mouse.highlight) {
            const size = config.mouse.highlightSize * 4;
            this.ctx.beginPath();
            this.ctx.arc(adjustedX, adjustedY, size, 0, 2 * Math.PI);
            this.ctx.strokeStyle = config.mouse.highlightColor;
            this.ctx.lineWidth = 3;
            this.ctx.stroke();
        }
        
        // Draw click effects
        if (config.mouse.clickEffects) {
            const elapsed = Date.now() - this.lastClickTime;
            if (elapsed < 1000) {
                const progress = elapsed / 1000;
                this.renderClickEffect(adjustedX, adjustedY, progress);
            }
        }
    }

    renderClickEffect(x, y, progress) {
        const color = config.mouse.highlightColor;
        
        switch (config.mouse.clickAnimation) {
            case 'ripple':
                const radius = progress * 50;
                this.ctx.beginPath();
                this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
                this.ctx.strokeStyle = color;
                this.ctx.globalAlpha = 1 - progress;
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
                this.ctx.globalAlpha = 1;
                break;
                
            case 'pulse':
                const pulseRadius = Math.sin(progress * Math.PI) * 30;
                this.ctx.beginPath();
                this.ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI);
                this.ctx.fillStyle = color;
                this.ctx.globalAlpha = (1 - progress) * 0.7;
                this.ctx.fill();
                this.ctx.globalAlpha = 1;
                break;
                
            case 'ring':
                const ringRadius = 20 + progress * 30;
                this.ctx.beginPath();
                this.ctx.arc(x, y, ringRadius, 0, 2 * Math.PI);
                this.ctx.strokeStyle = color;
                this.ctx.lineWidth = 5 * (1 - progress);
                this.ctx.globalAlpha = 1 - progress;
                this.ctx.stroke();
                this.ctx.globalAlpha = 1;
                break;
        }
    }

    onMouseClick() {
        this.lastClickTime = Date.now();
        
        // Trigger zoom on click if configured
        if (config.zoom.enabled && (config.zoom.trigger === 'click' || config.zoom.trigger === 'both')) {
            this.handleZoomTrigger();
        }
    }

    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        if (this.processedStream) {
            this.processedStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.sourceVideo) {
            this.sourceVideo.srcObject = null;
        }
    }
}

module.exports = StreamProcessor; 