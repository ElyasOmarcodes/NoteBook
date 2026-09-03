# Third-party model credits

**`soldier.glb`** — the rigged, animated soldier every agent is built from.

Taken from the three.js repository (`examples/models/gltf/Soldier.glb`,
https://github.com/mrdoob/three.js), where it ships as an example asset. It is
a Mixamo-derived character: 11,376 triangles, a 49-bone skeleton with finger
joints, and baked `Idle`, `Walk`, `Run` and `TPose` clips.

The engine clones it per player, tints the material per agent, plays the baked
clips through an `AnimationMixer`, and layers the poses the clips do not cover
(crouch, prone, aim pitch, reload, fire recoil, melee, ladder climb) directly
onto the same Mixamo bones. See `assets/web/js/entities/soldier.js`.
