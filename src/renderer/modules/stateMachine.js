const { config } = require('./config.js');

class RecordingStateMachine {
    constructor() {
        // Recording state
        this.isRecording = false;
        this.isPaused = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.timerInterval = null;
        this.seconds = 0;
        
        // Callbacks for UI updates
        this.onStateChange = null;
        this.onTimerUpdate = null;
        this.onError = null;
        this.onRecordingComplete = null;
    }

    // Initialize with callback functions
    initialize(callbacks) {
        this.onStateChange = callbacks.onStateChange;
        this.onTimerUpdate = callbacks.onTimerUpdate;
        this.onError = callbacks.onError;
        this.onRecordingComplete = callbacks.onRecordingComplete;
    }

    // Get current state
    getState() {
        return {
            isRecording: this.isRecording,
            isPaused: this.isPaused,
            seconds: this.seconds,
            hasActiveRecording: this.mediaRecorder && this.mediaRecorder.state !== 'inactive'
        };
    }

    // Start recording with the provided stream
    async startRecording(recordingStream) {
        if (this.isRecording) {
            throw new Error('Recording is already in progress');
        }

        this.isRecording = true;
        this.isPaused = false;
        this.recordedChunks = [];
        this.seconds = 0;

        try {
            // Setup MediaRecorder
            const mimeType = 'video/webm; codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                throw new Error(`${mimeType} is not supported`);
            }

            this.mediaRecorder = new MediaRecorder(recordingStream, { 
                mimeType,
                videoBitsPerSecond: 8000000  // 8 Mbps for better quality
            });
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                    console.log('📦 Recording data chunk:', e.data.size, 'bytes');
                }
            };
            
            this.mediaRecorder.onstop = () => this.handleStop();
            
            this.mediaRecorder.onerror = (event) => {
                console.error('❌ MediaRecorder error:', event);
                if (this.onError) {
                    this.onError('Recording Error', event);
                }
            };
            
            // Start recording
            this.mediaRecorder.start(100); // Collect data every 100ms
            console.log('🎬 MediaRecorder started. State:', this.mediaRecorder.state);

            // Start timer
            this.startTimer();

            // Notify state change
            if (this.onStateChange) {
                this.onStateChange(this.getState());
            }

        } catch (error) {
            this.isRecording = false;
            if (this.onError) {
                this.onError('Error starting recording', error);
            }
            throw error;
        }
    }

    // Pause/resume recording
    pauseRecording() {
        if (!this.isRecording || !this.mediaRecorder) return;
        
        this.isPaused = !this.isPaused;
        
        if (this.isPaused) {
            this.mediaRecorder.pause();
            this.stopTimer();
        } else {
            this.mediaRecorder.resume();
            this.startTimer();
        }

        // Notify state change
        if (this.onStateChange) {
            this.onStateChange(this.getState());
        }
    }

    // Stop recording
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
    }

    // Handle recording stop
    async handleStop() {
        this.isRecording = false;
        this.isPaused = false;
        this.stopTimer();
        this.seconds = 0;

        // Create blob from recorded chunks
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        
        // Notify completion
        if (this.onRecordingComplete && blob.size > 0) {
            const buffer = Buffer.from(await blob.arrayBuffer());
            this.onRecordingComplete(buffer);
        }

        // Reset state
        this.recordedChunks = [];
        this.mediaRecorder = null;

        // Notify state change
        if (this.onStateChange) {
            this.onStateChange(this.getState());
        }
    }

    // Timer management
    startTimer() {
        this.stopTimer(); // Clear any existing timer
        this.timerInterval = setInterval(() => {
            this.seconds++;
            if (this.onTimerUpdate) {
                this.onTimerUpdate(this.seconds);
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    // Cleanup
    destroy() {
        this.stopTimer();
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.isPaused = false;
        this.seconds = 0;
    }
}

module.exports = RecordingStateMachine; 