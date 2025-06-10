/**
 * UI Element Detection Module
 * Detects various UI elements (form fields, buttons, menus) for intelligent zoom
 */

class FormFieldDetector {
    constructor() {
        this.detectionHistory = [];
        this.textFieldHeatMap = new Map(); // Position -> confidence scores
        this.clickToTypingEvents = [];
        this.isMonitoring = false;
        this.keyboardListener = null;
        
        // Performance monitoring
        this.performanceMetrics = {
            detectionTimes: [],
            cacheHits: 0,
            cacheMisses: 0,
            totalDetections: 0,
            lastFPSCheck: Date.now(),
            detectionCount: 0
        };
        
        // Result caching
        this.detectionCache = new Map(); // cache detection results
        this.cacheTimeout = 500; // 500ms cache validity
        
        // Safety mechanisms
        this.maxDetectionTime = 50; // Max 50ms per detection
        this.detectionEnabled = true;
        this.degradationThreshold = 30; // Degrade if avg detection time > 30ms
        
        this.setupKeyboardListener();
    }

    // Start form field detection
    startDetection() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('📝 Starting form field detection...');
        
        // Listen for keyboard events to detect typing after clicks
        this.setupKeyboardListener();
    }

    // Stop form field detection
    stopDetection() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        console.log('📝 Stopping form field detection...');
        
        if (this.keyboardListener) {
            document.removeEventListener('keydown', this.keyboardListener);
            this.keyboardListener = null;
        }
    }

    // Setup keyboard event listener for click-to-typing detection
    setupKeyboardListener() {
        this.keyboardListener = (event) => {
            // Ignore special keys that don't indicate text input
            const specialKeys = ['Tab', 'Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Escape'];
            if (specialKeys.includes(event.key)) return;
            
            const now = Date.now();
            console.log('⌨️ Key pressed:', event.key, 'at', now);
            
            // Check for recent clicks that might indicate text field activation
            this.analyzeClickToTypingPattern(now);
        };
        
        document.addEventListener('keydown', this.keyboardListener);
    }

    // Analyze cursor state for text field detection
    analyzeCursorState(cursorInfo, mousePosition) {
        if (!this.isMonitoring) return null;
        
        const now = Date.now();
        const detection = {
            timestamp: now,
            position: mousePosition,
            cursorType: cursorInfo.type,
            cursorConfidence: cursorInfo.confidence,
            isTextCursor: cursorInfo.type === 'text',
            fieldConfidence: 0.0
        };

        // High confidence text cursor detection
        if (cursorInfo.type === 'text' && cursorInfo.confidence >= 0.7) {
            detection.fieldConfidence = Math.min(0.95, cursorInfo.confidence + 0.15);
            detection.detectionReason = 'text_cursor_high_confidence';
            
            // Update heat map
            this.updateTextFieldHeatMap(mousePosition, detection.fieldConfidence);
            
            console.log('📝 Text field detected with high confidence:', detection.fieldConfidence, 'at', mousePosition);
        }
        
        // Medium confidence text cursor
        else if (cursorInfo.type === 'text' && cursorInfo.confidence >= 0.5) {
            detection.fieldConfidence = cursorInfo.confidence;
            detection.detectionReason = 'text_cursor_medium_confidence';
            
            this.updateTextFieldHeatMap(mousePosition, detection.fieldConfidence * 0.8);
        }

        // Store detection in history
        this.detectionHistory.push(detection);
        
        // Keep only last 100 detections (about 10 seconds at 10fps)
        if (this.detectionHistory.length > 100) {
            this.detectionHistory.shift();
        }

        return detection.fieldConfidence > 0.5 ? detection : null;
    }

    // Analyze click-to-typing patterns (2-second window)
    analyzeClickToTypingPattern(typingTimestamp) {
        const CLICK_TO_TYPE_WINDOW = 2000; // 2 seconds
        
        // Look for recent clicks within the time window
        const recentDetections = this.detectionHistory.filter(detection => 
            typingTimestamp - detection.timestamp <= CLICK_TO_TYPE_WINDOW &&
            typingTimestamp - detection.timestamp >= 50 // At least 50ms delay
        );

        if (recentDetections.length === 0) return;

        // Find the most recent detection with a position
        const lastClick = recentDetections[recentDetections.length - 1];
        
        if (lastClick && lastClick.position) {
            const clickToTypeEvent = {
                clickTime: lastClick.timestamp,
                typeTime: typingTimestamp,
                position: lastClick.position,
                delay: typingTimestamp - lastClick.timestamp,
                cursorType: lastClick.cursorType,
                confidence: this.calculateClickToTypeConfidence(lastClick, typingTimestamp)
            };

            this.clickToTypingEvents.push(clickToTypeEvent);
            
            // Keep only last 50 events
            if (this.clickToTypingEvents.length > 50) {
                this.clickToTypingEvents.shift();
            }

            // High confidence click-to-type pattern
            if (clickToTypeEvent.confidence >= 0.85) {
                console.log('📝 High-confidence click-to-type detected:', clickToTypeEvent);
                
                // Update heat map with high confidence
                this.updateTextFieldHeatMap(lastClick.position, 0.9);
                
                return clickToTypeEvent;
            }
        }

        return null;
    }

    // Calculate confidence score for click-to-type patterns
    calculateClickToTypeConfidence(clickDetection, typingTimestamp) {
        const delay = typingTimestamp - clickDetection.timestamp;
        let confidence = 0.0;

        // Base confidence from cursor type
        if (clickDetection.cursorType === 'text') {
            confidence += 0.4;
        } else if (clickDetection.cursorType === 'pointer') {
            confidence += 0.2;
        } else {
            confidence += 0.1;
        }

        // Timing-based confidence (ideal delay is 200-800ms)
        if (delay >= 200 && delay <= 800) {
            confidence += 0.4; // Perfect timing
        } else if (delay >= 100 && delay <= 1500) {
            confidence += 0.3; // Good timing
        } else if (delay >= 50 && delay <= 2000) {
            confidence += 0.2; // Acceptable timing
        }

        // Position stability bonus
        if (clickDetection.fieldConfidence > 0.7) {
            confidence += 0.1;
        }

        return Math.min(0.95, confidence);
    }

    // Update text field heat map
    updateTextFieldHeatMap(position, confidence) {
        if (!position || !position.x || !position.y) return;

        // Create position key (rounded to 10px grid for clustering)
        const gridSize = 10;
        const gridX = Math.round(position.x / gridSize) * gridSize;
        const gridY = Math.round(position.y / gridSize) * gridSize;
        const posKey = `${gridX},${gridY}`;

        // Update heat map entry
        const existing = this.textFieldHeatMap.get(posKey) || { 
            x: gridX, 
            y: gridY, 
            totalConfidence: 0, 
            hitCount: 0, 
            avgConfidence: 0,
            lastUpdate: 0 
        };

        existing.totalConfidence += confidence;
        existing.hitCount++;
        existing.avgConfidence = existing.totalConfidence / existing.hitCount;
        existing.lastUpdate = Date.now();

        this.textFieldHeatMap.set(posKey, existing);

        // Clean up old entries (older than 60 seconds)
        this.cleanupHeatMap();
    }

    // Clean up old heat map entries
    cleanupHeatMap() {
        const now = Date.now();
        const maxAge = 60000; // 60 seconds

        for (const [key, entry] of this.textFieldHeatMap.entries()) {
            if (now - entry.lastUpdate > maxAge) {
                this.textFieldHeatMap.delete(key);
            }
        }
    }

    // Get text field detection at position
    getTextFieldDetectionAt(position, radius = 20) {
        if (!position) return null;

        let bestMatch = null;
        let bestDistance = Infinity;

        for (const entry of this.textFieldHeatMap.values()) {
            const distance = Math.sqrt(
                Math.pow(entry.x - position.x, 2) + 
                Math.pow(entry.y - position.y, 2)
            );

            if (distance <= radius && distance < bestDistance && entry.avgConfidence > 0.5) {
                bestMatch = {
                    ...entry,
                    distance,
                    confidence: entry.avgConfidence
                };
                bestDistance = distance;
            }
        }

        return bestMatch;
    }

    // Get detection statistics
    getStats() {
        const now = Date.now();
        const recentDetections = this.detectionHistory.filter(d => now - d.timestamp < 10000);
        const recentClickToType = this.clickToTypingEvents.filter(e => now - e.typeTime < 10000);

        return {
            isMonitoring: this.isMonitoring,
            totalDetections: this.detectionHistory.length,
            recentDetections: recentDetections.length,
            textFieldHotspots: this.textFieldHeatMap.size,
            clickToTypeEvents: this.clickToTypingEvents.length,
            recentClickToType: recentClickToType.length,
            highConfidenceDetections: recentDetections.filter(d => d.fieldConfidence > 0.8).length
        };
    }

    // Test form field detection accuracy
    testDetectionAccuracy() {
        const stats = this.getStats();
        console.log('📝 Form Field Detection Test Results:', stats);
        
        // Calculate accuracy metrics
        const totalEvents = this.clickToTypingEvents.length;
        const highConfidenceEvents = this.clickToTypingEvents.filter(e => e.confidence > 0.8).length;
        const accuracy = totalEvents > 0 ? (highConfidenceEvents / totalEvents) * 100 : 0;

        console.log(`📊 Detection Accuracy: ${accuracy.toFixed(1)}% (${highConfidenceEvents}/${totalEvents} high-confidence events)`);
        
        return { accuracy, totalEvents, highConfidenceEvents, stats };
    }

    // Cleanup
    destroy() {
        this.stopDetection();
        this.detectionHistory = [];
        this.textFieldHeatMap.clear();
        this.clickToTypingEvents = [];
    }

    analyzeForTextInput(cursorInfo, previousCursor) {
        if (!this.detectionEnabled) {
            return { isTextField: false, confidence: 0 };
        }
        
        const startTime = Date.now();
        
        try {
            // Check cache first
            const cacheKey = `${cursorInfo.x},${cursorInfo.y},${cursorInfo.type}`;
            const cached = this.detectionCache.get(cacheKey);
            
            if (cached && (startTime - cached.timestamp) < this.cacheTimeout) {
                this.performanceMetrics.cacheHits++;
                return cached.result;
            }
            
            this.performanceMetrics.cacheMisses++;
            
            let confidence = 0;
            let reasons = [];

            // Text cursor detection (90% confidence if true)
            if (cursorInfo.type === 'text') {
                confidence += 0.9;
                reasons.push('text_cursor');
            } else if (cursorInfo.type === 'default' && previousCursor && previousCursor.type === 'text') {
                // Recently was text cursor
                confidence += 0.7;
                reasons.push('recent_text_cursor');
            }

            // Click-to-typing pattern detection
            if (this.isTyping && (Date.now() - this.lastTypingTime) < this.typingThreshold) {
                confidence += 0.8;
                reasons.push('active_typing');
            }

            // Apply time limits for safety
            const detectionTime = Date.now() - startTime;
            if (detectionTime > this.maxDetectionTime) {
                console.warn(`FormField detection exceeded time limit: ${detectionTime}ms`);
                this.checkPerformanceDegradation();
            }
            
            const result = {
                isTextField: confidence > 0.95,
                confidence: Math.min(confidence, 1.0),
                reasons: reasons,
                timestamp: startTime
            };
            
            // Cache the result
            this.detectionCache.set(cacheKey, {
                result: result,
                timestamp: startTime
            });
            
            // Clean old cache entries (performance optimization)
            if (this.detectionCache.size > 100) {
                this.cleanCache();
            }
            
            // Record performance metrics
            this.recordDetectionTime(detectionTime);
            
            return result;
            
        } catch (error) {
            console.error('Error in FormField detection:', error);
            // Fallback to basic detection
            return { isTextField: cursorInfo.type === 'text', confidence: 0.5 };
        }
    }
    
    recordDetectionTime(detectionTime) {
        this.performanceMetrics.detectionTimes.push(detectionTime);
        this.performanceMetrics.totalDetections++;
        this.performanceMetrics.detectionCount++;
        
        // Keep only recent detection times (last 50)
        if (this.performanceMetrics.detectionTimes.length > 50) {
            this.performanceMetrics.detectionTimes.shift();
        }
    }
    
    checkPerformanceDegradation() {
        const avgTime = this.getAverageDetectionTime();
        if (avgTime > this.degradationThreshold) {
            console.warn(`UI Detection performance degraded: ${avgTime}ms avg, enabling fallback mode`);
            this.detectionEnabled = false;
            
            // Re-enable after 5 seconds
            setTimeout(() => {
                this.detectionEnabled = true;
                console.log('UI Detection re-enabled after performance recovery');
            }, 5000);
        }
    }
    
    cleanCache() {
        const now = Date.now();
        for (const [key, cached] of this.detectionCache.entries()) {
            if ((now - cached.timestamp) > this.cacheTimeout * 2) {
                this.detectionCache.delete(key);
            }
        }
    }
    
    getCurrentFPS() {
        const now = Date.now();
        const timeSinceLastCheck = now - this.performanceMetrics.lastFPSCheck;
        
        if (timeSinceLastCheck >= 1000) {
            const fps = (this.performanceMetrics.detectionCount / timeSinceLastCheck) * 1000;
            this.performanceMetrics.lastFPSCheck = now;
            this.performanceMetrics.detectionCount = 0;
            return Math.round(fps * 10) / 10; // Round to 1 decimal
        }
        
        return 0;
    }
    
    getAverageDetectionTime() {
        if (this.performanceMetrics.detectionTimes.length === 0) return 0;
        const sum = this.performanceMetrics.detectionTimes.reduce((a, b) => a + b, 0);
        return Math.round((sum / this.performanceMetrics.detectionTimes.length) * 10) / 10;
    }
    
    getCacheHitRate() {
        const total = this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses;
        return total > 0 ? this.performanceMetrics.cacheHits / total : 0;
    }
}

class ButtonDetector {
    constructor() {
        this.detectionHistory = [];
        this.buttonHeatMap = new Map();
        this.isMonitoring = false;
        this.hoverEvents = [];
        this.lastMousePosition = null;
        this.mouseVelocityHistory = [];
        this.hoverStartTime = null;
        this.currentHoverArea = null;
        
        // Performance monitoring
        this.performanceMetrics = {
            detectionTimes: [],
            cacheHits: 0,
            cacheMisses: 0,
            totalDetections: 0,
            lastFPSCheck: Date.now(),
            detectionCount: 0
        };
        
        // Result caching
        this.detectionCache = new Map();
        this.cacheTimeout = 500; // 500ms cache validity
        
        // Safety mechanisms
        this.maxDetectionTime = 50; // Max 50ms per detection
        this.detectionEnabled = true;
        this.degradationThreshold = 30; // Degrade if avg detection time > 30ms
    }

    // Start button detection
    startDetection() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('🔘 Starting button/clickable detection...');
    }

    // Stop button detection
    stopDetection() {
        if (!this.isMonitoring) return;
        
        this.isMonitoring = false;
        console.log('🔘 Stopping button/clickable detection...');
        
        // Clear hover state
        this.hoverStartTime = null;
        this.currentHoverArea = null;
    }

    // Analyze cursor state and mouse behavior for button detection
    analyzeCursorState(cursorInfo, mousePosition, mouseVelocity = null) {
        if (!this.isMonitoring) return null;
        
        const now = Date.now();
        const detection = {
            timestamp: now,
            position: mousePosition,
            cursorType: cursorInfo.type,
            cursorConfidence: cursorInfo.confidence,
            isPointerCursor: cursorInfo.type === 'pointer',
            buttonConfidence: 0.0,
            velocity: mouseVelocity
        };

        // Track mouse velocity for deceleration analysis
        if (mouseVelocity !== null) {
            this.mouseVelocityHistory.push({ 
                velocity: mouseVelocity, 
                timestamp: now,
                position: mousePosition 
            });
            
            // Keep only last 10 velocity measurements (about 1 second at 10fps)
            if (this.mouseVelocityHistory.length > 10) {
                this.mouseVelocityHistory.shift();
            }
        }

        // Pointer cursor detection with high confidence
        if (cursorInfo.type === 'pointer' && cursorInfo.confidence >= 0.8) {
            detection.buttonConfidence = Math.min(0.9, cursorInfo.confidence + 0.1);
            detection.detectionReason = 'pointer_cursor_high_confidence';
            
            this.startHoverTracking(mousePosition, now);
            this.updateButtonHeatMap(mousePosition, detection.buttonConfidence);
            
            console.log('🔘 Button/clickable detected with high confidence:', detection.buttonConfidence, 'at', mousePosition);
        }
        
        // Medium confidence pointer cursor
        else if (cursorInfo.type === 'pointer' && cursorInfo.confidence >= 0.6) {
            detection.buttonConfidence = cursorInfo.confidence;
            detection.detectionReason = 'pointer_cursor_medium_confidence';
            
            this.updateButtonHeatMap(mousePosition, detection.buttonConfidence * 0.8);
        }

        // Analyze mouse deceleration patterns (indicates hovering over clickable)
        const decelerationPattern = this.analyzeMouseDeceleration();
        if (decelerationPattern && decelerationPattern.confidence > 0.7) {
            detection.buttonConfidence = Math.max(detection.buttonConfidence, decelerationPattern.confidence);
            detection.decelerationDetected = true;
            detection.detectionReason = detection.detectionReason || 'mouse_deceleration';
            
            console.log('🔘 Button detected via deceleration pattern:', decelerationPattern.confidence);
        }

        // Store detection in history
        this.detectionHistory.push(detection);
        
        // Keep only last 100 detections
        if (this.detectionHistory.length > 100) {
            this.detectionHistory.shift();
        }

        this.lastMousePosition = mousePosition;
        
        return detection.buttonConfidence > 0.6 ? detection : null;
    }

    // Analyze mouse deceleration patterns
    analyzeMouseDeceleration() {
        if (this.mouseVelocityHistory.length < 5) return null;
        
        const recent = this.mouseVelocityHistory.slice(-5);
        const velocities = recent.map(v => v.velocity);
        
        // Check for deceleration pattern (high -> medium -> low velocity)
        let decelerationScore = 0;
        let isDecelerating = true;
        
        for (let i = 1; i < velocities.length; i++) {
            if (velocities[i] >= velocities[i-1]) {
                isDecelerating = false;
                break;
            }
            
            const velocityDrop = velocities[i-1] - velocities[i];
            const relativeChange = velocityDrop / Math.max(velocities[i-1], 1);
            decelerationScore += relativeChange;
        }
        
        if (!isDecelerating) return null;
        
        // Calculate confidence based on deceleration pattern
        const avgDeceleration = decelerationScore / (velocities.length - 1);
        const finalVelocity = velocities[velocities.length - 1];
        
        // Strong deceleration to near-stop indicates hover over clickable
        let confidence = 0;
        if (avgDeceleration > 0.5 && finalVelocity < 2) {
            confidence = Math.min(0.85, 0.4 + avgDeceleration);
        } else if (avgDeceleration > 0.3 && finalVelocity < 5) {
            confidence = Math.min(0.75, 0.3 + avgDeceleration);
        }
        
        return confidence > 0.5 ? { confidence, avgDeceleration, finalVelocity } : null;
    }

    // Start hover tracking for button size estimation
    startHoverTracking(position, timestamp) {
        if (!this.hoverStartTime) {
            this.hoverStartTime = timestamp;
            this.currentHoverArea = {
                startPos: position,
                minX: position.x,
                maxX: position.x,
                minY: position.y,
                maxY: position.y,
                positionHistory: [position]
            };
        }
        
        // Update hover area bounds
        if (this.currentHoverArea) {
            this.currentHoverArea.minX = Math.min(this.currentHoverArea.minX, position.x);
            this.currentHoverArea.maxX = Math.max(this.currentHoverArea.maxX, position.x);
            this.currentHoverArea.minY = Math.min(this.currentHoverArea.minY, position.y);
            this.currentHoverArea.maxY = Math.max(this.currentHoverArea.maxY, position.y);
            this.currentHoverArea.positionHistory.push(position);
            
            // Keep position history manageable
            if (this.currentHoverArea.positionHistory.length > 20) {
                this.currentHoverArea.positionHistory.shift();
            }
        }
    }

    // End hover tracking and estimate button size
    endHoverTracking(timestamp) {
        if (!this.hoverStartTime || !this.currentHoverArea) return null;
        
        const hoverDuration = timestamp - this.hoverStartTime;
        
        // Only process meaningful hover durations (200ms to 5 seconds)
        if (hoverDuration < 200 || hoverDuration > 5000) {
            this.clearHoverState();
            return null;
        }
        
        const width = this.currentHoverArea.maxX - this.currentHoverArea.minX;
        const height = this.currentHoverArea.maxY - this.currentHoverArea.minY;
        const area = width * height;
        
        const hoverEvent = {
            startTime: this.hoverStartTime,
            endTime: timestamp,
            duration: hoverDuration,
            centerPos: {
                x: (this.currentHoverArea.minX + this.currentHoverArea.maxX) / 2,
                y: (this.currentHoverArea.minY + this.currentHoverArea.maxY) / 2
            },
            estimatedSize: { width, height, area },
            confidence: this.calculateHoverConfidence(hoverDuration, area)
        };
        
        this.hoverEvents.push(hoverEvent);
        
        // Keep only last 20 hover events
        if (this.hoverEvents.length > 20) {
            this.hoverEvents.shift();
        }
        
        console.log('🔘 Hover event completed:', hoverEvent);
        
        this.clearHoverState();
        return hoverEvent;
    }

    // Calculate hover confidence based on duration and area
    calculateHoverConfidence(duration, area) {
        let confidence = 0;
        
        // Duration-based confidence (ideal hover is 300ms - 2s)
        if (duration >= 300 && duration <= 2000) {
            confidence += 0.4;
        } else if (duration >= 200 && duration <= 3000) {
            confidence += 0.3;
        } else {
            confidence += 0.1;
        }
        
        // Area-based confidence (typical buttons are 20x20 to 200x50 pixels)
        if (area >= 400 && area <= 10000) { // 20x20 to 100x100
            confidence += 0.3;
        } else if (area >= 100 && area <= 20000) { // 10x10 to 141x141
            confidence += 0.2;
        } else {
            confidence += 0.1;
        }
        
        // Movement stability (less movement = more button-like)
        const movementVariance = this.calculateMovementVariance();
        if (movementVariance < 10) {
            confidence += 0.2;
        } else if (movementVariance < 30) {
            confidence += 0.1;
        }
        
        return Math.min(0.9, confidence);
    }

    // Calculate movement variance during hover
    calculateMovementVariance() {
        if (!this.currentHoverArea || this.currentHoverArea.positionHistory.length < 3) {
            return 100; // High variance if no data
        }
        
        const positions = this.currentHoverArea.positionHistory;
        const centerX = (this.currentHoverArea.minX + this.currentHoverArea.maxX) / 2;
        const centerY = (this.currentHoverArea.minY + this.currentHoverArea.maxY) / 2;
        
        let totalVariance = 0;
        for (const pos of positions) {
            const dx = pos.x - centerX;
            const dy = pos.y - centerY;
            totalVariance += Math.sqrt(dx * dx + dy * dy);
        }
        
        return totalVariance / positions.length;
    }

    // Clear hover tracking state
    clearHoverState() {
        this.hoverStartTime = null;
        this.currentHoverArea = null;
    }

    // Update button heat map
    updateButtonHeatMap(position, confidence) {
        if (!position || !position.x || !position.y) return;

        // Create position key (rounded to 15px grid for button clustering)
        const gridSize = 15;
        const gridX = Math.round(position.x / gridSize) * gridSize;
        const gridY = Math.round(position.y / gridSize) * gridSize;
        const posKey = `${gridX},${gridY}`;

        // Update heat map entry
        const existing = this.buttonHeatMap.get(posKey) || { 
            x: gridX, 
            y: gridY, 
            totalConfidence: 0, 
            hitCount: 0, 
            avgConfidence: 0,
            lastUpdate: 0,
            buttonType: 'unknown' 
        };

        existing.totalConfidence += confidence;
        existing.hitCount++;
        existing.avgConfidence = existing.totalConfidence / existing.hitCount;
        existing.lastUpdate = Date.now();

        this.buttonHeatMap.set(posKey, existing);

        // Clean up old entries
        this.cleanupHeatMap();
    }

    // Clean up old heat map entries
    cleanupHeatMap() {
        const now = Date.now();
        const maxAge = 90000; // 90 seconds

        for (const [key, entry] of this.buttonHeatMap.entries()) {
            if (now - entry.lastUpdate > maxAge) {
                this.buttonHeatMap.delete(key);
            }
        }
    }

    // Get button detection at position
    getButtonDetectionAt(position, radius = 25) {
        if (!position) return null;

        let bestMatch = null;
        let bestDistance = Infinity;

        for (const entry of this.buttonHeatMap.values()) {
            const distance = Math.sqrt(
                Math.pow(entry.x - position.x, 2) + 
                Math.pow(entry.y - position.y, 2)
            );

            if (distance <= radius && distance < bestDistance && entry.avgConfidence > 0.6) {
                bestMatch = {
                    ...entry,
                    distance,
                    confidence: entry.avgConfidence
                };
                bestDistance = distance;
            }
        }

        return bestMatch;
    }

    // Get detection statistics
    getStats() {
        const now = Date.now();
        const recentDetections = this.detectionHistory.filter(d => now - d.timestamp < 10000);
        const recentHovers = this.hoverEvents.filter(h => now - h.endTime < 10000);

        return {
            isMonitoring: this.isMonitoring,
            totalDetections: this.detectionHistory.length,
            recentDetections: recentDetections.length,
            buttonHotspots: this.buttonHeatMap.size,
            hoverEvents: this.hoverEvents.length,
            recentHovers: recentHovers.length,
            highConfidenceDetections: recentDetections.filter(d => d.buttonConfidence > 0.8).length,
            currentlyHovering: !!this.hoverStartTime
        };
    }

    // Test button detection accuracy
    testDetectionAccuracy() {
        const stats = this.getStats();
        console.log('🔘 Button Detection Test Results:', stats);
        
        // Calculate accuracy metrics
        const totalDetections = this.detectionHistory.length;
        const highConfidenceDetections = this.detectionHistory.filter(d => d.buttonConfidence > 0.8).length;
        const accuracy = totalDetections > 0 ? (highConfidenceDetections / totalDetections) * 100 : 0;

        console.log(`📊 Button Detection Accuracy: ${accuracy.toFixed(1)}% (${highConfidenceDetections}/${totalDetections} high-confidence detections)`);
        
        return { accuracy, totalDetections, highConfidenceDetections, stats };
    }

    // Handle cursor leaving potential button area
    onCursorLeave(position, timestamp) {
        if (this.hoverStartTime) {
            this.endHoverTracking(timestamp || Date.now());
        }
    }

    // Cleanup
    destroy() {
        this.stopDetection();
        this.detectionHistory = [];
        this.buttonHeatMap.clear();
        this.hoverEvents = [];
        this.mouseVelocityHistory = [];
        this.clearHoverState();
    }

    analyzeForButton(cursorInfo, previousCursor, velocity) {
        if (!this.detectionEnabled) {
            return { isButton: false, confidence: 0 };
        }
        
        const startTime = Date.now();
        
        try {
            // Check cache first
            const cacheKey = `${cursorInfo.x},${cursorInfo.y},${cursorInfo.type},${velocity.x},${velocity.y}`;
            const cached = this.detectionCache.get(cacheKey);
            
            if (cached && (startTime - cached.timestamp) < this.cacheTimeout) {
                this.performanceMetrics.cacheHits++;
                return cached.result;
            }
            
            this.performanceMetrics.cacheMisses++;
            
            let confidence = 0;
            let reasons = [];

            // Pointer cursor detection (80% confidence)
            if (cursorInfo.type === 'pointer') {
                confidence += 0.8;
                reasons.push('pointer_cursor');
            }

            // Mouse deceleration analysis (hover detection)
            const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
            if (speed < 50 && previousCursor) { // Slow movement = potential hover
                const prevSpeed = Math.sqrt(
                    Math.pow(cursorInfo.x - previousCursor.x, 2) + 
                    Math.pow(cursorInfo.y - previousCursor.y, 2)
                );
                
                if (prevSpeed > speed * 2) { // Significant deceleration
                    confidence += 0.6;
                    reasons.push('hover_deceleration');
                }
            }

            // Low movement variance (hovering over element)
            if (speed < 25) { // Very slow or stationary
                confidence += 0.4;
                reasons.push('stationary_hover');
            }
            
            // Apply time limits for safety
            const detectionTime = Date.now() - startTime;
            if (detectionTime > this.maxDetectionTime) {
                console.warn(`Button detection exceeded time limit: ${detectionTime}ms`);
                this.checkPerformanceDegradation();
            }
            
            const result = {
                isButton: confidence > 0.8,
                confidence: Math.min(confidence, 1.0),
                reasons: reasons,
                estimatedSize: this.estimateButtonSize(cursorInfo, velocity),
                timestamp: startTime
            };
            
            // Cache the result
            this.detectionCache.set(cacheKey, {
                result: result,
                timestamp: startTime
            });
            
            // Clean old cache entries
            if (this.detectionCache.size > 100) {
                this.cleanCache();
            }
            
            // Record performance metrics
            this.recordDetectionTime(detectionTime);
            
            return result;
            
        } catch (error) {
            console.error('Error in Button detection:', error);
            // Fallback to basic detection
            return { isButton: cursorInfo.type === 'pointer', confidence: 0.5 };
        }
    }
    
    // Add the same performance methods as FormFieldDetector
    recordDetectionTime(detectionTime) {
        this.performanceMetrics.detectionTimes.push(detectionTime);
        this.performanceMetrics.totalDetections++;
        this.performanceMetrics.detectionCount++;
        
        // Keep only recent detection times (last 50)
        if (this.performanceMetrics.detectionTimes.length > 50) {
            this.performanceMetrics.detectionTimes.shift();
        }
    }
    
    checkPerformanceDegradation() {
        const avgTime = this.getAverageDetectionTime();
        if (avgTime > this.degradationThreshold) {
            console.warn(`Button Detection performance degraded: ${avgTime}ms avg, enabling fallback mode`);
            this.detectionEnabled = false;
            
            // Re-enable after 5 seconds
            setTimeout(() => {
                this.detectionEnabled = true;
                console.log('Button Detection re-enabled after performance recovery');
            }, 5000);
        }
    }
    
    cleanCache() {
        const now = Date.now();
        for (const [key, cached] of this.detectionCache.entries()) {
            if ((now - cached.timestamp) > this.cacheTimeout * 2) {
                this.detectionCache.delete(key);
            }
        }
    }
    
    getCurrentFPS() {
        const now = Date.now();
        const timeSinceLastCheck = now - this.performanceMetrics.lastFPSCheck;
        
        if (timeSinceLastCheck >= 1000) {
            const fps = (this.performanceMetrics.detectionCount / timeSinceLastCheck) * 1000;
            this.performanceMetrics.lastFPSCheck = now;
            this.performanceMetrics.detectionCount = 0;
            return Math.round(fps * 10) / 10;
        }
        
        return 0;
    }
    
    getAverageDetectionTime() {
        if (this.performanceMetrics.detectionTimes.length === 0) return 0;
        const sum = this.performanceMetrics.detectionTimes.reduce((a, b) => a + b, 0);
        return Math.round((sum / this.performanceMetrics.detectionTimes.length) * 10) / 10;
    }
    
    getCacheHitRate() {
        const total = this.performanceMetrics.cacheHits + this.performanceMetrics.cacheMisses;
        return total > 0 ? this.performanceMetrics.cacheHits / total : 0;
    }
}

module.exports = {
    FormFieldDetector,
    ButtonDetector
}; 