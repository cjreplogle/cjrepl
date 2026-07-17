const _SP_CLIENT_ID = '0d9880996e804bd98c0864673840c608';
const _SP_REDIRECT   = 'https://cjre.pl/ogle';
const _SP_SCOPES     = 'user-read-playback-state user-read-currently-playing';

// — PKCE helpers —
function _spRandStr(len) {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
async function _spChallenge(verifier) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(hash))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

// — Token storage —
const _spSave  = (a,r,e) => { localStorage.setItem('sp_access',a); localStorage.setItem('sp_refresh',r); localStorage.setItem('sp_expiry',e); };
const _spClear = () => ['sp_access','sp_refresh','sp_expiry','sp_verifier'].forEach(k => localStorage.removeItem(k));
const _spToken  = () => localStorage.getItem('sp_access');
const _spExpiry = () => parseInt(localStorage.getItem('sp_expiry') || '0');

// — OAuth —
window.spConnect = async () => {
  const verifier = _spRandStr(64);
  localStorage.setItem('sp_verifier', verifier);
  const challenge = await _spChallenge(verifier);
  location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    client_id: _SP_CLIENT_ID, response_type: 'code',
    redirect_uri: _SP_REDIRECT, scope: _SP_SCOPES,
    code_challenge_method: 'S256', code_challenge: challenge,
  });
};

async function _spExchange(code) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: _SP_CLIENT_ID, grant_type: 'authorization_code',
      code, redirect_uri: _SP_REDIRECT,
      code_verifier: localStorage.getItem('sp_verifier'),
    }),
  });
  if (!res.ok) return false;
  const d = await res.json();
  _spSave(d.access_token, d.refresh_token, Date.now() + d.expires_in * 1000);
  localStorage.removeItem('sp_verifier');
  return true;
}

async function _spRefresh() {
  const r = localStorage.getItem('sp_refresh');
  if (!r) return false;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: _SP_CLIENT_ID, grant_type: 'refresh_token', refresh_token: r }),
  });
  if (!res.ok) return false;
  const d = await res.json();
  _spSave(d.access_token, d.refresh_token || r, Date.now() + d.expires_in * 1000);
  return true;
}

async function _spFetch(path) {
  if (Date.now() > _spExpiry() - 60000) { if (!await _spRefresh()) { _spClear(); return null; } }
  const res = await fetch('https://api.spotify.com/v1' + path, {
    headers: { Authorization: 'Bearer ' + _spToken() },
  });
  if (res.status === 204 || !res.ok) return null;
  return res.json();
}

// — Playback state —
let _spActive   = false;
let _spPlaying  = false;
let _spPosMs    = 0;
let _spPollAt   = 0;
let _spTrackId  = null;
let _spAnalysis = null;
let _spTrackName = '', _spArtist = '';
let _spPollTimer = null;

function _spCurrentPos() {
  return _spPlaying ? _spPosMs + (Date.now() - _spPollAt) : _spPosMs;
}

function _spSetStatus(msg) {
  const el = document.getElementById('lj-status');
  if (el) el.textContent = msg;
}

function _spUpdateBtn() {
  const btn = document.getElementById('lj-sp-btn');
  if (!btn) return;
  btn.textContent = _spActive ? 'disconnect' : 'spotify';
}

async function _spPoll() {
  if (!_spActive) return;
  const data = await _spFetch('/me/player/currently-playing');
  if (!data) { _spPlaying = false; _spSetStatus('spotify · nothing playing'); return; }

  _spPlaying = data.is_playing;
  _spPosMs   = data.progress_ms;
  _spPollAt  = Date.now();

  const item = data.item;
  if (item && item.id !== _spTrackId) {
    _spTrackId   = item.id;
    _spTrackName = item.name;
    _spArtist    = item.artists.map(a => a.name).join(', ');
    _spAnalysis  = null;
    _spSetStatus('spotify · loading · ' + _spTrackName);
    const analysis = await _spFetch('/audio-analysis/' + _spTrackId);
    if (analysis) _spAnalysis = analysis;
  }

  if (_spAnalysis) {
    _spSetStatus((_spPlaying ? '▶ ' : '⏸ ') + _spArtist + ' — ' + _spTrackName);
  }
}

// — Binary search helper —
function _spAt(arr, posMs) {
  if (!arr || !arr.length) return null;
  const s = posMs / 1000;
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    arr[mid].start <= s ? lo = mid : hi = mid - 1;
  }
  return arr[lo];
}

// — Beat-synced waveform synthesis —
// Fills _ljDataL, _ljDataR, _ljDataZ with synthesized audio driven by Spotify analysis.
function _spSynth(posMs) {
  if (!_spAnalysis || !_spPlaying) return;

  const beat    = _spAt(_spAnalysis.beats,    posMs);
  const seg     = _spAt(_spAnalysis.segments, posMs);
  const bar     = _spAt(_spAnalysis.bars,     posMs);
  const section = _spAt(_spAnalysis.sections, posMs);
  if (!beat || !seg) return;

  // Beat phase 0→1 within current beat
  const beatPhase = Math.max(0, Math.min(1,
    (posMs / 1000 - beat.start) / Math.max(0.001, beat.duration)));

  // Amplitude: sharp attack at beat onset, exponential decay; floor for always-on presence
  const beatEnv = Math.exp(-beatPhase * 3.5) * beat.confidence;
  const loudness = Math.max(0, Math.min(1, (seg.loudness_max + 40) / 40));
  const amp = Math.max(0.12, beatEnv * 0.75 + loudness * 0.25) * 0.9;

  // Dominant + secondary pitch class from chromagram
  const pitches = seg.pitches;
  const p1 = pitches.indexOf(Math.max(...pitches));
  const tmp = [...pitches]; tmp[p1] = -1;
  const p2 = tmp.indexOf(Math.max(...tmp));

  // Map pitch class to a frequency range that gives 8–20 visible lissajous cycles per frame
  // (512 samples @ 44100 Hz = ~11.6 ms; need f > ~700 Hz for ≥8 cycles)
  const fBase  = 880 * Math.pow(2, p1 / 12);
  const fRatio = Math.pow(2, ((p2 - p1 + 12) % 12) / 12);

  // Brightness from timbre coefficient 1 (spectral centroid proxy)
  const bright = Math.max(0, Math.min(1, (seg.timbre[1] + 50) / 100));

  // Slow bar-phase modulation for organic drift
  const barPhase = bar ? (posMs / 1000 - bar.start) / Math.max(0.001, bar.duration) : 0;
  const barMod   = Math.sin(barPhase * Math.PI) * 0.08;

  // Section key/mode for phase offset between channels
  const phaseShift = section ? (section.key / 12) * Math.PI : Math.PI / 5;

  const SR    = 44100;
  const tBase = posMs / 1000;

  for (let i = 0; i < _LJ_N; i++) {
    const t = tBase + i / SR;
    const φ = 2 * Math.PI * fBase * t;

    _ljDataL[i] = amp * (
      Math.sin(φ) * (1 - bright * 0.3) +
      Math.sin(φ * 2 + 0.5) * bright * 0.45 +
      Math.sin(φ * 3 + 1.0) * bright * 0.2 +
      barMod
    );

    _ljDataR[i] = amp * (
      Math.sin(φ * fRatio + phaseShift) * (1 - bright * 0.3) +
      Math.sin(φ * fRatio * 2 + 0.8) * bright * 0.4 +
      barMod
    );

    _ljDataZ[i] = amp * 0.85 *
      Math.sin(φ * (fRatio + 1) * 0.5 + Math.PI / 3);
  }
}

// Called from lissajous.js draw loop
window._spGetData = function() {
  if (!_spActive) return false;
  _spSynth(_spCurrentPos());
  return true;
};

// — Public controls —
window.spStart = async () => {
  _spActive = true;
  _spUpdateBtn();
  _spSetStatus('spotify · connecting…');
  await _spPoll();
  _spPollTimer = setInterval(_spPoll, 3000);
};

window.spStop = () => {
  _spActive = false;
  clearInterval(_spPollTimer);
  _spPollTimer = null;
  _spTrackId = null; _spAnalysis = null;
  _spPlaying = false;
  _spUpdateBtn();
  _spSetStatus('—');
};

window.spDisconnect = () => {
  spStop();
  _spClear();
};

window.spToggle = () => {
  if (_spActive) { spDisconnect(); return; }
  if (_spToken() && _spExpiry() > Date.now()) { spStart(); }
  else { spConnect(); }
};

// — Handle OAuth callback + auto-start if already authed —
(async () => {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  if (code) {
    history.replaceState({}, '', location.pathname);
    const ok = await _spExchange(code);
    if (ok) setTimeout(() => { if (window.spStart) spStart(); }, 200);
  } else if (_spToken() && _spExpiry() > Date.now()) {
    // Token already present — auto-start when lissajous opens
    // spStart() is called from ljOpen via the button state
    _spUpdateBtn();
  }
})();
