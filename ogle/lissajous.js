let _ljCanvas, _ljCtx, _ljAudio;
let _ljAnalL, _ljAnalR, _ljAnalZ, _ljSrc, _ljStream, _ljAnimId;
let _ljBuffer = null, _ljPaused = false, _ljStartTime = 0, _ljOffset = 0;
const _LJ_FFT = 2048;
const _ljDataL = new Float32Array(_LJ_FFT);
const _ljDataR = new Float32Array(_LJ_FFT);
const _ljDataZ = new Float32Array(_LJ_FFT);

// 3D state
let _lj3d = false;
let _ljRotX = 0.35, _ljRotY = 0.5;
let _ljDrag = null; // {x, y, rx, ry}
let _ljAutoRot = true;

function _ljResize() {
  if (!_ljCanvas) return;
  const wrap = document.getElementById('lj-canvas-wrap');
  if (!wrap) return;
  _ljCanvas.width  = wrap.clientWidth;
  _ljCanvas.height = wrap.clientHeight;
}

function _ljStatus(msg) {
  const el = document.getElementById('lj-status');
  if (el) el.textContent = msg;
}

function _ljShowControls(show) {
  ['lj-play-btn','lj-seek','lj-time'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = show ? '' : 'none';
  });
}

function _ljUpdateSeek() {
  if (!_ljBuffer || !_ljAudio) return;
  const dur = _ljBuffer.duration;
  const pos = _ljPaused ? _ljOffset : Math.min((_ljAudio.currentTime - _ljStartTime) + _ljOffset, dur);
  const seek = document.getElementById('lj-seek');
  const time = document.getElementById('lj-time');
  if (seek) seek.value = (pos / dur) * 100;
  if (time) {
    const m = Math.floor(pos / 60), s = Math.floor(pos % 60);
    time.textContent = `${m}:${s.toString().padStart(2,'0')} / ${Math.floor(dur/60)}:${Math.floor(dur%60).toString().padStart(2,'0')}`;
  }
  if (!_ljPaused) requestAnimationFrame(_ljUpdateSeek);
}

const _TRANSIENT_THRESH = 0.18;
const _MAX_SEG = 40;
const _MIN_AMP = 0.03;
const _STRIDE = 4; // sample every Nth point to thin the time window
const _GRAD = [[255,50,50],[170,40,255],[40,90,255],[0,210,190]];

function _segColor(s, e) {
  let zc = 0;
  for (let k = s + 1; k < e; k++)
    if (_ljDataL[k-1] * _ljDataL[k] < 0) zc++;
  // ZC rate in typical music: bass ~0.02, mids ~0.08, highs ~0.2+
  // Map 0.0–0.15 → full gradient
  const t = Math.min(1, (zc / Math.max(1, e - s)) / 0.12);
  const scaled = t * (_GRAD.length - 1);
  const gi = Math.min(Math.floor(scaled), _GRAD.length - 2);
  const f = scaled - gi;
  const a = _GRAD[gi], b = _GRAD[gi + 1];
  return [
    Math.round(a[0] + f * (b[0] - a[0])),
    Math.round(a[1] + f * (b[1] - a[1])),
    Math.round(a[2] + f * (b[2] - a[2])),
  ];
}

// Rotate point (x,y,z) by current camera angles and return projected [sx, sy, depth]
function _project(x, y, z) {
  const cy = Math.cos(_ljRotY), sy = Math.sin(_ljRotY);
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(_ljRotX), sx = Math.sin(_ljRotX);
  const y2 = y * cx - z1 * sx;
  const z2 = y * sx + z1 * cx;
  const d = 2.8;
  const pz = d + z2 * 0.4;
  return [x1 / pz * d, y2 / pz * d, z2];
}

function _ljDraw() {
  _ljAnimId = requestAnimationFrame(_ljDraw);
  if (!_ljAnalL || !_ljCanvas) return;

  if (_lj3d && _ljAutoRot && !_ljDrag) _ljRotY += 0.004;

  _ljAnalL.getFloatTimeDomainData(_ljDataL);
  _ljAnalR.getFloatTimeDomainData(_ljDataR);
  if (_lj3d && _ljAnalZ) _ljAnalZ.getFloatTimeDomainData(_ljDataZ);

  const w = _ljCanvas.width, h = _ljCanvas.height;
  if (!w || !h) return;
  const cx = w / 2, cy = h / 2, scale = Math.min(w, h) / 2 * 0.88;

  _ljCtx.fillStyle = 'rgba(0,0,0,0.35)';
  _ljCtx.fillRect(0, 0, w, h);

  _ljCtx.save();
  _ljCtx.shadowBlur = 3;
  _ljCtx.lineWidth = 1.2;
  _ljCtx.lineJoin = 'round';

  let segStart = -1;
  const _N = Math.floor(_LJ_FFT / _STRIDE);
  for (let ii = 0; ii <= _N; ii++) {
    const i = ii < _N ? ii * _STRIDE : _LJ_FFT; // sentinel at end
    const amp = i < _LJ_FFT ? Math.abs(_ljDataL[i]) + Math.abs(_ljDataR[i]) : 0;
    const silent = amp < _MIN_AMP;
    const prev = Math.max(0, i - _STRIDE);
    const jump = i < _LJ_FFT && i > 0
      ? Math.abs(_ljDataL[i] - _ljDataL[prev]) + Math.abs(_ljDataR[i] - _ljDataR[prev])
      : 0;
    const isBreak = silent || jump > _TRANSIENT_THRESH || (segStart >= 0 && ii - segStart >= _MAX_SEG) || ii === _N;

    if (!silent && segStart === -1) { segStart = ii; }

    if (isBreak && segStart !== -1) {
      const si = segStart * _STRIDE, ei = Math.min(ii * _STRIDE, _LJ_FFT - 1);
      const [r, g, b] = _segColor(si, ei + 1);
      const col = `rgb(${r},${g},${b})`;
      _ljCtx.strokeStyle = col;
      _ljCtx.shadowColor = col;

      const len = ii - segStart;
      if (len <= 1) {
        let px, py;
        if (_lj3d) { [px, py] = _project(_ljDataL[si], _ljDataR[si], _ljAnalZ ? _ljDataZ[si] : 0); }
        else { px = _ljDataL[si]; py = -_ljDataR[si]; }
        const ni = Math.min(si + _STRIDE, _LJ_FFT - 1);
        let npx, npy;
        if (_lj3d) { [npx, npy] = _project(_ljDataL[ni], _ljDataR[ni], _ljAnalZ ? _ljDataZ[ni] : 0); }
        else { npx = _ljDataL[ni]; npy = -_ljDataR[ni]; }
        const dx = npx - px, dy = npy - py, dn = Math.sqrt(dx*dx + dy*dy) || 1;
        _ljCtx.beginPath();
        _ljCtx.moveTo(cx + (px - dx/dn) * scale, cy + (py - dy/dn) * scale);
        _ljCtx.lineTo(cx + (px + dx/dn) * scale, cy + (py + dy/dn) * scale);
        _ljCtx.stroke();
      } else {
        _ljCtx.beginPath();
        for (let kk = segStart; kk <= ii && kk * _STRIDE < _LJ_FFT; kk++) {
          const k = kk * _STRIDE;
          let px, py;
          if (_lj3d) { [px, py] = _project(_ljDataL[k], _ljDataR[k], _ljAnalZ ? _ljDataZ[k] : 0); }
          else { px = _ljDataL[k]; py = -_ljDataR[k]; }
          const sx2 = cx + px * scale, sy2 = cy + py * scale;
          kk === segStart ? _ljCtx.moveTo(sx2, sy2) : _ljCtx.lineTo(sx2, sy2);
        }
        _ljCtx.stroke();
      }
      segStart = -1;
    }
    if (silent) segStart = -1;
  }

  _ljCtx.restore();
}

function _ljStopSrc() {
  if (_ljSrc) { try { _ljSrc.stop(); } catch(e){} _ljSrc = null; }
}

function _ljStopAudio() {
  _ljStopSrc();
  if (_ljStream) { _ljStream.getTracks().forEach(t => t.stop()); _ljStream = null; }
  if (_ljAudio)  { _ljAudio.close(); _ljAudio = null; }
  _ljAnalL = _ljAnalR = _ljAnalZ = null;
  _ljBuffer = null; _ljOffset = 0; _ljPaused = false;
  _ljShowControls(false);
}

function _ljMakeAnalyser() {
  const a = _ljAudio.createAnalyser();
  a.fftSize = _LJ_FFT; a.smoothingTimeConstant = 0.5;
  return a;
}

function _ljSetupCtx() {
  _ljStopAudio();
  _ljAudio = new AudioContext();
  _ljAnalL = _ljMakeAnalyser();
  _ljAnalR = _ljMakeAnalyser();
  _ljAnalZ = _ljMakeAnalyser();
}

function _ljConnectStereo(src) {
  const sp = _ljAudio.createChannelSplitter(2);
  src.connect(sp);
  sp.connect(_ljAnalL, 0);
  sp.connect(_ljAnalR, 1);
  // Z = left channel delayed ~20ms
  const dz = _ljAudio.createDelay(0.1); dz.delayTime.value = 0.02;
  sp.connect(dz, 0); dz.connect(_ljAnalZ);
  src.connect(_ljAudio.destination);
}

function _ljConnectMono(src) {
  const d1 = _ljAudio.createDelay(0.1); d1.delayTime.value = 0.007;
  src.connect(_ljAnalL);
  src.connect(d1); d1.connect(_ljAnalR);
  const dz = _ljAudio.createDelay(0.1); dz.delayTime.value = 0.02;
  src.connect(dz); dz.connect(_ljAnalZ);
}

function _ljPlayFrom(offset) {
  _ljStopSrc();
  const src = _ljAudio.createBufferSource();
  src.buffer = _ljBuffer; src.loop = true;
  _ljSrc = src;
  const stereo = _ljBuffer.numberOfChannels >= 2;
  stereo ? _ljConnectStereo(src) : _ljConnectMono(src);
  _ljOffset = offset; _ljStartTime = _ljAudio.currentTime;
  src.start(0, offset); _ljPaused = false;
  const btn = document.getElementById('lj-play-btn');
  if (btn) btn.textContent = '⏸';
  _ljUpdateSeek();
}

window.ljTogglePlay = () => {
  if (!_ljBuffer) return;
  if (_ljPaused) { _ljPlayFrom(_ljOffset); }
  else {
    _ljOffset = Math.min((_ljAudio.currentTime - _ljStartTime) + _ljOffset, _ljBuffer.duration);
    _ljStopSrc(); _ljPaused = true;
    const btn = document.getElementById('lj-play-btn');
    if (btn) btn.textContent = '▶';
  }
};

window.ljSeek = (pct) => {
  if (!_ljBuffer) return;
  const offset = (pct / 100) * _ljBuffer.duration;
  if (_ljPaused) { _ljOffset = offset; _ljUpdateSeek(); }
  else _ljPlayFrom(offset);
};

window.ljToggle3d = () => {
  _lj3d = !_lj3d;
  _ljAutoRot = true;
  const btn = document.getElementById('lj-3d-btn');
  if (btn) btn.textContent = _lj3d ? '2D' : '3D';
  // reset rotation to a pleasant starting angle
  if (_lj3d) { _ljRotX = 0.35; _ljRotY = 0.5; }
};

function _ljSetupDrag() {
  const onStart = (px, py) => {
    _ljDrag = { x: px, y: py, rx: _ljRotX, ry: _ljRotY };
    _ljAutoRot = false;
  };
  const onMove = (px, py) => {
    if (!_ljDrag || !_lj3d) return;
    _ljRotY = _ljDrag.ry + (px - _ljDrag.x) * 0.007;
    _ljRotX = _ljDrag.rx + (py - _ljDrag.y) * 0.007;
    _ljRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, _ljRotX));
  };
  const onEnd = () => { _ljDrag = null; };

  _ljCanvas.addEventListener('mousedown', e => onStart(e.clientX, e.clientY));
  window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onEnd);
  _ljCanvas.addEventListener('touchstart', e => {
    onStart(e.touches[0].clientX, e.touches[0].clientY);
    e.preventDefault();
  }, { passive: false });
  window.addEventListener('touchmove', e => {
    if (_ljDrag) { onMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }
  }, { passive: false });
  window.addEventListener('touchend', onEnd);
}

window.ljUseMic = async () => {
  try {
    _ljStatus('waiting for mic…');
    _ljSetupCtx();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      video: false,
    });
    _ljStream = stream;
    _ljConnectMono(_ljAudio.createMediaStreamSource(stream));
    _ljShowControls(false);
    _ljStatus('mic · mono');
  } catch(e) { _ljStatus('mic denied'); }
};

window.ljLoadFile = async (file) => {
  if (!file) return;
  try {
    _ljStatus('decoding…');
    _ljSetupCtx();
    _ljBuffer = await _ljAudio.decodeAudioData(await file.arrayBuffer());
    _ljShowControls(true);
    _ljPlayFrom(0);
    _ljStatus(file.name);
  } catch(e) { _ljStatus('decode failed'); }
};

window.ljUseSystem = async () => {
  try {
    _ljStatus('requesting system audio…');
    _ljSetupCtx();
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    stream.getVideoTracks().forEach(t => t.stop());
    if (!stream.getAudioTracks().length) { _ljStatus('no audio track'); return; }
    _ljStream = stream;
    const src = _ljAudio.createMediaStreamSource(stream);
    const stereo = stream.getAudioTracks()[0].getSettings().channelCount >= 2;
    stereo ? _ljConnectStereo(src) : _ljConnectMono(src);
    _ljShowControls(false);
    _ljStatus('system audio');
  } catch(e) {
    _ljStatus(e.name === 'NotAllowedError' ? 'permission denied' : 'mic · mono');
    if (e.name !== 'NotAllowedError') window.ljUseMic();
  }
};

window.ljOpen = () => {
  const wrap = document.getElementById('lj-canvas-wrap');
  if (!wrap) return;
  if (!_ljCanvas) {
    _ljCanvas = document.createElement('canvas');
    _ljCanvas.style.cssText = 'display:block;width:100%;height:100%;cursor:grab';
    wrap.appendChild(_ljCanvas);
    _ljCtx = _ljCanvas.getContext('2d');
    window.addEventListener('resize', _ljResize);
    _ljSetupDrag();
  }
  _ljResize();
  if (!_ljAnimId) _ljDraw();
  window.ljUseSystem();
};

window.ljClose = () => {
  if (_ljAnimId) { cancelAnimationFrame(_ljAnimId); _ljAnimId = null; }
  _ljStopAudio();
  if (_ljCtx && _ljCanvas) _ljCtx.clearRect(0, 0, _ljCanvas.width, _ljCanvas.height);
  _ljStatus('—');
};
