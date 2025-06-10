const config = {
  zoom: {
    enabled: false,
    level: 1.5,      // Reduced zoom for better usability (was 2.0)
    speed: 2,        // Slower, smoother transition (was 3)
    trigger: 'click',
    sensitivity: 5,
    gracePeriod: 2000,          // ms before zoom can trigger
    followLagZoomed: 0.25,      // how quickly zoomed view follows cursor
    followLagNormal: 0.15,      // follow speed when not zoomed
  },
  mouse: {
    enabled: true,
    highlight: true,
    clickEffects: false,
    highlightSize: 3,
    highlightColor: '#1db954',
    clickAnimation: 'ripple',
    trackingInterval: 16,       // ms between mouse position checks
    clickInterval: 50,          // ms between click detection checks
  },
  recording: {
    includeAudio: true,
    includeMicrophone: false,
    quality: 'medium',
    framerate: 30,
  },
  debug: {
    showPerformance: false,      // Show performance overlay in preview
    showUIDetections: true,      // Show UI detection overlays
    logPerformance: false,       // Log performance metrics to console
    enableLogging: false,        // Enable verbose file logging
    maxDetectionTime: 50,        // Max time allowed for UI detection (ms)
    cacheTimeout: 500,           // Cache validity time (ms)
    degradationThreshold: 30,    // Performance degradation threshold (ms)
  }
};

function updateConfig(newConfig) {
  Object.assign(config, newConfig);
}

module.exports = { config, updateConfig };
