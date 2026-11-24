# Lowtide

Lowtide is an open-world crime game by Cloak Studios. It's built in HTML and has no build step.

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

QA deep links: `?scene=title`, `?scene=menu` and `?scene=pause`.

## The intro

1. **Cloak Studios.** The orb drops in with its eyes shut, squashes on landing and bounces once. CL and AK slide out from behind it. It opens its eyes, looks around and blinks.
2. **Match cut.** The orb winds up and swells to fill the frame in rust, then shrinks down until it becomes the sun over the water.
3. **Lowtide.** Letterbox bars come in over the dusk ocean, with ambience and the opening of the track. On the downbeat of the drop, the logo rises out of the water.

Picture and sound both read `js/cues.js`. Picture time zero is set after the audio's output latency, so hits land on the frame they belong to.

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
