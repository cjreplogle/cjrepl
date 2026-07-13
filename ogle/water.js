const WATER_EL = document.getElementById('fire');
const _mob = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
const DAMP = 0.720;

let waterW = 0, waterH = 0;
let cur = [], prv = [];
let waterRunning = false;
let lastMX = -1, lastMY = -1, lastMoveTime = 0;

function waterChar(h) {
  if (h >  2.5) return '#';
  if (h >  1.8) return '*';
  if (h >  1.1) return '^';
  if (h >  0.5) return "'";
  if (h >  0.1) return '~';
  if (h > -0.1) return '-';
  if (h > -0.5) return '_';
  if (h > -1.1) return '.';
  if (h > -1.8) return ',';
  return '`';
}

function waterColor(h) {
  const t = Math.min(1, Math.abs(h) / 3);
  const v = Math.floor(140 + t * 100);
  return `rgb(${Math.floor(v * 0.6)},${Math.floor(v * 0.8)},${v})`;
}

function waterInit(cols) {
  const lineH = parseFloat(getComputedStyle(WATER_EL).fontSize || '12') * 1.15;
  waterH = Math.max(40, Math.ceil(window.innerHeight / lineH));
  waterW = cols;
  cur = Array.from({ length: waterH }, () => new Float32Array(cols));
  prv = Array.from({ length: waterH }, () => new Float32Array(cols));
}

function disturb(row, col, strength) {
  const r0 = Math.max(0, row - 2), r1 = Math.min(waterH - 1, row + 2);
  const c0 = Math.max(0, col - 3), c1 = Math.min(waterW - 1, col + 3);
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const d = Math.sqrt((r - row) ** 2 + (c - col) ** 2);
      cur[r][c] += strength * Math.max(0, 1 - d / 3.5);
    }
}

function waterStep() {
  const cols = waterW, rows = waterH;
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const n = cur[r-1][c] + cur[r+1][c] + cur[r][c-1] + cur[r][c+1];
      prv[r][c] = (n / 2 - prv[r][c]) * DAMP;
    }
  }
  for (let c = 0; c < cols; c++) {
    prv[0][c] = prv[1][c];
    prv[rows-1][c] = prv[rows-2][c];
  }
  for (let r = 0; r < rows; r++) {
    prv[r][0] = prv[r][1];
    prv[r][cols-1] = prv[r][cols-2];
  }
  // ambient drips from the bottom
  // continuous background turbulence across the whole surface
  const numDrops = Math.floor(cols / 14);
  for (let i = 0; i < numDrops; i++) {
    if (Math.random() < 0.5)
      disturb(
        Math.floor(Math.random() * rows),
        Math.floor(Math.random() * cols),
        14 + Math.random() * 18
      );
  }
  [cur, prv] = [prv, cur];
}

function waterRender() {
  const cols = waterW, rows = waterH;
  let html = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const h = cur[r][c];
      const ch = waterChar(h);
      if (Math.abs(h) < 0.05) { html += ch; continue; }
      html += `<span style="color:${waterColor(h)}">${ch}</span>`;
    }
    html += '\n';
  }
  WATER_EL.innerHTML = html;
}

function waterFrame() {
  if (!waterRunning) return;
  waterStep();
  waterRender();
  setTimeout(() => requestAnimationFrame(waterFrame), (_mob?360:180) / (window._backdropSpeed || 1));
}

const waterMoveHandler = e => {
  if (!waterW) return;
  const now = performance.now();
  const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
  const speed = Math.sqrt(dx*dx + dy*dy) / Math.max(1, now - lastMoveTime);
  if (speed > 0.05 && lastMX >= 0) {
    const charW = window.innerWidth / waterW;
    const charH = WATER_EL.getBoundingClientRect().height / waterH;
    const col = Math.floor(e.clientX / charW);
    const elTop = WATER_EL.getBoundingClientRect().top;
    const row = Math.floor((e.clientY - elTop) / charH);
    if (row >= 0 && row < waterH)
      disturb(row, col, Math.min(0.375, speed * 0.75));
    else if (e.clientY > elTop)
      disturb(waterH - 1, col, Math.min(0.25, speed * 0.5));
  }
  lastMX = e.clientX; lastMY = e.clientY; lastMoveTime = now;
};

window.startWater = () => {
  if (waterRunning) return;
  waterInit(Math.ceil(window.innerWidth / 6));

  // pre-warm: seed disturbances across the grid then simulate into motion
  for (let i = 0; i < 24; i++)
    disturb(
      Math.floor(Math.random() * waterH),
      Math.floor(Math.random() * waterW),
      5 + Math.random() * 5
    );
  for (let i = 0; i < 500; i++) waterStep();

  waterRunning = true;
  window.addEventListener('mousemove', waterMoveHandler);
  requestAnimationFrame(waterFrame);
};

window.stopWater = () => {
  waterRunning = false;
  window.removeEventListener('mousemove', waterMoveHandler);
  WATER_EL.innerHTML = '';
  cur = []; prv = [];
};

let _waterResizeTimer;
window.addEventListener('resize', () => {
  if (!waterRunning) return;
  clearTimeout(_waterResizeTimer);
  _waterResizeTimer = setTimeout(() => { if (waterRunning) waterInit(Math.ceil(window.innerWidth / 6)); }, 100);
});

if (localStorage.getItem('backdrop') === 'water')
  window.startWater();
