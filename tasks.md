# Smart UI Element Detection & Zoom Tasks

Based on the current codebase and the UI element detection requirements, here are focused tasks:

## Phase 1: Cursor State Detection (3 tasks)

### Task 1.1: Add Cursor State Tracking
**Context**: Need to detect cursor changes (text/pointer) to identify UI element types.
- [x] Add `getCursorInfo()` IPC handler in `src/main/ipcHandlers.js` using Electron APIs
- [x] Implement cursor type detection (text, pointer, default) from system
- [x] Add cursor position and type polling in MouseTracker
- [x] Store cursor state history for pattern analysis
- [x] Test cursor state detection across different applications

### Task 1.2: Implement Form Field Detection
**Context**: Detect text input fields when cursor changes to text/I-beam.
- [x] Add `FormFieldDetector` class in `src/renderer/modules/uiDetection.js`
- [x] Implement text cursor detection with 95% confidence scoring
- [x] Add click-to-typing pattern detection (2-second window)
- [x] Track text field positions and create heat map
- [x] Test form field detection accuracy

### Task 1.3: Add Button/Clickable Detection
**Context**: Detect buttons and clickable elements via pointer cursor and hover behavior.
- [x] Add `ButtonDetector` class with pointer cursor detection
- [x] Implement mouse deceleration and hover timing analysis
- [x] Add button size estimation from hover area
- [x] Create clickable element confidence scoring
- [x] Test button detection across different UI frameworks

## Phase 2: Enhanced Zoom Logic (4 tasks)

### Task 2.1: Implement Multi-Level Zoom System
**Context**: Current zoom is binary on/off. Need multiple zoom levels for different UI elements.
- [x] Update StreamProcessor with zoom level presets (1.5x, 1.8x, 2.2x, 2.5x)
- [x] Add zoom level selection based on UI element type
- [x] Implement smooth transitions between different zoom levels
- [x] Add zoom level override for element size (small buttons = higher zoom)
- [x] Test multi-level zoom transitions

### Task 2.2: Add Context-Aware Zoom Timing
**Context**: Different UI elements need different zoom durations and timing.
- [ ] Implement element-specific zoom durations in StreamProcessor
- [ ] Add zoom persistence rules (form fields stay zoomed, buttons timeout)
- [ ] Create zoom exit condition detection
- [ ] Add 300ms minimum between zoom changes
- [ ] Test timing behavior for each element type

### Task 2.3: Implement Smart Zoom Centering
**Context**: Zoom should center on UI element, not just mouse position.
- [ ] Add UI element bounds estimation in detection modules
- [ ] Update zoom center calculation to use element center vs mouse position
- [ ] Implement predictive centering for moving elements
- [ ] Add zoom center smoothing for stability
- [ ] Test centering accuracy for different element sizes

### Task 2.4: Add Zoom Conflict Resolution
**Context**: Handle overlapping UI elements and zoom priority.
- [ ] Create zoom priority system (text input > dropdown > button > default)
- [ ] Implement smooth transitions between conflicting zoom requests
- [ ] Add emergency zoom-out for rapid mouse movement (>500px/sec)
- [ ] Create user override mechanism (manual zoom disables auto for 5 seconds)
- [ ] Test conflict resolution scenarios

## Phase 3: Dropdown/Menu Detection (3 tasks)

### Task 3.1: Implement Menu Appearance Detection
**Context**: Detect when dropdowns/menus appear after button clicks.
- [ ] Add `MenuDetector` class with UI change detection
- [ ] Implement before/after screen comparison for new elements
- [ ] Add vertical list pattern recognition
- [ ] Create overlay-style element detection
- [ ] Test menu detection accuracy

### Task 3.2: Add Multi-Phase Menu Zoom
**Context**: Menus need different zoom behavior: zoom out → show context → zoom in on selection.
- [ ] Implement 3-phase menu zoom sequence in StreamProcessor
- [ ] Add menu navigation tracking and zoom following
- [ ] Create hover-based menu item highlighting
- [ ] Add selection confirmation zoom (2.0x briefly)
- [ ] Test complete menu interaction workflow

### Task 3.3: Implement Menu Exit Detection
**Context**: Detect when menus close or are abandoned.
- [ ] Add menu element disappearance detection
- [ ] Implement outside-click detection for menu dismissal
- [ ] Add menu abandonment detection (mouse leaves for >2 seconds)
- [ ] Create ESC key detection for menu closure
- [ ] Test all menu exit scenarios

## Phase 4: Integration & Polish (2 tasks)

### Task 4.1: Integrate UI Detection with Existing System
**Context**: Connect new UI detection with current zoom/mouse tracking.
- [ ] Update MouseTracker to use UI detection results
- [ ] Modify StreamProcessor to accept UI element type for zoom decisions
- [ ] Add UI detection results to preview effects
- [ ] Integrate detection confidence scores with zoom triggers
- [ ] Test end-to-end UI-aware zoom behavior

### Task 4.2: Add Performance & Safety Mechanisms
**Context**: Ensure UI detection doesn't impact recording performance.
- [ ] Optimize UI detection to run at 10fps max (not 60fps)
- [ ] Add detection result caching to reduce CPU usage
- [ ] Implement detection failure fallbacks to current behavior
- [ ] Add performance monitoring and automatic degradation
- [ ] Test performance impact during recording

---

**Total Tasks: 12 focused tasks**
**Focus**: Transform current basic zoom into intelligent UI-aware zoom system
**Key Outcome**: Zoom behavior that understands what user is interacting with