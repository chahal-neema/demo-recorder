const { ipcRenderer } = require('electron');
const SourceManager = require('./sources.js');
const Preview = require('./preview.js');

class ScreenTracker {
    constructor() {
        this.selectedSource = null;
        this.currentSourceType = 'screen';
        this.dom = null;
        
        // Callbacks
        this.onSourceSelected = null;
        this.onPreviewReady = null;
        this.onError = null;
    }

    // Initialize with DOM elements and callbacks
    initialize(dom, callbacks = {}) {
        this.dom = dom;
        this.onSourceSelected = callbacks.onSourceSelected;
        this.onPreviewReady = callbacks.onPreviewReady;
        this.onError = callbacks.onError;
    }

    // Get current source info
    getCurrentSource() {
        return {
            selectedSource: this.selectedSource,
            currentSourceType: this.currentSourceType,
            hasValidSource: !!this.selectedSource
        };
    }

    // Change source type (screen/window)
    async changeSourceType(type) {
        console.log('🔄 Source type changed to:', type);
        this.currentSourceType = type;
        this.selectedSource = null;
        
        // Clear preview
        this.clearPreview();
        
        // Load new sources
        await this.loadSources();
    }

    // Load sources for current type
    async loadSources() {
        console.log('📺 Loading sources for type:', this.currentSourceType);
        
        try {
            // Clear previous sources and reset preview
            if (this.dom) {
                this.dom.sourceGrid.innerHTML = '';
                this.clearPreview();
            }

            console.log('🔄 Calling getSources...');
            const sources = await SourceManager.getSources(this.currentSourceType);
            console.log('📋 Sources received:', sources.length, 'sources');
            
            if (this.dom) {
                SourceManager.renderSources(sources, this.dom.sourceGrid, 
                    (source) => this.selectSource(source));
            }
            
            console.log('✅ Sources rendered');
            return sources;
            
        } catch (error) {
            console.error('❌ Error loading sources:', error);
            if (this.onError) {
                this.onError('Failed to load sources', error);
            }
            throw error;
        }
    }

    // Select a source for recording
    async selectSource(source) {
        console.log('🎯 Source selected:', source);
        this.selectedSource = source;

        try {
            // Get stream for the selected source
            const stream = await this.getSourceStream(source);
            
            // Setup preview
            if (this.dom) {
                this.dom.previewPlaceholder.style.display = 'none';
                this.dom.previewVideo.style.display = 'block';
                this.dom.previewVideo.srcObject = stream;
                this.dom.startBtn.disabled = false;
                
                // Add debug logging when video loads
                this.dom.previewVideo.addEventListener('loadedmetadata', () => {
                    console.log('📺 Video loaded - dimensions:', 
                        this.dom.previewVideo.videoWidth + 'x' + this.dom.previewVideo.videoHeight);
                    console.log('📺 Container dimensions:', 
                        this.dom.previewContainer.offsetWidth + 'x' + this.dom.previewContainer.offsetHeight);
                });
                
                // Initialize preview with effects
                await Preview.initializePreview(this.dom, this.selectedSource);
            }

            // Notify callbacks
            if (this.onSourceSelected) {
                this.onSourceSelected(source, stream);
            }
            
            if (this.onPreviewReady) {
                this.onPreviewReady(stream);
            }

            return stream;

        } catch (error) {
            console.error('❌ Error selecting source:', error);
            if (this.onError) {
                this.onError('Failed to select source', error);
            }
            throw error;
        }
    }

    // Get stream from source
    async getSourceStream(source) {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: source.id,
                },
            },
        });
        
        console.log('📹 Stream obtained:', stream);
        console.log('📹 Video tracks:', stream.getVideoTracks());
        
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
            const settings = videoTrack.getSettings();
            console.log('📹 Video track settings:', settings);
            console.log('📹 Resolution:', settings.width + 'x' + settings.height);
            console.log('📹 Aspect ratio:', (settings.width / settings.height).toFixed(2));
        }
        
        return stream;
    }

    // Get current stream (from preview video)
    getCurrentStream() {
        if (this.dom && this.dom.previewVideo && this.dom.previewVideo.srcObject) {
            return this.dom.previewVideo.srcObject;
        }
        return null;
    }

    // Clear preview
    clearPreview() {
        if (this.dom) {
            this.dom.previewVideo.style.display = 'none';
            this.dom.previewPlaceholder.style.display = 'flex';
            this.dom.startBtn.disabled = true;
        }
        
        Preview.stopPreview();
        this.selectedSource = null;
    }

    // Refresh current sources
    async refreshSources() {
        console.log('🔄 Refreshing sources...');
        await this.loadSources();
    }

    // Get recording bounds for selected source
    async getRecordingBounds() {
        if (!this.selectedSource) {
            throw new Error('No source selected');
        }

        const displayInfo = await ipcRenderer.invoke('get-display-info');
        
        if (this.selectedSource.type === 'screen') {
            const display = displayInfo.displays.find(d => 
                d.id.toString() === this.selectedSource.id.split('-')[1]
            ) || displayInfo.primary;
            return display.bounds;
        } else {
            return displayInfo.primary.bounds;
        }
    }

    // Cleanup
    destroy() {
        this.clearPreview();
        this.selectedSource = null;
        this.dom = null;
    }
}

module.exports = ScreenTracker; 