(function(){
const RAYS_EL = document.getElementById('fire');
const _mob = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
let raysW = 0, raysH = 0;
let raysRunning = false;
let raysGrid = [], raysActive = [];

const RAY_CHARS = ' ·.,:-=+*#@';

function raysInit(cols) {
  const lineH = parseFloat(getComputedStyle(RAYS_EL).fontSize || '12') * 1.15;
  raysH = Math.max(40, Math.ceil(window.innerHeight / lineH));
  raysW = cols;
  raysGrid = Array.from({ length: raysH }, () => new Float32Array(raysW));
  raysActive = [];
}

function spawnRay() {
  // pick a random edge to enter from
  const horiz = Math.random() < 0.7; // bias toward horizontal sweeps
  const angle = (Math.random() - 0.5) * (horiz ? 0.4 : 0.5); // tight spread
  const speed = 2.5 + Math.random() * 4;
  const trailLen = 12 + Math.floor(Math.random() * 28);
  const intensity = 0.7 + Math.random() * 0.3;
  // slight perpendicular width: 1-3 parallel lines offset
  const width = Math.floor(Math.random() * 3);

  let x, y, dx, dy;
  if (horiz) {
    const fromLeft = Math.random() < 0.5;
    x = fromLeft ? -trailLen : raysW + trailLen;
    y = Math.random() * raysH;
    dx = (fromLeft ? 1 : -1) * Math.cos(angle) * speed;
    dy = Math.sin(angle) * speed * 0.5; // aspect-ratio correction
  } else {
    const fromTop = Math.random() < 0.5;
    x = Math.random() * raysW;
    y = fromTop ? -trailLen : raysH + trailLen;
    dx = Math.sin(angle) * speed;
    dy = (fromTop ? 1 : -1) * Math.cos(angle) * speed * 0.5;
  }

  return { x, y, dx, dy, trail: [], trailLen, intensity, width, dead: false };
}

function raysStep() {
  // decay
  for (let r = 0; r < raysH; r++)
    for (let c = 0; c < raysW; c++)
      raysGrid[r][c] *= 0.78;

  // spawn
  if (Math.random() < 0.12) raysActive.push(spawnRay());

  for (const ray of raysActive) {
    ray.trail.push({ x: ray.x, y: ray.y });
    if (ray.trail.length > ray.trailLen) ray.trail.shift();

    ray.x += ray.dx;
    ray.y += ray.dy;

    // write trail to grid: brightest at head, fades toward tail
    for (let i = 0; i < ray.trail.length; i++) {
      const t = (i + 1) / ray.trail.length; // 0=tail, 1=head
      const brightness = ray.intensity * t * t;
      const { x, y } = ray.trail[i];
      // write across perpendicular width
      for (let w = -ray.width; w <= ray.width; w++) {
        const wFade = 1 - Math.abs(w) / (ray.width + 1);
        const col = Math.round(x) + w;
        const row = Math.round(y);
        if (row >= 0 && row < raysH && col >= 0 && col < raysW)
          raysGrid[row][col] = Math.max(raysGrid[row][col], brightness * wFade);
      }
    }

    if (ray.x < -ray.trailLen - 5 || ray.x > raysW + ray.trailLen + 5 ||
        ray.y < -ray.trailLen - 5 || ray.y > raysH + ray.trailLen + 5)
      ray.dead = true;
  }

  raysActive = raysActive.filter(r => !r.dead);
}

function raysRender() {
  let html = '';
  for (let r = 0; r < raysH; r++) {
    for (let c = 0; c < raysW; c++) {
      const v = raysGrid[r][c];
      if (v < 0.02) { html += ' '; continue; }
      const idx = Math.min(RAY_CHARS.length - 1, Math.floor(v * (RAY_CHARS.length - 1)));
      const ch = RAY_CHARS[idx];
      const lum = Math.floor(120 + v * 135);
      html += `<span style="color:rgb(${Math.floor(lum*0.75)},${Math.floor(lum*0.9)},${lum})">${ch}</span>`;
    }
    html += '\n';
  }
  RAYS_EL.innerHTML = html;
}

function raysFrame() {
  if (!raysRunning) return;
  raysStep();
  raysRender();
  _raysFrameTimer = setTimeout(() => requestAnimationFrame(raysFrame), (_mob?80:40) / (window._backdropSpeed || 1));
}

function _raysCols() { return Math.ceil(window.innerWidth * 1.15 / 6); }
function raysResize(newCols) {
  if (newCols <= raysW) { raysW = newCols; return; }
  for (let r = 0; r < raysH; r++) {
    const nr = new Float32Array(newCols); nr.set(raysGrid[r]); raysGrid[r] = nr;
  }
  raysW = newCols;
}

window.startRays = () => {
  if (raysRunning) return;
  raysInit(_raysCols());
  raysRunning = true;
  requestAnimationFrame(raysFrame);
};

window.stopRays = () => {
  raysRunning = false;
  clearTimeout(_raysFrameTimer);
  RAYS_EL.innerHTML = '';
  raysGrid = []; raysActive = [];
};

let _raysResizeTimer, _raysFrameTimer;
window.addEventListener('resize', () => {
  if (!raysRunning) return;
  clearTimeout(_raysResizeTimer);
  _raysResizeTimer = setTimeout(() => { if (raysRunning) raysResize(_raysCols()); }, 100);
});

if (localStorage.getItem('backdrop') === 'rays')
  window.startRays();
})();
