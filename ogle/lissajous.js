let _ljCanvas, _ljCtx, _ljAudio;
let _ljAnalL, _ljAnalR, _ljSrc, _ljStream, _ljAnimId;
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

function _ljDraw() {
  _ljAnimId = requestAnimationFrame(_ljDraw);
  if (!_ljAnalL || !_ljCanvas) return;
  _ljAnalL.getFloatTimeDomainData(_ljDataL);
  _ljAnalR.getFloatTimeDomainData(_ljDataR);
  const w = _ljCanvas.width, h = _ljCanvas.height;
  if (!w || !h) return;
  const cx = w / 2, cy = h / 2, scale = Math.min(w, h) / 2 * 0.88;

  // Trailing phosphor fade
  _ljCtx.fillStyle = 'rgba(0,0,0,0.18)';
  _ljCtx.fillRect(0, 0, w, h);

  // Glow trace
  _ljCtx.save();
  _ljCtx.shadowBlur = 10;
  _ljCtx.shadowColor = '#00ff88';
  _ljCtx.strokeStyle = 'rgba(0,255,136,0.82)';
  _ljCtx.lineWidth = 1.5;
  _ljCtx.lineJoin = 'round';
  _ljCtx.beginPath();
  for (let i = 0; i < _LJ_FFT; i++) {
    const x = cx + _ljDataL[i] * scale;
    const y = cy - _ljDataR[i] * scale;
    i === 0 ? _ljCtx.moveTo(x, y) : _ljCtx.lineTo(x, y);
  }
  _ljCtx.stroke();
  _ljCtx.restore();
}

function _ljStopAudio() {
  if (_ljSrc)    { try { _ljSrc.stop(); } catch(e){} _ljSrc = null; }
  if (_ljStream) { _ljStream.getTracks().forEach(t => t.stop()); _ljStream = null; }
  if (_ljAudio)  { _ljAudio.close(); _ljAudio = null; }
  _ljAnalL = _ljAnalR = null;
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
    const decoded = await _ljAudio.decodeAudioData(await file.arrayBuffer());
    const stereo = decoded.numberOfChannels >= 2;
    const src = _ljAudio.createBufferSource();
    src.buffer = decoded;
    src.loop = true;
    _ljSrc = src;
    stereo ? _ljConnectStereo(src) : _ljConnectMono(src);
    src.start();
    _ljStatus((stereo ? 'stereo' : 'mono') + ' · ' + file.name);
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
