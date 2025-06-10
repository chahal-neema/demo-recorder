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
}

class ButtonDetector {
    constructor() {
        this.detectionHistory = [];
        this.buttonHeatMap = new Map();
        this.isMonitoring = false;
    }

    // Placeholder for button detection - will be implemented in Task 1.3
    startDetection() {
        this.isMonitoring = true;
        console.log('🔘 Button detector initialized (full implementation in Task 1.3)');
    }

    stopDetection() {
        this.isMonitoring = false;
    }

    destroy() {
        this.stopDetection();
        this.detectionHistory = [];
        this.buttonHeatMap.clear();
    }
}

module.exports = {
    FormFieldDetector,
    ButtonDetector
}; 