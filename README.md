# DECOMPOSE

*A pixel-art necromancy prototype — harvest the dead, feed your magic.*

**[▶ Play Decompose](https://joramvanloenen.github.io/Decompose/)**

Hold and drag to remove individual pixels from a corpse. Pixels glow **bright purple** while still attached, then detach and become **deep-purple** fragments that fly into the sorcerer's hand.

## Physical, locally gated layers

- You can extract only the **topmost material** at the point of contact.
- **Deeper layers remain sealed** until at least 84% of the overlying material in a small neighborhood (6–8 sprite pixels around the point) has been absorbed. This is **local**, not a whole-body threshold; harvesting an arm doesn't expose an untouched chest.
- Cloth only needs to be removed **where it actually covers** dried remains.
- The **skeleton cannot be harvested at all** until **every flesh, cloth, and dried-remains pixel has actually been absorbed**, including detached chunks and free-floating suction particles.
- After extraction, the remaining layer is checked for **8-neighbor pixel connectivity**. Islands separated from its largest attached component become **rigid falling pixel clusters**, keeping their internal pattern intact. These chunks can be harvested after landing.
- Falling pieces collide with a **height field derived from the original bottommost skeleton pixel at each X coordinate**. Gaps use the nearest defined height. The collider remains in place even during the final skeleton harvest.
- The background never changes.

## Controls

- **Mouse / touch:** hold and move to activate the extraction field; remain close to a pixel until it releases.
- **LEFT / RIGHT:** pan across the body; keyboard arrows work too.
- **?** instructions.
- **RECONSTITUTE:** reset the body, fragments, counts, and magical energy.

## Artwork — rendered back to front

1. `assets/Coprse_BG.png` — permanent background.
2. `assets/Coprse04_Skeleton.png` — protected final harvestable layer and floor profile.
3. `assets/Coprse03_Dried.png` — dried remains.
4. `assets/Coprse02_Cloth.png` — cloth covering parts of the dried remains.
5. `assets/Coprse01_alive.png` — outer flesh, harvestable first.

The five supplied **original PNG files** are 364×204 pixels and precisely aligned. The original `Coprse` filename spelling is preserved.

## Development

No dependencies or build step: serve the directory (`python -m http.server 8000`) or use GitHub Pages. The `.github/workflows/pages.yml` workflow publishes `main` to Pages. Use `?debug=1` to expose a small read-only diagnostic object for regression tests.