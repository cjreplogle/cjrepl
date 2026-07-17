let _ljCanvas, _ljCtx, _ljAudio;
let _ljAnalL, _ljAnalR, _ljSrc, _ljStream, _ljAnimId;
let _ljBuffer = null, _ljPaused = false, _ljStartTime = 0, _ljOffset = 0;
const _LJ_FFT = 2048;
const _ljDataL = new Float32Array(_LJ_FFT);
const _ljDataR = new Float32Array(_LJ_FFT);

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

const _TRANSIENT_THRESH = 0.14;
const _MIN_AMP = 0.01; // skip near-silent samples to reduce center clutter

function _ljDraw() {
  _ljAnimId = requestAnimationFrame(_ljDraw);
  if (!_ljAnalL || !_ljCanvas) return;
  _ljAnalL.getFloatTimeDomainData(_ljDataL);
  _ljAnalR.getFloatTimeDomainData(_ljDataR);
  const w = _ljCanvas.width, h = _ljCanvas.height;
  if (!w || !h) return;
  const cx = w / 2, cy = h / 2, scale = Math.min(w, h) / 2 * 0.92;

  // Fast fade to kill center buildup
  _ljCtx.fillStyle = 'rgba(0,0,0,0.35)';
  _ljCtx.fillRect(0, 0, w, h);

  _ljCtx.save();
  _ljCtx.shadowBlur = 3;
  _ljCtx.shadowColor = '#00ff88';
  _ljCtx.lineWidth = 1.2;
  _ljCtx.lineJoin = 'round';

  // Estimate dominant frequency bin from FFT magnitude
  const _freqData = new Uint8Array(_LJ_FFT);
  _ljAnalL.getByteFrequencyData(_freqData);
  let freqPeak = 0, freqSum = 0;
  for (let b = 0; b < _LJ_FFT / 2; b++) { freqSum += _freqData[b]; if (_freqData[b] > _freqData[freqPeak]) freqPeak = b; }
  // Map peak bin to hue: bass (low bins) → red/orange, mid → green, high → blue/violet
  const freqRatio = freqPeak / (_LJ_FFT / 2); // 0=bass, 1=treble
  const hue = Math.round(freqRatio * 280); // 0=red, 140=green, 280=blue-violet
  const avgAmp = freqSum / (_LJ_FFT / 2);
  const brightness = Math.min(1, avgAmp / 80);

  let segStart = -1;
  for (let i = 0; i <= _LJ_FFT; i++) {
    const amp = i < _LJ_FFT ? Math.abs(_ljDataL[i]) + Math.abs(_ljDataR[i]) : 0;
    const silent = amp < _MIN_AMP;
    const jump = i > 0 && i < _LJ_FFT
      ? Math.abs(_ljDataL[i] - _ljDataL[i-1]) + Math.abs(_ljDataR[i] - _ljDataR[i-1])
      : 0;
    const isBreak = silent || jump > _TRANSIENT_THRESH || i === _LJ_FFT;

    if (!silent && segStart === -1) { segStart = i; }

    if (isBreak && segStart !== -1) {
      const len = i - segStart;
      const alpha = 0.55 + brightness * 0.4;
      _ljCtx.strokeStyle = `hsla(${hue},100%,70%,${alpha})`;
      _ljCtx.shadowColor = `hsla(${hue},100%,70%,0.6)`;
      if (len === 1) {
        // Tiny 2-px segment in direction of motion
        const x = cx + _ljDataL[segStart] * scale;
        const y = cy - _ljDataR[segStart] * scale;
        const nx = segStart + 1 < _LJ_FFT ? cx + _ljDataL[segStart + 1] * scale : x;
        const ny = segStart + 1 < _LJ_FFT ? cy - _ljDataR[segStart + 1] * scale : y;
        const dx = nx - x, dy = ny - y, dn = Math.sqrt(dx*dx + dy*dy) || 1;
        _ljCtx.beginPath();
        _ljCtx.moveTo(x - dx/dn, y - dy/dn);
        _ljCtx.lineTo(x + dx/dn, y + dy/dn);
        _ljCtx.stroke();
      } else {
        _ljCtx.beginPath();
        for (let k = segStart; k < i; k++) {
          const x = cx + _ljDataL[k] * scale;
          const y = cy - _ljDataR[k] * scale;
          k === segStart ? _ljCtx.moveTo(x, y) : _ljCtx.lineTo(x, y);
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
  _ljAnalL = _ljAnalR = null;
  _ljBuffer = null; _ljOffset = 0; _ljPaused = false;
  _ljShowControls(false);
}

function _ljSetupCtx() {
  _ljStopAudio();
  _ljAudio = new AudioContext();
  _ljAnalL = _ljAudio.createAnalyser(); _ljAnalL.fftSize = _LJ_FFT;
  _ljAnalR = _ljAudio.createAnalyser(); _ljAnalR.fftSize = _LJ_FFT;
  _ljAnalL.smoothingTimeConstant = 0.5;
  _ljAnalR.smoothingTimeConstant = 0.5;
}

function _ljConnectStereo(src) {
  const sp = _ljAudio.createChannelSplitter(2);
  src.connect(sp);
  sp.connect(_ljAnalL, 0);
  sp.connect(_ljAnalR, 1);
  src.connect(_ljAudio.destination);
}

function _ljConnectMono(src) {
  const delay = _ljAudio.createDelay(0.1);
  delay.delayTime.value = 0.007;
  src.connect(_ljAnalL);
  src.connect(delay);
  delay.connect(_ljAnalR);
}

function _ljPlayFrom(offset) {
  _ljStopSrc();
  const src = _ljAudio.createBufferSource();
  src.buffer = _ljBuffer;
  src.loop = true;
  _ljSrc = src;
  const stereo = _ljBuffer.numberOfChannels >= 2;
  stereo ? _ljConnectStereo(src) : _ljConnectMono(src);
  _ljOffset = offset;
  _ljStartTime = _ljAudio.currentTime;
  src.start(0, offset);
  _ljPaused = false;
  const btn = document.getElementById('lj-play-btn');
  if (btn) btn.textContent = '⏸';
  _ljUpdateSeek();
}

window.ljTogglePlay = () => {
  if (!_ljBuffer) return;
  if (_ljPaused) {
    _ljPlayFrom(_ljOffset);
  } else {
    _ljOffset = Math.min((_ljAudio.currentTime - _ljStartTime) + _ljOffset, _ljBuffer.duration);
    _ljStopSrc();
    _ljPaused = true;
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
  } catch(e) {
    _ljStatus('mic denied');
  }
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
  } catch(e) {
    _ljStatus('decode failed');
  }
};

window.ljOpen = () => {
  const wrap = document.getElementById('lj-canvas-wrap');
  if (!wrap) return;
  if (!_ljCanvas) {
    _ljCanvas = document.createElement('canvas');
    _ljCanvas.style.cssText = 'display:block;width:100%;height:100%';
    wrap.appendChild(_ljCanvas);
    _ljCtx = _ljCanvas.getContext('2d');
    window.addEventListener('resize', _ljResize);
  }
  _ljResize();
  if (!_ljAnimId) _ljDraw();
  window.ljUseMic();
};

window.ljClose = () => {
  if (_ljAnimId) { cancelAnimationFrame(_ljAnimId); _ljAnimId = null; }
  _ljStopAudio();
  if (_ljCtx && _ljCanvas) _ljCtx.clearRect(0, 0, _ljCanvas.width, _ljCanvas.height);
  _ljStatus('—');
};
