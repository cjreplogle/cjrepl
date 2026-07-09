const BOREALIS_EL = document.getElementById('fire');
let borW = 0, borH = 0;
let borRunning = false;
let borT = 0;

const BOR_NZ = 512;
const borNoise = Array.from({ length: BOR_NZ * BOR_NZ }, () => Math.random());

function bnoise(x, y) {
  const xi = Math.floor(x) & (BOR_NZ-1), yi = Math.floor(y) & (BOR_NZ-1);
  const xf = x-Math.floor(x), yf = y-Math.floor(y);
  const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const x1=(xi+1)&(BOR_NZ-1), y1=(yi+1)&(BOR_NZ-1);
  return borNoise[yi*BOR_NZ+xi]*(1-u)*(1-v)
       + borNoise[yi*BOR_NZ+x1]*u*(1-v)
       + borNoise[y1*BOR_NZ+xi]*(1-u)*v
       + borNoise[y1*BOR_NZ+x1]*u*v;
}

// aurora color palette: green → cyan → blue → violet → magenta
const AURORA_BANDS = [
  [  0, 255, 120],  // green
  [  0, 230, 200],  // cyan-green
  [  0, 180, 255],  // cyan-blue
  [ 80, 100, 255],  // blue
  [160,  60, 255],  // violet
  [220,  40, 200],  // magenta
];

function auroraBandColor(cx, intensity) {
  // hue shifts slowly across x and time
  const hueNoise = bnoise(cx * 0.03 + borT * 0.003, 88.1);
  const idx = hueNoise * (AURORA_BANDS.length - 1);
  const i0 = Math.floor(idx), i1 = Math.min(AURORA_BANDS.length-1, i0+1);
  const f = idx - i0;
  const c0 = AURORA_BANDS[i0], c1 = AURORA_BANDS[i1];
  const r = Math.floor((c0[0]*(1-f) + c1[0]*f) * intensity);
  const g = Math.floor((c0[1]*(1-f) + c1[1]*f) * intensity);
  const b = Math.floor((c0[2]*(1-f) + c1[2]*f) * intensity);
  return `rgb(${r},${g},${b})`;
}

// curtain chars — vertical strands
const CURTAIN_CHARS = [' ', '·', '|', '|', '!', 'i', '|', 'I', '‖'];

function borealisRender() {
  const cols = borW, rows = borH;
  const t = borT;
  let html = '';

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // horizontal wave: each curtain column sways over time
      const sway = bnoise(c * 0.04 + t * 0.008, 10.0) * 4
                 + bnoise(c * 0.09 + t * 0.014, 20.5) * 2;

      // aurora band — center in lower half, spread tall enough to reach upper screen
      const auroraCenter = rows * 0.50;
      const auroraSpread = rows * 0.38;
      const vertDist = Math.abs(r - auroraCenter + sway * 1.6);
      const vertEnvelope = Math.exp(-(vertDist*vertDist) / (auroraSpread*auroraSpread));

      // horizontal presence: flowing curtains
      const curtainNoise = bnoise(c * 0.06 + t * 0.009, 44.2) * 0.55
                         + bnoise(c * 0.14 + t * 0.015, 55.8) * 0.30
                         + bnoise(c * 0.28 + t * 0.022, 67.3) * 0.15;

      const intensity = vertEnvelope * curtainNoise;

      if (intensity < 0.06) { html += ' '; continue; }

      // brightness flicker along the curtain
      const flicker = bnoise(c * 0.1 + t * 0.04, r * 0.15 + 30) * 0.4 + 0.6;
      const brightness = Math.min(1, intensity * flicker * 3.0);

      const idx = Math.min(CURTAIN_CHARS.length-1, Math.floor(brightness * CURTAIN_CHARS.length));
      const ch = CURTAIN_CHARS[idx];
      if (ch === ' ') { html += ' '; continue; }

      html += `<span style="color:${auroraBandColor(c, brightness)}">${ch}</span>`;
    }
    html += '\n';
  }
  BOREALIS_EL.innerHTML = html;
}

function borealisFrame() {
  if (!borRunning) return;
  borT += 1.2;
  borealisRender();
  setTimeout(() => requestAnimationFrame(borealisFrame), 80 / (window._backdropSpeed || 1));
}

function borealisInit(cols) {
  const lineH = parseFloat(getComputedStyle(BOREALIS_EL).fontSize || '12') * 1.15;
  borH = Math.max(40, Math.ceil(window.innerHeight / lineH));
  borW = cols;
  borT = Math.random() * 500;
}

window.startBorealis = () => {
  if (borRunning) return;
  borealisInit(Math.max(60, Math.floor(window.innerWidth / 7.2)));
  borRunning = true;
  requestAnimationFrame(borealisFrame);
};

window.stopBorealis = () => {
  borRunning = false;
  BOREALIS_EL.innerHTML = '';
};

if (!localStorage.getItem('backdrop') || localStorage.getItem('backdrop') === 'borealis')
  window.startBorealis();
