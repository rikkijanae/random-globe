import * as THREE from "three";

/* ------------------------------------------------------------------ *
 * Crypto Globe
 * A slowly-spinning 3D globe whose surface is built from thousands of
 * randomly scattered crypto tokens (BTC, ETH, SOL, USDC, USDT).
 * Each token glitters: it brightens as it rotates toward the viewer and
 * dims as it turns away, with an additional per-token twinkle so the
 * whole surface shimmers.
 * ------------------------------------------------------------------ */

const CONFIG = {
  globeRadius: 2,
  tokenCount: 900,     // total tokens scattered across the sphere
  spinSpeed: 0.06,     // radians / second around the tilted axis
  tilt: 0.41,          // axial tilt (radians) — ~23.5°, like Earth
  minScale: 0.085,     // smallest token sprite
  maxScale: 0.20,      // largest token sprite
  twinkleSpeed: 1.6,   // how fast the shimmer cycles
};

const TOKENS = [
  "tokens/btc.png",
  "tokens/eth.png",
  "tokens/sol.png",
  "tokens/usdc.png",
  "tokens/usdt.png",
];

const canvas = document.getElementById("globe");
const loadingEl = document.getElementById("loading");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 6.2);

// The whole globe (dark sphere + tokens) lives in this group so we can
// spin it as one object around a tilted axis.
const globe = new THREE.Group();
globe.rotation.z = CONFIG.tilt;
scene.add(globe);

// A near-black sphere. It is essentially the "planet" — its job is to
// occlude the tokens on the far side so the globe reads as solid.
const core = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.globeRadius * 0.985, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0x070b16 })
);
globe.add(core);

// Soft atmospheric halo behind the globe.
const halo = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.globeRadius * 1.35, 48, 48),
  new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0x2a4a8f) } },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vNormal;
      uniform vec3 uColor;
      void main() {
        float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
        gl_FragColor = vec4(uColor, 1.0) * intensity;
      }`,
  })
);
scene.add(halo);

/* --- Evenly-but-randomly scatter points on the sphere ------------- *
 * A Fibonacci sphere gives even coverage; a small random jitter per
 * point keeps it from looking like a regular grid.                   */
function fibonacciSphere(count, radius) {
  const points = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2; // 1 -> -1
    const r = Math.sqrt(1 - y * y);
    const theta = golden * i + (Math.random() - 0.5) * 0.35;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const dir = new THREE.Vector3(x, y, z).normalize();
    points.push(dir.multiplyScalar(radius));
  }
  return points;
}

const clock = new THREE.Clock();
const tokenData = []; // { sprite, dir, baseOpacity, scale, phase }

const loader = new THREE.TextureLoader();
Promise.all(
  TOKENS.map(
    (url) =>
      new Promise((resolve, reject) => {
        loader.load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            resolve(tex);
          },
          undefined,
          reject
        );
      })
  )
)
  .then(buildTokens)
  .catch((err) => {
    console.error("Failed to load token textures", err);
    loadingEl.textContent = "Failed to load tokens";
  });

function buildTokens(textures) {
  const positions = fibonacciSphere(
    CONFIG.tokenCount,
    CONFIG.globeRadius * 1.01
  );

  for (const pos of positions) {
    const tex = textures[(Math.random() * textures.length) | 0];
    const material = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: true,   // let the core sphere occlude far-side tokens
      depthWrite: false, // but don't let tokens clip each other harshly
      opacity: 0,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos);

    const scale =
      CONFIG.minScale +
      Math.random() * (CONFIG.maxScale - CONFIG.minScale);
    sprite.scale.setScalar(scale);

    globe.add(sprite);
    tokenData.push({
      sprite,
      material,
      dir: pos.clone().normalize(),
      baseScale: scale,
      phase: Math.random() * Math.PI * 2,
      twinkleRate: 0.6 + Math.random() * 0.9,
    });
  }

  loadingEl.classList.add("hidden");
  animate();
}

// Reusable temp vector (avoid per-frame allocations).
const worldDir = new THREE.Vector3();

const SPIN_AXIS = new THREE.Vector3(0, 1, 0);

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const t = clock.elapsedTime; // updated by getDelta() above

  // Spin around the tilted axis.
  globe.rotateOnAxis(SPIN_AXIS, CONFIG.spinSpeed * delta);

  for (const tok of tokenData) {
    // Current outward normal of this token in world space.
    worldDir.copy(tok.dir).applyQuaternion(globe.quaternion);

    // Facing the camera (+z) => bright; facing away => transparent.
    const facing = THREE.MathUtils.smoothstep(worldDir.z, -0.15, 0.75);

    // Per-token twinkle so the lit hemisphere shimmers.
    const twinkle =
      0.72 + 0.28 * Math.sin(t * CONFIG.twinkleSpeed * tok.twinkleRate + tok.phase);

    tok.material.opacity = facing * twinkle;

    // A touch of scale-pulse adds to the "glitter" sparkle.
    const s = tok.baseScale * (0.92 + 0.08 * twinkle);
    tok.sprite.scale.setScalar(s);
  }

  renderer.render(scene, camera);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
