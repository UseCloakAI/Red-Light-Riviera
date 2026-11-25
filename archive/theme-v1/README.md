# Lowtide theme, v1

The first title theme: an 8-bar loop rendered from the WebAudio engine in
`lowtide/js/audio.js` by `tools/render-intro.js` (with the ocean bed baked in).
Replaced on 2026-11-25 by the new Lowtide theme (`lowtide/media/theme.mp3`,
lossless master in `audio-src/lowtide-theme.flac`).

- `loop.flac`: the title loop as it shipped.
- `intro.flac`: copy of the intro film soundtrack that builds into this loop's
  drop. The game still plays `lowtide/media/intro.flac`; this copy is here so
  the pair stays together.

To bring it back: copy `loop.flac` to `lowtide/media/` and in
`lowtide/js/intro.js` load `loop: MEDIA + "loop.flac"` instead of `theme.mp3`
(and drop the `ambStart` call in `startTitle` in `audio.js`, since this loop
already has the sea in it).
