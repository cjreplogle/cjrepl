const TB = document.getElementById('threebody');

const _tbProbe = document.createElement('pre');
_tbProbe.style.cssText = 'font-family:monospace;font-size:0.75rem;line-height:1.1;visibility:hidden;position:fixed;white-space:pre';
_tbProbe.textContent = 'X\nX\nX\nX\nX\nX\nX\nX\nX\nX';
document.body.appendChild(_tbProbe);
const _rect = _tbProbe.getBoundingClientRect();
const charTBW = _rect.width || 7;
const charTBH = (_rect.height / 10) || charTBW * 1.8;
document.body.removeChild(_tbProbe);

const ROWS = 30;
const TRAIL = 160;
const G = 1;
const SOFT = 0.05;
const DT = 0.003;
const STEPS_PER_FRAME = 3;
const BODY_CHARS = ['@', 'O', '*'];
const TRAIL_LEVELS = ['+', '-', '·', ' '];

// view: physics coords visible
let viewScale = 1.1; // half-width in physics units

let bodies, trails, tbRunning = false, tbPaused = false;
let dragIdx = -1;

const CONFIG_NAMES = ['figure-8', 'lagrange triangle', 'broucke', 'butterfly I', 'yin-yang I', 'random'];

const CONFIGS = [
  // figure-8 (Chenciner & Montgomery)
  [
    { x:  0.97000436, y: -0.24308753, vx:  0.46620368, vy:  0.43236573, m: 1 },
    { x: -0.97000436, y:  0.24308753, vx:  0.46620368, vy:  0.43236573, m: 1 },
    { x:  0.0,        y:  0.0,        vx: -0.93240737, vy: -0.86473146, m: 1 },
  ],
  // Lagrange equilateral triangle (slowly rotating)
  [
    { x:  1.0,   y:  0.0,         vx:  0.0,   vy:  0.5, m: 1 },
    { x: -0.5,   y:  0.8660254,   vx: -0.433, vy: -0.25, m: 1 },
    { x: -0.5,   y: -0.8660254,   vx:  0.433, vy: -0.25, m: 1 },
  ],
  // Broucke-Hadjidemetriou-Hénon (periodic figure)
  [
    { x:  0.3303,  y:  0.0,     vx:  0.0,      vy:  1.5189, m: 1 },
    { x: -0.3303,  y:  0.0,     vx:  0.0,      vy:  1.5189, m: 1 },
    { x:  0.0,     y:  0.0,     vx:  0.0,      vy: -3.0378, m: 2 },
  ],
  // butterfly I
  [
    { x:  1.0,  y:  0.0,  vx:  0.3066,  vy:  0.1253, m: 1 },
    { x: -1.0,  y:  0.0,  vx:  0.3066,  vy:  0.1253, m: 1 },
    { x:  0.0,  y:  0.0,  vx: -0.6132, vy: -0.2506, m: 1 },
  ],
  // yin-yang I
  [
    { x:  0.0,      y:  1.0,      vx:  0.5136, vy:  0.0,     m: 1 },
    { x:  0.0,      y: -1.0,      vx:  0.5136, vy:  0.0,     m: 1 },
    { x:  0.0,      y:  0.0,      vx: -1.0271, vy:  0.0,     m: 1 },
  ],
];

let configIndex = 0;

function setLabel(name) {
  const el = document.getElementById('tb-label');
  if (el) el.textContent = name;
}

function loadConfig(idx) {
  const p = CONFIGS[idx];
  bodies = p.map(b => ({ ...b }));
  trails = [[], [], []];
  const totalM = bodies.reduce((s, b) => s + b.m, 0);
  const cvx = bodies.reduce((s, b) => s + b.vx * b.m, 0) / totalM;
  const cvy = bodies.reduce((s, b) => s + b.vy * b.m, 0) / totalM;
  bodies.forEach(b => { b.vx -= cvx; b.vy -= cvy; });
  setLabel(CONFIG_NAMES[idx] ?? 'random');
}

function figure8() { configIndex = 0; loadConfig(0); }
function nextConfig() { configIndex = (configIndex + 1) % CONFIGS.length; loadConfig(configIndex); }

function randomIC() {
  setLabel('random');
  trails = [[], [], []];
  bodies = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const r = 0.7 + Math.random() * 0.4;
    const vscale = 0.55 + Math.random() * 0.35;
    bodies.push({ x: Math.cos(angle)*r, y: Math.sin(angle)*r, vx: -Math.sin(angle)*vscale, vy: Math.cos(angle)*vscale, m: 1 + Math.random()*0.4 });
  }
  const pvx = bodies.reduce((s,b) => s+b.vx*b.m, 0)/3;
  const pvy = bodies.reduce((s,b) => s+b.vy*b.m, 0)/3;
  bodies.forEach(b => { b.vx -= pvx; b.vy -= pvy; });
}

function accel(bs) {
  return bs.map((b, i) => {
    let ax = 0, ay = 0;
    bs.forEach((o, j) => {
      if (i === j) return;
      const dx = o.x - b.x, dy = o.y - b.y;
      const r2 = dx*dx + dy*dy + SOFT*SOFT;
      const f = G * o.m / (r2 * Math.sqrt(r2));
      ax += f*dx; ay += f*dy;
    });
    return { ax, ay };
  });
}

function rk4Step() {
  const s = bodies.map(b => ({ ...b }));
  const deriv = st => { const a = accel(st); return st.map((b,i) => ({ dx:b.vx, dy:b.vy, dvx:a[i].ax, dvy:a[i].ay })); };
  const add = (st,d,h) => st.map((b,i) => ({ ...b, x:b.x+d[i].dx*h, y:b.y+d[i].dy*h, vx:b.vx+d[i].dvx*h, vy:b.vy+d[i].dvy*h }));
  const k1=deriv(s), k2=deriv(add(s,k1,DT/2)), k3=deriv(add(s,k2,DT/2)), k4=deriv(add(s,k3,DT));
  bodies.forEach((b,i) => {
    b.x  += (k1[i].dx +2*k2[i].dx +2*k3[i].dx +k4[i].dx )*DT/6;
    b.y  += (k1[i].dy +2*k2[i].dy +2*k3[i].dy +k4[i].dy )*DT/6;
    b.vx += (k1[i].dvx+2*k2[i].dvx+2*k3[i].dvx+k4[i].dvx)*DT/6;
    b.vy += (k1[i].dvy+2*k2[i].dvy+2*k3[i].dvy+k4[i].dvy)*DT/6;
  });
}

function cols() { return Math.floor(TB.getBoundingClientRect().width / charTBW); }

// physics <-> grid
function physToGrid(px, py) {
  const c = cols(), cx = c/2, cy = ROWS/2;
  const W = c * charTBW, H = ROWS * charTBH;
  return { c: Math.round(cx + px / (viewScale * W / H) * cx), r: Math.round(cy + py / viewScale * cy) };
}

function gridToPhys(gc, gr) {
  const c = cols(), cx = c/2, cy = ROWS/2;
  const W = c * charTBW, H = ROWS * charTBH;
  return { x: (gc - cx) / cx * (viewScale * W / H), y: (gr - cy) / cy * viewScale };
}

function clientToGrid(clientX, clientY) {
  const rect = TB.getBoundingClientRect();
  return {
    c: Math.floor((clientX - rect.left) / charTBW),
    r: Math.floor((clientY - rect.top)  / charTBH),
  };
}

const COLORS = ['#ffaaaa', '#aaffaa', '#aaaaff'];

function tbRender() {
  const c = cols();
  const grid = Array.from({ length: ROWS }, () => Array(c).fill({ ch: ' ', color: null }));
  function plot(px, py, ch, color) {
    const { c: gc, r: gr } = physToGrid(px, py);
    if (gc >= 0 && gc < c && gr >= 0 && gr < ROWS) grid[gr][gc] = { ch, color };
  }
  trails.forEach((trail, i) => {
    const step = Math.max(1, Math.floor(trail.length / 50));
    for (let t = 0; t < trail.length; t += step) {
      const age = t / trail.length;
      const lvl = age < 0.25 ? 3 : age < 0.55 ? 2 : age < 0.8 ? 1 : 0;
      const ch = TRAIL_LEVELS[lvl];
      if (ch !== ' ') plot(trail[t].x, trail[t].y, ch, COLORS[i]);
    }
  });
  bodies.forEach((b, i) => plot(b.x, b.y, BODY_CHARS[i], COLORS[i]));

  let html = '';
  for (let r = 0; r < ROWS; r++) {
    for (let gc = 0; gc < c; gc++) {
      const { ch, color } = grid[r][gc];
      html += color ? `<span style="color:${color}">${ch}</span>` : ch;
    }
    html += '\n';
  }
  TB.innerHTML = html;
}

function escaped() {
  return bodies.some(b => Math.abs(b.x) > viewScale*3 || Math.abs(b.y) > viewScale*3);
}

function tbStep() {
  if (!tbRunning) return;
  if (!document.getElementById('tb-content').classList.contains('active')) { requestAnimationFrame(tbStep); return; }
  if (!tbPaused) {
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      if (dragIdx >= 0) {
        // pin dragged body to cursor each sub-step
        bodies[dragIdx].x = dragPhysX;
        bodies[dragIdx].y = dragPhysY;
        bodies[dragIdx].vx = 0;
        bodies[dragIdx].vy = 0;
      }
      rk4Step();
      if (dragIdx >= 0) {
        bodies[dragIdx].x = dragPhysX;
        bodies[dragIdx].y = dragPhysY;
        bodies[dragIdx].vx = 0;
        bodies[dragIdx].vy = 0;
      }
      bodies.forEach((b, i) => {
        trails[i].push({ x: b.x, y: b.y });
        if (trails[i].length > TRAIL) trails[i].shift();
      });
    }
    if (escaped()) loadConfig(configIndex);
  }
  tbRender();
  requestAnimationFrame(tbStep);
}

let clickHitBody = -1;
let dragPhysX = 0, dragPhysY = 0;
let dragVelX = 0, dragVelY = 0;
let lastDragPhysX = 0, lastDragPhysY = 0, lastDragTime = 0;

// drag interaction
let mouseDownX = 0, mouseDownY = 0;
TB.addEventListener('mousedown', e => {
  didDrag = false;
  mouseDownX = e.clientX; mouseDownY = e.clientY;
  const { c: gc, r: gr } = clientToGrid(e.clientX, e.clientY);
  let best = -1, bestD = 8;
  bodies.forEach((b, i) => {
    const { c: bc, r: br } = physToGrid(b.x, b.y);
    const d = Math.abs(gc - bc) + Math.abs(gr - br);
    if (d < bestD) { bestD = d; best = i; }
  });
  clickHitBody = best;
  if (best >= 0) {
    dragIdx = best;
    trails[best] = [];
    setLabel('chaos');
    const { x, y } = gridToPhys(gc, gr);
    dragPhysX = x; dragPhysY = y;
    lastDragPhysX = x; lastDragPhysY = y;
    lastDragTime = performance.now();
    dragVelX = 0; dragVelY = 0;
    TB.style.cursor = 'grabbing';
  }
});

let didDrag = false;
window.addEventListener('mousemove', e => {
  if (dragIdx === -1) return;
  const dx = e.clientX - mouseDownX, dy = e.clientY - mouseDownY;
  if (dx*dx + dy*dy > 16) { didDrag = true; clickHitBody = -1; }
  const { c: gc, r: gr } = clientToGrid(e.clientX, e.clientY);
  const { x, y } = gridToPhys(gc, gr);
  const now = performance.now();
  const dt = now - lastDragTime;
  if (dt > 0) {
    dragVelX = (x - lastDragPhysX) / dt * 16;
    dragVelY = (y - lastDragPhysY) / dt * 16;
  }
  lastDragPhysX = x; lastDragPhysY = y; lastDragTime = now;
  dragPhysX = x; dragPhysY = y;
});

window.addEventListener('mouseup', () => {
  if (dragIdx >= 0) {
    bodies[dragIdx].vx = dragVelX;
    bodies[dragIdx].vy = dragVelY;
  }
  dragIdx = -1;
  TB.style.cursor = 'default';
});

document.addEventListener('keydown', e => {
  if (e.key === ' ' && document.getElementById('tb-content').classList.contains('active')) {
    e.preventDefault();
    tbPaused = !tbPaused;
  }
  if (e.key === 'r' && document.getElementById('tb-content').classList.contains('active')) {
    loadConfig(configIndex);
  }
});

let clickTimer = null;

TB.addEventListener('dblclick', () => {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
  randomIC();
});

TB.addEventListener('click', () => {
  if (didDrag) return;
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
  clickTimer = setTimeout(() => {
    clickTimer = null;
    if (clickHitBody >= 0) {
      const b = bodies[clickHitBody];
      const angle = Math.random() * Math.PI * 2;
      const strength = 0.3 + Math.random() * 0.4;
      b.vx += Math.cos(angle) * strength;
      b.vy += Math.sin(angle) * strength;
      trails[clickHitBody] = [];
      setLabel('chaos');
    } else {
      nextConfig();
    }
  }, 220);
});

// touch drag — mirrors mouse logic with wider hit radius for fingers
let touchDragging = false;
Object.defineProperty(window, '_tbTouchDragging', { get: () => touchDragging });

TB.addEventListener('touchstart', e => {
  const t = e.touches[0];
  const { c: gc, r: gr } = clientToGrid(t.clientX, t.clientY);
  let best = -1, bestD = 14; // wider hit radius for touch
  bodies.forEach((b, i) => {
    const { c: bc, r: br } = physToGrid(b.x, b.y);
    const d = Math.abs(gc - bc) + Math.abs(gr - br);
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best >= 0) {
    touchDragging = true;
    e.preventDefault(); // block scroll only when grabbing a body
    dragIdx = best;
    trails[best] = [];
    setLabel('chaos');
    const { x, y } = gridToPhys(gc, gr);
    dragPhysX = x; dragPhysY = y;
    lastDragPhysX = x; lastDragPhysY = y;
    lastDragTime = performance.now();
    dragVelX = 0; dragVelY = 0;
  }
}, { passive: false });

TB.addEventListener('touchmove', e => {
  if (!touchDragging || dragIdx === -1) return;
  e.preventDefault();
  const t = e.touches[0];
  const { c: gc, r: gr } = clientToGrid(t.clientX, t.clientY);
  const { x, y } = gridToPhys(gc, gr);
  const now = performance.now();
  const dt = now - lastDragTime;
  if (dt > 0) {
    dragVelX = (x - lastDragPhysX) / dt * 16;
    dragVelY = (y - lastDragPhysY) / dt * 16;
  }
  lastDragPhysX = x; lastDragPhysY = y; lastDragTime = now;
  dragPhysX = x; dragPhysY = y;
}, { passive: false });

TB.addEventListener('touchend', e => {
  if (!touchDragging) return;
  touchDragging = false;
  if (dragIdx >= 0) {
    bodies[dragIdx].vx = dragVelX;
    bodies[dragIdx].vy = dragVelY;
  }
  dragIdx = -1;
});

const tbObserver = new MutationObserver(() => {
  if (document.getElementById('tb-content').classList.contains('active') && !tbRunning) {
    tbRunning = true;
    loadConfig(0);
    requestAnimationFrame(tbStep);
  }
});
tbObserver.observe(document.getElementById('tb-content'), { attributes: true, attributeFilter: ['class'] });
