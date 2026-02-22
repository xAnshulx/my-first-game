export class InputHandler {
  constructor() {
    // We track which keys are currently held down.
    // Using a Set is faster than checking individual booleans for many keys.
    this.keys = new Set();

    // Mouse delta is how much the mouse moved since last frame.
    // We accumulate movement here and reset it after each frame is read.
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;

    // Pointer Lock API is essential for a shooter — it hides the cursor and
    // lets the mouse move freely without hitting the screen edge.
    this._initPointerLock();
    this._initKeyboard();
  }

  _initPointerLock() {
    // When the player clicks anywhere in the game, request pointer lock.
    // This gives us raw mouse movement data via 'mousemove' events.
    document.addEventListener('click', () => {
      document.body.requestPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
      // Only track mouse movement when pointer is locked (i.e., game is focused)
      if (document.pointerLockElement === document.body) {
        // movementX/Y give us raw pixel deltas — exactly what we need for camera rotation
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });
  }

  _initKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Store lowercase key names for consistent lookup
      this.keys.add(e.code);
      // Prevent Space from scrolling the page
      if (e.code === 'Space') e.preventDefault();
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  // Call this at the END of each frame to reset accumulated mouse deltas.
  // If you forget this, the camera will spin forever.
  consumeMouseDelta() {
    const dx = this.mouseDeltaX;
    const dy = this.mouseDeltaY;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return { dx, dy };
  }

  isPressed(code) {
    return this.keys.has(code);
  }
}
