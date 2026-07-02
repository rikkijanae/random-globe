# Crypto Globe

A slowly-spinning 3D globe on a white background whose **land masses are built
from crypto tokens** — **BTC, ETH, SOL, USDC, USDT** — packed edge-to-edge so
the coins fill in the shapes of the continents and countries. The oceans are
left empty (white).

Every token is the same size. As the globe rotates, each coin darkens as it
turns toward the viewer and fades toward the limb, with a subtle per-token
twinkle so the surface gently glitters.

## How the land is built

- An even grid of points is walked across the sphere (longitude step widened by
  `1/cos(lat)` so spacing stays uniform toward the poles).
- Each point is tested against a real world land outline
  ([world-atlas](https://github.com/topojson/world-atlas) `land-110m`) using
  [`d3-geo`](https://github.com/d3/d3-geo)'s `geoContains` — points on land get a
  token, points in the ocean don't.
- A white sphere sits just under the tokens to occlude the far side, so the
  globe reads as solid.

three.js, d3-geo and topojson-client all load from a CDN via the import map in
`index.html` — no build step.

## Run locally

Static site — serve the folder (needs a server, not `file://`, because it loads
ES modules and fetches the land data over HTTP):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Structure

```
index.html    markup, white background, import map
globe.js      land detection + the three.js scene and glitter animation
tokens/       the five B&W token sprites (exported from Figma)
```

## Tuning

All the knobs live in the `CONFIG` object at the top of `globe.js`:

| Key              | What it does                                          |
| ---------------- | ----------------------------------------------------- |
| `gridSpacingDeg` | spacing between tokens — smaller = denser, more detail |
| `overlap`        | token size vs. spacing (1 = edge-to-edge)             |
| `tokenColor`     | tint applied to the light coin art (darker = bolder)  |
| `spinSpeed`      | rotation speed                                        |
| `tilt`           | axial tilt of the globe                               |
| `twinkleSpeed` / `twinkleAmount` | glitter shimmer speed / strength      |

Token artwork lives in `tokens/` — swap the PNGs to restyle the coins.
