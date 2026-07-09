let borCanvas, borCtx;
let borW = 0, borH = 0, borCW = 0, borCH = 0;
let borRunning = false;
let borT = 0;

const BOR_NZ = 256;
const borNoise = new Float32Array(BOR_NZ * BOR_NZ);
for (let i = 0; i < borNoise.length; i++) borNoise[i] = Math.random();

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

const AURORA_BANDS = [
  [  0, 255, 120],
  [  0, 230, 200],
  [  0, 180, 255],
  [ 80, 100, 255],
  [160,  60, 255],
  [220,  40, 200],
];

function auroraBandColor(cx, intensity) {
  const idx = bnoise(cx * 0.03 + borT * 0.003, 88.1) * (AURORA_BANDS.length - 1);
  const i0 = Math.floor(idx), i1 = Math.min(AURORA_BANDS.length-1, i0+1);
  const f = idx - i0;
  const c0 = AURORA_BANDS[i0], c1 = AURORA_BANDS[i1];
  return [
    (c0[0]*(1-f) + c1[0]*f) * intensity,
    (c0[1]*(1-f) + c1[1]*f) * intensity,
    (c0[2]*(1-f) + c1[2]*f) * intensity,
  ];
}

const CURTAIN_CHARS = [' ','·','|','|','!','i','|','I','‖'];

function borealisRender() {
  const cols = borW, rows = borH, t = borT;
  const ctx = borCtx;
  ctx.clearRect(0, 0, borCanvas.width, borCanvas.height);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sway = bnoise(c*0.04+t*0.008, 10.0)*4 + bnoise(c*0.09+t*0.014, 20.5)*2;
      const auroraCenter = rows * 0.50;
      const auroraSpread = rows * 0.38;
      const vertDist = Math.abs(r - auroraCenter + sway * 1.6);
      const vertEnvelope = Math.exp(-(vertDist*vertDist) / (auroraSpread*auroraSpread));
      const curtainNoise = bnoise(c*0.06+t*0.009, 44.2)*0.55
                         + bnoise(c*0.14+t*0.015, 55.8)*0.30
                         + bnoise(c*0.28+t*0.022, 67.3)*0.15;
      const intensity = vertEnvelope * curtainNoise;
      if (intensity < 0.06) continue;

      const flicker = bnoise(c*0.1+t*0.04, r*0.15+30)*0.4 + 0.6;
      const brightness = Math.min(1, intensity * flicker * 3.0);
      const idx = Math.min(CURTAIN_CHARS.length-1, Math.floor(brightness * CURTAIN_CHARS.length));
      const ch = CURTAIN_CHARS[idx];
      if (ch === ' ') continue;

      const [r2, g2, b2] = auroraBandColor(c, brightness);
      ctx.fillStyle = `rgb(${r2|0},${g2|0},${b2|0})`;
      ctx.fillText(ch, c * borCW, r * borCH + borCH * 0.85);
    }
  }
}

function borealisFrame() {
  if (!borRunning) return;
  borT += 1.2;
  borealisRender();
  const _isMobile = window.innerWidth < 768;
  setTimeout(() => requestAnimationFrame(borealisFrame), (_isMobile ? 160 : 80) / (window._backdropSpeed || 1));
}

function borealisInit() {
  const fireEl = document.getElementById('fire');
  if (!borCanvas) {
    borCanvas = document.createElement('canvas');
    borCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none';
    fireEl.parentElement.appendChild(borCanvas);
    borCtx = borCanvas.getContext('2d');
  }
  const fontSize = parseFloat(getComputedStyle(fireEl).fontSize) || 12;
  borCtx.font = `${fontSize}px monospace`;
  const metrics = borCtx.measureText('M');
  borCW = metrics.width;
  borCH = fontSize * 1.15;
  borCanvas.width  = Math.ceil(window.innerWidth);
  borCanvas.height = Math.ceil(window.innerHeight);
  borCtx.font = `${fontSize}px monospace`;
  borW = Math.ceil(borCanvas.width  / borCW);
  borH = Math.ceil(borCanvas.height / borCH);
  borT = Math.random() * 500;
}

window.startBorealis = () => {
  if (borRunning) return;
  borealisInit();
  borRunning = true;
  requestAnimationFrame(borealisFrame);
};

window.stopBorealis = () => {
  borRunning = false;
  if (borCanvas) {
    borCtx.clearRect(0, 0, borCanvas.width, borCanvas.height);
    borCanvas.remove();
    borCanvas = null; borCtx = null;
  }
};

if (!localStorage.getItem('backdrop') || localStorage.getItem('backdrop') === 'borealis')
  window.startBorealis();
