# Drop-in 3D models

Soldiers and weapons are built procedurally by the engine, so nothing is
required here. This folder is the override slot.

Put a rigged `.glb` named after an agent id — `zmarai.glb`, `shahzad.glb`,
`karwan.glb`, `nazo.glb`, `baaz.glb`, `spinzar.glb` — and
`loadExternalRig()` in `assets/web/js/entities/soldier.js` will use it instead
of the primitive rig, provided its skeleton exposes these joint names
(matched case-insensitively):

```
hips  spine  chest  neck  head
shoulderL shoulderR  armL armR  forearmL forearmR  handL handR
thighL thighR  shinL shinR  footL footR
```

The model should face +Z, stand on the origin with the feet at y = 0, and be
about 1.78 m tall. The animation state machine drives those joints directly,
so a model that matches the contract inherits every existing clip — walk, run,
crouch, prone, climb, reload and the rest — with no extra work.

Remember to list any file you add under `assets/models/` in `pubspec.yaml`.
