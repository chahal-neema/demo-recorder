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

// Render UI detection results in preview
function renderUIDetectionOverlay({ ctx, canvas, uiDetections, recordingBounds }) {
  if (!uiDetections || !recordingBounds) return;

  const { formFieldDetections, buttonDetections, currentUIElement } = uiDetections;
  
  // Render text field heat map
  if (formFieldDetections && formFieldDetections.size > 0) {
    for (const [posKey, detection] of formFieldDetections.entries()) {
      const [x, y] = posKey.split(',').map(Number);
      
      // Convert absolute coordinates to canvas coordinates
      const relativeX = (x - recordingBounds.x) / recordingBounds.width;
      const relativeY = (y - recordingBounds.y) / recordingBounds.height;
      const canvasX = relativeX * canvas.width;
      const canvasY = relativeY * canvas.height;
      
      // Skip if outside canvas bounds
      if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
        continue;
      }
      
      // Draw text field detection
      const confidence = detection.avgConfidence || 0.5;
      const alpha = Math.min(0.6, confidence);
      
      ctx.beginPath();
      ctx.fillStyle = `rgba(100, 149, 237, ${alpha})`; // Cornflower blue
      ctx.roundRect(canvasX - 30, canvasY - 8, 60, 16, 3);
      ctx.fill();
      
      // Draw confidence indicator
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha + 0.2})`;
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`📝 ${Math.round(confidence * 100)}%`, canvasX, canvasY + 3);
    }
  }
  
  // Render button heat map
  if (buttonDetections && buttonDetections.size > 0) {
    for (const [posKey, detection] of buttonDetections.entries()) {
      const [x, y] = posKey.split(',').map(Number);
      
      // Convert absolute coordinates to canvas coordinates
      const relativeX = (x - recordingBounds.x) / recordingBounds.width;
      const relativeY = (y - recordingBounds.y) / recordingBounds.height;
      const canvasX = relativeX * canvas.width;
      const canvasY = relativeY * canvas.height;
      
      // Skip if outside canvas bounds
      if (canvasX < 0 || canvasX > canvas.width || canvasY < 0 || canvasY > canvas.height) {
        continue;
      }
      
      // Draw button detection
      const confidence = detection.avgConfidence || 0.5;
      const alpha = Math.min(0.6, confidence);
      
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`; // Orange
      ctx.roundRect(canvasX - 20, canvasY - 10, 40, 20, 5);
      ctx.fill();
      
      // Draw confidence indicator
      ctx.beginPath();
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha + 0.2})`;
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`🔘 ${Math.round(confidence * 100)}%`, canvasX, canvasY + 3);
    }
  }
  
  // Highlight current active UI element
  if (currentUIElement && currentUIElement.detection && currentUIElement.detection.position) {
    const pos = currentUIElement.detection.position;
    const relativeX = (pos.x - recordingBounds.x) / recordingBounds.width;
    const relativeY = (pos.y - recordingBounds.y) / recordingBounds.height;
    const canvasX = relativeX * canvas.width;
    const canvasY = relativeY * canvas.height;
    
    if (canvasX >= 0 && canvasX <= canvas.width && canvasY >= 0 && canvasY <= canvas.height) {
      // Draw active element highlight
      ctx.beginPath();
      ctx.strokeStyle = '#FFD700'; // Gold
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      
      let width = 60, height = 20;
      if (currentUIElement.type === 'text-field') {
        width = 80;
        height = 20;
      } else if (currentUIElement.type === 'button') {
        width = 50;
        height = 25;
      }
      
      ctx.roundRect(canvasX - width/2, canvasY - height/2, width, height, 5);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw element type label
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255, 215, 0, 0.9)'; // Gold background
      ctx.roundRect(canvasX - 25, canvasY - 35, 50, 15, 3);
      ctx.fill();
      
      ctx.fillStyle = '#000';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      const icon = currentUIElement.type === 'text-field' ? '📝' : 
                   currentUIElement.type === 'button' ? '🔘' : '🎯';
      ctx.fillText(`${icon} ${currentUIElement.type}`, canvasX, canvasY - 25);
    }
  }
}

// Render performance metrics overlay
function renderPerformanceOverlay({ ctx, canvas, performanceData }) {
  if (!performanceData) return;
  
  const { detectionFPS, avgDetectionTime, cacheHitRate, totalDetections } = performanceData;
  
  // Draw performance panel in top-right corner
  const panelWidth = 180;
  const panelHeight = 80;
  const panelX = canvas.width - panelWidth - 10;
  const panelY = 10;
  
  // Background
  ctx.beginPath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.roundRect(panelX, panelY, panelWidth, panelHeight, 5);
  ctx.fill();
  
  // Text
  ctx.fillStyle = '#FFF';
  ctx.font = '11px Arial';
  ctx.textAlign = 'left';
  
  let textY = panelY + 15;
  ctx.fillText(`🎯 UI Detection: ${detectionFPS || 0} fps`, panelX + 5, textY);
  textY += 15;
  ctx.fillText(`⏱️ Avg Time: ${avgDetectionTime || 0}ms`, panelX + 5, textY);
  textY += 15;
  ctx.fillText(`💾 Cache Hit: ${Math.round((cacheHitRate || 0) * 100)}%`, panelX + 5, textY);
  textY += 15;
  ctx.fillText(`📊 Total: ${totalDetections || 0} detections`, panelX + 5, textY);
}

module.exports = {
  renderMouseEffects,
  renderZoomIndicators,
  renderUIDetectionOverlay,
  renderPerformanceOverlay
}; 