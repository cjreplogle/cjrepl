const FIRE_EL = document.getElementById('fire');
const _mob = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
const FIRE_ROWS = 55;
const MAX_HEAT = 48;

const FIRE_CHARS = '      .\',`^:;i|/\\1tj()[]?+*#@';

let fireW = 0, heat = [], fireRunning = false;
let mouseCol = -1;

const fireMoveHandler = e => {
  mouseCol = Math.floor(e.clientX / (window.innerWidth / fireW));
};
const fireLeaveHandler = () => { mouseCol = -1; };

function fireColor(h) {
  const v = Math.floor(80 + (h / MAX_HEAT) * 160);
  return `rgb(${v},${v},${v})`;
}

function fireInit(cols) {
  fireW = cols;
  heat = Array.from({ length: FIRE_ROWS }, () => new Array(cols).fill(0));
  for (let c = 0; c < cols; c++) heat[FIRE_ROWS - 1][c] = MAX_HEAT;
}

function fireStep() {
  const cols = fireW;
  for (let c = 0; c < cols; c++) {
    const distToCursor = mouseCol >= 0 ? Math.abs(c - mouseCol) : Infinity;
    const cursorBoost = distToCursor < 6 ? Math.max(0, (6 - distToCursor) / 6) * 18 : 0;
    heat[FIRE_ROWS - 1][c] = Math.min(MAX_HEAT, MAX_HEAT - Math.floor(Math.random() * 8) + cursorBoost);
    heat[FIRE_ROWS - 2][c] = Math.min(MAX_HEAT, MAX_HEAT - Math.floor(Math.random() * 14) + cursorBoost * 0.6);
  }
  for (let r = 0; r < FIRE_ROWS - 2; r++) {
    for (let c = 0; c < cols; c++) {
      const b  = heat[r + 1][c];
      const bl = heat[r + 1][Math.max(0, c - 1)];
      const br = heat[r + 1][Math.min(cols - 1, c + 1)];
      const b2 = heat[r + 2][c];
      const avg = (b + bl + br + b2) / 4;
      const decay = Math.random() < 0.5 ? Math.floor(Math.random() * 4) + 1 : 0;
      heat[r][c] = Math.max(0, Math.round(avg) - decay);
    }
  }
}

function fireRender() {
  const cols = fireW;
  let html = '';
  for (let r = 0; r < FIRE_ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const h = heat[r][c];
      if (h === 0) { html += ' '; continue; }
      const idx = Math.min(Math.floor(h / MAX_HEAT * (FIRE_CHARS.length - 1)), FIRE_CHARS.length - 1);
      const ch = FIRE_CHARS[idx];
      if (ch === ' ') { html += ' '; continue; }
      html += `<span style="color:${fireColor(h)}">${ch}</span>`;
    }
    html += '\n';
  }
  FIRE_EL.innerHTML = html;
}

function fireFrame() {
  if (!fireRunning) return;
  fireStep();
  fireRender();
  setTimeout(() => requestAnimationFrame(fireFrame), (_mob?120:60) / (window._backdropSpeed || 1));
}

window.startFire = () => {
  if (fireRunning) return;
  fireInit((function(){var el=document.getElementById("fire");var w=el?el.getBoundingClientRect().width||window.innerWidth:window.innerWidth;var p=document.createElement("span");p.style.cssText="font-family:monospace;font-size:0.75rem;visibility:hidden;position:fixed";p.textContent="X";document.body.appendChild(p);var cw=p.getBoundingClientRect().width||7.2;document.body.removeChild(p);return Math.ceil(w/cw);})());
  fireRunning = true;
  window.addEventListener('mousemove', fireMoveHandler);
  window.addEventListener('mouseleave', fireLeaveHandler);
  requestAnimationFrame(fireFrame);
};

window.stopFire = () => {
  fireRunning = false;
  window.removeEventListener('mousemove', fireMoveHandler);
  window.removeEventListener('mouseleave', fireLeaveHandler);
  FIRE_EL.innerHTML = '';
};

if (localStorage.getItem('backdrop') === 'fire')
  window.startFire();
