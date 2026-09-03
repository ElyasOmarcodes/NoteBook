# سنګر ډګر — Sangar Arena

د وای‌فای پر مټ ځايي څو‑لوبغاړې درېیم‑بُعدي ډګر، په **Dart/Flutter** او **three.js** جوړ شوی.
A Wi‑Fi LAN multiplayer 3D arena shooter built with **Flutter (Dart)** for the shell and
**three.js** for the game itself.

---

## څنګه لوبه وکړو / How to play

1. یو لوبغاړی خپل موبایل **هاټسپاټ** چالان کړي.
   One player turns on their phone **hotspot**.
2. نور ټول هماغه وای‌فای ته وصل شي.
   Everyone else connects to that Wi‑Fi.
3. هاټسپاټ لرونکی **ګروپ جوړول** ووهي — د ګروپ نوم، نقشه، ډول او وخت وټاکي.
   The host taps **Create group** and picks the name, map, mode and match length.
4. نور **ګروپ کې ګډون** ووهي؛ ګروپ به پخپله ښکاره شي (یا د **لټون** تڼۍ ووهي).
   Everyone else taps **Join group**; the group appears automatically (or tap **Search**).
5. کوربه **میدان پیلول** ووهي.
   The host taps **Start match**.

که د کوم دلیل له مخې ګروپ ونه ښکاري، په **لاسي وصل (IP)** کې د کوربه پته ولیکئ —
کوربه خپله پته د ګروپ په سر کې ویني.
If discovery is blocked on your network, use **Manual join (IP)** — the host's address is
shown at the top of their lobby.

**تمرینی حالت** د یوازې لوبې لپاره دی: یا له بوټانو سره جګړه، یا یوازې په نقشه کې ګرځېدل.
**Training** is solo play: either fight bots, or free‑roam the map on your own.

---

## څه پکې شته / What is in it

| | |
| --- | --- |
| **نقشه / Map** | «سنګر چوک» — ۲۲۰×۲۲۰ متره صنعتي سیمه: د تېلو ټانکونه، ګودامونه، کانټینرونه، مرکزي برج |
| **بورډونه / Boards** | د نقشې په هر څنډه او سیمه کې دوه‑ژبي بورډونه (پښتو + انګلیسي): سنګر چوک، شمشاد، هندوکش، ربع الخالي |
| **پورته ختل / Roof access** | لرګینې زینې، لرګین او فولادي نردبانونه، او د بکسونو له لارې ګام‑په‑ګام ختل |
| **پټې لارې / Hidden routes** | د بامونو ترمنځ نرۍ لارې او د پایپونو پُلونه چې له ښکته نه ښکاري |
| **کرکټرونه / Agents** | ریښتینی rigged ۳ډي انسان موډل (۴۹ هډوکي)، شپږ جلا کرکټرونه |
| **وسلې / Weapons** | اته وسلې چې په lathe/extrude جوړ شوي — **دوه یې په یو وخت** اخیستل کېږي |
| **ګرنېټ / Grenades** | چاودېدونکی، رڼا او لوګی |
| **حرکتونه / Animation** | دریدل، تګ، منډه، کرار تګ، ګونده، پرېوتل، ټوپ، پر نردبان ختل، ګام اچول، له لوړې ښکته کېدل، ډزې، ریلوډ، د مرمیو رسد، وهل |
| **ټوسټونه / Kill toasts** | د هر وژنې په مهال ټولو ته نری بنر: «پلانکی، پلانکی وویشت» |
| **جدول / Scoreboard** | د میدان په پای کې د ټولو ګډونوالو درجه‌بندي شوی جدول |

---

## جوړښت / Architecture

```
sangar_arena/
├── lib/                    Flutter shell — menus, settings, lobby, networking
│   ├── models/             agents, weapons, maps, match config, players
│   ├── net/                UDP discovery + WebSocket host/client, wire protocol
│   ├── state/              persisted settings
│   ├── game/               localhost asset server + WebView bridge
│   └── ui/                 screens and widgets
└── assets/web/             the game engine, loaded in a WebView
    ├── js/world/           procedural textures, the arena, geometry batching
    ├── js/entities/        soldier rig, weapons, grenades, bots, remote players
    ├── js/systems/         collision, effects, audio, touch controls, HUD
    └── vendor/             three.js
```

**Networking.** The host opens a WebSocket server on port `45456` and beacons its group over
UDP broadcast on `45455`. Every device simulates its own soldier and streams the resulting
transform at 20 Hz; the host merges those into snapshots, and owns health, scoring and the
clock. Remote soldiers are played back on a ~110 ms delay and interpolated, so hotspot jitter
does not teleport anyone.

**Rendering.** The engine is served to the WebView over `http://localhost:45099` rather than
`file://`, because Chromium blocks ES module graphs on file origins. Every texture is painted
at runtime onto a canvas, so the APK ships no image assets, and the whole static map is merged
into a handful of draw calls.

**Models.** Soldiers are a real rigged mesh — `assets/web/models/soldier.glb`,
11k triangles on a 49-bone Mixamo skeleton with finger joints and baked idle,
walk and run clips. The clips drive locomotion through an `AnimationMixer`;
everything they do not cover (crouch, prone, aim pitch, reload, recoil, melee,
ladder climbing) is layered on top by rotating the same bones. See
`assets/web/models/CREDITS.md` for the model's provenance.

Weapons are modelled rather than blocked out: barrels, suppressors and scope
bodies are profiles turned on a `LatheGeometry`, and receivers, magazines,
stocks and grips are bevelled 2D outlines run through `ExtrudeGeometry`
(`assets/web/js/entities/gunsmith.js`).

**Textures.** No image files ship. Every surface is painted at runtime from
value and cellular noise plus hand-written structure — a branching crack
network for the asphalt, panel joints and form-tie holes for precast concrete,
a real sinusoidal rib profile for corrugated steel, riveted plate courses for
the tanks — and each derives its own normal and roughness map from an explicit
height field (`assets/web/js/world/textures.js`).

---

## جوړول / Building

The Android build runs on **Flutter 3.44.9** with **AGP 9**, which is why
`flutter_inappwebview` is pinned to `6.2.0-beta.3`: it is the first release
whose Android module stopped using `getDefaultProguardFile('proguard-android.txt')`,
a call AGP 9 rejects outright. Move back to a `6.1.x` stable release only
together with an AGP 8 toolchain.

```bash
cd sangar_arena
flutter pub get
flutter analyze
flutter test
flutter build apk --release
```

APK جوړول د ګیټ‑هب اکشنز له لارې هم کېږي: **Build Sangar Arena APK**
(هر push، یا لاسي `workflow_dispatch`). APK فایلونه د workflow په artifacts کې دي.

CI builds the APK on every push to `main` or a `claude/**` branch, and on demand via
**Run workflow** — universal plus per‑ABI APKs land in the run's artifacts.
