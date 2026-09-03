import { Game } from './game.js';

/**
 * Entry point and the bridge to the Flutter shell.
 *
 * Flutter -> JS   `window.SangarGame.command(jsonString)`
 * JS -> Flutter   `window.flutter_inappwebview.callHandler('sangar', json)`
 *
 * Messages are queued on both sides until the other end is ready, so neither
 * has to care which finishes booting first.
 */

const outbox = [];
let flutterReady = false;

function flushOutbox() {
  if (!flutterReady) return;
  while (outbox.length) {
    const msg = outbox.shift();
    try {
      window.flutter_inappwebview.callHandler('sangar', JSON.stringify(msg));
    } catch (err) {
      // The channel disappeared (the WebView is going away). Drop the rest.
      console.warn('bridge send failed', err);
      outbox.length = 0;
      return;
    }
  }
}

const bridge = {
  send(msg) {
    outbox.push(msg);
    flushOutbox();
  },
};

function markFlutterReady() {
  if (window.flutter_inappwebview?.callHandler) {
    flutterReady = true;
    flushOutbox();
    return true;
  }
  return false;
}

if (!markFlutterReady()) {
  window.addEventListener('flutterInAppWebViewPlatformReady', markFlutterReady);
  // Belt and braces: some builds fire the event before this script parses.
  const poll = setInterval(() => {
    if (markFlutterReady()) clearInterval(poll);
  }, 100);
  setTimeout(() => clearInterval(poll), 15000);
}

let game = null;
const pending = [];

const api = {
  /** Boots the engine. Called once, with the whole match configuration. */
  async start(configJson) {
    if (game) return;
    const canvas = document.getElementById('scene');
    const config = typeof configJson === 'string'
      ? JSON.parse(configJson) : configJson;
    game = new Game(canvas, bridge);
    try {
      await game.boot(config);
    } catch (err) {
      console.error(err);
      bridge.send({ t: 'error', message: String(err && err.stack || err) });
      const note = document.getElementById('boot-note');
      if (note) note.textContent = `Failed: ${err}`;
      return;
    }
    while (pending.length) game.handle(pending.shift());
  },

  /** Every other message from Flutter. */
  command(json) {
    let msg;
    try {
      msg = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (err) {
      console.warn('bad command', err);
      return;
    }
    if (!game || !game.ready) {
      pending.push(msg);
      return;
    }
    game.handle(msg);
  },

  /** Audio needs a user gesture; Flutter calls this on the first tap. */
  resumeAudio() {
    game?.audio?.resume();
  },

  stop() {
    game?.dispose();
    game = null;
  },

  /** Exposed for the automated browser tests and for on-device debugging. */
  get instance() { return game; },
};

window.SangarGame = api;

// Surface engine crashes to the Flutter side rather than dying silently.
window.addEventListener('error', (e) => {
  bridge.send({ t: 'error', message: `${e.message} @ ${e.filename}:${e.lineno}` });
});
window.addEventListener('unhandledrejection', (e) => {
  bridge.send({ t: 'error', message: `unhandled: ${e.reason}` });
});

// Tell Flutter the page itself is up, so it can send the start command.
bridge.send({ t: 'loaded' });
