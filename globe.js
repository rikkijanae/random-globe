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
  gridSpacingDeg: 1.7,   // spacing between tokens (smaller = denser, finer shapes)
  overlap: 1.0,          // token size vs. grid spacing (1 = side by side, no overlap)
  spinSpeed: 0.06,       // radians / second
  tilt: 0.41,            // axial tilt (~23.5°)

  // Glitter: coins stay fully opaque (so the land never shows holes) and
  // instead shimmer in BRIGHTNESS between a light-grey and a dark shade.
  // Each coin swings within its own range, phase and speed, biased light
  // so most sit greyed-out while a shifting handful darken.
  glitterLight: 0xc4c9d1, // faint end of a coin's swing
  glitterDark: 0x171c27,  // strong end of a coin's swing
  twinkleSpeed: 2.2,      // overall shimmer speed
  floorRange: [0.0, 0.35], // per-coin low end of the swing (0 = fully light)
  peakRange: [0.6, 1.0],   // per-coin high end of the swing (1 = fully dark)

  // Faint grey outline drawn at the globe's silhouette.
  strokeColor: 0x9aa0ab,
  strokeOpacity: 0.75,
  strokeRadiusScale: 1.045, // where the stroke sits relative to the globe
  strokeWidth: 0.006,       // stroke thickness in world units

  // Filler dots: plain circles on a finer land grid that blink in and out,
  // filling the gaps between coins and standing in for small islands.
  dotSpacingDeg: 1.0,   // finer than the coins, so dots fall in the gaps
  dotColor: 0x9aa0ab,   // dot color
  dotSize: 26,          // dot size (screen px at the front of the globe)
  dotBlinkSpeed: 1.8,   // how fast dots blink

  // Hover: coins near the cursor tint blue, then fade back when you leave.
  hoverColor: 0x2f6bff,
  hoverInnerDeg: 1.0,   // fully blue within this radius of the cursor
  hoverOuterDeg: 3.4,   // blend back to normal by this radius
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

// Faint grey silhouette stroke — a thin screen-facing ring at the globe's
// edge. Added to the scene (not the spinning group) so it stays put.
(function addStroke() {
  const mid = CONFIG.globeRadius * CONFIG.strokeRadiusScale;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(
      mid - CONFIG.strokeWidth / 2,
      mid + CONFIG.strokeWidth / 2,
      256
    ),
    new THREE.MeshBasicMaterial({
      color: CONFIG.strokeColor,
      transparent: true,
      opacity: CONFIG.strokeOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false, // draw on top; a z=0 ring would be hidden by the sphere
    })
  );
  scene.add(ring);
})();

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
        // rasterize white; per-coin brightness is set via material.color
        .then((t) => svgToTexture(t, "#ffffff"))
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
const NORTH = new THREE.Vector3(0, 1, 0); // globe's pole (local space)
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _basis = new THREE.Matrix4();

// Orient a coin so it lies flat on the sphere (its normal points radially
// out) AND its "up" points toward the north pole — so the symbol stands
// upright and stays upright as the globe spins on its axis.
function orientUpright(mesh, dir) {
  _up.copy(NORTH).addScaledVector(dir, -NORTH.dot(dir)); // north on tangent plane
  if (_up.lengthSq() < 1e-6) _up.set(0, 0, 1); // at the poles, pick any up
  _up.normalize();
  _right.crossVectors(_up, dir).normalize();
  _basis.makeBasis(_right, _up, dir); // x=right, y=up, z=outward normal
  mesh.quaternion.setFromRotationMatrix(_basis);
}

function buildTokens(textures, land) {
  const pts = landPoints(land);

  const arc = CONFIG.globeRadius * CONFIG.gridSpacingDeg * DEG;
  const tokenScale = arc * CONFIG.overlap;

  for (const [lat, lon] of pts) {
    const dir = latLonDir(lat, lon);
    const tex = textures[(Math.random() * textures.length) | 0];

    const material = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true, // for the symbol cut-outs; the disc stays opaque
      depthWrite: false, // far side is handled by culling + the core sphere
      side: THREE.FrontSide,
    });

    const mesh = new THREE.Mesh(PLANE, material);
    mesh.position.copy(dir).multiplyScalar(CONFIG.globeRadius);
    orientUpright(mesh, dir);
    mesh.scale.set(tokenScale, tokenScale, 1);
    globe.add(mesh);

    const [fl0, fl1] = CONFIG.floorRange;
    const [pk0, pk1] = CONFIG.peakRange;
    tokenData.push({
      material,
      dir: dir.clone(), // local unit direction, used for hover hit-testing
      floor: fl0 + Math.random() * (fl1 - fl0),
      peak: pk0 + Math.random() * (pk1 - pk0),
      phase: Math.random() * Math.PI * 2,
      rate: 0.55 + Math.random() * 1.1, // per-coin speed variation
    });
  }

  buildDots(land);

  console.log(`Placed ${pts.length} tokens on land`);
  loadingEl.classList.add("hidden");
  animate();
}

/* --- blinking filler dots (one GPU points layer) ------------------ */
let dotMaterial = null;

function buildDots(land) {
  const dLat = CONFIG.dotSpacingDeg;
  const positions = [];
  const phases = [];
  const speeds = [];
  for (let lat = -84; lat <= 84; lat += dLat) {
    const cos = Math.cos(lat * DEG);
    const dLon = dLat / Math.max(cos, 0.12);
    for (let lon = -180; lon < 180; lon += dLon) {
      if (!geoContains(land, [lon, lat])) continue;
      const p = latLonDir(lat, lon).multiplyScalar(CONFIG.globeRadius);
      positions.push(p.x, p.y, p.z);
      phases.push(Math.random() * Math.PI * 2);
      speeds.push(0.5 + Math.random());
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aPhase", new THREE.Float32BufferAttribute(phases, 1));
  geo.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speeds, 1));

  dotMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true, // far-side dots are hidden by the core sphere
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(CONFIG.dotColor) },
      uSize: { value: CONFIG.dotSize },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uSpeed: { value: CONFIG.dotBlinkSpeed },
    },
    vertexShader: `
      attribute float aPhase;
      attribute float aSpeed;
      uniform float uTime;
      uniform float uSize;
      uniform float uPixelRatio;
      uniform float uSpeed;
      varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPixelRatio / -mv.z;
        float b = 0.5 + 0.5 * sin(uTime * uSpeed * aSpeed + aPhase);
        vAlpha = smoothstep(0.2, 0.95, b); // blink fully in and out
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vAlpha;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = dot(d, d);
        if (r > 0.25) discard;                  // round dot
        float edge = smoothstep(0.25, 0.16, r); // soft edge
        gl_FragColor = vec4(uColor, vAlpha * edge);
      }`,
  });

  const dots = new THREE.Points(geo, dotMaterial);
  dots.renderOrder = -1; // draw behind the coins so they only show in gaps
  globe.add(dots);
  console.log(`Placed ${phases.length} filler dots`);
}

const SPIN_AXIS = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);
const WORLD_Y = new THREE.Vector3(0, 1, 0);
const C_LIGHT = new THREE.Color(CONFIG.glitterLight);
const C_DARK = new THREE.Color(CONFIG.glitterDark);
const C_HOVER = new THREE.Color(CONFIG.hoverColor);
const COS_INNER = Math.cos(CONFIG.hoverInnerDeg * Math.PI / 180);
const COS_OUTER = Math.cos(CONFIG.hoverOuterDeg * Math.PI / 180);
const _color = new THREE.Color();
const hoverDir = new THREE.Vector3();
let hoverActive = false;

/* --- drag to rotate + hover to highlight -------------------------- */
let dragging = false;
let lastX = 0;
let lastY = 0;
const DRAG_SPEED = 0.006;

const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let pointerInside = false;

function updatePointer(e) {
  const r = canvas.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  pointerInside = true;
}

canvas.style.cursor = "grab";
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.style.cursor = "grabbing";
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  updatePointer(e);
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  // Rotate about world axes so the drag feels natural at any orientation.
  globe.rotateOnWorldAxis(WORLD_Y, dx * DRAG_SPEED);
  globe.rotateOnWorldAxis(WORLD_X, dy * DRAG_SPEED);
});
canvas.addEventListener("pointerleave", () => {
  pointerInside = false;
});
function endDrag() {
  dragging = false;
  canvas.style.cursor = "grab";
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const t = clock.elapsedTime;

  // Auto-spin on the polar axis, paused while the user is dragging.
  if (!dragging) globe.rotateOnAxis(SPIN_AXIS, CONFIG.spinSpeed * delta);

  // Where is the cursor on the globe? (local direction on the sphere)
  hoverActive = false;
  if (pointerInside && !dragging && tokenData.length) {
    raycaster.setFromCamera(pointerNDC, camera);
    const hit = raycaster.intersectObject(core, false)[0];
    if (hit) {
      globe.worldToLocal(hoverDir.copy(hit.point)).normalize();
      hoverActive = true;
    }
  }

  for (const tok of tokenData) {
    // 0..1 wave, biased low so coins spend most of the time light/grey.
    const s = Math.pow(
      0.5 + 0.5 * Math.sin(t * CONFIG.twinkleSpeed * tok.rate + tok.phase),
      1.6
    );
    const v = tok.floor + (tok.peak - tok.floor) * s; // 0 = light, 1 = dark
    _color.copy(C_LIGHT).lerp(C_DARK, v);

    // Tint blue near the cursor, fading out with distance.
    if (hoverActive) {
      const d = tok.dir.dot(hoverDir); // 1 = right under the cursor
      if (d > COS_OUTER) {
        _color.lerp(C_HOVER, THREE.MathUtils.smoothstep(d, COS_OUTER, COS_INNER));
      }
    }
    tok.material.color.copy(_color);
  }

  if (dotMaterial) dotMaterial.uniforms.uTime.value = t;

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
