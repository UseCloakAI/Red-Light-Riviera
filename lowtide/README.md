# Lowtide

Lowtide is an open-world crime game by Cloak Studios. It's built in HTML, has no build step, and is desktop only (phones and narrow screens get a notice).

| Path | What |
|---|---|
| `index.html` | The intro: Cloak Studios slate, match cut, title, main menu and pause menu |
| `brand/` | The brand kit: logo, colour, type, motion, interface and a sound board |
| `js/cues.js` | The cue sheet. Every beat of the intro in seconds, read by both picture and sound |
| `js/audio.js` | All music, ambience and sound effects, made live with WebAudio (no audio files) |
| `js/scene.js` | The dusk ocean on the title screen, drawn by one WebGL fragment shader |
| `js/intro.js` | The choreography (Web Animations API) and the menus |
| `css/lowtide.css` | The game's UI styles and motion tokens |
| `assets/` | `cloak-o.svg` (the Cloak orb, from `cloak/blinks`) and `lowtide-mark.svg` (app icon) |
| `media/` | Pre-rendered: `intro.mp4` (the film), `ocean.mp4` (title loop), `intro.flac`, `theme.mp3` (the Lowtide theme, title loop) |

| `game/` | The game, loaded on demand from Story Mode: `main.js` (renderer, loop, adaptive quality), `world.js` (Marlowe Keys), `sky.js` (dusk sky, sea, light), `player.js` (controller, camera, input), `hud.js` (radar, area names, map) |
| `vendor/three/` | three.js r180, pinned and served from this folder (MIT, see `LICENSE`) |
| `assets/human/` | Creator and crowd data built from MakeHuman (CC0): `human.json` / `human.bin`, `motion.json`, `tex/` |
| `assets/characters/` | Fallback player: `michelle.glb` (Mixamo, slimmed to 409 KB) and `anims.json` (idle, walk and run, retargeted onto her rig). See `CREDITS.md` |

QA deep links: `?scene=title`, `?scene=menu` and `?scene=pause`.

## The game (Stage 1: world and player)

Story Mode shows a loading screen, then drops you on Tideline Beach. Click to capture the mouse.

| Control | Action |
|---|---|
| Mouse | Look |
| W A S D | Move |
| Shift | Sprint |
| Ctrl or Alt | Walk |
| Space | Jump |
| Esc | Pause (the map tab shows where you are) |

Marlowe Keys is generated from a seed, so it's the same city every time. It has a 9 x 8 street grid of 64 m blocks across five districts (Downtown, Midtown, Port Salt, Tideline, Palm Square), plus Tideline Beach and the pier. Buildings are merged per material, and palms, lamps, containers and road markings are instanced, so the whole city draws in about 40 calls and 60k triangles. Street lights are faked with additive light pools, not real lights.

If frames run long, quality steps down by itself: first resolution, then shadows. `window.__lowtide` exposes the player, camera rig and draw stats in the console.

The player is Michelle, a rigged Mixamo character. Her idle, walk and run animations blend by speed, sprint plays the run faster, and footsteps fire on the foot contacts. A dusk environment map baked from the sky lights her, so she isn't a silhouette against the sun. If the model can't load, a procedural stand-in takes over.

To add animations to a character, run the retarget tool. It turns each source bone's world-space rotation from T-pose into the target's local space, so rigs with different bone axes still match:

```bash
node tools/retarget/run.js tools/retarget/src/Xbot.glb lowtide/assets/characters/michelle.glb idle,walk,run lowtide/assets/characters/anims.json
```

The source rig isn't committed. Download `Xbot.glb` from the three.js examples into `tools/retarget/src/`.

## Characters (creator) and pedestrians (Stage 2)

Characters are built from MakeHuman's CC0 data (`tools/human/`, see its README). `game/human.js` turns slider values into a rigged, clothed, animated person. `game/creator.js` is the creator, opened by Story Mode the first time and by Character in the menu. The result is saved in `localStorage` and becomes the player.

`game/peds.js` fills the streets with 18 unique people from the same generator, built on MakeHuman's 1,600-vertex body proxy. They walk the block sidewalks, stop now and then, wait for you to pass, and are recycled out of sight. Animation only runs within 70 m.

Coming next: weapons (Stage 3), police and wanted levels (4), vehicles (5), the first mission (6).

## The intro

1. **Cloak Studios.** The orb drops in with its eyes shut, squashes on landing and bounces once. CL and AK slide out from behind it. It opens its eyes, looks around and blinks.
2. **Match cut.** The orb winds up and swells to fill the frame in rust, then shrinks down until it becomes the sun over the water.
3. **Lowtide.** Letterbox bars come in over the dusk ocean, with ambience and the opening of the track. On the downbeat of the drop, the logo rises out of the water.

Picture and sound both read `js/cues.js`. Picture time zero is set after the audio's output latency, so hits land on the frame they belong to.

## Performance: the intro is a film

To run on low-end devices, the expensive parts are pre-rendered:

- **The film**: the Cloak Studios slate, the match cut and the ocean up to the drop, as 1920x1080 H.264.
- **The title background**: a seamless 10 s ocean loop.
- **The sound**: the film's soundtrack and an 8-bar music-and-ocean loop, as FLAC so the loop has no gap.

The page plays the film muted, keeps it in step with the audio clock, and cuts to the live title exactly on the drop. A flash and a small camera punch hide the cut. Only the logo, the menus and the UI sounds run live. If the media can't load, it falls back to the fully live intro.

To re-render after changing the choreography, shader or sound (needs Playwright and ffmpeg):

```bash
node tools/render-intro.js
```

The page has a render mode (`?render=intro` or `?render=ocean`) that runs on a virtual clock. The script steps it one frame at a time, so the output is frame-exact however slow the machine. The audio comes from the same engine on an `OfflineAudioContext`.

## Audio

Everything is synthesized: an FM electric piano, a detuned pad, sub bass, drums, ocean surf built from filtered noise, generated reverbs and a ping-pong delay. All of it runs through a glue compressor, soft saturation and a limiter. The same engine runs on an `OfflineAudioContext`, so you can render the whole intro to a file to check levels.

## Moving into the Cloak repo

This folder has no dependencies. Every path in it is relative, and it doesn't import anything from Cloak.

1. Copy `lowtide/` to the root of `UseCloakAI/cloak`. The `cloak` Worker will serve it at `usecloak.org/lowtide/`.
2. In `sw.js`, skip `/lowtide` the same way it already skips `/blinks`.
3. For `lowtide.usecloak.org`, either route that subdomain to `/lowtide/*`, or point a CNAME at GitHub Pages (this repo deploys `lowtide/` there on every push to `main`).

## Run locally

```bash
python3 -m http.server 8799
```
