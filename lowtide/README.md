# Lowtide

Lowtide is an open-world crime game by Cloak Game Studios. It's built in HTML and has no build step.

| Path | What |
|---|---|
| `index.html` | The intro (Cloak Game Studios slate, title, main menu, pause menu) |
| `brand/` | The brand kit: logo, colour, type, UI and a sound board |
| `js/audio.js` | All music and sound effects, made live with WebAudio (no audio files) |
| `js/intro.js` | Runs the intro sequence and the menus |
| `css/lowtide.css` | The game's UI styles |
| `assets/` | `cloak-o.svg` (the Cloak orb with eyes, from `cloak/blinks`) and `lowtide-sun.svg` |

QA deep links: `index.html?scene=title`, `?scene=menu` and `?scene=pause`.

## Moving into the Cloak repo

This folder has no dependencies. Every path in it is relative, and it doesn't import anything from Cloak.

1. Copy `lowtide/` to the root of `UseCloakAI/cloak`. The `cloak` Worker will serve it at `usecloak.org/lowtide/`.
2. In `sw.js`, skip `/lowtide` the same way it already skips `/blinks`, so the game is never served from Cloak's cache.
3. To serve it at `lowtide.usecloak.org`, add a custom domain or route in `wrangler.jsonc` that rewrites `lowtide.usecloak.org/*` to `/lowtide/*`. You could also give it its own Worker or Pages project with `lowtide/` as the root.

## Run locally

```bash
python3 -m http.server 8799
```
