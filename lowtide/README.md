# Lowtide

Lowtide is an open-world crime game by Cloak Studios. It's built in HTML, has no build step, and is desktop only (phones and narrow screens get a notice).

| Path | What |
|---|---|
| `index.html` | The intro: Cloak Studios cold open, title, main menu and pause menu |
| `brand/` | The brand kit: logo, colour, type, motion, interface and a sound board |
| `js/cues.js` | The cue sheet. Every beat of the intro in seconds, read by both picture and sound |
| `js/audio.js` | All music, ambience and sound effects, made live with WebAudio (no audio files) |
| `js/scene.js` | The dusk ocean on the title screen, drawn by one WebGL fragment shader |
| `js/intro.js` | The choreography (Web Animations API) and the menus |
| `css/lowtide.css` | The game's UI styles and motion tokens |
| `assets/` | `cloak-o.svg` (the Cloak orb, from `cloak/blinks`) and `lowtide-mark.svg` (app icon) |
| `media/` | Pre-rendered: `intro.mp4` (the film), `ocean.mp4` (title loop), `intro.flac`, `theme.mp3` (the Lowtide theme, title loop), `loading.mp3` (loading song), `loading/` (loading-screen art, two layers per slide, made by `tools/loading`) |

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

## Cars (Stage 5)

Six original models (the Marlin saloon, Skiff hatchback, Heron estate, Tarpon pickup, Barracuda coupe and Pelican van) plus the police cruiser and the cab, built in `game/carmodels.js` from side profiles: solid nose and tail, an open cabin with seats, dash and wheel, see-through glass. `game/carrender.js` draws every car on the island from its state: clean cars as instances, packed each frame with only what's in view; a hit car gets its own subdivided copy of the same model that dents where it's struck (paint scraped to metal, glass and lamps broken, wheels bent), with no limit and no drop in quality.

`game/carphys.js` is the driving model: magic-formula tyres sharing a friction circle with drive and brakes, load moving front to back, a torque curve through a five-speed automatic, ABS, a rear-locking handbrake, springs under the body (pitch, roll, kerbs, landing off a jump), and impulse collisions with the world and with other cars. Parked cars and traffic come loose into the same physics when they're hit, then settle (traffic finds its lane again).

`game/traffic.js` drives everyone else. Each driver sees the road ahead as one line along their route (the rest of the lane, the way through the next junction, the street after) and places every car, person and parked car against it by its real footprint, so oncoming cars on a bend or a parked row are never mistaken for something in the way. Speed is IDM+ car-following plus a speed for every bend ahead, braked for steadily; stop lines brake to a stop just short of the line; pedals move at a human rate. Junctions are built from one curve per way through, with a table of which ways cross or merge: signals give the through road the longer green and lefts wait for a gap, elsewhere it's the avenue first, then first come, then the car on the right, and nobody commits into a box they can't get out of. Routes are A* over the lanes (`game/nav.js` on `ngraph.path`, vendored in `vendor/ngraph`): drivers head for somewhere and may park when they arrive; police route to you (aimed ahead of your car, spread over different streets), pass queues on the other side and slow into junctions with traffic crossing.

`game/occupants.js` animates people and cars on the real bodies: getting in (door handle, door swung wide, duck, inside leg first, door pulled shut, hands to the wheel), getting out, pulling a driver out and throwing them on the road, and diving out of a moving car. The nearest drivers are real people at the wheel; further off, a figure through the glass. Traffic parks in free kerbside spaces (the driver gets out and walks off), and people walk up to parked cars, get in and pull out. Ragdolls (`game/rig.js`) have weighted limbs, hinged knees and elbows, real ground friction, and land on and roll off cars.

| Key | In a car |
|---|---|
| E | Get in (or pull the driver out) / get out (at speed: bail out) |
| W / S | Throttle / brake, reverse from a stop |
| A / D | Steer (less lock at speed) |
| Space | Handbrake |

`tools/carlab/index.html` renders every model side by side for checking them.

## Five stars (`game/drones.js`)

A citywide siren winds up and down over the island. Police loudspeaker drones cruise the streets round you with searchlights, broadcasting a wanted notice that describes you as you look right now (a woman or a man, roughly how old, the hair, the outfit you're wearing, change it in the wardrobe and the description changes) and where you were last seen. Strike drones come in high, lock on (a red line on you, a beep that speeds up, DRONE LOCKED ON), nose over, and dive at where you'll be, steering until the last 16 m. Break the line of sight during the lock (cover, indoors) and it has to find you again; cut sideways the moment it noses over and it misses (the blast still knocks you about); stand still and it won't. They can be shot down: one round for a strike drone, four for a loudspeaker.

From four stars the police helicopter locks on (a red line on you, the beeping, HELICOPTER LOCKED ON) while it can see you, then fires a pair of rockets at where you were heading, each with its own error, steering only gently once they're away: get out of its sight during the lock, or move hard sideways once they're fired.

## Debug menu

Hold 1, 2, 3, 8, 9 and 0 together for three seconds. Up/Down select, Left/Right change, Enter picks, Esc closes: wanted level, rapid-fire pistol, invincible, infinite ammo, heal.

## The street (`game/streetlife.js`)

Pavement bins go over when you run into them, a car hits them or something blows up near them: the drum tips about its foot, the lid flies, the rubbish spills out (they're put back up once you're far away). Litter in the gutters and on the pavements (more in the port and downtown), cans and bottles you and cars kick down the street, black bags by the walls, sheets of paper blown along by the wind. People sleeping rough by shop fronts in the poorer districts, on cardboard with a blanket and a bag, some asking for change, some asleep, some with a shopping cart; hurt or scared, they get up and go. Cats on the pavements ("Simple Cat" by Drummyfish, CC0, `assets/models/cat/`), walking, sitting, washing, bolting from you, gunfire and cars.

| Key | On foot |
|---|---|
| G (hold) | Lock on to the person in front of you |
| Q / E (while holding G) | Greet / taunt them |

## The intro

1. **Cloak Studios.** A cold open in the style of a big studio logo. Black, with room tone and a reversed swell sucking everything in. A line of light opens across the frame, the sound cuts to silence for a beat, then a hit (sub drop, punch, crack, a low D-minor braam and a struck-metal shimmer in a big dark hall) hard-cuts to the on-dark CL(O)AK lockup, over-exposed and split for a few frames. It pushes in slowly while it holds, a light sweep rakes across it, and the orb blinks twice (a soft tick on each close, a water-drop note on each open: D, then A). Then it all sinks to black.
2. **Out of the black.** The dusk ocean comes up out of the dark, with ambience and the opening of the track.
3. **Lowtide.** Letterbox bars come in over the water. On the downbeat of the drop, the logo rises out of the water.

Picture and sound both read `js/cues.js`. Picture time zero is set after the audio's output latency, so hits land on the frame they belong to.

## Performance: the intro is a film

To run on low-end devices, the expensive parts are pre-rendered:

- **The film**: the Cloak Studios cold open and the ocean up to the drop, as 1920x1080 H.264.
- **The title background**: a seamless 10 s ocean loop.
- **The sound**: the film's soundtrack, as FLAC. The title loop is the Lowtide theme (`theme.mp3`). The old 8-bar engine loop still bakes with `--kinds=loop`.

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
