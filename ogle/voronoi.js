const VORONOI_EL = document.getElementById('fire');
const _mob = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
const NUM_SEEDS = 12;

let vorW = 0, vorH = 0;
let vorRunning = false;
let seeds = [];
let vorT = 0;

function vorInit(cols) {
  const lineH = parseFloat(getComputedStyle(VORONOI_EL).fontSize || '12') * 1.15;
  vorH = Math.max(40, Math.ceil(window.innerHeight / lineH));
  vorW = cols;
  // assign seeds in a loose grid so they start spread out
  seeds = Array.from({ length: NUM_SEEDS }, (_, i) => ({
    x: Math.random() * vorW,
    y: Math.random() * vorH,
    vx: (Math.random() - 0.5) * 0.35,
    vy: (Math.random() - 0.5) * 0.18,
    px: Math.random() * Math.PI * 2,
    py: Math.random() * Math.PI * 2,
    spd: 1.2 + Math.random() * 1.4,
    // orbital parameters: each seed circles a slowly drifting center
    orbitR: 4 + Math.random() * 10,
    orbitSpeed: (0.4 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1),
    orbitPhase: Math.random() * Math.PI * 2,
  }));
}

// density chars from sparse to dense
const VOR_CHARS = ' ·.,;:!=+|*#@';

function vorRender() {
  const cols = vorW, rows = vorH;
  // aspect ratio compensation (chars are taller than wide, ~2:1)
  const ax = 1, ay = 2;
  let html = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let d1 = Infinity, d2 = Infinity, s1 = 0;
      for (let i = 0; i < seeds.length; i++) {
        const dx = (c - seeds[i].x) * ax;
        const dy = (r - seeds[i].y) * ay;
        const d = Math.sqrt(dx*dx + dy*dy);
        if (d < d1) { d2 = d1; d1 = d; s1 = i; }
        else if (d < d2) { d2 = d; }
      }

      const edge = d2 - d1; // small = near boundary
      const edgeThresh = 0.9;

      let ch, color;
      if (edge < edgeThresh) {
        // boundary: bright line
        const t = 1 - edge / edgeThresh;
        const v = Math.floor(160 + t * 90);
        ch = edge < 0.35 ? '#' : (edge < 0.65 ? '*' : '+');
        color = `rgb(${Math.floor(v*0.7)},${Math.floor(v*0.85)},${v})`;
      } else {
        // interior: density falls off with distance from seed
        const maxD = Math.sqrt(vorW * vorW + vorH * vorH * 0.25) / 2.5;
        const t = Math.min(1, d1 / maxD);
        const idx = Math.floor((1 - t) * (VOR_CHARS.length - 1));
        ch = VOR_CHARS[idx];
        // subtle color tint per seed
        const hue = (s1 / NUM_SEEDS) * 360;
        const lum = Math.floor(80 + (1 - t) * 80);
        // convert rough hue to rgb with low saturation
        const sat = 0.25;
        const r_ = lum + sat * lum * Math.cos(hue * Math.PI / 180);
        const b_ = lum + sat * lum * Math.cos((hue - 240) * Math.PI / 180);
        const g_ = lum * (1 + sat * 0.3);
        color = `rgb(${Math.round(Math.min(255,r_))},${Math.round(Math.min(255,g_))},${Math.round(Math.min(255,b_))})`;
      }

      if (ch === ' ') { html += ' '; continue; }
      html += `<span style="color:${color}">${ch}</span>`;
    }
    html += '\n';
  }
  VORONOI_EL.innerHTML = html;
}

function vorStep() {
  vorT += 0.016;
  for (const s of seeds) {
    // linear drift + sinusoidal wobble + orbital loop
    s.x += s.vx
      + Math.sin(vorT * s.spd + s.px) * 0.18
      + Math.cos(vorT * s.orbitSpeed + s.orbitPhase) * s.orbitR * 0.022;
    s.y += s.vy
      + Math.sin(vorT * s.spd * 0.7 + s.py) * 0.09
      + Math.sin(vorT * s.orbitSpeed + s.orbitPhase) * s.orbitR * 0.011;
    // soft bounce
    if (s.x < 0)    { s.x = 0;    s.vx = Math.abs(s.vx); }
    if (s.x > vorW) { s.x = vorW; s.vx = -Math.abs(s.vx); }
    if (s.y < 0)    { s.y = 0;    s.vy = Math.abs(s.vy); }
    if (s.y > vorH) { s.y = vorH; s.vy = -Math.abs(s.vy); }
  }
}

function vorFrame() {
  if (!vorRunning) return;
  vorStep();
  vorRender();
  setTimeout(() => requestAnimationFrame(vorFrame), (_mob?120:60) / (window._backdropSpeed || 1));
}

window.startVoronoi = () => {
  if (vorRunning) return;
  vorInit(Math.ceil(window.innerWidth / 6));
  vorRunning = true;
  requestAnimationFrame(vorFrame);
};

window.stopVoronoi = () => {
  vorRunning = false;
  VORONOI_EL.innerHTML = '';
};

if (localStorage.getItem('backdrop') === 'voronoi')
  window.startVoronoi();
