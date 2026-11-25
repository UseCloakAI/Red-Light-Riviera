/* The PS1 look, in one place. The game renders into a small target (270 lines,
   width to suit the screen) that is scaled up with hard pixels; every vertex in
   every material is snapped to that target's pixel grid (the wobble); textures
   are nearest-neighbour; the final image is cut to 15-bit colour with a 4x4
   ordered dither. The sea and the swash use the same snap as the sand they meet,
   so they move together and never open gaps. */
import * as THREE from "three";

export const PS1 = { h: 270, w: 480 };
let patched = false;
// call once, before any material is built, with the screen's aspect
export function configure(aspect) {
  PS1.w = Math.round(PS1.h * aspect / 2) * 2;
  if (patched) return; patched = true;
  // every built-in material: snap clip-space xy to the low-res pixel grid
  THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex + `
  #ifndef PS1_NOSNAP
  if (gl_Position.w > 0.0) { vec2 ps1g = vec2(${(PS1.w / 2).toFixed(1)}, ${(PS1.h / 2).toFixed(1)}); gl_Position.xy = floor(gl_Position.xy / gl_Position.w * ps1g + 0.5) / ps1g * gl_Position.w; }
  #endif`;
}
// the same snap for hand-written shaders
export const snapGLSL = () => `vec4 snap(vec4 c){if(c.w<=0.)return c;vec2 g=vec2(${(PS1.w / 2).toFixed(1)},${(PS1.h / 2).toFixed(1)});c.xy=floor(c.xy/c.w*g+.5)/g*c.w;return c;}`;

// the upscale: tone map, 15-bit colour with an ordered dither, nearest-neighbour onto the screen
export function makeBlit() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, res: { value: new THREE.Vector2(PS1.w, PS1.h) } },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}",
    fragmentShader: `uniform sampler2D tSrc;uniform vec2 res;varying vec2 vUv;
      float bayer(vec2 p){ivec2 q=ivec2(mod(p,4.));int i=q.x+q.y*4;
        float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);return m[i]/16.-.47;}
      void main(){
        vec2 px=floor(vUv*res);vec4 c=texture2D(tSrc,(px+.5)/res);
        gl_FragColor=vec4(c.rgb,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb=floor(gl_FragColor.rgb*31.+bayer(px)*.95+.5)/31.;
      }`,
    depthTest: false, depthWrite: false
  });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  return { mat, scene, cam };
}
// every texture in the scene to nearest-neighbour
export function crunch(root) {
  const seen = new Set();
  root.traverse((o) => {
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of ms) for (const k of ["map", "emissiveMap", "normalMap", "roughnessMap", "alphaMap"]) {
      const t = m[k]; if (!t || seen.has(t)) continue; seen.add(t);
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.anisotropy = 1; t.needsUpdate = true;
    }
  });
}
