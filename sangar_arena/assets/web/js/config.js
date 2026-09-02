// Tunables shared across the engine. Values are metres / seconds / radians.

export const PHYS = {
  gravity: 22.0,
  walkSpeed: 4.6,
  runSpeed: 7.4,
  crouchSpeed: 2.3,
  proneSpeed: 1.1,
  sneakSpeed: 1.6,
  airControl: 0.28,
  jumpVelocity: 7.4,
  climbSpeed: 3.1,
  playerRadius: 0.34,
  standHeight: 1.78,
  crouchHeight: 1.18,
  proneHeight: 0.62,
  eyeOffset: -0.16,        // eye sits this far below the capsule top
  stepHeight: 0.46,        // ledges up to here are stepped over automatically
  stepUpSpeed: 3.4,
  maxFallSafe: 4.0,        // fall further than this and you take damage
  fallDamagePerMetre: 9.0,
  terminalFall: 34.0,
  accelGround: 52.0,
  accelAir: 12.0,
  friction: 11.0,
};

export const COMBAT = {
  headMultiplier: 2.0,
  limbMultiplier: 0.78,
  torsoMultiplier: 1.0,
  headHeight: 1.52,        // above feet, standing
  torsoTop: 1.42,
  torsoBottom: 0.78,
  respawnProtection: 1.6,
  meleeDamage: 55,
  meleeRange: 2.1,
  meleeCooldown: 0.85,
  hipSpreadMultiplier: 2.4,
  moveSpreadMultiplier: 1.9,
  crouchSpreadMultiplier: 0.62,
  proneSpreadMultiplier: 0.40,
  adsSpreadMultiplier: 0.34,
};

export const TEAM_COLORS = [0x4c8dff, 0xe2574c];

export const QUALITY = {
  low:    { shadowMap: 0,    pixelRatio: 0.72, fog: 300, aniso: 1, decals: 24,  particles: 0.5 },
  medium: { shadowMap: 1024, pixelRatio: 1.0,  fog: 420, aniso: 4, decals: 60,  particles: 1.0 },
  high:   { shadowMap: 2048, pixelRatio: 1.35, fog: 560, aniso: 8, decals: 110, particles: 1.6 },
};

// Animation state names, mirrored by soldier.js poses.
export const ANIM = {
  IDLE: 'idle',
  WALK: 'walk',
  RUN: 'run',
  SNEAK: 'sneak',
  CROUCH_IDLE: 'crouchIdle',
  CROUCH_WALK: 'crouchWalk',
  PRONE_IDLE: 'proneIdle',
  PRONE_CRAWL: 'proneCrawl',
  JUMP: 'jump',
  FALL: 'fall',
  LAND: 'land',
  CLIMB: 'climb',
  STEP_UP: 'stepUp',
  FIRE: 'fire',
  RELOAD: 'reload',
  MELEE: 'melee',
  RESUPPLY: 'resupply',
  DEAD: 'dead',
};

export const MAP_SIZE = 220;

// The four named districts. Every board on the map carries both scripts so a
// new player learns the callouts in whichever language they read.
export const DISTRICTS = [
  { id: 'sangar',    ps: 'سنګر چوک',    en: 'SANGAR CHOWK',  color: 0xC8562F },
  { id: 'shamshad',  ps: 'شمشاد',       en: 'SHAMSHAD',      color: 0x2F6F63 },
  { id: 'hindukush', ps: 'هندوکش',      en: 'HINDUKUSH',     color: 0x35507A },
  { id: 'rubalkhali',ps: 'ربع الخالي',  en: 'RUB AL-KHALI',  color: 0xB08430 },
];
