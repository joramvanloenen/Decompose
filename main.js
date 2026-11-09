(() => {
  'use strict';

  // All original PNGs share one pixel grid. The camera moves; the images never do.
  const W = 364, H = 204, VW = 236, PIXELS = W * H;
  // Invisible, fixed long-range absorption field. Only its intensity pulses.
  const EXTRACTION_RADIUS = 150;
  function powerPulse() { return .5 + .5 * Math.sin(nowTime * .010); }
  function powerRadius() { return EXTRACTION_RADIUS; }
  const NAMES = ['OUTER FLESH', 'FUNERAL CLOTH', 'DRIED REMAINS', 'ANCIENT BONES'];
  const FILES = ['Coprse01_alive.png', 'Coprse02_Cloth.png', 'Coprse03_Dried.png', 'Coprse04_Skeleton.png'];
  const $ = id => document.getElementById(id);
  const canvas = $('game'), g = canvas.getContext('2d', { alpha: false });
  g.imageSmoothingEnabled = false;
  const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
  const layers = [], charges = new Map(), particles = [], debris = [], dust = [], flameSparks = [];
  const MAX_FLAME_SPARKS = 520;
  const MAX_SUCTION_PARTICLES = 1500;
  // A fraction of real extracted pixels travel like weightless ash first.
  const ASH_FROM_EXTRACTION = .24;
  const ASH_FROM_CRUMBLE = .57;
  const MAX_FALLING_CHUNK_PIXELS = 48;
  const MAX_FALLING_CHUNK_SPAN = 14;
  const MAX_DEBRIS_CHUNKS = 200;
  const visited = new Uint32Array(PIXELS), queue = new Int32Array(PIXELS);
  let visitGeneration = 0, chunkId = 0, ground = new Int16Array(W), groundY = -1;
  let background, cam = 0, wantCam = 0, hand = { x: VW / 2, y: 120 };
  let hold = false, hover = false, pan = 0, energy = 0, harvest = 0, taint = 0;
  let nowTime = 0, previous = performance.now(), connectivityClock = 0, needConnectivity = new Set();
  let loaded = false;

  function load(url) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(url));
      im.src = url;
    });
  }

  function createCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    return c;
  }

  function makeLayer(image) {
    const surface = createCanvas(W, H);
    const context = surface.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, W, H).data;
    const original = new Uint8Array(PIXELS);
    let remaining = 0;
    for (let n = 0; n < PIXELS; n++) {
      // These PNGs have binary alpha; keep the original artwork's RGBA values.
      if (pixels[n * 4 + 3] > 24) { original[n] = 1; remaining++; }
    }
    return { surface, context, pixels, original, absorbed: new Uint8Array(PIXELS), image, remaining, unabsorbed: remaining, dirty: false };
  }

  // A SINGLE horizontal ground line: the lowest row containing any
  // non-transparent pixel in the ORIGINAL skeleton image. It stays fixed
  // even after the skeleton is harvested. Never sample individual columns.
  function buildGround() {
    const bone = layers[3].original;
    groundY = -1;
    for (let y = H - 1; y >= 0 && groundY < 0; y--) {
      const first = y * W;
      for (let x = 0; x < W; x++) {
        if (bone[first + x]) { groundY = y; break; }
      }
    }
    if (groundY < 0) {
      console.warn('Skeleton PNG has no opaque pixels; using scene boundary.');
      groundY = H - 1;
    }
    // Preserve the existing diagnostic array, now a uniform flat floor.
    ground.fill(groundY);
  }

  async function init() {
    try {
      const imgs = await Promise.all(['assets/Coprse_BG.png', ...FILES.map(f => 'assets/' + f)].map(load));
      background = imgs[0];
      for (let i = 1; i < imgs.length; i++) layers.push(makeLayer(imgs[i]));
      buildGround();
      for (let i = 0; i < 42; i++) dust.push({ x: Math.random() * W, y: Math.random() * H, p: Math.random() * 6 });
      loaded = true;
      $('loading').style.opacity = '0';
      setTimeout(() => $('loading')?.remove(), 600);
      requestAnimationFrame(frame);
    } catch (err) {
      $('loading').textContent = 'ASSET ERROR: ' + err.message;
      console.error(err);
    }
  }

  function boneUnlocked() {
    // Falling debris and purple particles still need to reach the hand.
    return layers.length === 4 && layers[0].unabsorbed === 0 &&
      layers[1].unabsorbed === 0 && layers[2].unabsorbed === 0;
  }
  function remainingBeforeBone() {
    return layers.slice(0, 3).reduce((sum, l) => sum + l.unabsorbed, 0);
  }

  // Each deeper pixel requires nearby ABOVE-layer pixels to have been
  // substantially absorbed. The local original coverage is the denominator:
  // naturally bare areas (e.g. the head has no cloth) don't need fake cloth
  // removal, and clearing a distant limb cannot unlock tissue here.
  function locallyClear(k, x, y) {
    if (k === 0) return true;
    if (k === 3) return boneUnlocked(); // skeleton is a global final stage
    for (let above = 0; above < k; above++) {
      const l = layers[above];
      const radius = above === 0 ? 8 : 6;
      let original = 0, present = 0;
      const minY = Math.max(0, y - radius), maxY = Math.min(H - 1, y + radius);
      const minX = Math.max(0, x - radius), maxX = Math.min(W - 1, x + radius);
      const rr = radius * radius;
      for (let yy = minY; yy <= maxY; yy++) {
        const dy2 = (yy - y) * (yy - y);
        for (let xx = minX; xx <= maxX; xx++) {
          if ((xx - x) * (xx - x) + dy2 > rr) continue;
          const n = yy * W + xx;
          if (l.original[n]) {
            original++;
            if (!l.absorbed[n]) present++;
          }
        }
      }
      if (original >= 4 && present > original * 0.16) return false;
    }
    return true;
  }

  function topPixel(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    const alpha = (y * W + x) * 4 + 3;
    for (let k = 0; k < 4; k++) if (layers[k].pixels[alpha] > 24) return k;
    return -1;
  }

  function materialAt(x, y) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    // Disconnected pieces are on top of the corpse and can be harvested
    // individually, even after they've landed on the bone-shaped ground.
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      const rx = Math.round(x - d.x), ry = Math.round(y - d.y);
      if (rx < 0 || ry < 0 || rx >= d.w || ry >= d.h) continue;
      if (d.pixels[(ry * d.w + rx) * 4 + 3] > 24)
        return { k: d.layer, x: rx, y: ry, chunk: d, worldX: x, worldY: y };
    }
    const k = topPixel(x, y);
    if (k < 0 || !locallyClear(k, x, y)) return null;
    return { k, x, y, chunk: null, worldX: x, worldY: y };
  }

  function pointer(e) {
    const r = canvas.getBoundingClientRect(), ar = VW / H, bar = r.width / r.height;
    let x, y;
    if (bar > ar) {
      const w = r.height * ar;
      x = (e.clientX - r.left - (r.width - w) / 2) / w * VW;
      y = (e.clientY - r.top) / r.height * H;
    } else {
      const h = r.width / ar;
      x = (e.clientX - r.left) / r.width * VW;
      y = (e.clientY - r.top - (r.height - h) / 2) / h * H;
    }
    hand = { x: clamp(x, 0, VW), y: clamp(y, 0, H) };
    hover = true;
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault(); canvas.setPointerCapture(e.pointerId);
    pointer(e); hold = true; $('hint').style.opacity = 0;
  });
  canvas.addEventListener('pointermove', pointer);
  canvas.addEventListener('pointerenter', () => hover = true);
  canvas.addEventListener('pointerleave', () => { if (!hold) hover = false; });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    canvas.addEventListener(event, () => hold = false);
  for (const [id, dir] of [['panLeft', -1], ['panRight', 1]]) {
    const b = $(id);
    b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); pan = dir; });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
      b.addEventListener(event, () => pan = 0);
    b.addEventListener('click', () => wantCam = clamp(wantCam + dir * 40, 0, W - VW));
  }
  addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      pan = e.key === 'ArrowLeft' ? -1 : 1; e.preventDefault();
    }
  });
  addEventListener('keyup', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') pan = 0; });
  $('helpBtn').onclick = () => $('instructions').showModal();
  $('closeHelp').onclick = $('begin').onclick = () => $('instructions').close();

  function reset() {
    if (!loaded) return;
    for (const l of layers) {
      l.context.clearRect(0, 0, W, H);
      l.context.drawImage(l.image, 0, 0);
      l.pixels = l.context.getImageData(0, 0, W, H).data;
      l.remaining = l.unabsorbed = l.original.reduce((s, v) => s + v, 0);
      l.absorbed.fill(0);
      l.dirty = false;
    }
    particles.length = 0; flameSparks.length = 0; debris.length = 0; charges.clear();
    needConnectivity.clear(); connectivityClock = 0;
    energy = harvest = taint = 0; cam = wantCam = 0;
    updateHud();
  }
  $('restart').onclick = reset;

  function tainted(x, y, k) {
    return k === 2 && ((x - 188) / 17) ** 2 + ((y - 128) / 8) ** 2 < 1;
  }

  // Visual embers never affect harvesting counts. Cap them for slower phones.
  function spawnFlameSpark(x, y, poisoned, vx = 0, vy = 0) {
    if (flameSparks.length >= MAX_FLAME_SPARKS) flameSparks.shift();
    flameSparks.push({
      x, y, vx: vx * .3 + (Math.random() - .5) * .65,
      vy: vy * .3 - .24 - Math.random() * .5,
      age: 0, life: 220 + Math.random() * 320,
      seed: Math.random() * Math.PI * 2, poisoned
    });
  }


  // Every extracted pixel has exactly one original source location. Fragments
  // shed by gravity use this same path, so they still count only on absorption.
  function spawnSuctionParticle(x, y, k, sourceN, poisoned, evaporating = false) {
    const angle = Math.random() * Math.PI * 2;
    const ash = Math.random() < (evaporating ? ASH_FROM_CRUMBLE : ASH_FROM_EXTRACTION);
    particles.push({
      x, y, vx: ash ? (Math.random() - .5) * .42 : Math.cos(angle) * (.3 + Math.random() * 1.1),
      vy: ash ? -.18 - Math.random() * .45 : (evaporating ? -1.7 : -.6) - Math.random() * 1.25,
      age: 0, seed: Math.random() * Math.PI * 2,
      swirl: Math.random() < .5 ? -1 : 1, sparkClock: 0,
      trail: [{ x, y }], evaporating, ash,
      ashDuration: ash ? 850 + Math.random() * 900 : 0,
      k, sourceN, poisoned
    });
    if (!ash && Math.random() < (evaporating ? .95 : .72)) spawnFlameSpark(x, y, poisoned);
  }

  // Continuous, spatially-coherent turbulence; no independent random jumps.
  function turbulentFlow(x, y, time) {
    const a = x * .106 + time * .0018;
    const b = y * .083 - time * .0024;
    const c = x * .063 - y * .117 + time * .0031;
    return {
      x: Math.cos(b + a) * .65 + Math.sin(c) * .35,
      y: Math.sin(a - b) * .54 + Math.cos(c * 1.3) * .46
    };
  }

  // Smooth 2D value-noise field, advected through time. Unlike random velocity
  // kicks it produces coherent gusts: nearby ash drifts together in eddies.
  function noise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const hash = (a, b) => {
      const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return (v - Math.floor(v)) * 2 - 1;
    };
    const top = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
    const bottom = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  }

  function ashTurbulence(x, y, time, seed) {
    const t = time * .00023;
    return {
      x: noise2(x * .028 + t * 2 + seed, y * .028 - t) * .8 +
         noise2(x * .087 - t * 3, y * .087 + t * 1.5 + seed) * .4,
      y: noise2(y * .037 + t * 1.7 + seed, x * .037 - t * 2) * .65 +
         noise2(y * .093 - t, x * .093 + t * 2) * .35
    };
  }

  function chargeKey(m) {
    return m.chunk ? `d${m.chunk.id}:${m.y * m.chunk.w + m.x}` : `l${m.k}:${m.y * W + m.x}`;
  }

  function gather(dt) {
    if (!hold || !loaded) return;
    const cx = hand.x + cam, cy = hand.y;
    // Sample nearby material densely and distant material throughout the full field.
    const count = Math.max(96, Math.round(dt * 12));
    const radius = powerRadius();
    for (let n = 0; n < count; n++) {
      const a = Math.random() * Math.PI * 2;
      const sampleRadius = n % 5 < 2 ? 50 : radius;
      const r = Math.sqrt(Math.random()) * sampleRadius;
      const m = materialAt(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      if (!m) continue;
      const key = chargeKey(m);
      if (!charges.has(key)) charges.set(key, { ...m, phase: 0 });
    }
  }

  function chargePosition(p) {
    return p.chunk ? { x: Math.round(p.chunk.x + p.x), y: Math.round(p.chunk.y + p.y) }
      : { x: p.x, y: p.y };
  }

  function extractCharged(dt) {
    for (const [key, p] of charges) {
      const world = chargePosition(p);
      const layer = layers[p.k];
      const index = p.chunk ? (p.y * p.chunk.w + p.x) * 4 : (p.y * W + p.x) * 4;
      const pixels = p.chunk ? p.chunk.pixels : layer.pixels;
      if (pixels[index + 3] < 25 || (!p.chunk && (topPixel(p.x, p.y) !== p.k || !locallyClear(p.k, p.x, p.y)))) {
        charges.delete(key); continue;
      }
      const distance = Math.hypot(world.x - hand.x - cam, world.y - hand.y);
      if (!hold || distance > powerRadius() + 3) {
        p.phase -= dt * .008;
        if (p.phase <= 0) charges.delete(key);
        continue;
      }
      p.phase += dt * (.007 + .004 * powerPulse() + .0015 * Math.random());
      if (p.phase < 1) continue;
      if (p.chunk) {
        if (!clearDebrisCell(p.chunk, p.y * p.chunk.w + p.x)) {
          charges.delete(key); continue;
        }
      } else {
        pixels[index + 3] = 0;
        layer.remaining--;
        layer.dirty = true;
        needConnectivity.add(p.k);
      }
      const sourceN = p.chunk
        ? (p.chunk.sourceY + p.y) * W + (p.chunk.sourceX + p.x)
        : p.y * W + p.x;
      const poisoned = tainted(p.chunk ? p.chunk.sourceX + p.x : p.x,
        p.chunk ? p.chunk.sourceY + p.y : p.y, p.k);
      spawnSuctionParticle(world.x, world.y, p.k, sourceN, poisoned);
      if (poisoned) taint = clamp(taint + 1.2, 0, 100);
      charges.delete(key);
    }
  }

  // Only SMALL severed components may fall. Broad or long sections remain
  // attached to the original sprite until further disassembly reduces them.
  // Eight-neighbour connectivity preserves diagonal pixel-art connections.
  function detachIslands(k) {
    const l = layers[k];
    const comps = [];
    const generation = ++visitGeneration;
    for (let start = 0; start < PIXELS; start++) {
      if (l.pixels[start * 4 + 3] < 25 || visited[start] === generation) continue;
      const cells = [];
      let head = 0, tail = 1; queue[0] = start; visited[start] = generation;
      while (head < tail) {
        const current = queue[head++], cx = current % W, cy = (current / W) | 0;
        cells.push(current);
        for (let y = Math.max(0, cy - 1); y <= Math.min(H - 1, cy + 1); y++) {
          for (let x = Math.max(0, cx - 1); x <= Math.min(W - 1, cx + 1); x++) {
            const next = y * W + x;
            if (next === current || visited[next] === generation || l.pixels[next * 4 + 3] < 25) continue;
            visited[next] = generation; queue[tail++] = next;
          }
        }
      }
      comps.push(cells);
    }
    if (comps.length <= 1) return;
    comps.sort((a, b) => b.length - a.length);
    // Avoid a single pre-existing anti-aliasing island suddenly dropping merely
    // because a completely different part of the body was harvested.
    for (let i = 1; i < comps.length; i++) {
      const cells = comps[i];
      if (cells.length < 4 && cells.every(n => isolatedOriginal[k]?.has(n))) continue;
      if (cells.length > MAX_FALLING_CHUNK_PIXELS || debris.length >= MAX_DEBRIS_CHUNKS) continue;
      let minX = W, minY = H, maxX = 0, maxY = 0;
      for (const n of cells) {
        const x = n % W, y = (n / W) | 0;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      if (maxX - minX + 1 > MAX_FALLING_CHUNK_SPAN ||
          maxY - minY + 1 > MAX_FALLING_CHUNK_SPAN) continue;
      makeDebris(k, cells);
    }
  }

  const isolatedOriginal = [];
  function rememberOriginalIslands() {
    // The supplied cloth art has three independent single-pixel marks.
    // Preserve them until touched. They aren't newly severed fragments.
    for (let k = 0; k < 4; k++) {
      const l = layers[k], seen = new Uint8Array(PIXELS), singles = new Set();
      for (let n = 0; n < PIXELS; n++) {
        if (!l.original[n] || seen[n]) continue;
        let head = 0, tail = 1; queue[0] = n; seen[n] = 1;
        const cells = [];
        while (head < tail) {
          const at = queue[head++], x = at % W, y = (at / W) | 0; cells.push(at);
          for (let yy = Math.max(0, y - 1); yy <= Math.min(H - 1, y + 1); yy++)
            for (let xx = Math.max(0, x - 1); xx <= Math.min(W - 1, x + 1); xx++) {
              const next = yy * W + xx;
              if (l.original[next] && !seen[next]) { seen[next] = 1; queue[tail++] = next; }
            }
        }
        if (cells.length < 4) for (const c of cells) singles.add(c);
      }
      isolatedOriginal[k] = singles;
    }
  }

  function makeDebris(k, cells) {
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (const n of cells) {
      const x = n % W, y = (n / W) | 0;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    const surface = createCanvas(w, h), context = surface.getContext('2d');
    const data = context.createImageData(w, h), src = layers[k].pixels;
    for (const n of cells) {
      const x = n % W - minX, y = ((n / W) | 0) - minY;
      const to = (y * w + x) * 4, from = n * 4;
      for (let c = 0; c < 4; c++) data.data[to + c] = src[from + c];
      src[from + 3] = 0;
    }
    const active = [], slot = new Int32Array(w * h).fill(-1);
    for (const n of cells) {
      const local = (((n / W) | 0) - minY) * w + (n % W) - minX;
      slot[local] = active.length;
      active.push(local);
    }
    const d = { id: ++chunkId, layer: k, x: minX, y: minY,
      sourceX: minX, sourceY: minY, spawnY: minY,
      w, h, surface, context, pixels: data.data, originalPixels: new Uint8ClampedArray(data.data),
      remaining: cells.length, active, slot, vx: (Math.random() - .5) * 3,
      vy: 0, settled: false, dirty: true, profileDirty: true, profile: [],
      fallAge: 0, impactAt: -1, splitDepth: 0, aftershock: 0,
      shedAccumulator: 0, tint: 0, tintClock: 0 };
    debris.push(d);
    layers[k].remaining -= cells.length;
    layers[k].dirty = true;
  }


  // Dense occupancy array permits O(1) removal, even when only a few pixels
  // remain after both player extraction and gravity fragmentation.
  function clearDebrisCell(d, cell) {
    const index = d.slot[cell];
    if (index < 0) return false;
    const last = d.active.pop();
    if (index < d.active.length) {
      d.active[index] = last;
      d.slot[last] = index;
    }
    d.slot[cell] = -1;
    d.pixels[cell * 4 + 3] = 0;
    d.remaining = d.active.length;
    d.dirty = true;
    d.flashDirty = true;
    d.profileDirty = true;
    return true;
  }

  function crumbleDebris(d, count) {
    if (!d.remaining || particles.length >= MAX_SUCTION_PARTICLES) return;
    const limit = Math.min(count, d.remaining, MAX_SUCTION_PARTICLES - particles.length);
    for (let i = 0; i < limit; i++) {
      // Prefer exposed edges; clustered releases resemble crumbling cloth
      // and flesh rather than evenly distributed random holes.
      let cell = d.active[(Math.random() * d.active.length) | 0];
      for (let attempt = 0; attempt < 7; attempt++) {
        const candidate = d.active[(Math.random() * d.active.length) | 0];
        const x = candidate % d.w, y = (candidate / d.w) | 0;
        if (x === 0 || y === 0 || x === d.w - 1 || y === d.h - 1 ||
            d.slot[candidate - 1] < 0 || d.slot[candidate + 1] < 0 ||
            d.slot[candidate - d.w] < 0 || d.slot[candidate + d.w] < 0) {
          cell = candidate; break;
        }
      }
      const x = cell % d.w, y = (cell / d.w) | 0;
      const sourceX = d.sourceX + x, sourceY = d.sourceY + y;
      if (!clearDebrisCell(d, cell)) continue;
      const poisoned = tainted(sourceX, sourceY, d.layer);
      spawnSuctionParticle(d.x + x, d.y + y, d.layer, sourceY * W + sourceX, poisoned, true);
      if (poisoned) taint = clamp(taint + .55, 0, 100);
    }
  }

  // Keep ALL physical pixels in their source RGBA colors, permanently.
  // Purple is a separate, time-limited visual overlay, never a mutation of
  // the destructible layer or fragment pixel data.
  function tintDebris(d, dt) {
    d.tintClock += dt;
    const detachFlash = Math.max(0, 1 - d.fallAge / 300) * .78;
    const impactFlash = d.impactAt < 0 ? 0 :
      Math.max(0, 1 - (d.fallAge - d.impactAt) / 220) * .50;
    d.tint = Math.max(detachFlash, impactFlash);
  }

  // Cache a violet sprite matching only the CURRENT opaque debris pixels.
  // The source sprite itself is always the exact original artwork.
  function drawDebrisGlow(d, x, y) {
    if (d.tint <= .006) return;
    if (!d.glowSurface) {
      d.glowSurface = createCanvas(d.w, d.h);
      d.glowContext = d.glowSurface.getContext('2d');
      d.flashDirty = true;
    }
    if (d.flashDirty) {
      const glow = d.glowContext.createImageData(d.w, d.h);
      for (let i = 0; i < d.pixels.length; i += 4) {
        const alpha = d.pixels[i + 3];
        if (alpha <= 24) continue;
        glow.data[i] = 202;
        glow.data[i + 1] = 66;
        glow.data[i + 2] = 246;
        glow.data[i + 3] = alpha;
      }
      d.glowContext.putImageData(glow, 0, 0);
      d.flashDirty = false;
    }
    g.save();
    g.globalAlpha = d.tint;
    g.drawImage(d.glowSurface, x, y);
    g.restore();
  }

  function refreshProfile(d) {
    d.profile = new Int16Array(d.w).fill(-1);
    for (let x = 0; x < d.w; x++) {
      for (let y = d.h - 1; y >= 0; y--) {
        if (d.pixels[(y * d.w + x) * 4 + 3] > 24) { d.profile[x] = y; break; }
      }
    }
    d.profileDirty = false;
  }

  function floorLimit(d) {
    // Collide the lowest surviving pixel of each fragment with the fixed
    // horizontal skeleton baseline (one row above it is the final position).
    let lowest = -1;
    for (let x = 0; x < d.w; x++) {
      if (d.profile[x] > lowest) lowest = d.profile[x];
    }
    return lowest < 0 ? d.y : groundY - lowest - 1;
  }

  // On impact, split a falling fragment into several small, contiguous
  // pieces using multi-source 8-neighbour flood fill. These pieces spread
  // slightly and settle again under gravity. No source pixel is duplicated,
  // destroyed or prematurely counted as absorbed.
  function splitDebrisOnImpact(d, debrisIndex) {
    if (d.splitDepth !== 0 || d.remaining < 9 || debris.length >= MAX_DEBRIS_CHUNKS - 7) return false;
    const pieces = Math.min(6, Math.max(2, Math.floor(d.remaining / 15)));
    const seeds = [d.active[(Math.random() * d.active.length) | 0]];
    while (seeds.length < pieces) {
      let farthest = -1, best = -1;
      for (const cell of d.active) {
        if (seeds.includes(cell)) continue;
        const x = cell % d.w, y = (cell / d.w) | 0;
        let distance = Infinity;
        for (const seed of seeds) {
          const sx = seed % d.w, sy = (seed / d.w) | 0;
          distance = Math.min(distance, (x - sx) ** 2 + (y - sy) ** 2);
        }
        if (distance > farthest) { farthest = distance; best = cell; }
      }
      if (best < 0) break;
      seeds.push(best);
    }
    if (seeds.length < 2) return false;
    const owner = new Int16Array(d.w * d.h).fill(-1);
    const groups = seeds.map(() => []);
    const frontier = [];
    for (let i = 0; i < seeds.length; i++) {
      owner[seeds[i]] = i;
      frontier.push(seeds[i]);
    }
    for (let head = 0; head < frontier.length; head++) {
      const cell = frontier[head], group = owner[cell];
      groups[group].push(cell);
      const x = cell % d.w, y = (cell / d.w) | 0;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(d.h - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(d.w - 1, x + 1); xx++) {
          const next = yy * d.w + xx;
          if (owner[next] !== -1 || d.slot[next] < 0) continue;
          owner[next] = group;
          frontier.push(next);
        }
      }
    }
    // A partially harvested parent may already contain isolated specks.
    // Assign these too, without dropping or duplicating their source pixels.
    for (const cell of d.active) {
      if (owner[cell] >= 0) continue;
      const x = cell % d.w, y = (cell / d.w) | 0;
      let nearest = 0, best = Infinity;
      for (let i = 0; i < seeds.length; i++) {
        const sx = seeds[i] % d.w, sy = (seeds[i] / d.w) | 0;
        const dst = (x - sx) ** 2 + (y - sy) ** 2;
        if (dst < best) { best = dst; nearest = i; }
      }
      groups[nearest].push(cell);
    }
    const shards = [];
    for (const cells of groups) {
      if (!cells.length) continue;
      let minX = d.w, minY = d.h, maxX = 0, maxY = 0;
      for (const cell of cells) {
        const x = cell % d.w, y = (cell / d.w) | 0;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      const w = maxX - minX + 1, h = maxY - minY + 1;
      const surface = createCanvas(w, h), context = surface.getContext('2d');
      const data = context.createImageData(w, h);
      const active = [], slot = new Int32Array(w * h).fill(-1);
      for (const cell of cells) {
        const x = cell % d.w - minX, y = ((cell / d.w) | 0) - minY;
        const at = y * w + x, src = cell * 4, dest = at * 4;
        data.data[dest] = d.originalPixels[src];
        data.data[dest + 1] = d.originalPixels[src + 1];
        data.data[dest + 2] = d.originalPixels[src + 2];
        data.data[dest + 3] = d.originalPixels[src + 3];
        slot[at] = active.length;
        active.push(at);
      }
      const center = (minX + maxX) / 2;
      const side = center < d.w / 2 ? -1 : 1;
      shards.push({
        id: ++chunkId, layer: d.layer,
        x: d.x + minX, y: d.y + minY,
        sourceX: d.sourceX + minX, sourceY: d.sourceY + minY,
        spawnY: d.y + minY, w, h, surface, context,
        pixels: data.data, originalPixels: new Uint8ClampedArray(data.data),
        remaining: active.length, active, slot,
        vx: side * (8 + Math.random() * 13), vy: 0,
        settled: false, dirty: true, profileDirty: true, profile: [],
        fallAge: 0, impactAt: -1, splitDepth: d.splitDepth + 1,
        aftershock: 0, shedAccumulator: 0, tint: 0, tintClock: 0
      });
    }
    if (shards.length < 2) return false;
    // Pending extractions refer to old chunk-local coordinates. Reacquire
    // them on the next frame using the new shards' own coordinate systems.
    for (const [key, charge] of charges) if (charge.chunk === d) charges.delete(key);
    debris.splice(debrisIndex, 1, ...shards);
    return true;
  }

  function moveDebris(dt) {
    const seconds = dt / 1000;
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      if (!d.remaining) { debris.splice(i, 1); continue; }
      d.fallAge += dt;
      if (d.profileDirty) refreshProfile(d);
      if (!d.settled) {
        d.vy = Math.min(d.vy + 275 * seconds, 160);
        d.x = clamp(d.x + d.vx * seconds, 0, Math.max(0, W - d.w));
        const previousY = d.y;
        const nextY = previousY + d.vy * seconds;
        const contactY = floorLimit(d);
        // If detached tissue already touches/overlaps the flat line, it
        // settles immediately in place. Never lift it and NEVER allow it
        // to fall through to the bottom of the screen.
        if (previousY >= contactY || nextY >= contactY) {
          d.y = Math.max(previousY, contactY);
          d.vy = d.vx = 0;
          d.settled = true;
          d.impactAt = d.fallAge;
          d.aftershock = 0;
          if (splitDebrisOnImpact(d, i)) continue;
          crumbleDebris(d, Math.min(72, Math.ceil(d.remaining * (.12 + Math.random() * .07))));
        } else {
          d.y = nextY;
          d.shedAccumulator += dt * Math.min(.055, Math.max(.008, d.remaining * .000017));
          const shed = Math.min(9, Math.floor(d.shedAccumulator));
          if (shed > 0) { crumbleDebris(d, shed); d.shedAccumulator -= shed; }
        }
      } else {
        // A brief secondary crumble on impact. The rest stays on the ground
        // and can still be harvested directly with the hand.
        d.aftershock += dt;
        if (d.aftershock < 650) {
          d.shedAccumulator += dt * Math.min(.02, Math.max(.004, d.remaining * .000008));
          const shed = Math.floor(d.shedAccumulator);
          if (shed > 0) { crumbleDebris(d, shed); d.shedAccumulator -= shed; }
        }
      }
      if (d.profileDirty) refreshProfile(d);
      tintDebris(d, dt);
      if (d.dirty) {
        d.context.putImageData(new ImageData(new Uint8ClampedArray(d.pixels), d.w, d.h), 0, 0);
        d.dirty = false;
      }
    }
  }

  function moveParticles(dt) {
    const step = clamp(dt / 16.667, 0, 2.5), tx = hand.x + cam, ty = hand.y;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      const dx = tx - p.x, dy = ty - p.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 4) {
        // Only actual arrival at the hand counts toward local unlocking.
        layers[p.k].unabsorbed--;
        layers[p.k].absorbed[p.sourceN] = 1;
        harvest++;
        if (!p.poisoned) energy++;
        if (Math.random() < .4) spawnFlameSpark(tx, ty, p.poisoned);
        particles.splice(i, 1);
        continue;
      }
      // Some real pixels become almost weightless ash. They rise against
      // gravity, coherently wander through a slowly changing noise field,
      // then yield to the magical attraction. They are never thrown away:
      // only arrival at the hand counts as absorbed.
      if (p.ash && p.age < p.ashDuration) {
        const wind = ashTurbulence(p.x, p.y, nowTime, p.seed);
        const drag = Math.pow(.91, step);
        p.vx = p.vx * drag + (wind.x * .07 + Math.sin(p.age * .007 + p.seed) * .018) * step;
        p.vy = p.vy * drag + (-.046 + wind.y * .025) * step;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 1.25) { p.vx *= 1.25 / speed; p.vy *= 1.25 / speed; }
        p.x += p.vx * step;
        p.y += p.vy * step;
        p.trail.unshift({ x: p.x, y: p.y });
        if (p.trail.length > 3) p.trail.pop();
        continue;
      }
      // When the ash phase ends, the particle becomes part of the purple
      // siphon. Normal released pixels use the familiar swirling flame pull.
      const nx = dx / distance, ny = dy / distance;
      const surge = powerPulse();
      const pull = .25 + .72 * (1 - Math.exp(-p.age / 210)) + 12 / (distance + 24) + .45 * surge;
      const curl = p.swirl * (.19 + .16 * Math.sin(p.age * .017 + p.seed)) +
        .19 * Math.sin(p.age * .034 + p.seed * 2);
      const turbulence = turbulentFlow(p.x, p.y, nowTime);
      const chaos = p.ash ? .25 : p.evaporating ? .34 : .14;
      const lift = (p.evaporating ? -.46 : -.3) * Math.max(0, 1 - (p.ash ? Math.max(0, p.age - p.ashDuration) : p.age) / 420);
      const flicker = Math.sin(p.age * .043 + p.seed);
      const drag = Math.pow(.87, step);
      p.vx = p.vx * drag + (nx * pull - ny * curl + flicker * .13 + turbulence.x * chaos) * step;
      p.vy = p.vy * drag + (ny * pull + nx * curl + lift +
        Math.cos(p.age * .037 + p.seed) * .08 + turbulence.y * chaos) * step;
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 6.2) { p.vx *= 6.2 / speed; p.vy *= 6.2 / speed; }
      p.x += p.vx * step; p.y += p.vy * step;
      p.trail.unshift({ x: p.x, y: p.y });
      if (p.trail.length > 6) p.trail.pop();
      p.sparkClock += dt;
      if (p.sparkClock > (p.evaporating ? 25 : 46) && Math.random() < (p.evaporating ? .7 : .47)) {
        spawnFlameSpark(p.x, p.y, p.poisoned, p.vx, p.vy);
        p.sparkClock = 0;
      }
    }
  }

  function moveFlameSparks(dt) {
    const step = clamp(dt / 16.667, 0, 2.5), tx = hand.x + cam, ty = hand.y;
    for (let i = flameSparks.length - 1; i >= 0; i--) {
      const s = flameSparks[i];
      s.age += dt;
      const dx = tx - s.x, dy = ty - s.y;
      const distance = Math.hypot(dx, dy);
      if (s.age >= s.life || distance < 3) { flameSparks.splice(i, 1); continue; }
      const drag = Math.pow(.93, step);
      s.vx = s.vx * drag + (dx / distance * .07 +
        Math.sin(s.age * .03 + s.seed) * .1) * step;
      s.vy = s.vy * drag + (dy / distance * .07 - .06) * step;
      s.x += s.vx * step; s.y += s.vy * step;
    }
  }

  function updateHud() {
    $('essence').textContent = String(energy).padStart(5, '0');
    $('harvest').textContent = `${harvest} PIXELS ABSORBED`;
    $('healthBar').style.width = (100 - taint) + '%';
    const left = remainingBeforeBone();
    $('status').textContent = taint > 55 ? 'CORRUPTION CRITICAL'
      : taint > 8 ? 'TAINT DETECTED'
      : left ? `BONES SEALED · ${left.toLocaleString('en-US')} LEFT` : 'BONES UNBOUND · FINAL HARVEST';
  }

  function drawHand() {
    if (!hover && !hold) return;
    const x = Math.round(hand.x), y = Math.round(hand.y);
    g.save(); g.translate(x, y); g.shadowBlur = hold ? 12 + 10 * powerPulse() : 4; g.shadowColor = '#c644ff';
    g.fillStyle = '#14221b'; g.fillRect(4, 12, 9, 12); g.fillRect(-7, 6, 15, 11);
    g.fillStyle = '#536c61'; g.fillRect(-7, 7, 14, 9); g.fillRect(-3, 1, 9, 12); g.fillRect(3, 13, 9, 10);
    g.fillStyle = '#acc1a8'; g.fillRect(-6, 4, 11, 4); g.fillRect(-4, 0, 8, 4);
    for (let f = 0; f < 4; f++) {
      const px = -7 + f * 4, py = -2 - Math.abs(f - 1.5) * 1.8;
      g.fillStyle = '#536c61'; g.fillRect(px, py - 9, 3, 9);
      g.fillStyle = '#acc1a8'; g.fillRect(px, py - 10, 2, 7);
      g.fillStyle = hold ? '#da71fa' : '#819d90'; g.fillRect(px, py - 11, 2, 2);
    }
    g.fillStyle = '#8d45b6'; g.fillRect(-8, -2, 3, 5);
    g.restore();
  }

  // Three passes: faint additive fire wisps, short glowing trails, then
  // an opaque DEEP-purple source pixel. Source sprites stay perfectly sharp.
  function renderFlames() {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const s of flameSparks) {
      const x = Math.round(s.x - cam), y = Math.round(s.y);
      if (x < -5 || x > VW + 5 || y < -5 || y > H + 5) continue;
      const fade = Math.max(0, 1 - s.age / s.life);
      g.globalAlpha = fade * (.25 + .2 * Math.sin(s.age * .037 + s.seed) ** 2);
      g.fillStyle = s.poisoned ? '#ff4b93' : '#ac37ef';
      g.fillRect(x, y, 1, 1);
      if (fade > .7) {
        g.globalAlpha = fade * .08;
        g.fillRect(x - 1, y - 1, 3, 3);
      }
    }
    for (const p of particles) {
      const x = Math.round(p.x - cam), y = Math.round(p.y);
      if (x < -8 || x > VW + 8 || y < -8 || y > H + 8) continue;
      const floatingAsh = p.ash && p.age < p.ashDuration;
      for (let j = p.trail.length - 1; j >= 0; j--) {
        const point = p.trail[j];
        g.globalAlpha = floatingAsh ? .07 + .11 * (p.trail.length - j) / p.trail.length
          : .12 + .45 * (p.trail.length - j) / p.trail.length;
        g.fillStyle = floatingAsh ? '#b0a5b3' : p.poisoned ? '#e93588' : (j % 2 ? '#7c25d2' : '#a633f2');
        g.fillRect(Math.round(point.x - cam), Math.round(point.y), 1, 1);
      }
      if (!floatingAsh) {
        const pulse = .5 + .5 * Math.sin(p.age * .046 + p.seed);
        g.fillStyle = p.poisoned ? '#f8438b' : '#a739ff';
        g.globalAlpha = .07 + pulse * .07;
        g.fillRect(x - 2, y - 2, 5, 5);
        g.globalAlpha = .18 + pulse * .15;
        g.fillRect(x - 1, y - 1, 3, 3);
      }
    }
    g.restore();
    // Opaque cores deliberately stay deep purple even against bright BG.
    for (const p of particles) {
      const x = Math.round(p.x - cam), y = Math.round(p.y);
      if (x < 0 || x >= VW || y < 0 || y >= H) continue;
      const floatingAsh = p.ash && p.age < p.ashDuration;
      g.fillStyle = floatingAsh ? (p.poisoned ? '#b588a4' : '#b5aeb5')
        : p.poisoned ? '#aa1c70' : '#6820ad';
      g.fillRect(x, y, 1, 1);
    }
  }

  function render() {
    g.clearRect(0, 0, VW, H);
    g.drawImage(background, -Math.round(cam), 0);
    for (let k = 3; k >= 0; k--) g.drawImage(layers[k].surface, -Math.round(cam), 0);
    if (topPixel(188, 128) === 2) {
      g.globalAlpha = .65 + .25 * Math.sin(nowTime * .006);
      g.fillStyle = '#a32670';
      g.fillRect(187 - cam, 128, 3, 2); g.fillRect(182 - cam, 125, 2, 2);
      g.fillRect(193 - cam, 126, 2, 2); g.globalAlpha = 1;
    }
    for (const d of debris) {
      if (d.x - cam > VW || d.x + d.w < cam) continue;
      const dx = Math.round(d.x - cam), dy = Math.round(d.y);
      g.drawImage(d.surface, dx, dy);
      drawDebrisGlow(d, dx, dy);
    }
    for (const p of charges.values()) {
      const at = chargePosition(p), x = Math.round(at.x - cam);
      if (x < 0 || x >= VW) continue;
      g.fillStyle = p.phase > .6 ? '#f2b8ff' : p.phase > .22 ? '#d953ff' : '#a937ef';
      g.globalAlpha = .7 + .3 * powerPulse();
      g.fillRect(x, at.y, 1, 1);
      g.globalAlpha = 1;
      if (p.phase > .65) {
        g.fillStyle = '#cd36ff44'; g.fillRect(x - 1, at.y - 1, 3, 3);
      }
    }
    renderFlames();
    for (const m of dust) {
      g.fillStyle = '#80df7c'; g.globalAlpha = .1 + .12 * Math.sin(nowTime * .001 + m.p);
      g.fillRect(Math.round(m.x - cam * .25), Math.round(m.y), 1, 1);
    }
    g.globalAlpha = 1;
    drawHand();
  }

  function frame(time) {
    const dt = Math.min(40, time - previous); previous = time; nowTime += dt;
    wantCam = clamp(wantCam + pan * dt * .09, 0, W - VW);
    cam += (wantCam - cam) * Math.min(1, dt * .016);
    gather(dt);
    extractCharged(dt);
    // Expensive connectivity checks are coalesced, not run for every pixel.
    connectivityClock += dt;
    if (connectivityClock >= 115 && needConnectivity.size) {
      for (const k of needConnectivity) detachIslands(k);
      needConnectivity.clear(); connectivityClock = 0;
    }
    for (const l of layers) {
      if (!l.dirty) continue;
      l.context.putImageData(new ImageData(new Uint8ClampedArray(l.pixels), W, H), 0, 0);
      l.dirty = false;
    }
    moveDebris(dt);
    moveParticles(dt);
    moveFlameSparks(dt);
    updateHud();
    $('position').style.left = ((cam / (W - VW)) * 92) + '%';
    if (hold) {
      const worldX = Math.round(hand.x + cam), worldY = Math.round(hand.y);
      const k = topPixel(worldX, worldY);
      $('layerName').textContent = k === 3 && !boneUnlocked()
        ? 'ANCIENT BONES · SEALED' : k >= 0 ? NAMES[k] : 'DETACHED MATTER';
    }
    render();
    requestAnimationFrame(frame);
  }

  // Small diagnostic hook for automated regression tests; not a gameplay cheat.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__DECOMPOSE_DEBUG__ = {
      get ready() { return loaded; }, get layers() { return layers; }, get debris() { return debris; },
      get ground() { return ground; }, get groundY() { return groundY; }, get particles() { return particles; },
      get powerRadius() { return powerRadius(); },
      get flameSparks() { return flameSparks; },
      locallyClear, topPixel, materialAt, boneUnlocked, detachIslands,
      get maxFallingChunkPixels() { return MAX_FALLING_CHUNK_PIXELS; },
      get camera() { return cam; }
    };
  }
  init().then(() => { if (loaded) rememberOriginalIslands(); });
})();