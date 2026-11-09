# DECOMPOSE

*A pixel-art necromancy prototype — harvest the dead, feed your magic.*

**[▶ Play Decompose](https://joramvanloenen.github.io/Decompose/)**

Hold and drag to remove individual pixels from a corpse. An **invisible 70-pixel absorption range** lets you harvest at a moderate distance without circles or range indicators around the hand, and the brighter purple siphon pulls pixels through curling, noise-turbulent flame trails. Pixels glow **bright purple** while attached, then fly into the hand as deep-purple fragments.

## Physical, locally gated layers

- You can extract only the **topmost material** at the point of contact.
- **Deeper layers remain sealed** until at least 84% of the overlying material in a small neighborhood (6–8 sprite pixels around the point) has been absorbed. This is **local**, not a whole-body threshold; harvesting an arm doesn't expose an untouched chest.
- Cloth only needs to be removed **where it actually covers** dried remains.
- The **skeleton cannot be harvested at all** until **every flesh, cloth, and dried-remains pixel has actually been absorbed**, including detached chunks and free-floating suction particles.
- After extraction, **8-neighbor connectivity** determines which sections are disconnected. Only **small chunks (48 pixels or fewer, no more than 14 pixels wide or tall)** are allowed to fall; large disconnected portions stay in place until further harvested.
- Detached pieces keep their **original PNG pixel colors in memory at all times**. A separate violet overlay fades away in **300 ms** after detachment (and 220 ms after impact). This avoids permanently tinting chunks or leaving any purple dye behind.
- When a small chunk lands, it **breaks into multiple smaller, physically separate connected shards** that scatter slightly and fall onto the same skeleton-derived floor. Shards may also chip off pixels into the turbulent purple suction flame. All pieces can still be harvested.
- Falling pieces land on **one fixed horizontal collision line**, taken from the lowest non-transparent row anywhere in the original `Coprse04_Skeleton.png` (row **158**, zero-indexed, in the supplied 364×204 asset). This is NOT a per-column height field or the bottom of the screen. If a fragment already overlaps the baseline when disconnected, it settles where it is rather than jumping upward or dropping below it. The baseline persists during final skeleton extraction.
- **Weightless ash:** Roughly 24% of directly separated pixels and 57% of crumbling debris rise gently as pale ash. Smooth, spatially coherent two-octave turbulence causes swirling sideways drift. After floating for about 0.85–1.75 seconds they can join the purple siphon, **but only while the player presses within range**. Ash uses the same pixel identity/absorption accounting as all other particles.
- **Suction is press-and-hold only:** Releasing the mouse/touch disables magnetic attraction for all free pixels and decorative sparks. Uncollected fragments drift independently, cannot auto-absorb through hovering, and remain recoverable when pressed again within 70 pixels.
- All shattered/evaporated pixels remain individually accounted for and count as harvested **only after reaching the hand**; breaking pieces cannot unlock deeper tissue for free.
- The background never changes.

## Controls

- **Mouse / touch:** press and hold to activate the siphon (up to 70 sprite pixels away). Releasing disables the attractor.
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