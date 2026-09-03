function THREE_clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/**
 * Touch controls: a left thumbstick for movement, a right look pad, and a
 * cluster of action buttons.
 *
 * The look pad is a free area rather than a stick so a flick works the way it
 * does in every mobile shooter; the same pointer can also fire when "auto
 * fire" is on and the reticle passes over a target.
 */
export class TouchControls {
  constructor(root, settings) {
    this.root = root;
    this.settings = settings;

    this.move = { x: 0, y: 0 };        // -1..1
    this.look = { x: 0, y: 0 };        // radians accumulated this frame
    this.lookRaw = { x: 0, y: 0 };
    this.running = false;
    this.sneaking = false;

    this.buttons = {
      fire: false, reload: false, swap: false, scope: false,
      nade: false, jump: false, crouch: false, prone: false, melee: false,
      use: false,
    };
    /** Edge-triggered presses consumed once by the game loop. */
    this.pressed = new Set();

    this._pointers = new Map();
    this._moveStick = root.querySelector('#stick-move');
    this._moveKnob = this._moveStick?.querySelector('.stick-knob');
    this._lookPad = root.querySelector('#stick-look');

    this._bindStick();
    this._bindLook();
    this._bindButtons();
    this._bindKeyboard();
  }

  _radius() {
    return (this._moveStick?.clientWidth ?? 120) / 2;
  }

  _bindStick() {
    const el = this._moveStick;
    if (!el) return;
    let id = null;
    let origin = { x: 0, y: 0 };

    const start = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      id = t.identifier ?? 'mouse';
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Floating origin: wherever the thumb lands becomes the stick's centre,
      // clamped so it stays inside the ring. The thumb never has to hunt for
      // the middle, which is what made steering feel imprecise.
      const r = this._radius();
      const dx = THREE_clamp(t.clientX - cx, -r * 0.55, r * 0.55);
      const dy = THREE_clamp(t.clientY - cy, -r * 0.55, r * 0.55);
      origin = { x: cx + dx, y: cy + dy };
      this._updateStick(t, origin);
      e.preventDefault();
    };
    const move = (e) => {
      if (id === null) return;
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      for (const t of list) {
        if ((t.identifier ?? 'mouse') !== id) continue;
        this._updateStick(t, origin);
      }
      e.preventDefault();
    };
    const end = (e) => {
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      for (const t of list) {
        if ((t.identifier ?? 'mouse') !== id) continue;
        id = null;
        this.move.x = 0; this.move.y = 0;
        this.running = false;
        this.sneaking = false;
        if (this._moveKnob) this._moveKnob.style.transform = '';
      }
    };

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') start(e); });
    window.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') move(e); });
    window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') end(e); });
  }

  /** Below this fraction of the stick's travel, the thumb is treated as still. */
  static get DEAD_ZONE() { return 0.14; }

  _updateStick(touch, origin) {
    const r = this._radius();
    let dx = touch.clientX - origin.x;
    let dy = touch.clientY - origin.y;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, r);
    if (len > 0) { dx = (dx / len) * clamped; dy = (dy / len) * clamped; }

    // Normalise to 0..1, then rescale past the dead zone so the very first
    // millimetre of travel does not already mean "walk", and full deflection
    // still means full speed. Without this the stick felt vague and the
    // character crept whenever a thumb rested on it.
    let mag = clamped / r;
    const dead = TouchControls.DEAD_ZONE;
    if (mag < dead) {
      this.move.x = 0;
      this.move.y = 0;
      this.running = false;
      this.sneaking = false;
    } else {
      const scaled = (mag - dead) / (1 - dead);
      const ux = len > 0 ? dx / clamped : 0;
      const uy = len > 0 ? dy / clamped : 0;
      this.move.x = ux * scaled;
      this.move.y = -uy * scaled;
      mag = scaled;
      // Push past 85% of the travel to sprint; hold under 40% to creep.
      this.running = mag > 0.85;
      this.sneaking = mag < 0.40;
    }

    if (this._moveKnob) {
      this._moveKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  _bindLook() {
    const el = this._lookPad;
    if (!el) return;
    let id = null;
    let last = { x: 0, y: 0 };
    let downAt = 0;
    let moved = 0;

    const start = (e) => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      id = t.identifier ?? 'mouse';
      last = { x: t.clientX, y: t.clientY };
      downAt = performance.now();
      moved = 0;
      e.preventDefault();
    };
    const move = (e) => {
      if (id === null) return;
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      for (const t of list) {
        if ((t.identifier ?? 'mouse') !== id) continue;
        const dx = t.clientX - last.x;
        const dy = t.clientY - last.y;
        last = { x: t.clientX, y: t.clientY };
        moved += Math.abs(dx) + Math.abs(dy);
        this.lookRaw.x += dx;
        this.lookRaw.y += dy;
      }
      e.preventDefault();
    };
    const end = (e) => {
      const list = e.changedTouches ? Array.from(e.changedTouches) : [e];
      for (const t of list) {
        if ((t.identifier ?? 'mouse') !== id) continue;
        // A quick tap on the look pad is a shot — matches the reference games.
        if (performance.now() - downAt < 220 && moved < 14) {
          this.pressed.add('tapFire');
        }
        id = null;
      }
    };

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') start(e); });
    window.addEventListener('pointermove', (e) => { if (e.pointerType !== 'touch') move(e); });
    window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') end(e); });
  }

  _bindButtons() {
    const map = {
      'btn-fire': 'fire', 'btn-reload': 'reload', 'btn-swap': 'swap',
      'btn-scope': 'scope', 'btn-nade': 'nade', 'btn-jump': 'jump',
      'btn-crouch': 'crouch', 'btn-prone': 'prone', 'btn-melee': 'melee',
    };
    // Held buttons (fire) vs. tapped buttons (everything else).
    const held = new Set(['fire']);

    for (const [id, name] of Object.entries(map)) {
      const el = this.root.querySelector(`#${id}`);
      if (!el) continue;
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (held.has(name)) {
          this.buttons[name] = true;
        } else {
          this.pressed.add(name);
        }
        el.classList.add('on');
      };
      const up = (e) => {
        e.preventDefault();
        if (held.has(name)) this.buttons[name] = false;
        el.classList.remove('on');
      };
      el.addEventListener('touchstart', down, { passive: false });
      el.addEventListener('touchend', up);
      el.addEventListener('touchcancel', up);
      el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') down(e); });
      el.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') up(e); });
      el.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch') up(e); });
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  /** Desktop/emulator support, handy for debugging the build on a laptop. */
  _bindKeyboard() {
    const keys = {};
    const apply = () => {
      this.move.x = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      this.move.y = (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
      this.running = !!keys.shift;
      this.sneaking = !!keys.alt;
    };
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      keys[k] = true;
      if (k === 'shift') keys.shift = true;
      if (k === 'alt') keys.alt = true;
      if (k === 'r') this.pressed.add('reload');
      if (k === 'q') this.pressed.add('swap');
      if (k === 'g') this.pressed.add('nade');
      if (k === ' ') this.pressed.add('jump');
      if (k === 'c') this.pressed.add('crouch');
      if (k === 'z') this.pressed.add('prone');
      if (k === 'v') this.pressed.add('melee');
      if (k === 'f') this.pressed.add('use');
      apply();
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      keys[k] = false;
      if (k === 'shift') keys.shift = false;
      if (k === 'alt') keys.alt = false;
      apply();
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.buttons.fire = true;
      if (e.button === 2) this.pressed.add('scope');
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.buttons.fire = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /**
   * Converts accumulated pointer travel into a look delta in radians and
   * clears the frame's edge-triggered presses.
   */
  consumeLook(adsFactor = 0) {
    const base = (this.settings.sensitivity ?? 1) * 0.0032;
    const ads = (this.settings.adsSensitivity ?? 0.6);
    const scale = base * (1 - adsFactor) + base * ads * adsFactor;
    const invert = this.settings.invertY ? -1 : 1;
    this.look.x = this.lookRaw.x * scale;
    this.look.y = this.lookRaw.y * scale * invert;
    this.lookRaw.x = 0;
    this.lookRaw.y = 0;
    return this.look;
  }

  consumePress(name) {
    if (this.pressed.has(name)) {
      this.pressed.delete(name);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
  }

  setLeftHanded(on) {
    document.body.classList.toggle('left-handed', !!on);
  }
}
