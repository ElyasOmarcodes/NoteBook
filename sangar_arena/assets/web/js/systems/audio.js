/**
 * Synthesised audio.
 *
 * Every sound is generated with the Web Audio API rather than shipped as a
 * file, which keeps the APK small and lets each weapon carry its own timbre
 * derived from its stats — a heavy, slow round booms; an SMG snaps.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.enabled = false;
    this.settings = { masterVolume: 0.9, sfxVolume: 1, musicVolume: 0.4 };
    this._noiseBuffer = null;
  }

  /** Must be called from a user gesture — mobile browsers demand it. */
  resume() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(this.master);
      this.musicGain.connect(this.master);
      this.master.connect(this.ctx.destination);
      this._applyVolumes();
      this.enabled = true;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applySettings(s) {
    this.settings = { ...this.settings, ...s };
    this._applyVolumes();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.settings.masterVolume ?? 0.9;
    this.sfxGain.gain.value = this.settings.sfxVolume ?? 1;
    this.musicGain.gain.value = this.settings.musicVolume ?? 0.4;
  }

  get noise() {
    if (!this.ctx) return null;
    if (!this._noiseBuffer) {
      const len = this.ctx.sampleRate * 1.2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._noiseBuffer = buf;
    }
    return this._noiseBuffer;
  }

  /** Distance attenuation, applied by the caller before playing. */
  _gainFor(distance) {
    if (distance == null) return 1;
    return Math.max(0, 1 - distance / 110) ** 1.6;
  }

  _env(node, when, attack, decay, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    node.connect(g);
    return g;
  }

  /**
   * A gunshot built from three layers: a low-frequency thump, a filtered noise
   * crack, and a short metallic ring for the action.
   */
  shot(weapon, distance = 0, indoors = false) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vol = this._gainFor(distance);
    if (vol <= 0.001) return;

    // Weight the timbre by the round's damage: heavier hits sound deeper.
    const heavy = Math.min(1, (weapon?.damage ?? 30) / 90);
    const bodyFreq = 190 - heavy * 90;

    // low thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(bodyFreq, now);
    osc.frequency.exponentialRampToValueAtTime(bodyFreq * 0.35, now + 0.10);
    const oscEnv = this._env(osc, now, 0.002, 0.11 + heavy * 0.10, 0.55 * vol);
    oscEnv.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.30);

    // crack
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1 + heavy * 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400 - heavy * 900;
    bp.Q.value = 0.9;
    src.connect(bp);
    const crackEnv = this._env(bp, now, 0.001, 0.055 + heavy * 0.05, 0.75 * vol);
    crackEnv.connect(this.sfxGain);
    src.start(now); src.stop(now + 0.2);

    // tail / reflection off the yard walls
    const tail = ctx.createBufferSource();
    tail.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = indoors ? 900 : 1600;
    tail.connect(lp);
    const tailEnv = this._env(lp, now + 0.03, 0.02,
      (indoors ? 0.55 : 0.34) + heavy * 0.3, 0.16 * vol);
    tailEnv.connect(this.sfxGain);
    tail.start(now + 0.03); tail.stop(now + 1.1);
  }

  dryFire() {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    src.connect(hp);
    const env = this._env(hp, now, 0.001, 0.035, 0.28);
    env.connect(this.sfxGain);
    src.start(now); src.stop(now + 0.1);
  }

  /** Metallic clacks for magazine out / in / bolt. */
  mechanical(kind = 'click', distance = 0) {
    if (!this.enabled) return;
    const vol = this._gainFor(distance);
    if (vol <= 0.001) return;
    const now = this.ctx.currentTime;
    const freq = { magOut: 320, magIn: 460, bolt: 720, click: 540 }[kind] ?? 540;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + 0.06);
    const env = this._env(osc, now, 0.002, 0.07, 0.16 * vol);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    env.connect(lp);
    lp.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.14);

    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3400;
    n.connect(bp);
    const nenv = this._env(bp, now, 0.001, 0.04, 0.2 * vol);
    nenv.connect(this.sfxGain);
    n.start(now); n.stop(now + 0.08);
  }

  footstep(surface = 'concrete', distance = 0, running = false) {
    if (!this.enabled) return;
    const vol = this._gainFor(distance) * (running ? 0.55 : 0.34);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.5;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = surface === 'metal' ? 1800 : 700;
    filter.Q.value = 1.2;
    src.connect(filter);
    const env = this._env(filter, now, 0.004, 0.09, vol);
    env.connect(this.sfxGain);
    src.start(now); src.stop(now + 0.2);
  }

  impact(distance = 0) {
    if (!this.enabled) return;
    const vol = this._gainFor(distance) * 0.5;
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.4;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200;
    src.connect(bp);
    const env = this._env(bp, now, 0.001, 0.05, vol);
    env.connect(this.sfxGain);
    src.start(now); src.stop(now + 0.12);
  }

  hitMarker() {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1500, now);
    const env = this._env(osc, now, 0.002, 0.06, 0.22);
    env.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.1);
  }

  hurt() {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.25);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const env = this._env(osc, now, 0.005, 0.28, 0.30);
    env.connect(lp);
    lp.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 0.4);
  }

  explosion(distance = 0) {
    if (!this.enabled) return;
    const vol = this._gainFor(distance);
    if (vol <= 0.002) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(28, now + 0.55);
    const oenv = this._env(osc, now, 0.004, 0.65, 0.95 * vol);
    oenv.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 1.0);

    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, now);
    lp.frequency.exponentialRampToValueAtTime(300, now + 0.9);
    src.connect(lp);
    const nenv = this._env(lp, now, 0.003, 0.95, 0.8 * vol);
    nenv.connect(this.sfxGain);
    src.start(now); src.stop(now + 1.4);
  }

  /** A long ring after a flashbang, plus a duck on everything else. */
  flashbang() {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 4200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 4.5);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(now); osc.stop(now + 4.6);

    this.sfxGain.gain.setValueAtTime(this.sfxGain.gain.value, now);
    this.sfxGain.gain.linearRampToValueAtTime(0.12, now + 0.05);
    this.sfxGain.gain.linearRampToValueAtTime(
      this.settings.sfxVolume ?? 1, now + 3.6);
  }

  pickup() {
    if (!this.enabled) return;
    const now = this.ctx.currentTime;
    [660, 880].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      const env = this._env(osc, now + i * 0.07, 0.005, 0.10, 0.16);
      env.connect(this.sfxGain);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.2);
    });
  }
}
