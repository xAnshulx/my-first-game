import * as THREE from 'three';

// ─── TUNING CONSTANTS ────────────────────────────────────────────────────────
// These are the knobs you turn to change how the game feels.
// Spend time tweaking these values — this is where "game feel" lives.

const MOVE_SPEED        = 12;    // Max horizontal speed in units/second
const ACCELERATION      = 80;    // How quickly we reach max speed (higher = snappier)
const FRICTION          = 14;    // How quickly we stop when no key is held (higher = snappier)
const JUMP_FORCE        = 9;     // Upward velocity applied when jumping
const GRAVITY           = 25;    // Downward acceleration in units/second²
const FALL_GRAVITY_MULT = 2.2;   // Extra gravity multiplier when falling (makes arcs feel tight)
const PLAYER_HEIGHT     = 1.8;   // Capsule height — used to calculate foot position for ground check

const MOUSE_SENSITIVITY = 0.0018; // Radians per pixel of mouse movement
const CAM_PITCH_MIN     = -0.5;  // How far down you can look (radians)
const CAM_PITCH_MAX     = 0.8;   // How far up you can look (radians)

// Camera offset from player: right shoulder, slightly above and behind
const CAM_OFFSET = new THREE.Vector3(0.6, 1.4, -3.5);
// ─────────────────────────────────────────────────────────────────────────────

export class PlayerController {
  constructor(scene) {
    // ── Build the player mesh ──────────────────────────────────────────────
    // We use a CapsuleGeometry because it matches the collision shape we'll
    // use later. A capsule won't snag on step edges the way a box would.
    const bodyGeo = new THREE.CapsuleGeometry(0.4, PLAYER_HEIGHT - 0.8, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4488ff });
    this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
    this.mesh.castShadow = true;

    // Start the player above the ground so they fall into position on load
    this.mesh.position.set(0, 2, 0);
    scene.add(this.mesh);

    // ── Physics state ─────────────────────────────────────────────────────
    // velocity is our core physics variable. Every frame we modify this,
    // then apply it to position. We never move position directly.
    this.velocity = new THREE.Vector3();
    this.isGrounded = false;

    // ── Camera rig ────────────────────────────────────────────────────────
    // We use a two-object rig: a pivot (yaw/horizontal rotation) that is a
    // child of the player mesh, and the camera itself offset within it.
    // This way the camera always stays behind the player automatically.

    // yaw = left/right rotation (rotates the whole player + camera together)
    this.yawObject = new THREE.Object3D();
    this.mesh.add(this.yawObject); // attach to player so it moves with them

    // pitch = up/down rotation (only the camera tilts, not the player body)
    this.pitchObject = new THREE.Object3D();
    this.yawObject.add(this.pitchObject);

    // The actual camera is offset to sit over the right shoulder
    this.camera = new THREE.PerspectiveCamera(
      75,                                          // FOV in degrees
      window.innerWidth / window.innerHeight,      // aspect ratio
      0.1,                                         // near clip plane
      1000                                         // far clip plane
    );
    this.camera.position.copy(CAM_OFFSET);
    this.pitchObject.add(this.camera);

    // Handle window resize so the aspect ratio stays correct
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });

    // Temp vectors we reuse each frame to avoid garbage collection pressure.
    // In a game loop that runs 60+ times/second, creating new Vector3s causes
    // frequent GC pauses. Reusing objects prevents this.
    this._moveDir   = new THREE.Vector3();
    this._forward   = new THREE.Vector3();
    this._right     = new THREE.Vector3();
    this._groundRay = new THREE.Raycaster();
  }

  /**
   * Called every frame by the game loop.
   * @param {object} input  - The InputHandler instance
   * @param {number} delta  - Time in seconds since the last frame (for framerate-independent movement)
   * @param {Array}  collidables - Meshes to check for ground collision
   */
  update(input, delta, collidables) {
    this._handleCamera(input);
    this._handleMovement(input, delta, collidables);
  }

  _handleCamera(input) {
    const { dx, dy } = input.consumeMouseDelta();

    // Yaw rotates the player body left/right around the Y axis.
    // We subtract dx because moving the mouse right should rotate clockwise
    // when viewed from above, which is a negative Y rotation in Three.js.
    this.yawObject.rotation.y -= dx * MOUSE_SENSITIVITY;

    // Pitch tilts the camera up/down. We clamp it to prevent flipping upside-down.
    this.pitchObject.rotation.x -= dy * MOUSE_SENSITIVITY;
    this.pitchObject.rotation.x = THREE.MathUtils.clamp(
      this.pitchObject.rotation.x,
      CAM_PITCH_MIN,
      CAM_PITCH_MAX
    );
  }

  _handleMovement(input, delta, collidables) {
    // ── 1. Determine which direction the player wants to move ──────────────
    // "forward" in 3D space is relative to where the player is facing.
    // We extract the yaw object's facing direction by transforming the
    // world -Z axis by the yaw rotation. We zero out Y so moving forward
    // doesn't make you fly or sink into the floor.
    this.yawObject.getWorldDirection(this._forward);
    this._forward.y = 0;
    this._forward.normalize();

    // Right is simply forward rotated 90 degrees around Y
    this._right.crossVectors(this._forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Build a desired movement direction from WASD input
    this._moveDir.set(0, 0, 0);
    if (input.isPressed('KeyW')) this._moveDir.add(this._forward);
    if (input.isPressed('KeyS')) this._moveDir.sub(this._forward);
    if (input.isPressed('KeyD')) this._moveDir.add(this._right);
    if (input.isPressed('KeyA')) this._moveDir.sub(this._right);

    // Normalize so diagonal movement isn't faster than cardinal movement
    if (this._moveDir.lengthSq() > 0) this._moveDir.normalize();

    // ── 2. Apply acceleration or friction ─────────────────────────────────
    if (this._moveDir.lengthSq() > 0) {
      // Player is pressing a key: accelerate toward desired direction.
      // We use delta (frame time) to keep physics framerate-independent.
      this.velocity.x += this._moveDir.x * ACCELERATION * delta;
      this.velocity.z += this._moveDir.z * ACCELERATION * delta;

      // Clamp horizontal speed to max. We do this on X/Z only, not Y,
      // so vertical velocity (gravity/jumping) is unaffected.
      const horizSpeed = Math.sqrt(
        this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z
      );
      if (horizSpeed > MOVE_SPEED) {
        const scale = MOVE_SPEED / horizSpeed;
        this.velocity.x *= scale;
        this.velocity.z *= scale;
      }
    } else {
      // No key pressed: apply friction to bleed off horizontal velocity.
      // Multiplying by (1 - friction * delta) is exponential decay —
      // it naturally slows to near-zero without ever snapping to exactly zero.
      const frictionFactor = 1 - Math.min(FRICTION * delta, 1);
      this.velocity.x *= frictionFactor;
      this.velocity.z *= frictionFactor;
    }

    // ── 3. Gravity & Jumping ───────────────────────────────────────────────
    const isFalling = this.velocity.y < 0;

    // Apply extra gravity when falling for a tighter, more responsive arc
    const gravScale = isFalling ? FALL_GRAVITY_MULT : 1;
    this.velocity.y -= GRAVITY * gravScale * delta;

    // Jump only if grounded (prevents double-jumping for now)
    if (input.isPressed('Space') && this.isGrounded) {
      this.velocity.y = JUMP_FORCE;
      this.isGrounded = false;
    }

    // ── 4. Move the player mesh ────────────────────────────────────────────
    this.mesh.position.x += this.velocity.x * delta;
    this.mesh.position.y += this.velocity.y * delta;
    this.mesh.position.z += this.velocity.z * delta;

    // ── 5. Ground collision check via downward raycast ─────────────────────
    // We cast a ray straight down from the player's center.
    // The ray starts at center (half-height up from feet) and checks if
    // anything is within PLAYER_HEIGHT/2 + a small buffer below us.
    const origin = this.mesh.position.clone();
    origin.y += PLAYER_HEIGHT / 2; // start from center of capsule

    this._groundRay.set(origin, new THREE.Vector3(0, -1, 0));
    const hits = this._groundRay.intersectObjects(collidables, true);

    const groundCheckDist = PLAYER_HEIGHT / 2 + 0.15; // half-height + small buffer

    if (hits.length > 0 && hits[0].distance <= groundCheckDist) {
      // Snap the player to sit exactly on the surface
      this.mesh.position.y = hits[0].point.y + PLAYER_HEIGHT / 2;
      this.velocity.y = Math.max(0, this.velocity.y); // cancel downward velocity
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }
  }
}
