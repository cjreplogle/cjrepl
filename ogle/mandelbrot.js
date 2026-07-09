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
_probe.style.cssText = 'font-family:monospace;font-size:0.6rem;visibility:hidden;position:fixed';
_probe.textContent = 'X';
document.body.appendChild(_probe);
const charW = _probe.getBoundingClientRect().width || 7;
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

function mbRender() {
  const cols = Math.max(20, Math.floor(window.innerWidth / Math.max(1, charW)));
  const rows = 30;
  let out = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = viewX + (c / cols - 0.5) * zoom * 2.1;
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
MB.addEventListener('click', () => {
  if (!document.getElementById('mb-content').classList.contains('active')) return;
  if (mbClickTimer) { clearTimeout(mbClickTimer); mbClickTimer = null; return; }
  mbClickTimer = setTimeout(() => {
    mbClickTimer = null;
    if (tourTimer) mbPaused = !mbPaused;
  }, 220);
});

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
  const cols = Math.max(20, Math.floor(window.innerWidth / Math.max(1, charW)));
  viewX -= (e.clientX - lastX) / cols * zoom * 2.1 * 0.3;
  viewY -= (e.clientY - lastY) / 20 * zoom * 0.3;
  lastX = e.clientX; lastY = e.clientY;
  mbRender();
});

MB.addEventListener('wheel', e => {
  if (!document.getElementById('mb-content').classList.contains('active')) return;
  e.preventDefault();
  zoom *= e.deltaY > 0 ? 1.1 : 0.9;
  mbRender();
}, { passive: false });

let lastTX, lastTY;
MB.addEventListener('touchstart', e => { lastTX = e.touches[0].clientX; lastTY = e.touches[0].clientY; });
MB.addEventListener('touchmove', e => {
  e.preventDefault();
  const cols = Math.max(20, Math.floor(window.innerWidth / Math.max(1, charW)));
  viewX -= (e.touches[0].clientX - lastTX) / cols * zoom * 2.1 * 0.3;
  viewY -= (e.touches[0].clientY - lastTY) / 20 * zoom * 0.3;
  lastTX = e.touches[0].clientX; lastTY = e.touches[0].clientY;
  mbRender();
}, { passive: false });

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
