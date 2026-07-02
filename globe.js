import * as THREE from "three";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

/* ------------------------------------------------------------------ *
 * Crypto Globe
 * A white globe whose LAND MASSES are built from crypto tokens
 * (BTC, ETH, SOL, USDC, USDT). Tokens are placed only on land, on an
 * evenly-spaced grid, and each coin is laid flat ON the sphere surface
 * (tangent to it) so they follow the globe's curvature and fold away at
 * the edges instead of sticking out as flat cards.
 *
 * Coins are crisp vector SVGs, rasterized in the browser. Each glitters
 * gently with a per-token twinkle as the globe slowly spins.
 * ------------------------------------------------------------------ */

const CONFIG = {
  globeRadius: 2,
  gridSpacingDeg: 2.4,   // spacing between tokens (smaller = denser land)
  overlap: 1.15,         // token size vs. grid spacing (1 = edge-to-edge)
  spinSpeed: 0.06,       // radians / second
  tilt: 0.41,            // axial tilt (~23.5°)
  tokenColor: "#1b2130", // coin color (SVGs are recolored to this)
  twinkleSpeed: 1.6,     // shimmer cycle speed
  twinkleAmount: 0.22,   // how much the shimmer dims a token (0 = off)
};

const TOKENS = [
  "tokens/btc.svg",
  "tokens/eth.svg",
  "tokens/sol.svg",
  "tokens/usdc.svg",
  "tokens/usdt.svg",
];

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

// A pure-white globe body: invisible against the white page, so only the
// coin "continents" show. It still occludes the tokens on the far side,
// so we only ever see the near hemisphere.
const core = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.globeRadius * 0.99, 96, 96),
  new THREE.MeshBasicMaterial({ color: 0xffffff })
);
globe.add(core);

const clock = new THREE.Clock();
const tokenData = []; // { material, dir, phase, twinkleRate }

/* --- lat/lon -> position on the sphere ---------------------------- */
const DEG = Math.PI / 180;
function latLonDir(lat, lon) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  );
}

/* --- evenly-spaced grid of land points ---------------------------- */
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

/* --- rasterize an SVG string into a crisp texture ----------------- */
function svgToTexture(svgText, color, size = 256) {
  const colored = svgText.replaceAll("#000000", color);
  const url =
    "data:image/svg+xml;charset=utf-8," + encodeURIComponent(colored);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      const ar = (img.width || 1) / (img.height || 1);
      let w = size, h = size;
      if (ar > 1) h = size / ar;
      else w = size * ar;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      resolve(tex);
    };
    img.onerror = reject;
    img.src = url;
  });
}

Promise.all([
  Promise.all(
    TOKENS.map((u) =>
      fetch(u)
        .then((r) => r.text())
        .then((t) => svgToTexture(t, CONFIG.tokenColor))
    )
  ),
  fetch(LAND_URL).then((r) => r.json()),
])
  .then(([textures, topo]) => {
    buildTokens(textures, feature(topo, topo.objects.land));
  })
  .catch((err) => {
    console.error("Failed to build globe", err);
    loadingEl.textContent = "Failed to load";
  });

const PLANE = new THREE.PlaneGeometry(1, 1);
const Z = new THREE.Vector3(0, 0, 1);

function buildTokens(textures, land) {
  const pts = landPoints(land);

  const arc = CONFIG.globeRadius * CONFIG.gridSpacingDeg * DEG;
  const tokenScale = arc * CONFIG.overlap;

  for (const [lat, lon] of pts) {
    const dir = latLonDir(lat, lon);
    const tex = textures[(Math.random() * textures.length) | 0];

    const material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false, // far side is handled by culling + the core sphere
      side: THREE.FrontSide,
      opacity: 1,
    });

    const mesh = new THREE.Mesh(PLANE, material);
    mesh.position.copy(dir).multiplyScalar(CONFIG.globeRadius);
    mesh.quaternion.setFromUnitVectors(Z, dir); // lie flat on the surface
    mesh.scale.set(tokenScale, tokenScale, 1);
    globe.add(mesh);

    tokenData.push({
      material,
      phase: Math.random() * Math.PI * 2,
      twinkleRate: 0.6 + Math.random() * 0.9,
    });
  }

  console.log(`Placed ${pts.length} tokens on land`);
  loadingEl.classList.add("hidden");
  animate();
}

const SPIN_AXIS = new THREE.Vector3(0, 1, 0);

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const t = clock.elapsedTime;

  globe.rotateOnAxis(SPIN_AXIS, CONFIG.spinSpeed * delta);

  for (const tok of tokenData) {
    tok.material.opacity =
      1 - CONFIG.twinkleAmount *
        (0.5 + 0.5 * Math.sin(t * CONFIG.twinkleSpeed * tok.twinkleRate + tok.phase));
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
