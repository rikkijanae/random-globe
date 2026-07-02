# Crypto Globe

A slowly-spinning globe on a white background whose **land masses are built
from crypto tokens** — **BTC, ETH, SOL, USDC, USDT** — packed edge-to-edge so
the coins fill in the shapes of the continents and countries. The globe body
itself is white (invisible against the page), so only the coin-continents show.

Every token is the same size and lies flat **on** the sphere surface (tangent
to it), oriented so its symbol stays **upright** (up toward the north pole), so
the coins follow the globe's curvature and fold away at the edges instead of
sticking out as flat cards. They overlap enough to fill each land area with no
holes. Coins are crisp vector **SVGs**, rasterized in the browser. They're kept
translucent (max 50% opacity) so they always read light, and glitter by fading
between a faint floor and that 50% peak — each coin at its own pace.

A finer layer of plain **circle dots** (a single GPU points layer) blinks in and
out behind the coins — filling the gaps between them and standing in for small
islands the coin grid is too coarse to capture.

**Hover** the globe and the coins near the cursor tint blue with a soft falloff,
fading back to their normal shade as you move away. **Drag** to rotate it.

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
globe.js      SVG rasterizing + land detection + the three.js scene
tokens/       the five B&W token coins as transparent SVGs (from Figma)
```

## Tuning

All the knobs live in the `CONFIG` object at the top of `globe.js`:

| Key              | What it does                                          |
| ---------------- | ----------------------------------------------------- |
| `gridSpacingDeg` | spacing between tokens — smaller = denser, more detail |
| `overlap`        | token size vs. spacing (1 = edge-to-edge)             |
| `spinSpeed`      | rotation speed                                        |
| `tilt`           | axial tilt of the globe                               |
| `coinColor`      | coin shade (kept translucent, so it reads light)      |
| `twinkleSpeed`   | glitter shimmer speed                                 |
| `floorOpacity` / `peakOpacity` | per-coin opacity swing (peak capped at 0.5 = never darker than 50%) |
| `strokeColor` / `strokeOpacity` / `strokeWidth` / `strokeRadiusScale` | the faint grey outline ring |
| `dotSpacingDeg` | grid for the blinking filler dots — smaller = more dots / more small islands |
| `dotColor` / `dotSize` / `dotBlinkSpeed` / `dotMaxOpacity` | color, size, blink speed and max opacity of the filler dots |
| `hoverColor` / `hoverInnerDeg` / `hoverOuterDeg` | color and radius of the blue hover highlight |

Token artwork lives in `tokens/` as SVGs — swap them to restyle the coins.
