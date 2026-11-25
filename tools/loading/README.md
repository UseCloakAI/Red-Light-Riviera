# Loading-screen art

The loading screen's slides are pre-rendered: the cast from `story/STORY.md`,
built with `lowtide/game/human.js`, posed in Marlowe Keys, shot through an
ink-and-paint pass (ink from depth and normals, banded shading, halftone
shadows, paper grain). Each slide is two layers with the same camera:

- `<slide>-bg.jpg`: the city with the people invisible (their shadows stay)
- `<slide>-fg.webp`: the people alone, matte pulled by rendering over black and white

The game pans them at different speeds (`nextSlide` in `lowtide/js/intro.js`).

    node tools/loading/render.js [slide ...]   # PNGs into tools/loading/out/ (Playwright)
    python3 tools/loading/pack.py              # -> lowtide/media/loading/

Slides, cast looks, poses and cameras are all in `render.html`. Captions are in
`LD` in `intro.js`.
