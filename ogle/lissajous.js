let _ljCanvas, _ljCtx, _ljAudio;
let _ljAnalL, _ljAnalR, _ljAnalZ, _ljSrc, _ljStream, _ljAnimId;
let _ljBuffer = null, _ljPaused = false, _ljStartTime = 0, _ljOffset = 0;

const _LJ_N = 512; // time-domain window — small = fewer segments, better perf
const _ljDataL = new Float32Array(_LJ_N);
const _ljDataR = new Float32Array(_LJ_N);
const _ljDataZ = new Float32Array(_LJ_N);

const _THRESH   = 0.14;  // transient break threshold
const _MAX_SEG  = 80;    // max samples per segment before forced break
const _MIN_AMP  = 0.04;  // skip near-silent samples
const _MIN_DISP = 0.05;  // skip segments whose peak displacement from origin is too small

// red → purple → blue → teal
const _GRAD = [[255,40,40],[255,30,140],[160,20,255],[40,100,255],[80,210,255]];

// Returns [colorString, t] where t=0 is bass/red, t=1 is treble/teal
// Uses a padded context window so short segments still get reliable color
function _segInfo(s, e) {
  const pad = 16;
  const ws = Math.max(0, s - pad), we = Math.min(_LJ_N, e + pad);
  let zc = 0;
  for (let k = ws + 1; k < we; k++)
    if (_ljDataL[k-1] * _ljDataL[k] < 0) zc++;
  const t = Math.min(1, Math.pow((zc / Math.max(1, we - ws)) / 0.10, 0.6));
  const scaled = t * (_GRAD.length - 1);
  const gi = Math.min(Math.floor(scaled), _GRAD.length - 2);
  const f = scaled - gi;
  const a = _GRAD[gi], b = _GRAD[gi + 1];
  const col = `rgb(${Math.round(a[0]+f*(b[0]-a[0]))},${Math.round(a[1]+f*(b[1]-a[1]))},${Math.round(a[2]+f*(b[2]-a[2]))})`;
  return [col, t];
}

// 3D state
let _lj3d = false;
let _ljRotX = 0.35, _ljRotY = 0.5;
let _ljDrag = null;
let _ljAutoRot = true;

// Orthographic rotation (no perspective divide = no singularities)
function _rot(x, y, z) {
  const cy = Math.cos(_ljRotY), sy = Math.sin(_ljRotY);
  const x1 =  x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const cx = Math.cos(_ljRotX), sx = Math.sin(_ljRotX);
  const y2 =  y * cx - z1 * sx;
  return [x1, y2]; // orthographic — no divide
}

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
  const time  = document.getElementById('lj-time');
  if (seek) seek.value = (pos / dur) * 100;
  if (time) {
    const m = Math.floor(pos / 60), s = Math.floor(pos % 60);
    time.textContent = `${m}:${s.toString().padStart(2,'0')} / ${Math.floor(dur/60)}:${Math.floor(dur%60).toString().padStart(2,'0')}`;
  }
  if (!_ljPaused) requestAnimationFrame(_ljUpdateSeek);
}

function _ljDraw() {
  _ljAnimId = requestAnimationFrame(_ljDraw);
  if (!_ljAnalL || !_ljCanvas) return;

  if (_lj3d && _ljAutoRot && !_ljDrag) _ljRotY += 0.005;

  const _spotifyData = window._spGetData && window._spGetData();
  if (!_spotifyData) {
    if (!_ljAnalL) return;
    // Kick suspended AudioContext back to life every frame
    if (_ljAudio && _ljAudio.state === 'suspended') { _ljAudio.resume(); return; }
    _ljAnalL.getFloatTimeDomainData(_ljDataL);
    _ljAnalR.getFloatTimeDomainData(_ljDataR);
    if (_lj3d && _ljAnalZ) _ljAnalZ.getFloatTimeDomainData(_ljDataZ);
  }

  const w = _ljCanvas.width, h = _ljCanvas.height;
  if (!w || !h) return;
  const ox = w / 2, oy = h / 2;
  const scale = Math.min(w, h) / 2 * 0.88;

  _ljCtx.fillStyle = 'rgba(0,0,0,0.3)';
  _ljCtx.fillRect(0, 0, w, h);
  _ljCtx.save();

  // Draw axes in 3D mode
  if (_lj3d) {
    _ljCtx.strokeStyle = 'rgba(255,255,255,0.12)';
    _ljCtx.lineWidth = 0.8;
    _ljCtx.shadowBlur = 0;
    const axLen = 1.05;
    const axes = [
      [[-axLen,0,0],[axLen,0,0]],  // X (left channel)
      [[0,-axLen,0],[0,axLen,0]],  // Y (right channel)
      [[0,0,-axLen],[0,0,axLen]],  // Z (delayed)
    ];
    for (const [[x0,y0,z0],[x1,y1,z1]] of axes) {
      const [px0, py0] = _rot(x0, y0, z0);
      const [px1, py1] = _rot(x1, y1, z1);
      _ljCtx.beginPath();
      _ljCtx.moveTo(ox + px0 * scale, oy + py0 * scale);
      _ljCtx.lineTo(ox + px1 * scale, oy + py1 * scale);
      _ljCtx.stroke();
    }
  }

  _ljCtx.lineJoin = 'round';

  // Compute frame peak to scale thresholds — fewer particles at low volume
  let framePeak = 0;
  for (let i = 0; i < _LJ_N; i++) {
    const a = Math.abs(_ljDataL[i]) + Math.abs(_ljDataR[i]);
    if (a > framePeak) framePeak = a;
  }
  const volFactor = Math.min(1, framePeak / 0.4);
  const dynMinAmp  = _MIN_AMP  + (0.55 - _MIN_AMP)  * (1 - volFactor);
  const dynMinDisp = _MIN_DISP + (0.80 - _MIN_DISP) * (1 - volFactor);

  // Precompute sliding-window ZCR per sample so cap decisions aren't based on
  // the running in-segment count (which is always 0 at segment start → every
  // segment was being broken as a 1-sample particle immediately).
  const _ZCR_WIN = 32;
  const _zcrBuf = new Float32Array(_LJ_N);
  for (let i = 0; i < _LJ_N; i++) {
    const ws = Math.max(0, i - (_ZCR_WIN >> 1));
    const we = Math.min(_LJ_N, i + (_ZCR_WIN >> 1));
    let zc = 0;
    for (let k = ws + 1; k < we; k++)
      if (_ljDataL[k-1] * _ljDataL[k] < 0) zc++;
    _zcrBuf[i] = zc / Math.max(1, we - ws);
  }

  let segStart = -1;
  for (let i = 0; i <= _LJ_N; i++) {
    const end = i === _LJ_N;
    const amp = end ? 0 : Math.abs(_ljDataL[i]) + Math.abs(_ljDataR[i]);
    const silent = amp < dynMinAmp;
    const jump = (!end && i > 0)
      ? Math.abs(_ljDataL[i] - _ljDataL[i-1]) + Math.abs(_ljDataR[i] - _ljDataR[i-1])
      : 0;

    if (!silent && !end && segStart < 0) segStart = i;

    // Use precomputed ZCR at segment start for stable cap decisions
    const curLen = segStart >= 0 ? i - segStart : 0;
    const zcRate = segStart >= 0 ? _zcrBuf[segStart] : 0;
    const disp = i > 0 ? Math.abs(_ljDataL[i-1]) + Math.abs(_ljDataR[i-1]) : 0.5;
    const baseCap = zcRate < 0.015 ? 1 : zcRate < 0.04 ? 16 : zcRate < 0.08 ? 40 : _MAX_SEG;
    // near-center segments get longer to show continuous path; far segments stay short/particle
    const dynMax = Math.min(_MAX_SEG, disp < 0.3 ? Math.round(baseCap * (1 + 2 * (1 - disp / 0.3))) : baseCap);

    const doBreak = end || silent || jump > _THRESH || (segStart >= 0 && curLen >= dynMax);

    if (doBreak && segStart >= 0) {
      // skip segments too close to origin
      let peak = 0;
      for (let k = segStart; k < i; k++) {
        const d = Math.abs(_ljDataL[k]) + Math.abs(_ljDataR[k]);
        if (d > peak) peak = d;
      }
      if (peak >= dynMinDisp) {
        const [col] = _segInfo(segStart, i);
        const brightness = Math.min(1, peak / 0.6);
        _ljCtx.strokeStyle = col;
        _ljCtx.fillStyle = col;
        _ljCtx.shadowColor = col;
        _ljCtx.lineWidth = 0.8 + brightness * 2.2;
        _ljCtx.shadowBlur = 2 + brightness * 8;
        if (i - segStart === 1) {
          // single-sample: stroke draws nothing, use a filled dot scaled by amplitude
          const L = _ljDataL[segStart], R = _ljDataR[segStart];
          const Z = _lj3d && _ljAnalZ ? _ljDataZ[segStart] : 0;
          const [px, py] = _lj3d ? _rot(L, -R, Z) : [L, -R];
          const radius = 1.5;
          _ljCtx.beginPath();
          _ljCtx.arc(ox + px * scale, oy + py * scale, radius, 0, Math.PI * 2);
          _ljCtx.fill();
        } else {
          _ljCtx.beginPath();
          for (let k = segStart; k < i; k++) {
            const L = _ljDataL[k], R = _ljDataR[k];
            const Z = _lj3d && _ljAnalZ ? _ljDataZ[k] : 0;
            const [px, py] = _lj3d ? _rot(L, -R, Z) : [L, -R];
            k === segStart
              ? _ljCtx.moveTo(ox + px * scale, oy + py * scale)
              : _ljCtx.lineTo(ox + px * scale, oy + py * scale);
          }
          _ljCtx.stroke();
        }
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

function _ljMakeAnal() {
  const a = _ljAudio.createAnalyser();
  a.fftSize = _LJ_N * 2; // fftSize must be >= 2× the time-domain buffer
  a.smoothingTimeConstant = 0.4;
  return a;
}

function _ljSetupCtx() {
  _ljStopAudio();
  _ljAudio = new AudioContext();
  _ljAnalL = _ljMakeAnal();
  _ljAnalR = _ljMakeAnal();
  _ljAnalZ = _ljMakeAnal();
}

function _ljConnectStereo(src) {
  const sp = _ljAudio.createChannelSplitter(2);
  src.connect(sp);
  sp.connect(_ljAnalL, 0);
  sp.connect(_ljAnalR, 1);
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
  src.buffer = _ljBuffer; src.loop = true; _ljSrc = src;
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
  if (_lj3d) { _ljRotX = 0.35; _ljRotY = 0.5; }
  const btn = document.getElementById('lj-3d-btn');
  if (btn) btn.textContent = _lj3d ? '2D' : '3D';
};

function _ljSetupDrag() {
  const onStart = (px, py) => {
    if (!_lj3d) return;
    _ljDrag = { x: px, y: py, rx: _ljRotX, ry: _ljRotY };
    _ljAutoRot = false;
    _ljCanvas.style.cursor = 'grabbing';
  };
  const onMove = (px, py) => {
    if (!_ljDrag) return;
    _ljRotY = _ljDrag.ry + (px - _ljDrag.x) * 0.007;
    _ljRotX = _ljDrag.rx + (py - _ljDrag.y) * 0.007;
    _ljRotX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, _ljRotX));
  };
  const onEnd = () => {
    _ljDrag = null;
    _ljCanvas.style.cursor = _lj3d ? 'grab' : 'default';
  };
  _ljCanvas.addEventListener('mousedown',  e => onStart(e.clientX, e.clientY));
  window.addEventListener('mousemove',     e => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup',       onEnd);
  _ljCanvas.addEventListener('touchstart', e => { onStart(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); }, { passive: false });
  window.addEventListener('touchmove',     e => { if (_ljDrag) { onMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } }, { passive: false });
  window.addEventListener('touchend',      onEnd);
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
    _ljStopAudio();
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    console.log('[lj] tracks:', stream.getTracks().map(t => t.kind + ':' + t.label));
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach(t => t.stop());
      _ljStatus('no audio — share a Tab and enable "Share tab audio"');
      return;
    }
    // Create AudioContext after user gesture resolves so it starts in running state
    _ljAudio = new AudioContext();
    _ljAnalL = _ljMakeAnal();
    _ljAnalR = _ljMakeAnal();
    _ljAnalZ = _ljMakeAnal();
    await _ljAudio.resume();
    _ljStream = stream;
    const src = _ljAudio.createMediaStreamSource(stream);
    const stereo = (stream.getAudioTracks()[0].getSettings().channelCount ?? 1) >= 2;
    stereo ? _ljConnectStereo(src) : _ljConnectMono(src);
    _ljShowControls(false);
    _ljStatus('system audio · ' + _ljAudio.state);

    // Update status when AudioContext state changes
    _ljAudio.addEventListener('statechange', () => {
      if (!_ljAudio) return;
      _ljStatus('system audio · ' + _ljAudio.state);
      if (_ljAudio.state === 'suspended') _ljAudio.resume();
    });

    // Notify if the stream track ends (user clicks "Stop sharing")
    stream.getAudioTracks().forEach(t => {
      t.addEventListener('ended', () => _ljStatus('stream ended — reshare to continue'));
    });
  } catch(e) {
    _ljStatus(e.name === 'NotAllowedError' ? 'permission denied' : 'unavailable');
    if (e.name !== 'NotAllowedError') window.ljUseMic();
  }
};

window.ljOpen = () => {
  const wrap = document.getElementById('lj-canvas-wrap');
  if (!wrap) return;
  if (!_ljCanvas) {
    _ljCanvas = document.createElement('canvas');
    _ljCanvas.style.cssText = 'display:block;width:100%;height:100%;cursor:default';
    wrap.appendChild(_ljCanvas);
    _ljCtx = _ljCanvas.getContext('2d');
    window.addEventListener('resize', _ljResize);
    _ljSetupDrag();
  }
  _ljResize();
  if (!_ljAnimId) _ljDraw();
};

window.ljClose = () => {
  if (_ljAnimId) { cancelAnimationFrame(_ljAnimId); _ljAnimId = null; }
  _ljStopAudio();
  if (_ljCtx && _ljCanvas) _ljCtx.clearRect(0, 0, _ljCanvas.width, _ljCanvas.height);
  _ljStatus('—');
};
