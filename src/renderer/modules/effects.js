const { config } = require('./config.js');

function renderRippleEffect(ctx, x, y, progress, color) {
  const maxRadius = 50;
  const radius = progress * maxRadius;
  const opacity = 1 - progress;
  
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.globalAlpha = opacity;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function renderPulseEffect(ctx, x, y, progress, color) {
  const maxRadius = 40;
  const radius = (Math.sin(progress * Math.PI) * maxRadius) / 2;
  const opacity = 1 - progress;
  
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.globalAlpha = opacity * 0.7;
  ctx.fill();
  ctx.globalAlpha = 1;
}

function renderRingEffect(ctx, x, y, progress, color) {
  const startRadius = 20;
  const endRadius = 50;
  const radius = startRadius + (endRadius - startRadius) * progress;
  const opacity = 1 - progress;

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5 * (1 - progress);
  ctx.globalAlpha = opacity;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function renderMouseEffects({ ctx, canvas, mousePos, lastClick }) {
  if (!config.mouse.highlight || mousePos.relativeX === -1) return;

  const previewX = mousePos.relativeX * canvas.width;
  const previewY = mousePos.relativeY * canvas.height;

  if (previewX < 0 || previewX > canvas.width || previewY < 0 || previewY > canvas.height) {
    return;
  }

  const size = config.mouse.highlightSize * 4 + 8; // Scale for visibility
  const color = config.mouse.highlightColor;

  // Draw mouse highlight
  ctx.beginPath();
  ctx.arc(previewX, previewY, size, 0, 2 * Math.PI);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw click effects
  if (config.mouse.clickEffects && Date.now() - lastClick < 1000) {
    const elapsed = Date.now() - lastClick;
    const progress = elapsed / 1000;
    
    switch (config.mouse.clickAnimation) {
      case 'ripple': renderRippleEffect(ctx, previewX, previewY, progress, color); break;
      case 'pulse': renderPulseEffect(ctx, previewX, previewY, progress, color); break;
      case 'ring': renderRingEffect(ctx, previewX, previewY, progress, color); break;
    }
  }
}

function renderZoomIndicators({ ctx, canvas, mousePos, velocity }) {
  if (mousePos.relativeX === -1) return;

  const previewX = mousePos.relativeX * canvas.width;
  const previewY = mousePos.relativeY * canvas.height;
  
  const lookaheadTime = 0.1; // 100ms
  const predictedX = mousePos.x + velocity.x * lookaheadTime;
  const predictedY = mousePos.y + velocity.y * lookaheadTime;

  // This needs to be mapped to relative coordinates, assuming recordingBounds is available
  // For now, we'll just calculate a predicted canvas position for visualization
  const predictedCanvasX = previewX + (velocity.x * lookaheadTime / 10); // Simplified
  const predictedCanvasY = previewY + (velocity.y * lookaheadTime / 10);


  const zoomRadius = (canvas.width / config.zoom.level) / 2;

  // Draw predicted zoom area
  ctx.beginPath();
  ctx.setLineDash([5, 10]);
  ctx.strokeStyle = 'rgba(173, 216, 230, 0.7)'; // Light blue
  ctx.arc(predictedCanvasX, predictedCanvasY, zoomRadius, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw predicted zoom center
  ctx.beginPath();
  ctx.fillStyle = 'rgba(144, 238, 144, 0.9)'; // Light green
  ctx.arc(predictedCanvasX, predictedCanvasY, 5, 0, 2 * Math.PI);
  ctx.fill();

  // Draw current mouse position
  ctx.beginPath();
  ctx.fillStyle = '#00FF00'; // Green dot
  ctx.arc(previewX, previewY, 3, 0, 2 * Math.PI);
  ctx.fill();
}

module.exports = {
  renderMouseEffects,
  renderZoomIndicators
}; 