const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logFile = null;
        this.originalConsoleLog = null;
        this.isInitialized = false;
    }

    // Initialize the logger
    initialize(logFileName = 'debug.log') {
        if (this.isInitialized) {
            console.warn('Logger already initialized');
            return;
        }

        // Setup log file path
        this.logFile = path.join(__dirname, '..', '..', '..', logFileName);
        this.originalConsoleLog = console.log;

        // Override console.log to also write to file
        console.log = (...args) => {
            const timestamp = new Date().toISOString();
            const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
            ).join(' ');
            
            const logEntry = `[${timestamp}] ${message}\n`;
            
            // Write to file
            this.writeToFile(logEntry);
            
            // Also output to original console
            this.originalConsoleLog.apply(console, args);
        };

        // Clear/initialize log file
        this.clearLogFile();
        
        this.isInitialized = true;
        console.log('✅ Logger initialized with file:', this.logFile);
    }

    // Write content to log file
    writeToFile(content) {
        if (!this.logFile) return;
        
        try {
            fs.appendFileSync(this.logFile, content);
        } catch (error) {
            // Fallback to original console.log if file write fails
            if (this.originalConsoleLog) {
                this.originalConsoleLog('❌ Failed to write to log file:', error.message);
            }
        }
    }

    // Clear the log file and add header
    clearLogFile() {
        if (!this.logFile) return;
        
        try {
            const header = '=== DEMO RECORDER DEBUG LOG ===\n';
            fs.writeFileSync(this.logFile, header);
        } catch (error) {
            // Ignore if can't clear - file might not exist yet
        }
    }

    // Log with specific level
    info(message, ...args) {
        console.log('ℹ️', message, ...args);
    }

    warn(message, ...args) {
        console.log('⚠️', message, ...args);
    }

    error(message, ...args) {
        console.log('❌', message, ...args);
    }

    success(message, ...args) {
        console.log('✅', message, ...args);
    }

    debug(message, ...args) {
        console.log('🔧', message, ...args);
    }

    // Log recording events
    recording(message, ...args) {
        console.log('🎬', message, ...args);
    }

    // Log mouse events
    mouse(message, ...args) {
        console.log('🖱️', message, ...args);
    }

    // Log zoom events
    zoom(message, ...args) {
        console.log('🔍', message, ...args);
    }

    // Log UI events
    ui(message, ...args) {
        console.log('🎨', message, ...args);
    }

    // Log source/screen events
    screen(message, ...args) {
        console.log('📺', message, ...args);
    }

    // Log performance events
    performance(message, ...args) {
        console.log('⚡', message, ...args);
    }

    // Add custom log entry with timestamp
    logEntry(level, message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            level: level,
            message: message,
            data: data
        };

        if (data) {
            console.log(`${this.getLevelIcon(level)} ${message}:`, data);
        } else {
            console.log(`${this.getLevelIcon(level)} ${message}`);
        }
    }

    // Get icon for log level
    getLevelIcon(level) {
        const icons = {
            'info': 'ℹ️',
            'warn': '⚠️',
            'error': '❌',
            'success': '✅',
            'debug': '🔧',
            'recording': '🎬',
            'mouse': '🖱️',
            'zoom': '🔍',
            'ui': '🎨',
            'screen': '📺',
            'performance': '⚡'
        };
        return icons[level] || 'ℹ️';
    }

    // Restore original console.log
    restore() {
        if (this.originalConsoleLog && this.isInitialized) {
            console.log = this.originalConsoleLog;
            this.isInitialized = false;
            this.originalConsoleLog('✅ Logger restored to original console.log');
        }
    }

    // Get log file path
    getLogFilePath() {
        return this.logFile;
    }

    // Check if logger is initialized
    isReady() {
        return this.isInitialized;
    }
}

// Create and export singleton instance
const logger = new Logger();

module.exports = logger; 