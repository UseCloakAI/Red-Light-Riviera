/* Dusk over Marlowe Keys: sky dome, sea, sun light and fog, all sharing one
   palette so distant buildings melt into the same horizon the sky paints.
   Shaders run through three's tone mapping and colour-space chunks so they
   match the lit geometry. */
import * as THREE from "three";

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

  // the sea: wave normals from layered sines, sky reflection with Fresnel, a glitter path to the sun
  const wu = Object.assign({}, uniforms, { uDeep: { value: PALETTE.deep }, uFogC: { value: scene.fog.color }, uFogD: { value: scene.fog.density } });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    uniforms: wu, fog: false,
    vertexShader: "varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}",
    fragmentShader: SKY_FN + `uniform vec3 uDeep,uFogC;uniform float uFogD;varying vec3 vW;
    void main(){
      vec3 V=normalize(cameraPosition-vW);vec2 p=vW.xz;float t=uTime;
      float dist=length(cameraPosition-vW),k=1./(1.+dist*.004);
      float dx=cos(p.x*.21+p.y*.07+t*.9)*.07+cos(p.x*.53-p.y*.31+t*1.4)*.045*k+cos(p.x*1.7+p.y*.9+t*2.3)*.03*k;
      float dz=cos(p.y*.27-p.x*.05+t*.8)*.07+cos(p.y*.61+p.x*.37+t*1.2)*.045*k+cos(p.y*1.9-p.x*.7+t*2.6)*.03*k;
      vec3 N=normalize(vec3(-dx,1.,-dz));
      vec3 R=reflect(-V,N);R.y=abs(R.y)+.01;
      float F=.02+.98*pow(1.-max(dot(N,V),0.),5.);
      vec3 col=mix(uDeep,skyCol(normalize(R),false),F);
      float s=max(dot(R,uSunDir),0.);
      col+=uSun*(pow(s,500.)*8.+pow(s,60.)*.5);
      float f=1.-exp(-uFogD*uFogD*dist*dist);
      col=mix(col,uFogC,f*.85);
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  }));
  water.position.y = -0.6; water.receiveShadow = false;
  scene.add(water);

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
      water.position.x = Math.round(camPos.x / 50) * 50; water.position.z = Math.round(camPos.z / 50) * 50;
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(LIGHT_DIR, 120);
    }
  };
}
