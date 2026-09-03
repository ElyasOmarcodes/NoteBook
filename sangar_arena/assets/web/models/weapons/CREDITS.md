# Weapon models — sources and licences

Every firearm and the frag grenade in Sangar Arena is a real, downloaded 3D
model. None of them is built out of primitives.

The files were collected from two MIT-licensed open-source browser shooters,
[FPS X](https://github.com/Parking-Master/FPS-X) and
[FPS2](https://github.com/Parking-Master/FPS2) by Parking Master, which publish
the models together with the attribution their authors require. The models
themselves come from [Sketchfab](https://sketchfab.com) and are licensed
**CC BY 4.0**, so they may be used commercially as long as the author is
credited — which is what this file is for. The same credits are shown in the
game's settings screen.

| File | Weapon in game | Model | Author |
|------|----------------|-------|--------|
| `ak74.glb` | سنګر AK / Sangar AK | AK-74 | [Cransh](https://sketchfab.com/ccransh) |
| `m16.glb` | کنډک M4 / Kandak M4 | M16 | [Luchador](https://sketchfab.com/Luchador90) |
| `p90.glb` | طوفان MP / Toofan MP | SMG-90 | [TORI106](https://sketchfab.com/TORI106) |
| `awp.glb` | هندوکش SVD / Hindukush SVD | AWP / L96 | [Space_One and contributors, via FPS X](https://github.com/Parking-Master/FPS-X#credits) |
| `scar.glb` | شمشاد DMR / Shamshad DMR | SCAR-H | [TastyTony](https://sketchfab.com/TastyTony) |
| `rem870.glb` | پېښور SG / Pekhawar SG | Remington 870 | [FinBass](https://sketchfab.com/FinBass) |
| `m60.glb` | غازي LMG / Ghazi LMG | M60 | [Kingy](https://sketchfab.com/kingy) |
| `glock.glb` | تیره پستول / Teera Pistol | Glock / XD Mod 2 | [Cransh](https://sketchfab.com/ccransh) |
| `frag.glb` | فراګ بم / Frag grenade | Frag grenade | [hsevencg](https://sketchfab.com/hsevencg) |

## What was changed

The originals are first-person view models sized for a scene of their own. Each
one was re-processed offline so the engine can treat them all the same way:

- first-person arms and hands stripped out, skeletons baked into the rest pose;
- meshes welded and decimated to at most ~8,000 triangles;
- textures resized to 512 px and re-encoded as JPEG (WebP where an alpha
  channel is needed);
- vertex data quantised (`KHR_mesh_quantization`);
- re-centred on the origin, rotated so **+Z runs down the barrel** and **+Y is
  up**, and scaled to the weapon's real length in metres.

Together the nine files come to about 3 MB.
