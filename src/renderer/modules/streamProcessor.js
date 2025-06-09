const { config } = require('./config.js');

class StreamProcessor {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.processedStream = null;
        this.originalStream = null;
        this.animationFrameId = null;
        
        // Initialize with clean state
        this.resetZoomState();
        console.log('🎬 StreamProcessor created with clean 1.0x zoom state');
    }
    
    resetZoomState() {
        // Reset all zoom and mouse tracking state
        this.mousePosition = { x: 0, y: 0, relativeX: -1, relativeY: -1 };
        this.lastMouseMove = { x: 0, y: 0, time: 0 };
        this.lastActivityTime = 0;
        this.recordingBounds = null;
        this.lastClickTime = 0;
        this.lastZoomCheck = 0;
        this.lastForceCheck = 0;
        this.recordingStartTime = 0;
        this.zoomLevel = 1.0;
        this.targetZoomLevel = 1.0;
        this.zoomCenter = { x: 0.5, y: 0.5 };
        this.zoomCenterTarget = { x: 0.5, y: 0.5 };
        
        // Zoom animation properties
        this.zoomTransition = {
            active: false,
            startLevel: 1.0,
            targetLevel: 1.0,
            startTime: 0,
            duration: 500 // ms
        };
        
        console.log('🔄 Zoom state reset to clean 1.0x state');
    }

    async initialize(originalStream, recordingBounds) {
        console.log('🏁 StreamProcessor.initialize called');
        console.log('   Original stream:', originalStream);
        console.log('   Recording bounds:', recordingBounds);
        console.log('   Config at initialization:', {
            zoom: config.zoom,
            mouse: config.mouse
        });
        
        // Always start with clean state - no leftover zoom
        this.resetZoomState();
        
        // FORCE zoom to 1.0x at initialization
        this.zoomLevel = 1.0;
        this.targetZoomLevel = 1.0;
        this.recordingStartTime = Date.now(); // Track recording start time
        console.log('🔧 FORCED zoom reset: zoomLevel=', this.zoomLevel, 'targetZoomLevel=', this.targetZoomLevel);
        console.log('🎬 Recording started at:', this.recordingStartTime, '- Grace period: 2 seconds');
        
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
        
        console.log('   Canvas dimensions:', this.canvas.width, 'x', this.canvas.height);
        
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
        
        console.log('   Processed stream created with', this.processedStream.getTracks().length, 'tracks');
        
        this.startProcessing();
        console.log('✅ StreamProcessor initialization complete');
        return this.processedStream;
    }

    getVelocityThreshold() {
        // Higher sensitivity -> lower threshold
        // Increased base threshold to prevent tiny movements from triggering zoom
        const base = 2.0; // px/ms (was 0.7)
        return base * (11 - config.zoom.sensitivity) / 10;
    }

    updateMousePosition(position) {
        const now = Date.now();
        this.mousePosition = position;

        if (!config.zoom.enabled) return;

        if (position.relativeX >= 0 && position.relativeY >= 0) {
            const dx = position.x - this.lastMouseMove.x;
            const dy = position.y - this.lastMouseMove.y;
            const dt = now - this.lastMouseMove.time;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const velocity = dt > 0 ? distance / dt : 0;

            this.lastMouseMove = { x: position.x, y: position.y, time: now };

            // Update activity time only when there's significant movement (velocity-based)
            if (velocity > this.getVelocityThreshold()) {
                this.lastActivityTime = now;
            }
            
            // Always update zoom center when zoomed in, regardless of velocity
            // This ensures the zoom follows the cursor smoothly
            if (this.zoomLevel > 1.05 || this.targetZoomLevel > 1.05) {
                this.zoomCenterTarget.x = Math.min(1, Math.max(0, position.relativeX));
                this.zoomCenterTarget.y = Math.min(1, Math.max(0, position.relativeY));
            } else {
                // When not zoomed, only update center on significant movement
                if (velocity > this.getVelocityThreshold()) {
                    this.zoomCenterTarget.x = Math.min(1, Math.max(0, position.relativeX));
                    this.zoomCenterTarget.y = Math.min(1, Math.max(0, position.relativeY));
                }
            }

            // Only check zoom state every 500ms instead of every frame (60fps)
            if (!this.lastZoomCheck || now - this.lastZoomCheck > 500) {
                this.lastZoomCheck = now;
                this.handleZoomTrigger();
            }
            
            // Additional aggressive zoom-out check every 2 seconds
            if (!this.lastForceCheck || now - this.lastForceCheck > 2000) {
                this.lastForceCheck = now;
                this.forceZoomOutIfNeeded();
            }
        }
    }

    handleZoomTrigger() {
        const now = Date.now();
        const timeSinceRecordingStart = now - this.recordingStartTime;
        const gracePeriod = config.zoom.gracePeriod;
        let shouldZoom = false;
        
        console.log('🎯 handleZoomTrigger called');
        console.log('   Current time:', now);
        console.log('   Time since recording start:', timeSinceRecordingStart);
        console.log('   Last click time:', this.lastClickTime);
        console.log('   Time since click:', now - this.lastClickTime);
        console.log('   Last activity time:', this.lastActivityTime);
        
        // Force 1x zoom for the first few seconds regardless of clicks
        if (timeSinceRecordingStart < gracePeriod) {
            console.log('📺 GRACE PERIOD ACTIVE - Forcing 1x zoom for first', gracePeriod/1000, 'seconds');
            console.log('   Remaining grace time:', (gracePeriod - timeSinceRecordingStart) / 1000, 'seconds');
            
            this.targetZoomLevel = 1.0;
            
            // Still need to transition if we're not at 1.0x
            if (Math.abs(this.targetZoomLevel - this.zoomLevel) > 0.05) {
                console.log('🚀 Grace period zoom transition to 1.0x');
                this.startZoomTransition();
            }
            return;
        }
        
        console.log('✅ Grace period ended - Normal zoom behavior active');

        switch (config.zoom.trigger) {
            case 'mouse':
                shouldZoom = now - this.lastActivityTime < 8000; // 8 seconds for better UX
                console.log('   Mouse trigger - shouldZoom:', shouldZoom);
                break;
            case 'click':
                shouldZoom = now - this.lastClickTime < 8000; // 8 seconds for better UX
                console.log('   Click trigger - shouldZoom:', shouldZoom);
                break;
            case 'both':
                shouldZoom = (now - this.lastActivityTime < 8000) ||
                              (now - this.lastClickTime < 8000);
                console.log('   Both trigger - shouldZoom:', shouldZoom);
                break;
            case 'keyboard':
                console.log('   Keyboard trigger - not implemented');
                break;
        }

        const newTargetZoomLevel = shouldZoom ? config.zoom.level : 1.0;
        
        // Force zoom out if we've been zoomed in too long without activity
        if (!shouldZoom && this.zoomLevel > 1.0) {
            console.log('⏰ Zoom timeout reached - forcing zoom out to 1.0x');
        }
        
        this.targetZoomLevel = newTargetZoomLevel;
        console.log('   Target zoom level:', this.targetZoomLevel);
        console.log('   Current zoom level:', this.zoomLevel);
        console.log('   Zoom level difference:', Math.abs(this.targetZoomLevel - this.zoomLevel));
        
        // Start zoom transition if level changed significantly
        if (Math.abs(this.targetZoomLevel - this.zoomLevel) > 0.05) {
            console.log('🚀 Starting zoom transition from', this.zoomLevel, 'to', this.targetZoomLevel);
            this.startZoomTransition();
        } else {
            console.log('⏸️ No zoom transition needed - difference too small');
        }
    }
    
    forceZoomOutIfNeeded() {
        const now = Date.now();
        const timeSinceRecordingStart = now - this.recordingStartTime;
        const gracePeriod = config.zoom.gracePeriod;
        
        // During grace period, always force 1x zoom
        if (timeSinceRecordingStart < gracePeriod) {
            if (this.zoomLevel > 1.1) {
                console.log('📺 GRACE PERIOD: Forcing zoom to 1x');
                this.targetZoomLevel = 1.0;
                this.startZoomTransition();
            }
            return;
        }
        
        // Normal force zoom-out logic after grace period
        const timeSinceClick = now - this.lastClickTime;
        const timeSinceActivity = now - this.lastActivityTime;
        
        // Force zoom out if we've been zoomed and no recent activity (more generous timeout)
        if (this.zoomLevel > 1.1 && timeSinceClick > 10000 && timeSinceActivity > 10000) {
            console.log('🔥 FORCE ZOOM OUT: Been zoomed too long without activity');
            console.log('   Time since click:', timeSinceClick);
            console.log('   Time since activity:', timeSinceActivity);
            console.log('   Current zoom:', this.zoomLevel);
            
            this.targetZoomLevel = 1.0;
            this.startZoomTransition();
        }
    }

    startZoomTransition() {
        const duration = (6 - config.zoom.speed) * 100;
        console.log('⚡ startZoomTransition called');
        console.log('   Zoom speed setting:', config.zoom.speed);
        console.log('   Calculated duration:', duration, 'ms');
        
        this.zoomTransition = {
            active: true,
            startLevel: this.zoomLevel,
            targetLevel: this.targetZoomLevel,
            startTime: Date.now(),
            duration: duration
        };
        
        console.log('   Zoom transition started:', this.zoomTransition);
    }

    updateZoomCenter() {
        // Use more responsive lag when zoomed in to better track cursor
        const isZoomedIn = this.zoomLevel > 1.05 || this.targetZoomLevel > 1.05;
        const lag = isZoomedIn ? config.zoom.followLagZoomed : config.zoom.followLagNormal;
        
        const oldCenter = { x: this.zoomCenter.x, y: this.zoomCenter.y };
        this.zoomCenter.x += (this.zoomCenterTarget.x - this.zoomCenter.x) * lag;
        this.zoomCenter.y += (this.zoomCenterTarget.y - this.zoomCenter.y) * lag;
        
        // Log zoom center updates when zoomed in (occasionally to avoid spam)
        if (isZoomedIn && Math.random() < 0.01) { // 1% chance to log
            console.log('🎯 Zoom center update:', {
                target: { x: this.zoomCenterTarget.x.toFixed(3), y: this.zoomCenterTarget.y.toFixed(3) },
                current: { x: this.zoomCenter.x.toFixed(3), y: this.zoomCenter.y.toFixed(3) },
                zoomLevel: this.zoomLevel.toFixed(2),
                mousePos: { x: this.mousePosition.relativeX?.toFixed(3), y: this.mousePosition.relativeY?.toFixed(3) }
            });
        }
    }

    updateZoomLevel() {
        if (!this.zoomTransition.active) return;
        
        const now = Date.now();
        const elapsed = now - this.zoomTransition.startTime;
        const progress = Math.min(elapsed / this.zoomTransition.duration, 1);
        
        // Smooth easing function
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        
        const oldZoomLevel = this.zoomLevel;
        this.zoomLevel = this.zoomTransition.startLevel + 
            (this.zoomTransition.targetLevel - this.zoomTransition.startLevel) * easeProgress;
        
        // Log zoom progress occasionally (every 10 frames)
        if (Math.floor(progress * 100) % 10 === 0) {
            console.log('🔄 Zoom progress:', Math.floor(progress * 100) + '%', 
                       'Level:', this.zoomLevel.toFixed(2));
        }
        
        if (progress >= 1) {
            console.log('✅ Zoom transition completed. Final level:', this.zoomLevel);
            this.zoomTransition.active = false;
            this.zoomLevel = this.zoomTransition.targetLevel;
        }
    }

    startProcessing() {
        const processFrame = () => {
            this.updateZoomLevel();
            this.updateZoomCenter();
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
        
        const { width, height } = this.canvas;
        const x = this.mousePosition.relativeX * width;
        const y = this.mousePosition.relativeY * height;

        const zoomWidth = width / this.zoomLevel;
        const zoomHeight = height / this.zoomLevel;
        const sourceX = (this.zoomCenter.x * width) - (zoomWidth / 2);
        const sourceY = (this.zoomCenter.y * height) - (zoomHeight / 2);
        const clampedX = Math.max(0, Math.min(width - zoomWidth, sourceX));
        const clampedY = Math.max(0, Math.min(height - zoomHeight, sourceY));

        // Adjust position for zoom and clamping
        const adjustedX = (x - clampedX) * (width / zoomWidth);
        const adjustedY = (y - clampedY) * (height / zoomHeight);
        
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

    handleClick(x, y) {
        // Convert click coordinates to relative position
        const relativeX = x / this.canvas.width;
        const relativeY = y / this.canvas.height;
        
        // Update mouse position with click location
        this.mousePosition = {
            x: x,
            y: y,
            relativeX: relativeX,
            relativeY: relativeY
        };
        
        this.onMouseClick();
    }

    onMouseClick() {
        const clickTime = Date.now();
        const timeSinceRecordingStart = clickTime - this.recordingStartTime;
        const gracePeriod = config.zoom.gracePeriod;
        
        console.log('🖱️ Click detected in StreamProcessor!');
        console.log('   Zoom enabled:', config.zoom.enabled);
        console.log('   Zoom trigger:', config.zoom.trigger);
        console.log('   Current zoom level:', this.zoomLevel);
        console.log('   Mouse position:', this.mousePosition);
        console.log('   Click timestamp:', clickTime);
        console.log('⏰ Time since last click:', clickTime - this.lastClickTime, 'ms');
        console.log('🎬 Time since recording start:', timeSinceRecordingStart, 'ms');
        
        // Show grace period status
        if (timeSinceRecordingStart < gracePeriod) {
            console.log('📺 CLICK DURING GRACE PERIOD - Will be ignored for zoom');
            console.log('   Grace period remaining:', (gracePeriod - timeSinceRecordingStart) / 1000, 'seconds');
        } else {
            console.log('✅ Click after grace period - Will trigger zoom');
        }
        
        this.lastClickTime = clickTime;
        this.lastActivityTime = clickTime;
        this.zoomCenterTarget.x = this.mousePosition.relativeX;
        this.zoomCenterTarget.y = this.mousePosition.relativeY;

        if (config.zoom.enabled && (config.zoom.trigger === 'click' || config.zoom.trigger === 'both')) {
            console.log('🔍 Triggering zoom...');
            // Reset zoom check timer so click triggers immediately
            this.lastZoomCheck = clickTime;
            this.handleZoomTrigger();
        } else {
            console.log('❌ Zoom not triggered - conditions not met');
            console.log('   Config check:', {
                enabled: config.zoom.enabled,
                trigger: config.zoom.trigger,
                isClickTrigger: config.zoom.trigger === 'click',
                isBothTrigger: config.zoom.trigger === 'both'
            });
        }
    }

    // Debug function to test zoom manually
    testZoom() {
        console.log('🧪 Manual zoom test triggered');
        this.lastClickTime = Date.now();
        this.lastActivityTime = this.lastClickTime;
        this.zoomCenterTarget.x = 0.5; // Center of screen
        this.zoomCenterTarget.y = 0.5;
        this.lastZoomCheck = this.lastClickTime;
        this.handleZoomTrigger();
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
