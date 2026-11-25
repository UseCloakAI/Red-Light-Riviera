# tools/human

Builds the character creator's data from MakeHuman's CC0 assets.

1. Get the data. Clone `makehumancommunity/makehuman` (you only need the `makehuman/data` folder), and download the CC0 system assets pack from `https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip`.
2. Pack it into `human.json`, `human.bin` and `tex/*.webp`:
   ```bash
   python3 tools/human/build.py <makehuman>/makehuman/data <system_assets> lowtide/assets/human
   ```
3. Extract the motion data: Mixamo clips as world-space rotations, so they can be aligned to any MakeHuman body at runtime. It needs Playwright and `Xbot.glb` from the three.js examples.
   ```bash
   node tools/human/anims.js tools/retarget/src/Xbot.glb idle,walk,run lowtide/assets/human/motion.json
   ```

The runtime is `lowtide/game/human.js`, and the creator UI is `lowtide/game/creator.js`.
