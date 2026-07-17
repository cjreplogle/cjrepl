const WATER_EL = document.getElementById('fire');
const _mob = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;

let waterW = 0, waterRunning = false, waterT = 0;
let _waterFrameTimer, _waterResizeTimer, _waterRafId;

const ROWS = 22; // total rows rendered

function _waterCols() { return Math.ceil(window.innerWidth * 1.15 / 6); }

// Returns surface row index (0 = top of ROWS block)
function surfRow(col, t) {
  const h =
    2.2 * Math.sin(0.038 * col + 0.55 * t) +
    1.2 * Math.sin(0.071 * col - 0.80 * t + 1.4) +
    0.6 * Math.sin(0.118 * col + 1.35 * t + 2.7) +
    0.3 * Math.sin(0.190 * col - 1.90 * t + 0.6);
  const maxH = 4.3;
  // map [-maxH, maxH] → [1, ROWS-5], so bottom rows always filled
  return Math.round(1 + (h / maxH + 1) * 0.5 * (ROWS - 7));
}

// Color: bright at crest, deeper blue below
function wc(r, g, b) { return `rgb(${r},${g},${b})`; }
const CREST_COLORS  = [wc(210,238,255), wc(190,225,255), wc(170,215,255)];
const BODY_COLORS   = [wc(90,160,230), wc(60,130,205), wc(40,100,180), wc(25,75,155), wc(15,55,130)];
const DEEP_COLOR    = wc(10,40,110);

function waterRender() {
  const cols = waterW, t = waterT;

  // precompute surface row per column
  const surf = new Int32Array(cols);
  for (let c = 0; c < cols; c++) surf[c] = surfRow(c, t);

  let html = '';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < cols; c++) {
      const s = surf[c];
      if (r < s) {
        html += ' ';
        continue;
      }
      if (r === s) {
        // crest — pick char by local slope
        const sl = surf[Math.min(cols - 1, c + 2)] - surf[Math.max(0, c - 2)];
        const ch = sl < -1 ? '\'' : sl > 1 ? '.' : '~';
        const col_i = Math.abs(sl) > 2 ? 0 : Math.abs(sl) > 0 ? 1 : 2;
        html += `<span style="color:${CREST_COLORS[col_i]}">${ch}</span>`;
        continue;
      }
      const depth = r - s; // 1 = just below crest
      let ch, color;
      if (depth === 1)      { ch = '~'; color = BODY_COLORS[0]; }
      else if (depth === 2) { ch = '-'; color = BODY_COLORS[1]; }
      else if (depth === 3) { ch = '~'; color = BODY_COLORS[2]; }
      else if (depth === 4) { ch = '-'; color = BODY_COLORS[3]; }
      else if (depth === 5) { ch = '~'; color = BODY_COLORS[4]; }
      else                  { ch = '='; color = DEEP_COLOR; }
      html += `<span style="color:${color}">${ch}</span>`;
    }
    html += '\n';
  }
  WATER_EL.innerHTML = html;
}

function waterFrame() {
  if (!waterRunning) return;
  waterT += 0.035 * (window._backdropSpeed || 1);
  waterRender();
  _waterFrameTimer = setTimeout(() => { _waterRafId = requestAnimationFrame(waterFrame); }, _mob ? 50 : 33);
}

window.startWater = () => {
  if (waterRunning) return;
  waterW = _waterCols();
  waterT = Math.random() * 100;
  waterRunning = true;
  requestAnimationFrame(waterFrame);
};

window.stopWater = () => {
  waterRunning = false;
  clearTimeout(_waterFrameTimer);
  cancelAnimationFrame(_waterRafId);
  WATER_EL.innerHTML = '';
};

window.addEventListener('resize', () => {
  if (!waterRunning) return;
  clearTimeout(_waterResizeTimer);
  _waterResizeTimer = setTimeout(() => { if (waterRunning) waterW = _waterCols(); }, 100);
});

if (localStorage.getItem('backdrop') === 'water')
  window.startWater();
