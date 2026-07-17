const CLOUD_EL = document.getElementById('fire');
const _mob = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
let cloudW = 0, cloudH = 0;
let cloudRunning = false;
let cloudT = 0;

const NZ = 256;
const noiseTab = Array.from({ length: NZ * NZ }, () => Math.random());

function vnoise(x, y) {
  const xi = Math.floor(x) & (NZ - 1), yi = Math.floor(y) & (NZ - 1);
  const xf = x - Math.floor(x), yf = y - Math.floor(y);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x1 = (xi + 1) & (NZ - 1), y1 = (yi + 1) & (NZ - 1);
  return noiseTab[yi * NZ + xi]  * (1-u) * (1-v)
       + noiseTab[yi * NZ + x1]  *    u  * (1-v)
       + noiseTab[y1 * NZ + xi]  * (1-u) *    v
       + noiseTab[y1 * NZ + x1]  *    u  *    v;
}

// horizontal "presence" noise — determines where cloud masses exist along the x axis
function cloudPresence(cx) {
  const t = cloudT;
  let p = 0;
  p += vnoise(cx * 0.03 + t * 0.006, 7.3)  * 0.65;
  p += vnoise(cx * 0.07 + t * 0.010, 14.1) * 0.25;
  p += vnoise(cx * 0.13 + t * 0.016, 21.7) * 0.10;
  return p;
}

// per-column base offset — varies cloud floor height independently of presence
function cloudBaseOffset(cx) {
  return vnoise(cx * 0.025 + cloudT * 0.004, 33.7);
}

// high-altitude layer: smaller, more numerous clouds
function highPresence(cx) {
  const t = cloudT;
  let p = 0;
  p += vnoise(cx * 0.05 + t * 0.009, 51.2) * 0.60;
  p += vnoise(cx * 0.11 + t * 0.015, 63.7) * 0.40;
  return p;
}
function highBaseOffset(cx) {
  return vnoise(cx * 0.04 + cloudT * 0.005, 77.1);
}

// fine texture noise for cloud body
function cloudTexture(cx, cy) {
  const t = cloudT;
  let n = 0;
  n += vnoise(cx * 0.20 + t * 0.014, cy * 0.30) * 0.60;
  n += vnoise(cx * 0.40 + t * 0.022, cy * 0.55) * 0.40;
  return n;
}

function cloudDensityAt(c, r) {
  // cloud base varies per column — sits in top 15% of grid
  const baseOffset = cloudBaseOffset(c);
  const base = cloudH * (0.22 + baseOffset * 0.06);
  const distAbove = base - r;

  // hard flat bottom
  if (distAbove < 0) return 0;

  const presence = cloudPresence(c);
  const presenceThreshold = 0.32;
  if (presence < presenceThreshold) return 0;

  const presenceNorm = Math.min(1, (presence - presenceThreshold) / 0.35);

  const cloudHeight = 10 + presenceNorm * 18;
  const heightFactor = Math.exp(-(distAbove * distAbove) / (cloudHeight * cloudHeight * 0.5));

  const texture = cloudTexture(c, r);
  return presenceNorm * heightFactor * (0.45 + texture * 0.55);
}

function highCloudDensityAt(c, r) {
  // sits even higher — very top of grid
  const baseOffset = highBaseOffset(c);
  const base = cloudH * (0.12 + baseOffset * 0.04);
  const distAbove = base - r;

  // hard flat bottom
  if (distAbove < 0) return 0;

  const presence = highPresence(c);
  const threshold = 0.28;
  if (presence < threshold) return 0;

  const presenceNorm = Math.min(1, (presence - threshold) / 0.35);
  const cloudHeight = 4 + presenceNorm * 8;
  const heightFactor = Math.exp(-(distAbove * distAbove) / (cloudHeight * cloudHeight * 0.5));

  const texture = cloudTexture(c * 1.3, r * 1.3);
  return presenceNorm * heightFactor * (0.35 + texture * 0.45);
}

const CLOUD_EDGE  = ['.', ',', "'", '-', '~'];
const CLOUD_MID   = ['(', 'c', 'o', 'C', ')'];
const CLOUD_THICK = ['O', '0', '*', 'Q'];
const CLOUD_CORE  = ['#', '@', '8'];

function cloudChar(d) {
  if (d < 0.18) return ' ';
  if (d < 0.35) return CLOUD_EDGE [Math.floor((d - 0.18) / 0.17 * CLOUD_EDGE.length)];
  if (d < 0.55) return CLOUD_MID  [Math.floor((d - 0.35) / 0.20 * CLOUD_MID.length)];
  if (d < 0.75) return CLOUD_THICK[Math.floor((d - 0.55) / 0.20 * CLOUD_THICK.length)];
  return CLOUD_CORE[Math.min(CLOUD_CORE.length - 1, Math.floor((d - 0.75) / 0.10 * CLOUD_CORE.length))];
}

function cloudColor(d) {
  const t = Math.min(1, d / 0.9);
  const lum = Math.floor(115 + t * 130);
  return `rgb(${Math.floor(lum * 0.89)},${Math.floor(lum * 0.94)},${lum})`;
}

function cloudRender() {
  const cols = cloudW, rows = cloudH;
  let html = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const d = Math.max(cloudDensityAt(c, r), highCloudDensityAt(c, r));
      const ch = cloudChar(d);
      if (ch === ' ') { html += ' '; continue; }
      html += `<span style="color:${cloudColor(d)}">${ch}</span>`;
    }
    html += '\n';
  }
  CLOUD_EL.innerHTML = html;
}

function cloudFrame() {
  if (!cloudRunning) return;
  cloudT += 0.5;
  cloudRender();
  _cloudFrameTimer = setTimeout(() => requestAnimationFrame(cloudFrame), (_mob?160:80) / (window._backdropSpeed || 1));
}

function cloudInit(cols) {
  const lineH = parseFloat(getComputedStyle(CLOUD_EL).fontSize || '12') * 1.15;
  cloudH = Math.max(40, Math.ceil(window.innerHeight / lineH));
  cloudW = cols;
  cloudT = Math.random() * 1000;
}

function _cloudCols() { return Math.ceil(window.innerWidth * 1.15 / 6); }
function cloudResize(newCols) { cloudW = newCols; }

window.startClouds = () => {
  if (cloudRunning) return;
  cloudInit(_cloudCols());
  cloudRunning = true;
  requestAnimationFrame(cloudFrame);
};

window.stopClouds = () => {
  cloudRunning = false;
  clearTimeout(_cloudFrameTimer);
  CLOUD_EL.innerHTML = '';
};

let _cloudResizeTimer, _cloudFrameTimer;
window.addEventListener('resize', () => {
  if (!cloudRunning) return;
  clearTimeout(_cloudResizeTimer);
  _cloudResizeTimer = setTimeout(() => { if (cloudRunning) cloudResize(_cloudCols()); }, 100);
});

if (localStorage.getItem('backdrop') === 'clouds')
  window.startClouds();
