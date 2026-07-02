import * as THREE from "three";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

/* ------------------------------------------------------------------ *
 * Crypto Globe
 * A slowly-spinning 3D globe whose LAND MASSES are built from crypto
 * tokens (BTC, ETH, SOL, USDC, USDT) packed edge-to-edge. Tokens are
 * placed only where there is land, on an evenly-spaced grid, so the
 * coins fill in the shapes of the continents / countries.
 *
 * The oceans are left empty (white). Each token glitters gently: it
 * darkens as it rotates toward the viewer and fades toward the limb,
 * with a subtle per-token twinkle so the surface shimmers.
 * ------------------------------------------------------------------ */

const CONFIG = {
  globeRadius: 2,
  gridSpacingDeg: 2.4,   // spacing between tokens (smaller = denser land)
  overlap: 1.02,         // token size vs. grid spacing (1 = edge-to-edge)
  spinSpeed: 0.06,       // radians / second
  tilt: 0.41,            // axial tilt (~23.5°)
  tokenColor: 0x272d3a,  // tint applied to the (light) coin art -> dark coins
  twinkleSpeed: 1.6,     // shimmer cycle speed
  twinkleAmount: 0.18,   // how much the shimmer dims a token (0 = off)
};

const TOKENS = [
  "tokens/btc.png",
  "tokens/eth.png",
  "tokens/sol.png",
  "tokens/usdc.png",
  "tokens/usdt.png",
];

// Low-res world land outline (single multipolygon), fetched from a CDN.
const LAND_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json";

const canvas = document.getElementById("globe");
const loadingEl = document.getElementById("loading");

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true, // let the white page show through the oceans
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 6.2);

// Everything spins together inside this tilted group.
const globe = new THREE.Group();
globe.rotation.z = CONFIG.tilt;
scene.add(globe);

// A white sphere just under the tokens. Its only job is to occlude the
// tokens on the far side, so the globe reads as solid. White = invisible
// against the white page, so the oceans look empty.
const core = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.globeRadius * 0.99, 64, 64),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
globe.add(core);

const clock = new THREE.Clock();
const tokenData = []; // { material, dir, phase, twinkleRate }

/* --- lat/lon -> position on the sphere ---------------------------- */
const DEG = Math.PI / 180;
function latLonToVec3(lat, lon, radius) {
  const phi = (90 - lat) * DEG;   // polar angle from +Y
  const theta = (lon + 180) * DEG; // azimuth
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/* --- build an evenly-spaced grid of land points ------------------- *
 * Step latitude uniformly; widen the longitude step by 1/cos(lat) so
 * points stay ~equally spaced on the sphere (no bunching at the poles).
 * Keep only points that fall on land.                                */
function landPoints(landFeature) {
  const pts = [];
  const dLat = CONFIG.gridSpacingDeg;
  for (let lat = -84; lat <= 84; lat += dLat) {
    const cos = Math.cos(lat * DEG);
    const dLon = dLat / Math.max(cos, 0.12);
    for (let lon = -180; lon < 180; lon += dLon) {
      if (geoContains(landFeature, [lon, lat])) pts.push([lat, lon]);
    }
  }
  return pts;
}

Promise.all([
  Promise.all(TOKENS.map(loadTexture)),
  fetch(LAND_URL).then((r) => r.json()),
])
  .then(([textures, topo]) => {
    const land = feature(topo, topo.objects.land);
    buildTokens(textures, land);
  })
  .catch((err) => {
    console.error("Failed to build globe", err);
    loadingEl.textContent = "Failed to load";
  });

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        resolve(tex);
      },
      undefined,
      reject
    );
  });
}

function buildTokens(textures, land) {
  const pts = landPoints(land);

  // Uniform token size: match the grid spacing (in world units) so the
  // coins sit edge-to-edge and fill each land area.
  const arc = CONFIG.globeRadius * CONFIG.gridSpacingDeg * DEG;
  const tokenScale = arc * CONFIG.overlap;
  const tint = new THREE.Color(CONFIG.tokenColor);

  for (const [lat, lon] of pts) {
    const pos = latLonToVec3(lat, lon, CONFIG.globeRadius * 1.005);
    const tex = textures[(Math.random() * textures.length) | 0];

    const material = new THREE.SpriteMaterial({
      map: tex,
      color: tint,
      transparent: true,
      depthTest: true,   // far-side tokens are occluded by the core sphere
      depthWrite: false,
      opacity: 0,
    });

    const sprite = new THREE.Sprite(material);
    sprite.position.copy(pos);
    sprite.scale.setScalar(tokenScale);
    globe.add(sprite);

    tokenData.push({
      material,
      dir: pos.clone().normalize(),
      phase: Math.random() * Math.PI * 2,
      twinkleRate: 0.6 + Math.random() * 0.9,
    });
  }

  console.log(`Placed ${pts.length} tokens on land`);
  loadingEl.classList.add("hidden");
  animate();
}

const SPIN_AXIS = new THREE.Vector3(0, 1, 0);
const worldDir = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const t = clock.elapsedTime;

  globe.rotateOnAxis(SPIN_AXIS, CONFIG.spinSpeed * delta);

  for (const tok of tokenData) {
    worldDir.copy(tok.dir).applyQuaternion(globe.quaternion);

    // Facing the camera (+z) => full strength; toward the limb => fade.
    const facing = THREE.MathUtils.smoothstep(worldDir.z, -0.05, 0.55);

    // Gentle per-token twinkle so the land shimmers without flickering.
    const twinkle =
      1 - CONFIG.twinkleAmount *
        (0.5 + 0.5 * Math.sin(t * CONFIG.twinkleSpeed * tok.twinkleRate + tok.phase));

    tok.material.opacity = facing * twinkle;
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
