const FW_EL = document.getElementById('fire');
const _mob = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
let fwW = 0, fwH = 0;
let fwRunning = false;
let fwBright = [], fwColor = [];
let rockets = [], sparks = [];

const FW_PALETTES = [
  [255,  80,  80],  // red
  [255, 160,  40],  // orange
  [255, 230,  60],  // gold
  [ 80, 230,  80],  // green
  [ 60, 200, 255],  // cyan
  [120, 120, 255],  // blue
  [220,  80, 255],  // violet
  [255, 255, 255],  // white
];

function fwInit(cols) {
  const lineH = parseFloat(getComputedStyle(FW_EL).fontSize || '12') * 1.15;
  fwH = Math.max(40, Math.ceil(window.innerHeight / lineH));
  fwW = cols;
  fwBright = Array.from({ length: fwH }, () => new Float32Array(fwW));
  fwColor  = Array.from({ length: fwH }, () => new Array(fwW).fill(null));
  rockets = []; sparks = [];
}

function spawnRocket(col, apexRow) {
  const c = col   ?? Math.floor(fwW * (0.1 + Math.random() * 0.8));
  const a = apexRow ?? Math.floor(fwH * (0.05 + Math.random() * 0.45));
  return {
    x: c, y: fwH - 1,
    targetY: a,
    speed: 1.2 + Math.random() * 0.6,
    color: FW_PALETTES[Math.floor(Math.random() * FW_PALETTES.length)],
    trail: [],
  };
}

function explode(x, y, color, size) {
  const count = (size ?? 1) * (24 + Math.floor(Math.random() * 16));
  // main burst
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
    const spd = 0.6 + Math.random() * 2.2;
    sparks.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd * 0.45, // aspect ratio correction
      color,
      life: 1.0,
      decay: 0.018 + Math.random() * 0.022,
      gravity: 0.012,
    });
  }
  // small secondary sparkles
  for (let i = 0; i < Math.floor(count * 0.4); i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 0.2 + Math.random() * 0.6;
    sparks.push({
      x, y,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd * 0.45,
      color: [255, 255, 220],
      life: 0.7 + Math.random() * 0.3,
      decay: 0.03 + Math.random() * 0.04,
      gravity: 0.008,
    });
  }
}

function writeCell(r, c, brightness, color) {
  if (r < 0 || r >= fwH || c < 0 || c >= fwW) return;
  if (brightness > fwBright[r][c]) {
    fwBright[r][c] = brightness;
    fwColor[r][c]  = color;
  }
}

function fwStep() {
  // decay grid
  for (let r = 0; r < fwH; r++)
    for (let c = 0; c < fwW; c++) {
      fwBright[r][c] *= 0.72;
      if (fwBright[r][c] < 0.01) { fwBright[r][c] = 0; fwColor[r][c] = null; }
    }

  // update rockets
  const deadRockets = [];
  for (const rk of rockets) {
    rk.trail.push({ x: Math.round(rk.x), y: Math.round(rk.y) });
    if (rk.trail.length > 5) rk.trail.shift();

    rk.y -= rk.speed;

    // draw trail
    for (let i = 0; i < rk.trail.length; i++) {
      const t = (i + 1) / rk.trail.length;
      const { x, y } = rk.trail[i];
      writeCell(Math.round(y), x, t * 0.9, rk.color);
    }

    if (rk.y <= rk.targetY) {
      explode(Math.round(rk.x), Math.round(rk.y), rk.color);
      deadRockets.push(rk);
    }
  }
  rockets = rockets.filter(r => !deadRockets.includes(r));

  // update sparks
  const aliveSparks = [];
  for (const sp of sparks) {
    sp.x += sp.vx;
    sp.y += sp.vy;
    sp.vy += sp.gravity;
    sp.life -= sp.decay;
    if (sp.life <= 0) continue;
    writeCell(Math.round(sp.y), Math.round(sp.x), sp.life, sp.color);
    aliveSparks.push(sp);
  }
  sparks = aliveSparks;

  // random auto-launch
  const launchRate = window._fwFestive ? 0.12 : 0.07;
  if (Math.random() < launchRate) rockets.push(spawnRocket());
  if (Math.random() < launchRate * 0.5) rockets.push(spawnRocket());
  if (window._fwFestive && Math.random() < 0.04) rockets.push(spawnRocket());
}

const FW_CHARS = [' ', '.', '·', '+', '*', '#', '@'];

function fwRender() {
  let html = '';
  for (let r = 0; r < fwH; r++) {
    for (let c = 0; c < fwW; c++) {
      const b = fwBright[r][c];
      if (b < 0.02) { html += ' '; continue; }
      const col = fwColor[r][c] || [255,255,255];
      const idx = Math.min(FW_CHARS.length - 1, Math.floor(b * FW_CHARS.length));
      const ch = FW_CHARS[idx];
      const dim = Math.min(1, b);
      const rc = Math.floor(col[0] * dim), gc = Math.floor(col[1] * dim), bc2 = Math.floor(col[2] * dim);
      html += `<span style="color:rgb(${rc},${gc},${bc2})">${ch}</span>`;
    }
    html += '\n';
  }
  FW_EL.innerHTML = html;
}

function fwFrame() {
  if (!fwRunning) return;
  fwStep();
  fwRender();
  setTimeout(() => requestAnimationFrame(fwFrame), (_mob?80:40) / (window._backdropSpeed || 1));
}

const fwClickHandler = e => {
  if (!fwW) return;
  const charW = window.innerWidth / fwW;
  const charH = FW_EL.getBoundingClientRect().height / fwH;
  const col = Math.floor(e.clientX / charW);
  const elTop = FW_EL.getBoundingClientRect().top;
  const row = Math.max(0, Math.floor((e.clientY - elTop) / charH));
  // burst directly at click position; also launch a rocket toward it
  explode(col, row, FW_PALETTES[Math.floor(Math.random() * FW_PALETTES.length)], 0.7);
  rockets.push(spawnRocket(col, row));
};

window.startFireworks = () => {
  if (fwRunning) return;
  fwInit(Math.ceil(window.innerWidth / 7.2));
  fwRunning = true;
  window.addEventListener('click', fwClickHandler);
  requestAnimationFrame(fwFrame);
};

window.stopFireworks = () => {
  fwRunning = false;
  window.removeEventListener('click', fwClickHandler);
  FW_EL.innerHTML = '';
};

if (localStorage.getItem('backdrop') === 'fireworks')
  window.startFireworks();
