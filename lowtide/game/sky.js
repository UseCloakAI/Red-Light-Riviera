/* Dusk over Marlowe Keys: sky dome, sea, sun light and fog, all sharing one
   palette so distant buildings melt into the same horizon the sky paints.
   Shaders run through three's tone mapping and colour-space chunks so they
   match the lit geometry. */
import * as THREE from "three";
import { EDGE, SEA, BEACH_GLSL, islandOutline } from "./world.js?v=dev";
import { snapGLSL } from "./ps1.js?v=dev";

const lin = (hex) => new THREE.Color(hex);   // three converts sRGB hex to linear
export const PALETTE = {
  top: lin(0x0C0E22), high: lin(0x2A1650), mid: lin(0x7A2A6A), low: lin(0xE0505E), hor: lin(0xFF8A55),
  sun: lin(0xFFB36B), haze: lin(0xC2607A), deep: lin(0x0A1726)
};
// the sun sits low over the sea to the south-west, so Tideline faces the sunset
export const SUN_DIR = new THREE.Vector3(-0.55, 0.075, 0.83).normalize();
// the key light comes from the same bearing but higher, so streets read instead of drowning in shadow
const LIGHT_DIR = new THREE.Vector3(-0.55, 0.4, 0.83).normalize();

const SKY_FN = `
uniform vec3 uTop,uHigh,uMid,uLow,uHor,uSun;uniform vec3 uSunDir;uniform float uTime;
float h21(vec2 p){vec3 q=fract(p.xyx*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
vec3 skyCol(vec3 d,bool clouds){
  float e=d.y,h=max(e,0.);
  vec3 c=mix(uHor,uLow,smoothstep(0.,.06,h));
  c=mix(c,uMid,smoothstep(.04,.22,h));
  c=mix(c,uHigh,smoothstep(.18,.5,h));
  c=mix(c,uTop,smoothstep(.45,1.,h));
  float s=max(dot(d,uSunDir),0.);
  c+=uSun*(pow(s,6.)*.35+pow(s,40.)*.55+pow(s,400.)*1.2);
  if(clouds&&e>0.){
    vec2 q=d.xz/(e+.12)*vec2(1.2,3.)+vec2(uTime*.004,0.);
    float n=vn(q)*.55+vn(q*2.1+3.)*.3+vn(q*4.3+7.)*.15;
    float m=smoothstep(.5,.78,n)*smoothstep(.02,.1,e)*(1.-smoothstep(.3,.55,e));
    vec3 cc=mix(uMid*.45,uSun*1.1,pow(s,3.)*.9+.1);
    c=mix(c,cc,m*.75);
  }
  c=mix(c,uSun*6.,smoothstep(.99955,.9998,s));
  return c;
}`;

export function buildSky(scene, renderer) {
  scene.fog = new THREE.FogExp2(PALETTE.haze.clone(), 0.0036);
  scene.background = PALETTE.hor.clone();

  const uniforms = {
    uTop: { value: PALETTE.top }, uHigh: { value: PALETTE.high }, uMid: { value: PALETTE.mid }, uLow: { value: PALETTE.low },
    uHor: { value: PALETTE.haze }, uSun: { value: PALETTE.sun }, uSunDir: { value: SUN_DIR }, uTime: { value: 0 }
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: "varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: SKY_FN + "varying vec3 vD;void main(){gl_FragColor=vec4(skyCol(normalize(vD),true),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}"
  }));
  sky.renderOrder = -1; sky.frustumCulled = false;
  scene.add(sky);

  /* the sea, PS1 style: a camera-centred grid (dense near you, sparse to the horizon) with
     swells rolling in toward the beach, flat-shaded facets, vertices snapped to a coarse
     screen grid, colours cut to 15 bits with an ordered dither. It stays off the island,
     goes clear turquoise over the sand and lets the swash take over at the waterline. */
  const PS1 = `
    float bayer(vec2 p){ivec2 q=ivec2(mod(p,4.));int i=q.x+q.y*4;
      float m[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);return m[i]/16.-.47;}
    vec3 cut15(vec3 c,vec2 fc){return floor(c*31.+bayer(fc)*.9+.5)/31.;}
    ${snapGLSL()}
    uniform sampler2D uMask;uniform vec4 uMaskBox;
    bool land(vec2 p){vec2 q=(p-uMaskBox.xy)/uMaskBox.zw;return q.x>0.&&q.y>0.&&q.x<1.&&q.y<1.&&texture2D(uMask,vec2(q.x,1.-q.y)).r>.5;}
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`;
  const SWELL = `float swell(vec2 p,float t){
      return .15*sin(dot(p,vec2(.018,-.105))+t*1.05)+.07*sin(dot(p,vec2(-.06,-.15))+t*1.6)+.045*sin(dot(p,vec2(.21,-.17))+t*2.5)+.025*sin(dot(p,vec2(-.33,-.26))+t*3.2);}`;
  // the island as a mask, so the sea stays off the land whatever shape the coast is
  const MB = new THREE.Vector4(EDGE.w - 40, EDGE.n - 40, EDGE.e - EDGE.w + 80, EDGE.s - EDGE.n + 80);
  const mc = document.createElement("canvas"); mc.width = mc.height = 512;
  { const g = mc.getContext("2d"), P = islandOutline(); g.fillStyle = "#000"; g.fillRect(0, 0, 512, 512); g.fillStyle = "#fff"; g.beginPath();
    P.forEach((p, k) => { const x = (p.x - MB.x) / MB.z * 512, y = (p.z - MB.y) / MB.w * 512; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill(); }
  const maskT = new THREE.CanvasTexture(mc); maskT.flipY = true;
  const wu = Object.assign({}, uniforms, { uDeep: { value: PALETTE.deep }, uFogC: { value: scene.fog.color }, uFogD: { value: scene.fog.density }, uMask: { value: maskT }, uMaskBox: { value: MB } });
  const seaG = new THREE.PlaneGeometry(2, 2, 150, 150).rotateX(-Math.PI / 2), sp = seaG.attributes.position;
  const spread = (u) => Math.sign(u) * Math.pow(Math.abs(u), 2.3) * 2600;   // ~0.6 m cells near you, wide ones far out
  for (let k = 0; k < sp.count; k++) sp.setXYZ(k, spread(sp.getX(k)), 0, spread(sp.getZ(k)));
  seaG.computeBoundingSphere();
  const water = new THREE.Mesh(seaG, new THREE.ShaderMaterial({
    uniforms: wu, fog: false, transparent: true,
    vertexShader: BEACH_GLSL + PS1 + SWELL + `uniform float uTime;varying vec3 vW;
    void main(){
      vec4 w=modelMatrix*vec4(position,1.);
      float depth=w.z>promenade(w.x)?(${SEA.toFixed(2)})-beachY(w.xz):8.;
      float amp=clamp(depth/1.4,.12,1.)*(1.-smoothstep(500.,1600.,distance(w.xz,cameraPosition.xz)));
      w.y=(${SEA.toFixed(2)})+swell(w.xz,uTime)*amp;
      if(land(w.xz))w.y-=4.;      // under the island: out of sight
      vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,   // flat like the sand: unsnapped, so they never part
    fragmentShader: SKY_FN + BEACH_GLSL + PS1 + `uniform vec3 uDeep,uFogC;uniform float uFogD;varying vec3 vW;
    void main(){
      if(land(vW.xz))discard;
      vec3 N=normalize(cross(dFdx(vW),dFdy(vW)));if(N.y<0.)N=-N;                  // one normal per facet
      vec3 V=normalize(cameraPosition-vW);float dist=length(cameraPosition-vW);
      vec3 R=reflect(-V,N);R.y=abs(R.y)+.01;
      float F=.04+.96*pow(1.-max(dot(N,V),0.),5.);
      // the water's own colour by depth: sand showing through, then teal, then the deep; the sky reflects on top
      float depth=vW.z>promenade(vW.x)?vW.y-beachY(vW.xz):9.;
      vec3 body=mix(mix(vec3(.42,.3,.2),vec3(.06,.24,.26),smoothstep(0.,.7,depth)),uDeep,smoothstep(.9,4.5,depth));
      vec3 col=mix(body,skyCol(normalize(R),false),F);
      float s=max(dot(R,uSunDir),0.);col+=uSun*(step(.99,s)*step(hash(floor(vW.xz*1.5)+floor(uTime*5.)),.45)*2.2+pow(s,40.)*.35);   // the sun path breaks into glitter
      // crests catch foam, in chunky blocks
      vec2 q=floor(vW.xz*3.)/3.;float crest=smoothstep(.22,.3,vW.y-(${SEA.toFixed(2)}))*smoothstep(1.5,3.,depth);   // open water only
      col=mix(col,vec3(.93,.9,.86),step(hash(q+floor(uTime*2.)),crest*.3));
      float a=smoothstep(.03,.25,depth);   // gone before it ever meets the sand; the swash covers the shallows
      float f=1.-exp(-uFogD*uFogD*dist*dist);col=mix(col,uFogC,f*.85);
      gl_FragColor=vec4(col,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  }));
  water.receiveShadow = false; water.frustumCulled = false; water.renderOrder = 1;
  scene.add(water);

  /* the swash: each wave runs up the sand with a foam edge, slides back, and leaves it
     dark and wet for a moment. Sets of waves vary along the beach. Drawn in quarter-metre
     blocks so it reads as pixels, like the rest of the sea. */
  const swG = new THREE.PlaneGeometry(EDGE.e - EDGE.w + 60, 60, Math.ceil((EDGE.e - EDGE.w + 60) / 3), 80).rotateX(-Math.PI / 2);
  swG.translate((EDGE.w + EDGE.e) / 2, 0, 258);
  const swash = new THREE.Mesh(swG, new THREE.ShaderMaterial({
    uniforms: Object.assign({}, wu), fog: false, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    vertexShader: BEACH_GLSL + PS1 + `varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);w.y=beachY(w.xz)+.03;vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: BEACH_GLSL + PS1 + `uniform float uTime;uniform vec3 uFogC,uLow;uniform float uFogD;varying vec3 vW;
    void main(){
      if(vW.z<promenade(vW.x)+4.)discard;
      vec2 q=floor(vW.xz*4.)/4.+.125;float h=beachY(q);
      float ph=uTime/7.+.35*sin(q.x*.013+.5)+.2*sin(q.x*.041+2.);float set=floor(ph),p=fract(ph);
      float run=p<.3?1.-pow(1.-p/.3,2.):1.-smoothstep(0.,1.,(p-.3)/.7);              // rushes up, slides back
      float amp=.11+.05*sin(q.x*.027+set*2.1)+.03*sin(set*5.3);
      float L=(${SEA.toFixed(2)})-.01+run*amp,d=L-h,peak=(${SEA.toFixed(2)})-.01+amp;
      vec3 col;float a;
      if(d>0.){
        float edge=1.-smoothstep(0.,p<.3?.03:.012,d);                                   // the foam front
        float bub=step(hash(q+set*7.),.3*smoothstep(.07,0.,d));                          // fizz behind it
        float foam=max(edge,bub);
        col=mix(mix(vec3(.16,.4,.42),uLow,.35),vec3(.95,.92,.86),foam);
        a=mix(.45,.95,foam)*(p<.3?1.:1.-.6*smoothstep(.6,1.,p));
      }else if(h<peak&&p>.3){col=vec3(.28,.2,.14);a=.38*(1.-(p-.3)/.7);}                // wet sand left behind
      else discard;
      float dist=length(cameraPosition-vW),f=1.-exp(-uFogD*uFogD*dist*dist);col=mix(col,uFogC,f*.85);
      if(a<.02)discard;
      gl_FragColor=vec4(col,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  }));
  swash.renderOrder = 2; swash.frustumCulled = false;
  scene.add(swash);

  // image-based light from this same sky, baked once: only PBR materials (characters) use it,
  // so they pick up the dusk fill instead of reading as silhouettes against the sun
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), sky.material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0.04, 0.1, 50).texture;
  scene.environmentIntensity = 0.9;
  pmrem.dispose();

  // light: a low warm sun with shadows that follow the player, a violet sky fill
  const hemi = new THREE.HemisphereLight(0x8E6CC0, 0x5A3A30, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xFFB27A, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.4;
  scene.add(sun, sun.target);

  return {
    sun, water, sky,
    update(t, focus, camPos) {
      uniforms.uTime.value = t;
      sky.position.copy(camPos);
      water.position.x = Math.round(camPos.x / 8) * 8; water.position.z = Math.round(camPos.z / 8) * 8;
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(LIGHT_DIR, 120);
    }
  };
}
