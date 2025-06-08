<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Demo Recorder</title>
    <meta name="theme-color" content="#1db954">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0f0f0f 0%, #191414 50%, #1a1a1a 100%);
            color: #ffffff;
            height: 100vh;
            overflow: hidden;
        }

        .app {
            display: flex;
            flex-direction: column;
            height: 100vh;
            background: linear-gradient(135deg, rgba(15, 15, 15, 0.95) 0%, rgba(25, 20, 20, 0.95) 100%);
            backdrop-filter: blur(20px);
        }

        /* Header */
        .header {
            background: linear-gradient(90deg, rgba(0, 0, 0, 0.8) 0%, rgba(29, 185, 84, 0.1) 100%);
            border-bottom: 1px solid rgba(29, 185, 84, 0.2);
            padding: 20px 30px;
            backdrop-filter: blur(10px);
            box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
        }

        .header-content {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .header h1 {
            font-size: 28px;
            font-weight: 700;
            background: linear-gradient(45deg, #1db954, #1ed760);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            text-shadow: 0 0 30px rgba(29, 185, 84, 0.3);
        }

        .recording-status {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 12px 20px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 25px;
            border: 1px solid rgba(29, 185, 84, 0.3);
            backdrop-filter: blur(10px);
        }

        .status-indicator {
            width: 12px;
            height: 12px;
            background: #1db954;
            border-radius: 50%;
            animation: pulse 2s infinite;
            box-shadow: 0 0 10px rgba(29, 185, 84, 0.6);
        }

        @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
        }

        .status-indicator.recording {
            background: #e22134;
            box-shadow: 0 0 15px rgba(226, 33, 52, 0.8);
        }

        .timer {
            font-family: 'Inter', monospace;
            font-weight: 600;
            color: #1db954;
            font-size: 16px;
            text-shadow: 0 0 10px rgba(29, 185, 84, 0.3);
        }

        /* Main Content */
        .main-content {
            flex: 1;
            display: grid;
            grid-template-columns: 1fr 1.2fr;
            gap: 30px;
            padding: 30px;
            min-height: 0;
        }

        /* Controls Panel */
        .controls-panel {
            background: linear-gradient(135deg, rgba(40, 40, 40, 0.8) 0%, rgba(20, 20, 20, 0.9) 100%);
            border-radius: 16px;
            padding: 30px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(20px);
            overflow-y: auto;
            height: 100%;
        }

        .controls-panel h3 {
            color: #1db954;
            margin-bottom: 20px;
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .controls-panel h3::before {
            content: '';
            width: 4px;
            height: 20px;
            background: linear-gradient(45deg, #1db954, #1ed760);
            border-radius: 2px;
        }

        /* Source Selection */
        .source-selection {
            margin-bottom: 30px;
        }

        .source-types {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.05);
            padding: 8px;
        }

        .source-type-btn {
            flex: 1;
            padding: 12px 16px;
            border: none;
            border-radius: 8px;
            background: transparent;
            color: #b3b3b3;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 14px;
            font-weight: 500;
        }

        .source-type-btn:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
        }

        .source-type-btn.active {
            background: linear-gradient(45deg, #1db954, #1ed760);
            color: #ffffff;
            box-shadow: 0 2px 10px rgba(29, 185, 84, 0.3);
        }

        .source-list-container {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .source-list {
            max-height: 300px;
            overflow-y: auto;
            margin-bottom: 15px;
        }

        .source-item {
            display: flex;
            align-items: center;
            gap: 15px;
            padding: 15px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            border: 2px solid transparent;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 10px;
        }

        .source-item:last-child {
            margin-bottom: 0;
        }

        .source-item:hover {
            background: rgba(29, 185, 84, 0.1);
            border-color: rgba(29, 185, 84, 0.3);
        }

        .source-item.selected {
            background: rgba(29, 185, 84, 0.2);
            border-color: #1db954;
            box-shadow: 0 0 20px rgba(29, 185, 84, 0.2);
        }

        .source-thumbnail {
            width: 60px;
            height: 45px;
            background: linear-gradient(45deg, #2a2a2a, #1a1a1a);
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .source-info {
            flex: 1;
        }

        .source-name {
            font-weight: 600;
            font-size: 14px;
            color: #ffffff;
            margin-bottom: 4px;
        }

        .source-details {
            font-size: 12px;
            color: #b3b3b3;
        }

        .source-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        }

        /* Recording Options */
        .recording-options, .zoom-mouse-options {
            margin-bottom: 30px;
        }

        /* Feature Toggle Switches */
        .feature-toggle {
            margin-bottom: 20px;
            padding: 15px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .toggle-label {
            display: flex;
            align-items: center;
            gap: 15px;
            cursor: pointer;
            margin-bottom: 8px;
        }

        .toggle-input {
            display: none;
        }

        .toggle-slider {
            position: relative;
            width: 50px;
            height: 26px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 26px;
            transition: all 0.3s ease;
            border: 2px solid rgba(255, 255, 255, 0.1);
        }

        .toggle-slider::before {
            content: '';
            position: absolute;
            width: 18px;
            height: 18px;
            background: #ffffff;
            border-radius: 50%;
            top: 2px;
            left: 2px;
            transition: all 0.3s ease;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }

        .toggle-input:checked + .toggle-slider {
            background: linear-gradient(45deg, #1db954, #1ed760);
            border-color: #1db954;
        }

        .toggle-input:checked + .toggle-slider::before {
            transform: translateX(24px);
        }

        .toggle-text {
            font-weight: 600;
            font-size: 16px;
            color: #ffffff;
        }

        .feature-description {
            font-size: 12px;
            color: #b3b3b3;
            margin: 0;
            margin-left: 65px;
        }

        /* Settings Sections */
        .zoom-settings, .mouse-settings {
            padding: 20px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            margin-top: 15px;
            transition: all 0.3s ease;
        }

        .zoom-settings.disabled, .mouse-settings.disabled {
            opacity: 0.5;
            pointer-events: none;
        }

        /* Custom Range Sliders */
        .range-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            color: #e0e0e0;
            font-weight: 500;
        }

        .range-value {
            color: #1db954;
            font-weight: 600;
            min-width: 60px;
            text-align: right;
        }

        .custom-range {
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 3px;
            outline: none;
            -webkit-appearance: none;
            margin: 8px 0;
        }

        .custom-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 18px;
            height: 18px;
            background: linear-gradient(45deg, #1db954, #1ed760);
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(29, 185, 84, 0.4);
            transition: all 0.2s ease;
        }

        .custom-range::-webkit-slider-thumb:hover {
            transform: scale(1.2);
            box-shadow: 0 3px 8px rgba(29, 185, 84, 0.6);
        }

        .custom-range::-moz-range-thumb {
            width: 18px;
            height: 18px;
            background: linear-gradient(45deg, #1db954, #1ed760);
            border-radius: 50%;
            cursor: pointer;
            border: none;
            box-shadow: 0 2px 6px rgba(29, 185, 84, 0.4);
        }

        /* Color Picker */
        .color-picker-container {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 8px;
        }

        .color-picker {
            width: 40px;
            height: 30px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            background: none;
            padding: 0;
        }

        .color-picker::-webkit-color-swatch {
            border: 2px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
        }

        .color-label {
            color: #b3b3b3;
            font-size: 14px;
        }

        /* Preview Panel Enhancement */
        .zoom-preview {
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            color: #1db954;
            font-weight: 600;
            display: none;
        }

        .zoom-preview.active {
            display: block;
        }

        .option-group {
            margin-bottom: 20px;
        }

        .option-group label {
            display: flex;
            align-items: center;
            gap: 12px;
            color: #e0e0e0;
            font-weight: 500;
            cursor: pointer;
            padding: 12px;
            border-radius: 8px;
            transition: all 0.2s ease;
        }

        .option-group label:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .option-group input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: #1db954;
            cursor: pointer;
        }

        .option-group select {
            background: rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 10px 15px;
            color: white;
            font-size: 14px;
            cursor: pointer;
            min-width: 120px;
        }

        .option-group select:focus {
            outline: none;
            border-color: #1db954;
            box-shadow: 0 0 0 2px rgba(29, 185, 84, 0.3);
        }

        /* Buttons */
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 25px;
            font-weight: 600;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            text-decoration: none;
            font-family: inherit;
        }

        .btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none !important;
        }

        .btn-primary {
            background: linear-gradient(45deg, #1db954, #1ed760);
            color: white;
            box-shadow: 0 4px 15px rgba(29, 185, 84, 0.3);
        }

        .btn-primary:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(29, 185, 84, 0.4);
        }

        .btn-secondary {
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .btn-secondary:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.2);
            transform: translateY(-1px);
        }

        .btn-warning {
            background: linear-gradient(45deg, #ff9500, #ffb84d);
            color: white;
            box-shadow: 0 4px 15px rgba(255, 149, 0, 0.3);
        }

        .btn-warning:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(255, 149, 0, 0.4);
        }

        .btn-danger {
            background: linear-gradient(45deg, #e22134, #ff4757);
            color: white;
            box-shadow: 0 4px 15px rgba(226, 33, 52, 0.3);
        }

        .btn-danger:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(226, 33, 52, 0.4);
        }

        /* Recording Controls */
        .recording-controls {
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }

        /* Preview Panel */
        .preview-panel {
            background: linear-gradient(135deg, rgba(40, 40, 40, 0.8) 0%, rgba(20, 20, 20, 0.9) 100%);
            border-radius: 16px;
            padding: 30px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(20px);
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .preview-panel h3 {
            color: #1db954;
            margin-bottom: 20px;
            font-size: 18px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .preview-panel h3::before {
            content: '';
            width: 4px;
            height: 20px;
            background: linear-gradient(45deg, #1db954, #1ed760);
            border-radius: 2px;
        }

        .preview-container {
            position: relative;
            background: #000;
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 30px;
            min-height: 250px;
            border: 2px solid rgba(29, 185, 84, 0.2);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
        }

        #preview-video {
            width: 100%;
            height: 100%;
            object-fit: contain;
            background: #000;
        }

        .preview-placeholder {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(45deg, #1a1a1a, #2a2a2a);
            color: #888;
            font-size: 16px;
        }

        /* Recordings Section */
        .recordings-section {
            flex: 1;
            overflow: hidden;
        }

        .recordings-list {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            min-height: 150px;
            overflow-y: auto;
            flex: 1;
        }

        .no-recordings {
            text-align: center;
            color: #888;
            font-style: italic;
            padding: 40px 20px;
        }

        .recording-item {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: all 0.3s ease;
            cursor: pointer;
        }

        .recording-item:hover {
            background: rgba(29, 185, 84, 0.1);
            border-color: rgba(29, 185, 84, 0.3);
            transform: translateX(5px);
        }

        .recording-item:last-child {
            margin-bottom: 0;
        }

        .recording-name {
            font-weight: 600;
            margin-bottom: 5px;
        }

        .recording-meta {
            font-size: 12px;
            color: #888;
            display: flex;
            justify-content: space-between;
        }

        /* Modal */
        .modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(10px);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .modal.show {
            display: flex;
        }

        .modal-content {
            background: linear-gradient(135deg, rgba(40, 40, 40, 0.95) 0%, rgba(20, 20, 20, 0.95) 100%);
            border-radius: 16px;
            padding: 40px;
            border: 1px solid rgba(29, 185, 84, 0.3);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            text-align: center;
            max-width: 500px;
            margin: 20px;
        }

        .modal-content h3 {
            color: #1db954;
            margin-bottom: 15px;
            font-size: 24px;
        }

        .modal-content p {
            color: #e0e0e0;
            margin-bottom: 30px;
            font-size: 16px;
        }

        .modal-actions {
            display: flex;
            gap: 15px;
            justify-content: center;
            flex-wrap: wrap;
        }

        /* Scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(29, 185, 84, 0.6);
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: rgba(29, 185, 84, 0.8);
        }

        /* Responsive */
        @media (max-width: 1024px) {
            .main-content {
                grid-template-columns: 1fr;
                gap: 20px;
            }
            
            .header-content {
                flex-direction: column;
                gap: 15px;
                text-align: center;
            }
            
            .recording-controls {
                justify-content: center;
            }
        }

        @media (max-width: 768px) {
            .controls-panel,
            .preview-panel {
                padding: 20px;
            }
            
            .main-content {
                padding: 20px;
            }
            
            .source-grid {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="app">
        <header class="header">
            <div class="header-content">
                <h1>Demo Recorder</h1>
                <div class="recording-status">
                    <span id="status-indicator" class="status-indicator"></span>
                    <span id="status-text">Ready</span>
                    <span id="recording-timer" class="timer">00:00</span>
                </div>
            </div>
        </header>

        <main class="main-content">
            <div class="controls-panel">
                <div class="source-selection">
                    <h3>📺 Select Recording Source</h3>
                    
                    <!-- Source Type Selection -->
                    <div class="source-types">
                        <button class="source-type-btn active" data-type="screen">
                            🖥️ Screen
                        </button>
                        <button class="source-type-btn" data-type="window">
                            🪟 Window
                        </button>
                        <button class="source-type-btn" data-type="tab">
                            🌐 Browser Tab
                        </button>
                    </div>

                    <!-- Dynamic Source List -->
                    <div class="source-list-container">
                        <div class="source-list" id="source-list">
                            <!-- Sources will be populated here based on selected type -->
                            <div class="source-item selected" data-source-id="screen-1">
                                <div class="source-thumbnail">🖥️</div>
                                <div class="source-info">
                                    <div class="source-name">Primary Display</div>
                                    <div class="source-details">1920x1080</div>
                                </div>
                            </div>
                        </div>
                        
                        <button id="refresh-sources" class="btn btn-secondary">
                            🔄 Refresh Sources
                        </button>
                    </div>
                </div>

                <div class="recording-options">
                    <h3>⚙️ Recording Options</h3>
                    <div class="option-group">
                        <label>
                            <input type="checkbox" id="include-audio" checked>
                            Include System Audio
                        </label>
                    </div>
                    <div class="option-group">
                        <label>
                            <input type="checkbox" id="include-microphone">
                            Include Microphone
                        </label>
                    </div>
                    <div class="option-group">
                        <label>
                            Quality:
                            <select id="quality-select">
                                <option value="high">High (1080p)</option>
                                <option value="medium" selected>Medium (720p)</option>
                                <option value="low">Low (480p)</option>
                            </select>
                        </label>
                    </div>
                    <div class="option-group">
                        <label>
                            Frame Rate:
                            <select id="framerate-select">
                                <option value="60">60 FPS</option>
                                <option value="30" selected>30 FPS</option>
                                <option value="24">24 FPS</option>
                                <option value="15">15 FPS</option>
                            </select>
                        </label>
                    </div>
                </div>

                <!-- New: Zoom & Mouse Tracking Section -->
                <div class="zoom-mouse-options">
                    <h3>🔍 Zoom & Mouse Tracking</h3>
                    
                    <div class="feature-toggle">
                        <label class="toggle-label">
                            <input type="checkbox" id="enable-zoom" class="toggle-input">
                            <span class="toggle-slider"></span>
                            <span class="toggle-text">Smart Zoom</span>
                        </label>
                        <p class="feature-description">Automatically zoom into areas of activity</p>
                    </div>

                    <div class="zoom-settings" id="zoom-settings">
                        <div class="option-group">
                            <label class="range-label">
                                Zoom Level:
                                <span class="range-value" id="zoom-level-value">1.5x</span>
                            </label>
                            <input type="range" id="zoom-level" min="1.2" max="3.0" step="0.1" value="1.5" class="custom-range">
                        </div>

                        <div class="option-group">
                            <label class="range-label">
                                Zoom Speed:
                                <span class="range-value" id="zoom-speed-value">Medium</span>
                            </label>
                            <input type="range" id="zoom-speed" min="1" max="5" step="1" value="3" class="custom-range">
                        </div>

                        <div class="option-group">
                            <label>
                                Zoom Trigger:
                                <select id="zoom-trigger">
                                    <option value="mouse">Mouse Movement</option>
                                    <option value="click" selected>Mouse Clicks</option>
                                    <option value="both">Both</option>
                                    <option value="keyboard">Keyboard Activity</option>
                                </select>
                            </label>
                        </div>

                        <div class="option-group">
                            <label class="range-label">
                                Sensitivity:
                                <span class="range-value" id="zoom-sensitivity-value">Medium</span>
                            </label>
                            <input type="range" id="zoom-sensitivity" min="1" max="10" step="1" value="5" class="custom-range">
                        </div>
                    </div>

                    <div class="feature-toggle">
                        <label class="toggle-label">
                            <input type="checkbox" id="enable-mouse-tracking" class="toggle-input" checked>
                            <span class="toggle-slider"></span>
                            <span class="toggle-text">Mouse Tracking</span>
                        </label>
                        <p class="feature-description">Enhanced cursor visibility and effects</p>
                    </div>

                    <div class="mouse-settings" id="mouse-settings">
                        <div class="option-group">
                            <label>
                                <input type="checkbox" id="mouse-highlight" checked>
                                Cursor Highlight
                            </label>
                        </div>

                        <div class="option-group">
                            <label>
                                <input type="checkbox" id="click-effects">
                                Click Effects
                            </label>
                        </div>

                        <div class="option-group">
                            <label class="range-label">
                                Highlight Size:
                                <span class="range-value" id="highlight-size-value">Medium</span>
                            </label>
                            <input type="range" id="highlight-size" min="1" max="5" step="1" value="3" class="custom-range">
                        </div>

                        <div class="option-group">
                            <label>
                                Highlight Color:
                                <div class="color-picker-container">
                                    <input type="color" id="highlight-color" value="#1db954" class="color-picker">
                                    <span class="color-label">Green</span>
                                </div>
                            </label>
                        </div>

                        <div class="option-group">
                            <label>
                                Click Animation:
                                <select id="click-animation">
                                    <option value="ripple" selected>Ripple Effect</option>
                                    <option value="pulse">Pulse</option>
                                    <option value="ring">Ring</option>
                                    <option value="none">None</option>
                                </select>
                            </label>
                        </div>
                    </div>
                </div>

                <div class="recording-controls">
                    <button id="start-recording" class="btn btn-primary" disabled>
                        ⏺️ Start Recording
                    </button>
                    <button id="pause-recording" class="btn btn-warning" disabled>
                        ⏸️ Pause
                    </button>
                    <button id="stop-recording" class="btn btn-danger" disabled>
                        ⏹️ Stop
                    </button>
                </div>
            </div>

            <div class="preview-panel">
                <h3>👁️ Preview</h3>
                <div class="preview-container">
                    <video id="preview-video" autoplay muted></video>
                    <div id="preview-placeholder" class="preview-placeholder">
                        <p>Select a source to see preview</p>
                    </div>
                    <div class="zoom-preview" id="zoom-preview">
                        Zoom: 1.5x | Mouse Tracking: ON
                    </div>
                </div>
                
                <div class="recordings-section">
                    <h3>📁 Recent Recordings</h3>
                    <div id="recordings-list" class="recordings-list">
                        <p class="no-recordings">No recordings yet</p>
                    </div>
                </div>
            </div>
        </main>

        <div id="save-modal" class="modal">
            <div class="modal-content">
                <h3>🎉 Recording Complete!</h3>
                <p>Your recording is ready. Choose what to do:</p>
                <div class="modal-actions">
                    <button id="save-file" class="btn btn-primary">💾 Save to File</button>
                    <button id="preview-recording" class="btn btn-secondary">👁️ Preview</button>
                    <button id="discard-recording" class="btn btn-danger">🗑️ Discard</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Mock data for different source types
        const mockSources = {
            screen: [
                { id: 'screen-1', name: 'Primary Display', details: '1920x1080', icon: '🖥️' },
                { id: 'screen-2', name: 'Secondary Display', details: '1366x768', icon: '🖥️' }
            ],
            window: [
                { id: 'window-1', name: 'Visual Studio Code', details: 'Code Editor', icon: '💻' },
                { id: 'window-2', name: 'Chrome Browser', details: 'Web Browser', icon: '🌐' },
                { id: 'window-3', name: 'Figma', details: 'Design Tool', icon: '🎨' },
                { id: 'window-4', name: 'Slack', details: 'Communication', icon: '💬' },
                { id: 'window-5', name: 'Terminal', details: 'Command Line', icon: '⚡' },
                { id: 'window-6', name: 'Spotify', details: 'Music Player', icon: '🎵' }
            ],
            tab: [
                { id: 'tab-1', name: 'GitHub - Repository', details: 'github.com/user/repo', icon: '📁' },
                { id: 'tab-2', name: 'Stack Overflow', details: 'stackoverflow.com', icon: '❓' },
                { id: 'tab-3', name: 'Documentation', details: 'docs.example.com', icon: '📚' },
                { id: 'tab-4', name: 'YouTube Tutorial', details: 'youtube.com', icon: '🎬' },
                { id: 'tab-5', name: 'Local Development', details: 'localhost:3000', icon: '🔧' }
            ]
        };

        document.addEventListener('DOMContentLoaded', function() {
            let selectedSourceId = 'screen-1';
            let currentSourceType = 'screen';
            
            // Elements
            const sourceTypeButtons = document.querySelectorAll('.source-type-btn');
            const sourceList = document.getElementById('source-list');
            const startButton = document.getElementById('start-recording');
            const refreshButton = document.getElementById('refresh-sources');
            
        document.addEventListener('DOMContentLoaded', function() {
            let selectedSourceId = 'screen-1';
            let currentSourceType = 'screen';
            
            // Configuration state
            const config = {
                zoom: {
                    enabled: false,
                    level: 1.5,
                    speed: 3,
                    trigger: 'click',
                    sensitivity: 5
                },
                mouse: {
                    enabled: true,
                    highlight: true,
                    clickEffects: false,
                    highlightSize: 3,
                    highlightColor: '#1db954',
                    clickAnimation: 'ripple'
                }
            };
            
            // Elements
            const sourceTypeButtons = document.querySelectorAll('.source-type-btn');
            const sourceList = document.getElementById('source-list');
            const startButton = document.getElementById('start-recording');
            const refreshButton = document.getElementById('refresh-sources');
            
            // Zoom & Mouse Tracking Elements
            const enableZoom = document.getElementById('enable-zoom');
            const zoomSettings = document.getElementById('zoom-settings');
            const zoomLevel = document.getElementById('zoom-level');
            const zoomSpeed = document.getElementById('zoom-speed');
            const zoomTrigger = document.getElementById('zoom-trigger');
            const zoomSensitivity = document.getElementById('zoom-sensitivity');
            
            const enableMouseTracking = document.getElementById('enable-mouse-tracking');
            const mouseSettings = document.getElementById('mouse-settings');
            const mouseHighlight = document.getElementById('mouse-highlight');
            const clickEffects = document.getElementById('click-effects');
            const highlightSize = document.getElementById('highlight-size');
            const highlightColor = document.getElementById('highlight-color');
            const clickAnimation = document.getElementById('click-animation');
            
            const zoomPreview = document.getElementById('zoom-preview');
            
            // Initialize
            renderSources(currentSourceType);
            initializeZoomMouseSettings();
            updatePreviewStatus();
            
            // Initialize zoom and mouse settings
            function initializeZoomMouseSettings() {
                // Set initial states
                zoomSettings.classList.add('disabled');
                
                // Zoom toggle
                enableZoom.addEventListener('change', function() {
                    config.zoom.enabled = this.checked;
                    zoomSettings.classList.toggle('disabled', !this.checked);
                    updatePreviewStatus();
                });
                
                // Mouse tracking toggle
                enableMouseTracking.addEventListener('change', function() {
                    config.mouse.enabled = this.checked;
                    mouseSettings.classList.toggle('disabled', !this.checked);
                    updatePreviewStatus();
                });
                
                // Zoom level slider
                zoomLevel.addEventListener('input', function() {
                    config.zoom.level = parseFloat(this.value);
                    document.getElementById('zoom-level-value').textContent = this.value + 'x';
                    updatePreviewStatus();
                });
                
                // Zoom speed slider
                zoomSpeed.addEventListener('input', function() {
                    config.zoom.speed = parseInt(this.value);
                    const speeds = ['Very Slow', 'Slow', 'Medium', 'Fast', 'Very Fast'];
                    document.getElementById('zoom-speed-value').textContent = speeds[this.value - 1];
                });
                
                // Zoom trigger
                zoomTrigger.addEventListener('change', function() {
                    config.zoom.trigger = this.value;
                });
                
                // Zoom sensitivity
                zoomSensitivity.addEventListener('input', function() {
                    config.zoom.sensitivity = parseInt(this.value);
                    const levels = ['Very Low', 'Low', 'Low-Med', 'Medium', 'Med-High', 'High', 'Higher', 'Very High', 'Maximum', 'Ultra'];
                    document.getElementById('zoom-sensitivity-value').textContent = levels[this.value - 1];
                });
                
                // Mouse settings
                mouseHighlight.addEventListener('change', function() {
                    config.mouse.highlight = this.checked;
                });
                
                clickEffects.addEventListener('change', function() {
                    config.mouse.clickEffects = this.checked;
                });
                
                highlightSize.addEventListener('input', function() {
                    config.mouse.highlightSize = parseInt(this.value);
                    const sizes = ['Small', 'Medium-Small', 'Medium', 'Medium-Large', 'Large'];
                    document.getElementById('highlight-size-value').textContent = sizes[this.value - 1];
                });
                
                highlightColor.addEventListener('change', function() {
                    config.mouse.highlightColor = this.value;
                    updateColorLabel(this.value);
                });
                
                clickAnimation.addEventListener('change', function() {
                    config.mouse.clickAnimation = this.value;
                });
            }
            
            function updateColorLabel(color) {
                const colorMap = {
                    '#1db954': 'Green',
                    '#ff0000': 'Red', 
                    '#0000ff': 'Blue',
                    '#ffff00': 'Yellow',
                    '#ff00ff': 'Magenta',
                    '#00ffff': 'Cyan',
                    '#ffffff': 'White'
                };
                document.querySelector('.color-label').textContent = colorMap[color] || 'Custom';
            }
            
            function updatePreviewStatus() {
                if (selectedSourceId) {
                    zoomPreview.classList.add('active');
                    const zoomText = config.zoom.enabled ? `Zoom: ${config.zoom.level}x` : 'Zoom: OFF';
                    const mouseText = config.mouse.enabled ? 'Mouse Tracking: ON' : 'Mouse Tracking: OFF';
                    zoomPreview.textContent = `${zoomText} | ${mouseText}`;
                } else {
                    zoomPreview.classList.remove('active');
                }
            }
            
            // Source type selection
            sourceTypeButtons.forEach(btn => {
                btn.addEventListener('click', function() {
                    currentSourceType = this.dataset.type;
                    
                    // Update active state
                    sourceTypeButtons.forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    
                    // Render sources for this type
                    renderSources(currentSourceType);
                });
            });
            
            // Render sources based on type
            function renderSources(type) {
                const sources = mockSources[type] || [];
                
                if (sources.length === 0) {
                    sourceList.innerHTML = '<div class="no-sources">No sources available</div>';
                    startButton.disabled = true;
                    updatePreviewStatus();
                    return;
                }
                
                sourceList.innerHTML = sources.map(source => `
                    <div class="source-item ${source.id === selectedSourceId ? 'selected' : ''}" 
                         data-source-id="${source.id}">
                        <div class="source-thumbnail">${source.icon}</div>
                        <div class="source-info">
                            <div class="source-name">${source.name}</div>
                            <div class="source-details">${source.details}</div>
                        </div>
                    </div>
                `).join('');
                
                // Add click handlers to new items
                const sourceItems = sourceList.querySelectorAll('.source-item');
                sourceItems.forEach(item => {
                    item.addEventListener('click', function() {
                        selectedSourceId = this.dataset.sourceId;
                        
                        // Update selection
                        sourceItems.forEach(s => s.classList.remove('selected'));
                        this.classList.add('selected');
                        
                        // Enable start button
                        startButton.disabled = false;
                        updatePreviewStatus();
                        
                        console.log('Selected source:', selectedSourceId);
                    });
                });
                
                // Auto-select first item if none selected
                if (sources.length > 0 && !sources.find(s => s.id === selectedSourceId)) {
                    selectedSourceId = sources[0].id;
                    sourceList.querySelector('.source-item').classList.add('selected');
                    startButton.disabled = false;
                    updatePreviewStatus();
                }
            }
            
            // Refresh sources
            refreshButton.addEventListener('click', function() {
                this.innerHTML = '🔄 Refreshing...';
                this.disabled = true;
                
                // Simulate API call
                setTimeout(() => {
                    renderSources(currentSourceType);
                    this.innerHTML = '🔄 Refresh Sources';
                    this.disabled = false;
                }, 1000);
            });
            
            // Mock recording functionality
            let isRecording = false;
            let isPaused = false;
            let recordingTime = 0;
            let timer;
            
            const statusIndicator = document.getElementById('status-indicator');
            const statusText = document.getElementById('status-text');
            const recordingTimer = document.getElementById('recording-timer');
            const pauseButton = document.getElementById('pause-recording');
            const stopButton = document.getElementById('stop-recording');
            
            function updateTimer() {
                const minutes = Math.floor(recordingTime / 60);
                const seconds = recordingTime % 60;
                recordingTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
            
            startButton.addEventListener('click', function() {
                if (!isRecording && selectedSourceId) {
                    isRecording = true;
                    statusIndicator.classList.add('recording');
                    statusText.textContent = 'Recording';
                    startButton.disabled = true;
                    pauseButton.disabled = false;
                    stopButton.disabled = false;
                    
                    // Show recording configuration
                    const selectedSource = mockSources[currentSourceType].find(s => s.id === selectedSourceId);
                    console.log('Recording Configuration:', {
                        source: `${selectedSource.name} (${currentSourceType})`,
                        zoom: config.zoom,
                        mouse: config.mouse
                    });
                    
                    timer = setInterval(() => {
                        if (!isPaused) {
                            recordingTime++;
                            updateTimer();
                        }
                    }, 1000);
                }
            });
            
            pauseButton.addEventListener('click', function() {
                isPaused = !isPaused;
                if (isPaused) {
                    statusText.textContent = 'Paused';
                    pauseButton.innerHTML = '▶️ Resume';
                } else {
                    statusText.textContent = 'Recording';
                    pauseButton.innerHTML = '⏸️ Pause';
                }
            });
            
            stopButton.addEventListener('click', function() {
                isRecording = false;
                isPaused = false;
                clearInterval(timer);
                statusIndicator.classList.remove('recording');
                statusText.textContent = 'Ready';
                startButton.disabled = false;
                pauseButton.disabled = true;
                stopButton.disabled = true;
                pauseButton.innerHTML = '⏸️ Pause';
                
                // Show save modal
                document.getElementById('save-modal').classList.add('show');
            });
            
            // Modal actions
            document.getElementById('save-file').addEventListener('click', function() {
                document.getElementById('save-modal').classList.remove('show');
                recordingTime = 0;
                updateTimer();
                alert('Recording saved with zoom and mouse tracking settings!');
            });
            
            document.getElementById('discard-recording').addEventListener('click', function() {
                document.getElementById('save-modal').classList.remove('show');
                recordingTime = 0;
                updateTimer();
            });
            
            document.getElementById('preview-recording').addEventListener('click', function() {
                document.getElementById('save-modal').classList.remove('show');
                alert('Opening preview with effects...');
                recordingTime = 0;
                updateTimer();
            });
        });
                }
            });
            
            pauseButton.addEventListener('click', function() {
                isPaused = !isPaused;
                if (isPaused) {
                    statusText.textContent = 'Paused';
                    pauseButton.innerHTML = '▶️ Resume';
                } else {
                    statusText.textContent = 'Recording';
                    pauseButton.innerHTML = '⏸️ Pause';
                }
            });
            
            stopButton.addEventListener('click', function() {
                isRecording = false;
                isPaused = false;
                clearInterval(timer);
                statusIndicator.classList.remove('recording');
                statusText.textContent = 'Ready';
                startButton.disabled = false;
                pauseButton.disabled = true;
                stopButton.disabled = true;
                pauseButton.innerHTML = '⏸️ Pause';
                
                // Show save modal
                document.getElementById('save-modal').classList.add('show');
            });
            
            // Modal actions
            document.getElementById('save-file').addEventListener('click', function() {
                document.getElementById('save-modal').classList.remove('show');
                recordingTime = 0;
                updateTimer();
                alert('Recording saved!');
            });
            
            document.getElementById('discard-recording').addEventListener('click', function() {
                document.getElementById('save-modal').classList.remove('show');
                recordingTime = 0;
                updateTimer();
            });
            
            document.getElementById('preview-recording').addEventListener('click', function() {
                document.getElementById('save-modal').classList.remove('show');
                alert('Opening preview...');
                recordingTime = 0;
                updateTimer();
            });
        });
    </script>
</body>
</html>