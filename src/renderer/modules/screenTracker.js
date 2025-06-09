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

        console.log('🖥️ Getting recording bounds for source:', this.selectedSource);
        console.log('🖥️ Selected source TYPE:', this.selectedSource.type);
        console.log('🖥️ Selected source ID:', this.selectedSource.id);
        console.log('🖥️ Selected source NAME:', this.selectedSource.name);
        console.log('🖥️ Selected source DISPLAY_ID:', this.selectedSource.display_id);
        
        const displayInfo = await ipcRenderer.invoke('get-display-info');
        console.log('🖥️ Display info received:', displayInfo);
        
        if (this.selectedSource.type === 'screen') {
            // ALWAYS use display_id if available (this is the most reliable method)
            if (this.selectedSource.display_id) {
                console.log('🖥️ Using display_id from source:', this.selectedSource.display_id);
                const display = displayInfo.displays.find(d => 
                    d.id.toString() === this.selectedSource.display_id.toString()
                );
                
                if (display) {
                    console.log('🖥️ ✅ Found display by display_id:', display);
                    console.log('🖥️ Recording bounds:', display.bounds);
                    return display.bounds;
                } else {
                    console.log('⚠️ Display not found by display_id, available IDs:', 
                        displayInfo.displays.map(d => d.id));
                }
            }
            
            // Fallback: Parse screen index from ID (more reliable than name)
            let screenIndex = 0;
            if (this.selectedSource.id.includes(':')) {
                // Parse from "screen:0:0" format - use first number after 'screen:'
                screenIndex = parseInt(this.selectedSource.id.split(':')[1]) || 0;
            } else if (this.selectedSource.name && this.selectedSource.name.includes('Screen ')) {
                // Extract screen number from "Screen 1", "Screen 2", etc.
                const screenNumber = parseInt(this.selectedSource.name.split('Screen ')[1]) || 1;
                screenIndex = screenNumber - 1; // Convert to 0-based index
            }
            
            console.log('🖥️ Parsed screen index:', screenIndex);
            console.log('🖥️ Available displays:', displayInfo.displays.map((d, i) => ({ 
                index: i, id: d.id, bounds: d.bounds, label: d.label || 'Unknown'
            })));
            
            // Try to match by name pattern first
            if (this.selectedSource.name && this.selectedSource.name.includes('Screen ')) {
                const screenNumber = parseInt(this.selectedSource.name.split('Screen ')[1]);
                console.log('🖥️ Extracted screen number from name:', screenNumber);
                
                // Try to find a display that matches this screen number
                // Look for displays with labels that might correspond
                for (let i = 0; i < displayInfo.displays.length; i++) {
                    const display = displayInfo.displays[i];
                    // For primary displays or when screen number matches position
                    if ((screenNumber === 1 && !display.internal && display.label) || 
                        (screenNumber === 2 && display.internal)) {
                        console.log('🖥️ ✅ Found display by screen pattern matching:', display);
                        console.log('🖥️ Recording bounds:', display.bounds);
                        return display.bounds;
                    }
                }
            }
            
            // Final fallback: use primary display for Screen 1, first internal for Screen 2
            const isScreen1 = this.selectedSource.name && this.selectedSource.name.includes('Screen 1');
            if (isScreen1) {
                const primaryDisplay = displayInfo.primary;
                console.log('🖥️ ✅ Using primary display for Screen 1:', primaryDisplay);
                console.log('🖥️ Recording bounds:', primaryDisplay.bounds);
                return primaryDisplay.bounds;
            } else {
                // For other screens, use first available display
                const firstDisplay = displayInfo.displays[0] || displayInfo.primary;
                console.log('🖥️ ✅ Using first available display:', firstDisplay);
                console.log('🖥️ Recording bounds:', firstDisplay.bounds);
                return firstDisplay.bounds;
            }
        } else {
            // Window source - need to get the actual window bounds
            console.log('🖥️ Window source detected:', this.selectedSource.name);
            
            // For window sources, we need to get the window's actual position and size
            // This is more complex as we need to track the specific window
            // For now, let's use a more intelligent approach
            
            try {
                // Try to get window bounds from the source name or other available info
                // If we can't get specific bounds, use the primary display as fallback
                console.log('🖥️ Attempting to get window bounds for:', this.selectedSource);
                
                // TODO: Implement proper window bounds detection
                // For now, use primary display bounds but log that this needs improvement
                console.log('⚠️ Window bounds detection not fully implemented - using primary display');
                console.log('🖥️ Consider selecting a screen source for full click detection coverage');
                
                return displayInfo.primary.bounds;
            } catch (error) {
                console.error('❌ Error getting window bounds:', error);
                return displayInfo.primary.bounds;
            }
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