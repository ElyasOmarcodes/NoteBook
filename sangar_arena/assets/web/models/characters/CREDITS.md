# Character models — sources and licences

Four rigged characters, each a real model with its own kit, its own textures
and its own baked animation set. None is built out of primitives.

| File | Character | Source |
|------|-----------|--------|
| `vanguard.glb` | Vanguard | [Mixamo](https://www.mixamo.com) |
| `marine.glb` | Marine | [Mixamo](https://www.mixamo.com), via [FPS X](https://github.com/Parking-Master/FPS-X) (MIT) |
| `gasmask.glb` | Gas Mask | [Mixamo](https://www.mixamo.com), via [FPS X](https://github.com/Parking-Master/FPS-X) (MIT) |
| `swat.glb` | S.W.A.T. | [Mixamo](https://www.mixamo.com), via [FPS X](https://github.com/Parking-Master/FPS-X) (MIT) |

Mixamo characters and animations are free to use in games, including
commercially, under Adobe's Mixamo terms.

## What was changed

- meshes welded and decimated to about 13,000 triangles each;
- textures resized to 512 px and re-encoded as JPEG (WebP where alpha is
  needed);
- clips trimmed to the ones the engine drives — idle, walk, jump, shoot,
  grenade throw and death;
- every model is normalised to 1.80 m at load, because they were exported in
  different units, and a weapon parented to a hand takes its scale from the
  bone rather than from a constant.

The three FPS X characters bring `rifle_idle`, `rifle_walking`,
`rifle_shooting`, `rifle_jumping`, `grenade_throw` and `dying`; the engine
layers stance, aim, reload and melee on top of whichever clip is playing.
