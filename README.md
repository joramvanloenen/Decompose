# DECOMPOSE

*A pixel-art necromancy prototype — harvest the dead, feed your magic.*

**[▶ Play Decompose](https://joramvanloenen.github.io/Decompose/)**

Hold and drag to remove individual pixels from a corpse. Pixels glow **bright purple** while still attached, detach, become **deep purple**, and are pulled into your sorcerer's hand. Removing pixels reveals the next anatomical layer exactly where the surface was stripped.

### Controls

- **Mouse / touch:** hold and move to extract pixels beneath the hand.
- **LEFT / RIGHT:** pan across the body; keyboard arrow keys also work.
- **?** instructions.
- **RECONSTITUTE:** restore all body layers.

### Artwork — rendered back to front

1. `assets/Coprse_BG.png` — permanent, indestructible background.
2. `assets/Coprse04_Skeleton.png` — final harvestable skeletal layer.
3. `assets/Coprse03_Dried.png` — dried remains.
4. `assets/Coprse02_Cloth.png` — cloth, covering dried remains.
5. `assets/Coprse01_alive.png` — outer flesh, absorbed first.

The five provided **original PNG files** are 364×204 pixels and share the same registration. The original `Coprse` filename spelling is intentionally retained.

### Development

The game is a dependency-free HTML/CSS/Canvas JavaScript project. Open `index.html` through any static web server, for example `python -m http.server 8000`. GitHub Actions deploys `main` to GitHub Pages.

Current scope: tactile pixel extraction, particle suction, scrollable body, energy harvesting, and an early corruption hazard.

