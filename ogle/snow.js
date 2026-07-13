const SNOW_EL = document.getElementById('fire');
const _mob = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
let snowW = 0, snowH = 0;
let snowRunning = false;
let flakes = [];
let snowGrid = [], snowColorGrid = [];

const FLAKE_TYPES = [
  { ch: '*', size: 1.0, speed: 0.18, drift: 0.06 },
  { ch: '+', size: 0.8, speed: 0.14, drift: 0.05 },
  { ch: 'o', size: 0.6, speed: 0.11, drift: 0.04 },
  { ch: '.', size: 0.4, speed: 0.08, drift: 0.03 },
  { ch: ',', size: 0.25, speed: 0.05, drift: 0.02 },
];

function snowInit(cols) {
  const lineH = parseFloat(getComputedStyle(SNOW_EL).fontSize || '12') * 1.15;
  snowH = Math.max(40, Math.ceil(window.innerHeight / lineH));
  snowW = cols;
  snowGrid      = Array.from({ length: snowH }, () => new Float32Array(snowW));
  snowColorGrid = Array.from({ length: snowH }, () => new Array(snowW).fill(null));
  flakes = [];
  const count = Math.floor(snowW * snowH * 0.012);
  for (let i = 0; i < count; i++) flakes.push(spawnFlake(true));
}

function spawnFlake(anywhere) {
  const type = FLAKE_TYPES[Math.floor(Math.random() ** 1.5 * FLAKE_TYPES.length)]; // bias toward small
  return {
    x: Math.random() * snowW,
    y: anywhere ? Math.random() * snowH : -1,
    vy: type.speed + Math.random() * type.speed * 0.5,
    driftAmp: type.drift * (0.5 + Math.random()),
    driftFreq: 0.3 + Math.random() * 0.7,
    driftPhase: Math.random() * Math.PI * 2,
    type,
    age: Math.random() * 1000,
  };
}

function snowStep() {
  // decay grid gently (snow lingers)
  for (let r = 0; r < snowH; r++)
    for (let c = 0; c < snowW; c++) {
      snowGrid[r][c] *= 0.88;
      if (snowGrid[r][c] < 0.01) { snowGrid[r][c] = 0; snowColorGrid[r][c] = null; }
    }

  for (const f of flakes) {
    f.age += 1;
    f.y += f.vy;
    f.x += Math.sin(f.age * f.driftFreq * 0.05 + f.driftPhase) * f.driftAmp;

    // wrap horizontally
    if (f.x < 0) f.x += snowW;
    if (f.x >= snowW) f.x -= snowW;

    const r = Math.round(f.y), c = Math.round(f.x);
    if (r >= 0 && r < snowH && c >= 0 && c < snowW) {
      const b = f.type.size;
      if (b > snowGrid[r][c]) {
        snowGrid[r][c] = b;
        snowColorGrid[r][c] = f.type;
      }
    }

    // respawn at top when off bottom
    if (f.y > snowH + 1) {
      f.y = -1;
      f.x = Math.random() * snowW;
      f.age = Math.random() * 1000;
    }
  }
}

function snowColor(brightness) {
  const v = Math.floor(180 + brightness * 75);
  const b = Math.min(255, v + 10);
  return `rgb(${v},${v},${b})`;
}

function snowRender() {
  // build char grid (space by default)
  const display = Array.from({ length: snowH }, () => new Array(snowW).fill(null));
  for (let r = 0; r < snowH; r++)
    for (let c = 0; c < snowW; c++)
      if (snowGrid[r][c] > 0.05)
        display[r][c] = { ch: snowColorGrid[r][c]?.ch || '.', b: snowGrid[r][c] };

  let html = '';
  for (let r = 0; r < snowH; r++) {
    for (let c = 0; c < snowW; c++) {
      const cell = display[r][c];
      if (!cell) { html += ' '; continue; }
      html += `<span style="color:${snowColor(cell.b)}">${cell.ch}</span>`;
    }
    html += '\n';
  }
  SNOW_EL.innerHTML = html;
}

function snowFrame() {
  if (!snowRunning) return;
  snowStep();
  snowRender();
  setTimeout(() => requestAnimationFrame(snowFrame), (_mob?120:60) / (window._backdropSpeed || 1));
}

window.startSnow = () => {
  if (snowRunning) return;
  snowInit(Math.ceil(window.innerWidth / 6));
  snowRunning = true;
  requestAnimationFrame(snowFrame);
};

window.stopSnow = () => {
  snowRunning = false;
  SNOW_EL.innerHTML = '';
  flakes = []; snowGrid = []; snowColorGrid = [];
};

let _snowResizePending = false;
window.addEventListener('resize', () => {
  if (!snowRunning || _snowResizePending) return;
  _snowResizePending = true;
  requestAnimationFrame(() => { _snowResizePending = false; if (snowRunning) snowInit(Math.ceil(window.innerWidth / 6)); });
});

if (localStorage.getItem('backdrop') === 'snow')
  window.startSnow();
