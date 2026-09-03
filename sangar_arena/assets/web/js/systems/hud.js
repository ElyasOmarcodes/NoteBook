/**
 * DOM heads-up display: vitals, ammo, the kill-toast strip, the reticle, the
 * scope overlay and the minimap.
 *
 * Kill toasts are the thin, short-lived banner every player sees when anyone
 * is eliminated, so the whole lobby follows the fight.
 */
export class Hud {
  constructor(root, strings) {
    this.root = root;
    this.strings = strings;
    this.el = {
      hud: root.querySelector('#hud'),
      selfName: root.querySelector('#self-name'),
      kills: root.querySelector('#stat-kills'),
      deaths: root.querySelector('#stat-deaths'),
      scoreA: root.querySelector('#score-a'),
      scoreB: root.querySelector('#score-b'),
      scoreChip: root.querySelector('#chip-score'),
      clock: root.querySelector('#match-clock'),
      toasts: root.querySelector('#toasts'),
      crosshair: root.querySelector('#crosshair'),
      hitmarker: root.querySelector('#hitmarker'),
      vignette: root.querySelector('#damage-vignette'),
      flash: root.querySelector('#flash-veil'),
      scope: root.querySelector('#scope'),
      pips: root.querySelector('#health-pips'),
      ammoMag: root.querySelector('#ammo-mag'),
      ammoReserve: root.querySelector('#ammo-reserve'),
      ammoLine: root.querySelector('.ammo-line'),
      weaponName: root.querySelector('#weapon-name'),
      nadeCount: root.querySelector('#nade-count'),
      prompt: root.querySelector('#prompt'),
      promptText: root.querySelector('#prompt-text'),
      respawn: root.querySelector('#respawn'),
      respawnTitle: root.querySelector('#respawn-title'),
      respawnCount: root.querySelector('#respawn-count'),
      fps: root.querySelector('#fps'),
      minimap: root.querySelector('#minimap-canvas'),
      btnScope: root.querySelector('#btn-scope'),
      btnNade: root.querySelector('#btn-nade'),
    };

    this.pipCount = 10;
    this._buildPips();
    this.mapCtx = this.el.minimap?.getContext('2d') ?? null;
    this._lastHealth = 100;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
  }

  _buildPips() {
    if (!this.el.pips) return;
    this.el.pips.innerHTML = '';
    for (let i = 0; i < this.pipCount; i++) {
      this.el.pips.appendChild(document.createElement('i'));
    }
    this.pips = Array.from(this.el.pips.children);
  }

  show() { this.el.hud?.classList.remove('hidden'); }
  hide() { this.el.hud?.classList.add('hidden'); }

  setStrings(strings) { this.strings = strings; }

  setSelf(name) {
    if (this.el.selfName) this.el.selfName.textContent = name;
  }

  /**
   * Rebuilds the action cluster from the player's own layout.
   *
   * Each entry is `{action, x, y, scale}` with x and y as fractions of the
   * screen, so one layout works on any phone. When no layout is stored the
   * markup's default grid is left exactly as it is.
   *
   * @param {Array<{action:string,x:number,y:number,scale:number}>} layout
   */
  setButtonLayout(layout) {
    const host = this.root.getElementById('actions');
    if (!host) return;
    if (!Array.isArray(layout) || layout.length === 0) {
      host.classList.remove('free');
      return;
    }
    // Keep one of each kind of button around to clone, so the icon markup and
    // the grenade counter do not have to be duplicated here.
    if (!this._buttonTemplates) {
      this._buttonTemplates = {};
      for (const el of host.querySelectorAll('[data-action]')) {
        this._buttonTemplates[el.dataset.action] = el.cloneNode(true);
      }
    }
    host.classList.add('free');
    host.textContent = '';
    for (const item of layout) {
      const tpl = this._buttonTemplates[item.action];
      if (!tpl) continue;
      const el = tpl.cloneNode(true);
      el.dataset.bound = '';
      // The grenade counter is looked up by id, so only the first copy may
      // carry it; the rest lose the badge rather than fight over the id.
      const badge = el.querySelector('#nade-count');
      if (badge && host.querySelector('#nade-count')) badge.remove();
      el.style.left = `${(item.x ?? 0.5) * 100}%`;
      el.style.top = `${(item.y ?? 0.5) * 100}%`;
      el.style.setProperty('--btn-scale', String(item.scale ?? 1));
      host.appendChild(el);
    }
  }

  setHudScale(scale) {
    document.documentElement.style.setProperty('--hud', String(scale));
  }

  setStats(kills, deaths) {
    if (this.el.kills) this.el.kills.textContent = String(kills);
    if (this.el.deaths) this.el.deaths.textContent = String(deaths);
  }

  setTeamScores(a, b, teamMode) {
    if (!this.el.scoreChip) return;
    this.el.scoreChip.style.display = teamMode ? '' : 'none';
    if (this.el.scoreA) this.el.scoreA.textContent = String(a);
    if (this.el.scoreB) this.el.scoreB.textContent = String(b);
  }

  setClock(seconds) {
    if (!this.el.clock) return;
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    this.el.clock.textContent = `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  setHealth(hp) {
    const filled = Math.ceil((hp / 100) * this.pipCount);
    this.pips?.forEach((pip, i) => {
      pip.classList.toggle('off', i >= filled);
      pip.classList.toggle('low', hp <= 30 && i < filled);
    });
    if (hp < this._lastHealth) this.damageFlash();
    this._lastHealth = hp;
  }

  setAmmo(mag, reserve, weaponName) {
    if (this.el.ammoMag) this.el.ammoMag.textContent = String(mag);
    if (this.el.ammoReserve) this.el.ammoReserve.textContent = String(reserve);
    if (this.el.weaponName) this.el.weaponName.textContent = weaponName;
    this.el.ammoLine?.classList.toggle('empty', mag === 0);
  }

  setGrenades(n) {
    if (this.el.nadeCount) this.el.nadeCount.textContent = String(n);
    this.el.btnNade?.classList.toggle('disabled', n <= 0);
  }

  setScopeAvailable(available) {
    this.el.btnScope?.classList.toggle('disabled', !available);
  }

  /** Reticle bloom tracks the current spread so the player can read accuracy. */
  setSpread(factor) {
    if (!this.el.crosshair) return;
    this.el.crosshair.style.transform = `scale(${1 + factor * 1.8})`;
  }

  setScope(on) {
    this.el.scope?.classList.toggle('hidden', !on);
    this.el.crosshair?.classList.toggle('hide', on);
  }

  hitMarker() {
    const el = this.el.hitmarker;
    if (!el) return;
    el.classList.remove('on');
    // Force a reflow so the animation restarts on rapid consecutive hits.
    void el.offsetWidth;
    el.classList.add('on');
  }

  damageFlash() {
    const el = this.el.vignette;
    if (!el) return;
    el.classList.add('on');
    clearTimeout(this._vignetteTimer);
    this._vignetteTimer = setTimeout(() => el.classList.remove('on'), 90);
  }

  flashbang(duration = 3.4) {
    const el = this.el.flash;
    if (!el) return;
    el.classList.add('on');
    clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => el.classList.remove('on'), 80);
    setTimeout(() => el.classList.remove('on'), duration * 1000);
  }

  /**
   * The kill toast every player sees: "<killer> eliminated <victim>".
   */
  killToast({ killerName, victimName, headshot, killerTeam, victimTeam, selfName }) {
    if (!this.el.toasts) return;
    const div = document.createElement('div');
    div.className = 'toast';
    const kClass = killerTeam === 0 ? 'k' : 'v';
    const vClass = victimTeam === 0 ? 'k' : 'v';
    const verb = this.strings.eliminated ?? 'eliminated';
    const mine = killerName === selfName || victimName === selfName;
    if (mine) div.style.borderLeftColor = '#e8a33d';
    div.innerHTML =
      `<span class="${kClass}"></span><span class="w"></span>` +
      `<span class="${vClass}"></span>` +
      (headshot ? '<span class="hs">HS</span>' : '');
    div.children[0].textContent = killerName;
    div.children[1].textContent = verb;
    div.children[2].textContent = victimName;
    this.el.toasts.prepend(div);
    while (this.el.toasts.children.length > 5) {
      this.el.toasts.lastElementChild.remove();
    }
    setTimeout(() => div.remove(), 4200);
  }

  setPrompt(text) {
    if (!this.el.prompt) return;
    if (!text) {
      this.el.prompt.classList.add('hidden');
      return;
    }
    this.el.promptText.textContent = text;
    this.el.prompt.classList.remove('hidden');
  }

  showRespawn(title, seconds) {
    if (!this.el.respawn) return;
    this.el.respawn.classList.remove('hidden');
    this.el.respawnTitle.textContent = title;
    this.el.respawnCount.textContent = String(Math.ceil(seconds));
  }

  hideRespawn() {
    this.el.respawn?.classList.add('hidden');
  }

  setFpsVisible(v) {
    this.el.fps?.classList.toggle('hidden', !v);
  }

  tickFps(dt) {
    this._fpsAccum += dt;
    this._fpsFrames++;
    if (this._fpsAccum >= 0.5) {
      const fps = Math.round(this._fpsFrames / this._fpsAccum);
      if (this.el.fps) this.el.fps.textContent = String(fps);
      this._fpsAccum = 0;
      this._fpsFrames = 0;
    }
  }

  /**
   * Minimap: the map's footprint, named callouts, and every visible soldier.
   */
  drawMinimap({ mapSize, self, yaw, others, places, teamMode }) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0, 0, w, h);

    // A rotating map keeps "up" as the direction you are facing.
    const scale = w / (mapSize * 0.55);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(yaw);

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      (-mapSize / 2 - self.x) * scale, (-mapSize / 2 - self.z) * scale,
      mapSize * scale, mapSize * scale);

    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const p of places) {
      const x = (p.x - self.x) * scale;
      const z = (p.z - self.z) * scale;
      if (Math.abs(x) > w / 2 || Math.abs(z) > h / 2) continue;
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-yaw);
      ctx.fillText(p.en, 0, 0);
      ctx.restore();
    }

    for (const o of others) {
      const x = (o.x - self.x) * scale;
      const z = (o.z - self.z) * scale;
      if (Math.abs(x) > w / 2 || Math.abs(z) > h / 2) continue;
      ctx.fillStyle = teamMode
        ? (o.team === 0 ? '#4c8dff' : '#e2574c')
        : '#e2574c';
      ctx.beginPath();
      ctx.arc(x, z, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // self marker: a chevron pointing up
    ctx.fillStyle = '#e8a33d';
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2 - 6);
    ctx.lineTo(w / 2 - 4.5, h / 2 + 5);
    ctx.lineTo(w / 2 + 4.5, h / 2 + 5);
    ctx.closePath();
    ctx.fill();
  }
}
