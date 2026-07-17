const MB = document.getElementById('mandelbrot');
const CHARS = ' .,-:;~=+!?*tucXYUJCQ0OZmwpdbao#MW&8%B@$';
let MAX_ITER = 100;
let viewX = -0.5, viewY = 0.0, zoom = 1.67;
let mbPaused = false;

document.addEventListener('keydown', e => {
  if (e.key === ' ' && document.getElementById('mb-content').classList.contains('active')) {
    e.preventDefault();
    mbPaused = !mbPaused;
  }
});

const _probe = document.createElement('span');
_probe.style.cssText = 'font-family:monospace;font-size:0.6rem;line-height:1.1;visibility:hidden;position:fixed';
_probe.textContent = 'X';
document.body.appendChild(_probe);
const charW = _probe.getBoundingClientRect().width || 7;
const charH = _probe.getBoundingClientRect().height || 11;
document.body.removeChild(_probe);

function mandelbrot(cx, cy) {
  let x = 0, y = 0, i = 0;
  while (x*x + y*y <= 4 && i < MAX_ITER) {
    const xn = x*x - y*y + cx;
    y = 2*x*y + cy;
    x = xn;
    i++;
  }
  return i;
}

function mbXSpan(cols) {
  // x span matches visual aspect ratio so widening shows more, not zooms in
  return zoom * (cols * charW) / (30 * charH);
}

function mbRender() {
  const cols = Math.max(20, Math.floor(MB.getBoundingClientRect().width / Math.max(1, charW)));
  const rows = 30;
  const xSpan = mbXSpan(cols);
  let out = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = viewX + (c / cols - 0.5) * xSpan;
      const cy = viewY + (r / rows - 0.5) * zoom;
      const n = mandelbrot(cx, cy);
      const idx = n === MAX_ITER ? 0 : Math.floor(n / MAX_ITER * (CHARS.length - 1)) + 1;
      out += CHARS[idx];
    }
    out += '\n';
  }
  MB.textContent = out;
}

const TOUR = [
  { name: 'seahorse valley',  x: -0.745,  y:  0.10,  endZoom: 0.3  },
  { name: 'feigenbaum point', x: -1.4012, y:  0.0,   endZoom: 0.25 },
  { name: 'triple spiral',    x: -0.1592, y:  1.0317, endZoom: 0.3  },
  { name: 'mini mandelbrot',  x:  0.360,  y:  0.10,  endZoom: 0.3  },
  { name: 'tip of needle',    x: -1.755,  y:  0.0,   endZoom: 0.25 },
];
let tourTimer = null, tourIndex = 0;

function setMbLabel(text) {
  const el = document.getElementById('mb-label');
  if (el) el.textContent = text;
}

function resetTour() {
  if (tourTimer) { cancelAnimationFrame(tourTimer); tourTimer = null; }
  zoom = 1.67; viewX = -0.5; viewY = 0; MAX_ITER = 100;
  setMbLabel('');
  mbRender();
}

function runTour() {
  const target = TOUR[tourIndex % TOUR.length];
  tourIndex++;
  setMbLabel(target.name);
  const startZoom = zoom, startX = viewX, startY = viewY;
  const duration = 7000;

  let elapsed = 0, lastTime = null;
  function step(now) {
    if (!mbPaused) {
      const delta = lastTime ? now - lastTime : 0;
      elapsed = Math.min(elapsed + delta, duration);
      const t = elapsed / duration;
      zoom = startZoom * Math.pow(target.endZoom / startZoom, t);
      viewX = startX + (target.x - startX) * t;
      viewY = startY + (target.y - startY) * t;
      MAX_ITER = Math.min(300, Math.floor(100 + Math.log2(startZoom / zoom) * 15));
      mbRender();
      if (t >= 1) { continueZoom(target); return; }
    }
    lastTime = now;
    tourTimer = requestAnimationFrame(step);
  }
  tourTimer = requestAnimationFrame(step);
}

function continueZoom(target) {
  function zoomIn() {
    if (!mbPaused) {
      zoom *= 0.994;
      MAX_ITER = Math.min(400, Math.floor(100 + Math.log2(1.67 / zoom) * 15));
      mbRender();
    }
    if (zoom > 2e-4) { tourTimer = requestAnimationFrame(zoomIn); return; }
    // max depth reached — zoom back out
    setMbLabel(target.name + ' ↑');
    zoomOut(target);
  }

  function zoomOut(target) {
    const peakZoom = zoom;
    const duration = 5000;
    let elapsed = 0, lastTime = null;
    function step(now) {
      if (!mbPaused) {
        const delta = lastTime ? now - lastTime : 0;
        elapsed = Math.min(elapsed + delta, duration);
        const t = elapsed / duration;
        zoom = peakZoom * Math.pow(1.67 / peakZoom, t);
        MAX_ITER = Math.max(100, Math.floor(100 + Math.log2(1.67 / zoom) * 15));
        mbRender();
        if (t >= 1) {
          viewX = -0.5; viewY = 0; zoom = 1.67; MAX_ITER = 100;
          setMbLabel('');
          setTimeout(runTour, 800);
          return;
        }
      }
      lastTime = now;
      tourTimer = requestAnimationFrame(step);
    }
    tourTimer = requestAnimationFrame(step);
  }

  tourTimer = requestAnimationFrame(zoomIn);
}

let mbClickTimer = null;
let mbFocused = false;
MB.addEventListener('click', () => {
  if (!document.getElementById('mb-content').classList.contains('active')) return;
  mbFocused = true;
  MB.style.outline = '1px solid rgba(255,255,255,0.2)';
  if (mbClickTimer) { clearTimeout(mbClickTimer); mbClickTimer = null; return; }
  mbClickTimer = setTimeout(() => {
    mbClickTimer = null;
    if (tourTimer) mbPaused = !mbPaused;
  }, 220);
});
window.addEventListener('click', e => {
  if (!MB.contains(e.target)) { mbFocused = false; MB.style.outline = ''; }
}, true);

MB.addEventListener('dblclick', () => {
  if (!document.getElementById('mb-content').classList.contains('active')) return;
  if (tourTimer) { resetTour(); return; }
  runTour();
});

let dragging = false, lastX, lastY;
MB.addEventListener('mousedown', e => {
  if (!document.getElementById('mb-content').classList.contains('active')) return;
  dragging = true; lastX = e.clientX; lastY = e.clientY; MB.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', () => { dragging = false; MB.style.cursor = 'grab'; });
window.addEventListener('mousemove', e => {
  if (!dragging) return;
  const cols = Math.max(20, Math.floor(MB.getBoundingClientRect().width / Math.max(1, charW)));
  viewX -= (e.clientX - lastX) / cols * mbXSpan(cols) * 0.3;
  viewY -= (e.clientY - lastY) / 20 * zoom * 0.3;
  lastX = e.clientX; lastY = e.clientY;
  mbRender();
});

MB.addEventListener('wheel', e => {
  if (!document.getElementById('mb-content').classList.contains('active')) return;
  if (!mbFocused) return;
  e.preventDefault();
  zoom *= e.deltaY > 0 ? 1.1 : 0.9;
  mbRender();
}, { passive: false });

let lastTX, lastTY, lastPinchDist = null, lastTapTime = 0;

function _mbPinchDist(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.hypot(dx, dy);
}

MB.addEventListener('touchstart', e => {
  if (e.touches.length === 1) {
    lastTX = e.touches[0].clientX;
    lastTY = e.touches[0].clientY;
    lastPinchDist = null;

    // Double-tap to tour
    const now = Date.now();
    if (now - lastTapTime < 300) {
      if (!document.getElementById('mb-content').classList.contains('active')) return;
      tourTimer ? resetTour() : runTour();
    }
    lastTapTime = now;
  } else if (e.touches.length === 2) {
    lastPinchDist = _mbPinchDist(e);
    e.preventDefault();
  }
}, { passive: false });

MB.addEventListener('touchmove', e => {
  e.preventDefault();
  const cols = Math.max(20, Math.floor(MB.getBoundingClientRect().width / Math.max(1, charW)));

  if (e.touches.length === 2) {
    // Pinch to zoom
    const dist = _mbPinchDist(e);
    if (lastPinchDist) {
      const ratio = lastPinchDist / dist;
      // Zoom toward pinch midpoint
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = MB.getBoundingClientRect();
      const fx = (mx - rect.left) / rect.width  - 0.5;
      const fy = (my - rect.top)  / rect.height - 0.5;
      viewX += fx * mbXSpan(cols) * (1 - ratio);
      viewY += fy * zoom * (1 - ratio);
      zoom  *= ratio;
      zoom   = Math.max(1e-6, Math.min(4, zoom));
    }
    lastPinchDist = dist;
    lastTX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    lastTY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  } else if (e.touches.length === 1 && lastPinchDist === null) {
    // Single-finger pan
    viewX -= (e.touches[0].clientX - lastTX) / cols * mbXSpan(cols) * 0.3;
    viewY -= (e.touches[0].clientY - lastTY) / 20 * zoom * 0.3;
    lastTX = e.touches[0].clientX;
    lastTY = e.touches[0].clientY;
  }
  mbRender();
}, { passive: false });

MB.addEventListener('touchend', e => {
  if (e.touches.length < 2) lastPinchDist = null;
}, { passive: true });

let mbLoopRunning = false;

function mbLoop() {
  if (!mbLoopRunning) return;
  if (document.getElementById('mb-content').classList.contains('active') && !tourTimer) mbRender();
  setTimeout(mbLoop, 2000);
}

window.mbOpen = function() {
  if (!mbLoopRunning) {
    mbLoopRunning = true;
    setTimeout(() => { mbRender(); mbLoop(); }, 400);
  } else {
    setTimeout(mbRender, 400);
  }
};

let _mbResizeTimer;
window.addEventListener('resize', () => {
  if (!mbLoopRunning) return;
  clearTimeout(_mbResizeTimer);
  _mbResizeTimer = setTimeout(mbRender, 80);
});
