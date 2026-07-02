# Crypto Globe

A slowly-spinning 3D globe whose surface is built entirely from glittering
crypto tokens — **BTC, ETH, SOL, USDC, USDT** — representing global crypto
payments.

Hundreds of token coins are scattered randomly across the sphere. As the globe
rotates, each token **brightens as it turns toward the viewer and fades as it
turns away**, with an extra per-token twinkle so the whole surface shimmers.

## Run locally

It's a static site — just serve the folder:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Opening `index.html` directly via `file://` won't work because it loads
[three.js](https://threejs.org/) as an ES module from a CDN.)

## Structure

```
index.html    markup + styling + import map
globe.js      the three.js scene and glitter animation
tokens/       the five B&W token sprites (exported from Figma)
```

## Tuning

All the knobs live in the `CONFIG` object at the top of `globe.js`:

| Key           | What it does                                    |
| ------------- | ----------------------------------------------- |
| `tokenCount`  | how many tokens cover the globe                 |
| `spinSpeed`   | rotation speed                                  |
| `tilt`        | axial tilt of the globe                         |
| `min/maxScale`| token sprite size range                         |
| `twinkleSpeed`| how fast the glitter shimmer cycles             |

Token artwork lives in `tokens/` — swap the PNGs to restyle the coins.
