const config = {
  zoom: {
    enabled: false,
    level: 1.5,
    speed: 3,
    trigger: 'click',
    sensitivity: 5,
  },
  mouse: {
    enabled: true,
    highlight: true,
    clickEffects: false,
    highlightSize: 3,
    highlightColor: '#1db954',
    clickAnimation: 'ripple',
  },
  recording: {
    includeAudio: true,
    includeMicrophone: false,
    quality: 'medium',
    framerate: 30,
  }
};

function updateConfig(newConfig) {
  Object.assign(config, newConfig);
}

module.exports = { config, updateConfig }; 