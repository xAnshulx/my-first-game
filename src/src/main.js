import * as THREE from 'three';
import { PlayerController } from './PlayerController.js';
import { InputHandler } from './InputHandler.js';

// ── Scene Setup ──────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky blue
scene.fog = new THREE.Fog(0x87ceeb, 20, 80);  // adds depth, also hides pop-in

// Renderer — we attach it directly to the body
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap at 2x for perf
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game-container').appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Crosshair HTML overlay ───────────────────────────────────────────────────
const crosshair = document.createElement('div');
crosshair.id = 'crosshair';
document.body.appendChild(crosshair);

// ── Lighting ─────────────────────────────────────────────────────────────────
// Ambient light so nothing is pitch black
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);

// Directional light acts as the sun and casts shadows
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); // shadow resolution
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 100;
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
scene.add(sun);

// ── Ground Plane ─────────────────────────────────────────────────────────────
const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x4a7c4e });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2; // rotate flat
ground.receiveShadow = true;
scene.add(ground);

// ── Some platforms to jump on (gives us something to test movement against) ──
const collidables = [ground]; // everything in this array will be checked for ground collision

function addPlatform(x, y, z, w, h, d, color = 0x888888) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  collidables.push(mesh);
  return mesh;
}

addPlatform(5,  1, -5,  4, 0.5, 4, 0x886644); // low platform
addPlatform(-6, 2, -8,  3, 0.5, 3, 0x886644); // medium platform
addPlatform(0,  3, -14, 5, 0.5, 5, 0x886644); // far platform

// ── Player & Input ────────────────────────────────────────────────────────────
const input = new InputHandler();
const player = new PlayerController(scene);

// ── Game Loop ─────────────────────────────────────────────────────────────────
// Three.js's clock gives us accurate delta time (time between frames).
// Delta time is critical — it makes movement speed consistent regardless
// of whether the game runs at 30fps or 144fps.
const clock = new THREE.Clock();

function gameLoop() {
  requestAnimationFrame(gameLoop);

  // Cap delta at 0.1s (100ms) to prevent huge physics jumps if the tab
  // loses focus and then regains it (otherwise delta could be several seconds)
  const delta = Math.min(clock.getDelta(), 0.1);

  player.update(input, delta, collidables);

  // Render the scene from the player's camera
  renderer.render(scene, player.camera);
}

gameLoop();
