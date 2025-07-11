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
        
        // Multi-level zoom system
        this.zoomPresets = {
            none: 1.0,
            low: 1.5,
            medium: 1.8,
            high: 2.2,
            maximum: 2.5
        };
        
        this.currentUIElement = null;
        this.lastZoomChangeTime = 0;
        this.zoomCooldown = 300; // Minimum 300ms between zoom changes
        
        // Context-aware zoom timing
        this.zoomPersistenceRules = {
            'text-field': { 
                duration: 10000,    // 10 seconds - stay zoomed while typing
                persistent: true,   // Don't auto-zoom out
                exitConditions: ['cursor_leave', 'click_outside', 'escape_key']
            },
            'button': { 
                duration: 3000,     // 3 seconds - quick zoom for button interaction
                persistent: false,  // Auto-zoom out after timeout
                exitConditions: ['click', 'cursor_leave']
            },
            'menu': { 
                duration: 8000,     // 8 seconds - medium duration for menu navigation
                persistent: false,  // Auto-zoom out after timeout
                exitConditions: ['click_outside', 'escape_key', 'menu_close']
            },
            'dropdown': { 
                duration: 8000,     // 8 seconds - same as menu
                persistent: false,
                exitConditions: ['selection', 'click_outside', 'escape_key']
            },
            'default': { 
                duration: 5000,     // 5 seconds - default timeout
                persistent: false,
                exitConditions: ['timeout']
            }
        };
        
        this.zoomExitConditions = new Set();
        this.lastZoomExitCheck = 0;
        
        // Smart zoom centering
        this.elementBounds = null;
        this.predictiveCenter = { x: 0.5, y: 0.5 };
        this.centerSmoothingFactor = 0.15; // How quickly center adjusts
        this.lastCenterUpdate = 0;
        
        // Zoom conflict resolution
        this.zoomPriority = {
            'text-field': 4,    // Highest priority - text input is critical
            'dropdown': 3,      // High priority - user is selecting
            'menu': 3,          // High priority - user is navigating
            'button': 2,        // Medium priority - clickable action
            'default': 1        // Lowest priority
        };
        
        this.conflictingElements = [];
        this.userOverride = {
            active: false,
            timestamp: 0,
            duration: 5000,     // 5 seconds of manual control
            zoomLevel: 1.0
        };
        
        this.rapidMovementThreshold = 500; // px/sec for emergency zoom-out
        this.lastRapidMovementCheck = 0;
        
        // Zoom animation properties
        this.zoomTransition = {
            active: false,
            startLevel: 1.0,
            targetLevel: 1.0,
            startTime: 0,
            duration: 500 // ms
        };
        
        console.log('🔄 Zoom state reset to clean 1.0x state with multi-level system');
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
        this.setupKeyboardHandling();
        console.log('✅ StreamProcessor initialization complete');
        return this.processedStream;
    }

    // Setup keyboard event handling for zoom exit conditions
    setupKeyboardHandling() {
        this.keyboardHandler = (event) => {
            this.onKeyboardEvent(event);
        };
        
        document.addEventListener('keydown', this.keyboardHandler);
        console.log('⌨️ Keyboard handling setup for zoom exit conditions');
    }

    // Handle UI element detection from MouseTracker
    onUIElementDetected(elementType, detection) {
        const now = Date.now();
        
        // Check if user override is active
        if (this.isUserOverrideActive()) {
            console.log('👤 User override active - ignoring UI element detection');
            return;
        }
        
        // Respect zoom cooldown to prevent rapid changes
        if (now - this.lastZoomChangeTime < this.zoomCooldown) {
            return;
        }
        
        console.log('🎯 UI Element detected:', elementType, 'confidence:', detection.confidence || detection.fieldConfidence || detection.buttonConfidence);
        
        // Resolve conflicts with other UI elements
        const resolvedElement = this.resolveZoomConflicts(elementType, detection);
        const finalElementType = resolvedElement.elementType;
        const finalDetection = resolvedElement.detection;
        
        // Store previous element for transition handling
        const previousElement = this.currentUIElement;
        
        this.currentUIElement = {
            type: finalElementType,
            detection: finalDetection,
            timestamp: now,
            zoomStartTime: now,
            persistenceRule: this.zoomPersistenceRules[finalElementType] || this.zoomPersistenceRules.default,
            conflictResolved: resolvedElement.conflictResolved || false
        };
        
        // Clear any existing exit conditions
        this.zoomExitConditions.clear();
        
        // Calculate smart zoom center for the UI element
        const elementCenter = this.calculateElementCenter(finalElementType, finalDetection);
        this.applyCenterSmoothing(elementCenter);
        
        // Select appropriate zoom level based on element type
        const newZoomLevel = this.selectZoomLevelForElement(finalElementType, finalDetection);
        
        if (newZoomLevel !== this.targetZoomLevel) {
            console.log('🔍 Changing zoom level for', finalElementType, 'from', this.targetZoomLevel, 'to', newZoomLevel);
            console.log('⏱️ Using persistence rule:', this.currentUIElement.persistenceRule);
            console.log('🎯 Smart center:', elementCenter);
            
            if (resolvedElement.conflictResolved) {
                console.log('⚔️ Conflict resolved - using priority-based zoom');
            }
            
            // Handle smooth transitions for conflicts
            if (previousElement && resolvedElement.conflictResolved) {
                this.handleConflictTransition(previousElement, this.currentUIElement);
            } else {
                this.targetZoomLevel = newZoomLevel;
                this.startZoomTransition();
            }
            
            this.lastZoomChangeTime = now;
        }
    }

    // Handle cursor type changes from MouseTracker
    onCursorTypeChange(cursorInfo) {
        console.log('🖱️ Cursor type changed to:', cursorInfo.type, 'confidence:', cursorInfo.confidence);
        
        // Update zoom center based on cursor position
        if (cursorInfo.x && cursorInfo.y && this.recordingBounds) {
            const relativeX = (cursorInfo.x - this.recordingBounds.x) / this.recordingBounds.width;
            const relativeY = (cursorInfo.y - this.recordingBounds.y) / this.recordingBounds.height;
            
            this.zoomCenterTarget.x = Math.min(1, Math.max(0, relativeX));
            this.zoomCenterTarget.y = Math.min(1, Math.max(0, relativeY));
        }
    }

    // Select zoom level based on UI element type and properties
    selectZoomLevelForElement(elementType, detection) {
        const baseConfidence = detection.confidence || detection.fieldConfidence || detection.buttonConfidence || 0;
        
        // Low confidence = lower zoom
        if (baseConfidence < 0.7) {
            return this.zoomPresets.low;
        }
        
        switch (elementType) {
            case 'text-field':
                // Text fields need high zoom for readability
                if (baseConfidence >= 0.9) {
                    return this.zoomPresets.high;
                } else if (baseConfidence >= 0.8) {
                    return this.zoomPresets.medium;
                } else {
                    return this.zoomPresets.low;
                }
                
            case 'button':
                // Button zoom based on estimated size and confidence
                const estimatedSize = detection.estimatedSize;
                
                if (estimatedSize && estimatedSize.area) {
                    // Small buttons need higher zoom
                    if (estimatedSize.area < 1000) { // Very small button
                        return this.zoomPresets.maximum;
                    } else if (estimatedSize.area < 2500) { // Small button
                        return this.zoomPresets.high;
                    } else if (estimatedSize.area < 5000) { // Medium button
                        return this.zoomPresets.medium;
                    } else { // Large button
                        return this.zoomPresets.low;
                    }
                } else {
                    // Default button zoom based on confidence
                    if (baseConfidence >= 0.9) {
                        return this.zoomPresets.medium;
                    } else {
                        return this.zoomPresets.low;
                    }
                }
                
            case 'menu':
            case 'dropdown':
                // Menus need medium zoom to show context
                return this.zoomPresets.medium;
                
            default:
                // Default zoom for unknown elements
                return this.zoomPresets.low;
        }
    }

    // Get current zoom level name for debugging
    getCurrentZoomLevelName() {
        const currentLevel = this.zoomLevel;
        for (const [name, level] of Object.entries(this.zoomPresets)) {
            if (Math.abs(currentLevel - level) < 0.1) {
                return name;
            }
        }
        return 'custom';
    }

    // Find nearest zoom preset for a given zoom level
    findNearestZoomPreset(targetZoom) {
        let nearestPreset = this.zoomPresets.none;
        let smallestDiff = Math.abs(targetZoom - nearestPreset);
        
        for (const [name, level] of Object.entries(this.zoomPresets)) {
            const diff = Math.abs(targetZoom - level);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                nearestPreset = level;
            }
        }
        
        return nearestPreset;
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
            
            // Check zoom exit conditions every 1 second
            if (!this.lastZoomExitCheck || now - this.lastZoomExitCheck > 1000) {
                this.lastZoomExitCheck = now;
                this.checkZoomExitConditions();
            }
            
            // Check for rapid movement every 100ms
            this.checkRapidMovement();
            
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

        // Multi-level zoom logic
        let newTargetZoomLevel;
        
        if (!shouldZoom) {
            // Check if we should respect persistence rules before zooming out
            if (this.currentUIElement && this.currentUIElement.persistenceRule.persistent) {
                console.log('🔒 Persistent zoom active for', this.currentUIElement.type, '- not zooming out');
                return; // Don't zoom out for persistent elements
            }
            
            // Force zoom out if we've been zoomed in too long without activity
            if (this.zoomLevel > 1.0) {
                console.log('⏰ Zoom timeout reached - forcing zoom out to 1.0x');
            }
            newTargetZoomLevel = this.zoomPresets.none;
        } else {
            // Use UI element-based zoom if available, otherwise fallback to config
            if (this.currentUIElement && (now - this.currentUIElement.timestamp) < 5000) {
                // Check if we're still within the element's duration
                const timeSinceZoomStart = now - this.currentUIElement.zoomStartTime;
                const rule = this.currentUIElement.persistenceRule;
                
                if (rule.persistent || timeSinceZoomStart < rule.duration) {
                    // Use current UI element zoom level
                    newTargetZoomLevel = this.selectZoomLevelForElement(
                        this.currentUIElement.type, 
                        this.currentUIElement.detection
                    );
                    console.log('🎯 Using UI element-based zoom:', newTargetZoomLevel, 'for', this.currentUIElement.type, 
                               '(time:', timeSinceZoomStart, 'ms, duration:', rule.duration, 'ms)');
                } else {
                    // Element duration expired, zoom out
                    console.log('⏰ UI element duration expired for', this.currentUIElement.type);
                    newTargetZoomLevel = this.zoomPresets.none;
                    this.currentUIElement = null;
                }
            } else {
                // Fallback to config-based zoom (convert to nearest preset)
                const configZoom = config.zoom.level;
                newTargetZoomLevel = this.findNearestZoomPreset(configZoom);
                console.log('⚙️ Using config-based zoom preset:', newTargetZoomLevel, '(config:', configZoom, ')');
            }
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
        const baseDuration = (6 - config.zoom.speed) * 100;
        
        // Adjust duration based on zoom level change magnitude
        const zoomDifference = Math.abs(this.targetZoomLevel - this.zoomLevel);
        const durationMultiplier = Math.min(2.0, Math.max(0.5, zoomDifference));
        const duration = Math.round(baseDuration * durationMultiplier);
        
        console.log('⚡ startZoomTransition called');
        console.log('   Zoom speed setting:', config.zoom.speed);
        console.log('   Base duration:', baseDuration, 'ms');
        console.log('   Zoom difference:', zoomDifference.toFixed(2));
        console.log('   Duration multiplier:', durationMultiplier.toFixed(2));
        console.log('   Final duration:', duration, 'ms');
        console.log('   Transition:', this.zoomLevel.toFixed(2), '->', this.targetZoomLevel.toFixed(2));
        
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
        // Update predictive centering for moving elements
        this.updatePredictiveCenter();
        
        // Use more responsive lag when zoomed in to better track cursor
        const isZoomedIn = this.zoomLevel > 1.05 || this.targetZoomLevel > 1.05;
        
        // Adjust lag based on whether we're using smart centering
        let lag;
        if (this.currentUIElement && this.elementBounds) {
            // Use slower, more stable lag for UI element centering
            lag = isZoomedIn ? 0.08 : 0.05;
        } else {
            // Use config-based lag for mouse following
            lag = isZoomedIn ? config.zoom.followLagZoomed : config.zoom.followLagNormal;
        }
        
        const oldCenter = { x: this.zoomCenter.x, y: this.zoomCenter.y };
        this.zoomCenter.x += (this.zoomCenterTarget.x - this.zoomCenter.x) * lag;
        this.zoomCenter.y += (this.zoomCenterTarget.y - this.zoomCenter.y) * lag;
        
        // Log zoom center updates when zoomed in (occasionally to avoid spam)
        if (isZoomedIn && Math.random() < 0.01) { // 1% chance to log
            console.log('🎯 Zoom center update:', {
                target: { x: this.zoomCenterTarget.x.toFixed(3), y: this.zoomCenterTarget.y.toFixed(3) },
                current: { x: this.zoomCenter.x.toFixed(3), y: this.zoomCenter.y.toFixed(3) },
                zoomLevel: this.zoomLevel.toFixed(2),
                mousePos: { x: this.mousePosition.relativeX?.toFixed(3), y: this.mousePosition.relativeY?.toFixed(3) },
                elementType: this.currentUIElement?.type || 'none',
                smartCentering: !!this.elementBounds
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
        this.isProcessing = true;
        this.setupVisibilityHandling();
        this.startFrameLoop();
    }

    setupVisibilityHandling() {
        // Handle document visibility changes (minimized/hidden window)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                console.log('🔍 Window minimized/hidden - switching to timer-based processing');
                this.switchToTimerMode();
            } else {
                console.log('🔍 Window visible - switching to requestAnimationFrame');
                this.switchToAnimationFrameMode();
            }
        });
    }

    startFrameLoop() {
        if (document.hidden) {
            this.switchToTimerMode();
        } else {
            this.switchToAnimationFrameMode();
        }
    }

    switchToAnimationFrameMode() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        if (this.isProcessing && !this.animationFrameId) {
            const processFrame = () => {
                if (!this.isProcessing) return;
                
                this.updateZoomLevel();
                this.updateZoomCenter();
                this.renderFrame();
                
                if (!document.hidden) {
                    this.animationFrameId = requestAnimationFrame(processFrame);
                } else {
                    this.animationFrameId = null;
                    this.switchToTimerMode();
                }
            };
            processFrame();
        }
    }

    switchToTimerMode() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        if (this.isProcessing && !this.timerInterval) {
            // Use 60 FPS timer (16.67ms) to maintain smooth recording even when minimized
            this.timerInterval = setInterval(() => {
                if (!this.isProcessing) return;
                
                this.updateZoomLevel();
                this.updateZoomCenter();
                this.renderFrame();
            }, 1000 / 60);
        }
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

        // Handle click for zoom exit conditions
        this.onClickEvent(this.mousePosition);

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
        console.log('🧪 Testing multi-level zoom functionality...');
        console.log('   Current zoom level:', this.zoomLevel, '(' + this.getCurrentZoomLevelName() + ')');
        console.log('   Target zoom level:', this.targetZoomLevel);
        console.log('   Zoom presets:', this.zoomPresets);
        console.log('   Current UI element:', this.currentUIElement);
        console.log('   Zoom center:', this.zoomCenter);
        console.log('   Mouse position:', this.mousePosition);
        console.log('   Last activity time:', this.lastActivityTime);
        console.log('   Last click time:', this.lastClickTime);
        
        // Cycle through zoom presets for testing
        const presetLevels = Object.values(this.zoomPresets);
        const currentIndex = presetLevels.findIndex(level => Math.abs(level - this.zoomLevel) < 0.1);
        const nextIndex = (currentIndex + 1) % presetLevels.length;
        
        this.targetZoomLevel = presetLevels[nextIndex];
        console.log('🔄 Testing zoom transition to:', this.targetZoomLevel);
        
        this.lastClickTime = Date.now();
        this.lastActivityTime = this.lastClickTime;
        this.zoomCenterTarget.x = 0.5; // Center of screen
        this.zoomCenterTarget.y = 0.5;
        this.startZoomTransition();
    }
    
    // Test smart zoom centering accuracy
    testSmartCentering() {
        console.log('🎯 Testing smart zoom centering...');
        
        // Simulate different UI element types for testing
        const testElements = [
            {
                type: 'text-field',
                detection: {
                    position: { x: 400, y: 300 },
                    confidence: 0.9,
                    avgConfidence: 0.85,
                    hitCount: 5
                }
            },
            {
                type: 'button',
                detection: {
                    position: { x: 600, y: 200 },
                    confidence: 0.8,
                    estimatedSize: { width: 80, height: 30, area: 2400 }
                }
            },
            {
                type: 'menu',
                detection: {
                    position: { x: 200, y: 400 },
                    confidence: 0.75
                }
            }
        ];
        
        let testIndex = 0;
        const runNextTest = () => {
            if (testIndex >= testElements.length) {
                console.log('✅ Smart centering test completed');
                return;
            }
            
            const element = testElements[testIndex];
            console.log(`🧪 Testing ${element.type} centering...`);
            
            // Simulate UI element detection
            this.onUIElementDetected(element.type, element.detection);
            
            testIndex++;
            setTimeout(runNextTest, 3000); // 3 seconds between tests
        };
        
        runNextTest();
    }

    destroy() {
        this.isProcessing = false;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        if (this.processedStream) {
            this.processedStream.getTracks().forEach(track => track.stop());
        }
        
        if (this.sourceVideo) {
            this.sourceVideo.srcObject = null;
        }
        
        if (this.keyboardHandler) {
            document.removeEventListener('keydown', this.keyboardHandler);
            this.keyboardHandler = null;
        }
    }

    // Add zoom exit condition
    addZoomExitCondition(condition) {
        this.zoomExitConditions.add(condition);
        console.log('🚪 Zoom exit condition added:', condition);
        console.log('   Current exit conditions:', Array.from(this.zoomExitConditions));
        
        // Check if we should exit zoom immediately
        this.checkZoomExitConditions();
    }

    // Check if zoom should exit based on current conditions
    checkZoomExitConditions() {
        if (!this.currentUIElement || this.zoomLevel <= 1.05) {
            return false;
        }
        
        const now = Date.now();
        const rule = this.currentUIElement.persistenceRule;
        const timeSinceZoomStart = now - this.currentUIElement.zoomStartTime;
        
        // Check timeout condition
        if (!rule.persistent && timeSinceZoomStart > rule.duration) {
            console.log('⏰ Zoom timeout reached for', this.currentUIElement.type, 'after', timeSinceZoomStart, 'ms');
            this.exitZoom('timeout');
            return true;
        }
        
        // Check exit conditions
        for (const condition of this.zoomExitConditions) {
            if (rule.exitConditions.includes(condition)) {
                console.log('🚪 Zoom exit condition met:', condition, 'for', this.currentUIElement.type);
                this.exitZoom(condition);
                return true;
            }
        }
        
        return false;
    }

    // Exit zoom with specified reason
    exitZoom(reason) {
        console.log('🔚 Exiting zoom due to:', reason);
        
        this.targetZoomLevel = this.zoomPresets.none;
        this.currentUIElement = null;
        this.zoomExitConditions.clear();
        this.lastZoomChangeTime = Date.now();
        this.startZoomTransition();
    }

    // Handle keyboard events for zoom exit conditions
    onKeyboardEvent(event) {
        if (event.key === 'Escape') {
            this.addZoomExitCondition('escape_key');
        }
    }

    // Handle click events for zoom exit conditions
    onClickEvent(position) {
        if (!this.currentUIElement) return;
        
        // Check if click is outside the current UI element area
        const detection = this.currentUIElement.detection;
        if (detection && detection.position) {
            const distance = Math.sqrt(
                Math.pow(position.x - detection.position.x, 2) + 
                Math.pow(position.y - detection.position.y, 2)
            );
            
            // If click is far from the UI element (>50px), consider it "outside"
            if (distance > 50) {
                this.addZoomExitCondition('click_outside');
            } else {
                this.addZoomExitCondition('click');
            }
        } else {
            // No position info, assume it's a click on the element
            this.addZoomExitCondition('click');
        }
    }

    // Estimate UI element bounds from detection data
    estimateElementBounds(elementType, detection) {
        const position = detection.position;
        if (!position || !this.recordingBounds) {
            return null;
        }
        
        // Convert absolute position to relative
        const relativeX = (position.x - this.recordingBounds.x) / this.recordingBounds.width;
        const relativeY = (position.y - this.recordingBounds.y) / this.recordingBounds.height;
        
        let bounds = {
            centerX: relativeX,
            centerY: relativeY,
            width: 0.1,  // Default 10% of screen width
            height: 0.05 // Default 5% of screen height
        };
        
        switch (elementType) {
            case 'text-field':
                // Text fields are typically wider and shorter
                bounds.width = 0.15;  // 15% of screen width
                bounds.height = 0.03; // 3% of screen height
                
                // Use heat map data if available
                if (detection.avgConfidence && detection.hitCount > 3) {
                    // More hits = more precise bounds
                    const precision = Math.min(detection.hitCount / 10, 1);
                    bounds.width *= (1 + precision * 0.5);
                }
                break;
                
            case 'button':
                // Use estimated size if available
                if (detection.estimatedSize) {
                    const size = detection.estimatedSize;
                    bounds.width = Math.max(0.05, Math.min(0.2, size.width / this.recordingBounds.width));
                    bounds.height = Math.max(0.03, Math.min(0.1, size.height / this.recordingBounds.height));
                } else {
                    // Default button size
                    bounds.width = 0.08;  // 8% of screen width
                    bounds.height = 0.04; // 4% of screen height
                }
                break;
                
            case 'menu':
            case 'dropdown':
                // Menus are typically taller and narrower
                bounds.width = 0.12;  // 12% of screen width
                bounds.height = 0.15; // 15% of screen height
                break;
                
            default:
                // Keep default bounds
                break;
        }
        
        // Ensure bounds are within screen limits
        bounds.centerX = Math.max(bounds.width/2, Math.min(1 - bounds.width/2, bounds.centerX));
        bounds.centerY = Math.max(bounds.height/2, Math.min(1 - bounds.height/2, bounds.centerY));
        
        return bounds;
    }

    // Calculate optimal zoom center for UI element
    calculateElementCenter(elementType, detection) {
        const bounds = this.estimateElementBounds(elementType, detection);
        if (!bounds) {
            // Fallback to mouse position
            return {
                x: this.mousePosition.relativeX || 0.5,
                y: this.mousePosition.relativeY || 0.5
            };
        }
        
        this.elementBounds = bounds;
        
        // For text fields, center slightly above the field to show context
        if (elementType === 'text-field') {
            return {
                x: bounds.centerX,
                y: Math.max(0.1, bounds.centerY - 0.05) // Slightly above
            };
        }
        
        // For buttons, center exactly on the button
        if (elementType === 'button') {
            return {
                x: bounds.centerX,
                y: bounds.centerY
            };
        }
        
        // For menus, center slightly to show more options below
        if (elementType === 'menu' || elementType === 'dropdown') {
            return {
                x: bounds.centerX,
                y: Math.max(0.15, bounds.centerY - 0.1) // Show more below
            };
        }
        
        // Default: center on element
        return {
            x: bounds.centerX,
            y: bounds.centerY
        };
    }

    // Implement predictive centering for moving elements
    updatePredictiveCenter() {
        if (!this.currentUIElement || !this.elementBounds) {
            return;
        }
        
        const now = Date.now();
        const timeDelta = now - this.lastCenterUpdate;
        
        if (timeDelta < 50) return; // Update at most every 50ms
        
        // Track mouse movement velocity for prediction
        const mouseVelocityX = this.mousePosition.relativeX - (this.lastMousePosition?.relativeX || this.mousePosition.relativeX);
        const mouseVelocityY = this.mousePosition.relativeY - (this.lastMousePosition?.relativeY || this.mousePosition.relativeY);
        
        // Predict where the element might be in the next 200ms
        const predictionTime = 0.2; // 200ms
        this.predictiveCenter.x = this.elementBounds.centerX + (mouseVelocityX * predictionTime);
        this.predictiveCenter.y = this.elementBounds.centerY + (mouseVelocityY * predictionTime);
        
        // Clamp to screen bounds
        this.predictiveCenter.x = Math.max(0.1, Math.min(0.9, this.predictiveCenter.x));
        this.predictiveCenter.y = Math.max(0.1, Math.min(0.9, this.predictiveCenter.y));
        
        this.lastCenterUpdate = now;
        this.lastMousePosition = { ...this.mousePosition };
    }

    // Add zoom center smoothing for stability
    applyCenterSmoothing(targetCenter) {
        const smoothing = this.centerSmoothingFactor;
        
        // Apply smoothing to prevent jittery zoom center
        const smoothedCenter = {
            x: this.zoomCenter.x + (targetCenter.x - this.zoomCenter.x) * smoothing,
            y: this.zoomCenter.y + (targetCenter.y - this.zoomCenter.y) * smoothing
        };
        
        // Only update if the change is significant enough
        const deltaX = Math.abs(smoothedCenter.x - this.zoomCenter.x);
        const deltaY = Math.abs(smoothedCenter.y - this.zoomCenter.y);
        
        if (deltaX > 0.01 || deltaY > 0.01) {
            this.zoomCenterTarget.x = smoothedCenter.x;
            this.zoomCenterTarget.y = smoothedCenter.y;
            
            console.log('🎯 Smart zoom center updated:', {
                target: { x: targetCenter.x.toFixed(3), y: targetCenter.y.toFixed(3) },
                smoothed: { x: smoothedCenter.x.toFixed(3), y: smoothedCenter.y.toFixed(3) },
                element: this.currentUIElement?.type
            });
        }
    }

    // Handle zoom conflicts between overlapping UI elements
    resolveZoomConflicts(newElementType, newDetection) {
        const now = Date.now();
        
        // Add new element to conflicting elements list
        this.conflictingElements.push({
            type: newElementType,
            detection: newDetection,
            timestamp: now,
            priority: this.zoomPriority[newElementType] || this.zoomPriority.default
        });
        
        // Remove old conflicting elements (older than 2 seconds)
        this.conflictingElements = this.conflictingElements.filter(
            element => now - element.timestamp < 2000
        );
        
        // If only one element, no conflict
        if (this.conflictingElements.length <= 1) {
            return { elementType: newElementType, detection: newDetection };
        }
        
        console.log('⚔️ Zoom conflict detected between', this.conflictingElements.length, 'elements');
        
        // Find highest priority element
        let highestPriority = 0;
        let winningElement = null;
        
        for (const element of this.conflictingElements) {
            if (element.priority > highestPriority) {
                highestPriority = element.priority;
                winningElement = element;
            } else if (element.priority === highestPriority) {
                // Same priority - use most recent
                if (element.timestamp > winningElement.timestamp) {
                    winningElement = element;
                }
            }
        }
        
        console.log('🏆 Conflict resolved: winner is', winningElement.type, 'with priority', winningElement.priority);
        
        return {
            elementType: winningElement.type,
            detection: winningElement.detection,
            conflictResolved: true,
            conflictingCount: this.conflictingElements.length
        };
    }

    // Handle smooth transitions between conflicting zoom requests
    handleConflictTransition(fromElement, toElement) {
        const fromZoom = this.selectZoomLevelForElement(fromElement.type, fromElement.detection);
        const toZoom = this.selectZoomLevelForElement(toElement.type, toElement.detection);
        
        // If zoom levels are very different, use intermediate transition
        const zoomDifference = Math.abs(toZoom - fromZoom);
        
        if (zoomDifference > 0.5) {
            console.log('🔄 Large zoom conflict - using intermediate transition');
            
            // First transition to intermediate level
            const intermediateZoom = (fromZoom + toZoom) / 2;
            this.targetZoomLevel = intermediateZoom;
            this.startZoomTransition();
            
            // Then transition to final level after a short delay
            setTimeout(() => {
                this.targetZoomLevel = toZoom;
                this.startZoomTransition();
            }, 300);
        } else {
            // Direct transition for small differences
            this.targetZoomLevel = toZoom;
            this.startZoomTransition();
        }
    }

    // Check for rapid mouse movement and trigger emergency zoom-out
    checkRapidMovement() {
        const now = Date.now();
        
        if (now - this.lastRapidMovementCheck < 100) return; // Check every 100ms
        
        this.lastRapidMovementCheck = now;
        
        if (!this.mousePosition.relativeX || !this.lastMousePosition) return;
        
        // Calculate mouse velocity
        const timeDelta = now - (this.lastMousePosition.timestamp || now);
        if (timeDelta <= 0) return;
        
        const dx = this.mousePosition.x - (this.lastMousePosition.x || this.mousePosition.x);
        const dy = this.mousePosition.y - (this.lastMousePosition.y || this.mousePosition.y);
        const distance = Math.sqrt(dx * dx + dy * dy);
        const velocity = distance / (timeDelta / 1000); // pixels per second
        
        if (velocity > this.rapidMovementThreshold && this.zoomLevel > 1.1) {
            console.log('🚨 Rapid movement detected:', velocity.toFixed(0), 'px/s - emergency zoom out');
            this.emergencyZoomOut();
        }
    }

    // Emergency zoom-out for rapid movement
    emergencyZoomOut() {
        this.targetZoomLevel = this.zoomPresets.none;
        this.currentUIElement = null;
        this.conflictingElements = [];
        this.zoomExitConditions.clear();
        
        // Use faster transition for emergency
        this.zoomTransition = {
            active: true,
            startLevel: this.zoomLevel,
            targetLevel: this.targetZoomLevel,
            startTime: Date.now(),
            duration: 200 // Fast 200ms transition
        };
        
        console.log('🚨 Emergency zoom-out initiated');
    }

    // Activate user override (manual zoom control)
    activateUserOverride(zoomLevel) {
        const now = Date.now();
        
        this.userOverride = {
            active: true,
            timestamp: now,
            duration: 5000,
            zoomLevel: zoomLevel
        };
        
        this.targetZoomLevel = zoomLevel;
        this.currentUIElement = null; // Clear UI element control
        this.conflictingElements = [];
        
        console.log('👤 User override activated:', zoomLevel, 'for', this.userOverride.duration / 1000, 'seconds');
        this.startZoomTransition();
    }

    // Check if user override is still active
    isUserOverrideActive() {
        if (!this.userOverride.active) return false;
        
        const now = Date.now();
        const elapsed = now - this.userOverride.timestamp;
        
        if (elapsed > this.userOverride.duration) {
            this.userOverride.active = false;
            console.log('👤 User override expired after', elapsed / 1000, 'seconds');
            return false;
        }
        
        return true;
    }

    // Test zoom conflict resolution scenarios
    testConflictResolution() {
        console.log('⚔️ Testing zoom conflict resolution...');
        
        // Simulate overlapping UI elements
        const conflicts = [
            {
                type: 'button',
                detection: { position: { x: 300, y: 200 }, confidence: 0.8 }
            },
            {
                type: 'text-field',
                detection: { position: { x: 320, y: 210 }, confidence: 0.9 }
            },
            {
                type: 'menu',
                detection: { position: { x: 310, y: 205 }, confidence: 0.7 }
            }
        ];
        
        // Simulate rapid detection of conflicting elements
        conflicts.forEach((conflict, index) => {
            setTimeout(() => {
                console.log(`🧪 Simulating ${conflict.type} detection...`);
                this.onUIElementDetected(conflict.type, conflict.detection);
            }, index * 500); // 500ms apart
        });
        
        // Test user override after conflicts
        setTimeout(() => {
            console.log('🧪 Testing user override...');
            this.activateUserOverride(1.8);
        }, 3000);
        
        // Test emergency zoom-out
        setTimeout(() => {
            console.log('🧪 Testing emergency zoom-out...');
            this.emergencyZoomOut();
        }, 6000);
    }
}

module.exports = StreamProcessor;
