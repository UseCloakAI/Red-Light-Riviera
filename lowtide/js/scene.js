/* Lowtide title scene: a dusk ocean drawn by one fragment shader.
   Sky gradient with long lit stratus, a hazed far city with window lights,
   a low sun reddened by the haze, wave normals that reflect the sky with
   Fresnel, a glitter path under the sun, aerial perspective, filmic tone
   curve, vignette and moving grain. The live game plays pre-rendered video
   of this scene; the shader runs only in render mode (?render=...), where
   tools/render-intro.js steps it frame by frame. */
(function () {
  "use strict";
  var HOR = 0.43;
  // the sun shrinks and slides right on tall screens so it never sits behind the logo
  function sun() {
    var A = innerWidth / innerHeight, r = 0.058 * Math.min(1, A / 1.1);
    return { x: A < 1 ? 0.87 : 0.79, y: HOR + r * 0.72, r: r };
  }
  var cvs = document.getElementById("sea"), gl = null, manual = false, grain = 0.05;

  var api = {
    ok: true,
    clock: function () { return performance.now(); },
    horizonY: function () { return (1 - HOR) * innerHeight; },
    sunRect: function () { var s = sun(); return { x: s.x * innerWidth, y: (1 - s.y) * innerHeight, r: s.r * innerHeight }; },
    start: function () {}, exposure: function () {}, flash: function () {}, renderAt: function () {}
  };
  window.LTScene = api;

  var FS = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;", "#else", "precision mediump float;", "#endif",
    "uniform vec2 uR,uS;uniform float uT,uE,uF,uH,uSR,uG;float A;",
    "float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}",
    "float h21(vec2 p){vec3 q=fract(p.xyx*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}",
    "float vn(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);",
    " return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}",
    "float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.02+vec2(13.7,7.3);a*=.5;}return s;}",
    "vec3 dirOf(vec2 uv){return normalize(vec3((uv.x-.5)*A,uv.y-uH,1.3));}",
    "vec2 uvOf(vec3 d){d.z=max(d.z,.05);return vec2(d.x/d.z*1.3/A+.5,d.y/d.z*1.3+uH);}",

    "vec3 sky(vec2 uv,float city){",
    " float h=max(uv.y-uH,0.),hn=h/(1.-uH);",
    " vec3 c=mix(vec3(1.,.46,.20),vec3(.93,.27,.33),smoothstep(0.,.09,hn));",
    " c=mix(c,vec3(.50,.14,.40),smoothstep(.07,.32,hn));",
    " c=mix(c,vec3(.17,.08,.30),smoothstep(.28,.66,hn));",
    " c=mix(c,vec3(.035,.04,.11),smoothstep(.60,1.0,hn));",
    " c+=vec3(1.,.5,.28)*exp(-hn*30.)*.22;",
    " vec2 d=(uv-uS)*vec2(A,1.);float r=length(d);",
    " c+=vec3(1.,.5,.26)*(exp(-r*4.)*.25+exp(-r*12.)*.45+exp(-r*40.)*.35);",
    // long stratus, lit warm on the sun side and near the horizon
    " vec2 q=vec2(uv.x*A*.85+uT*.006,hn*9.);",
    " float n=fbm(q+vec2(0.,fbm(q*.6+3.)*1.2));",
    " float band=smoothstep(.04,.14,hn)*(1.-smoothstep(.42,.75,hn));",
    " float dn=smoothstep(.50,.80,n)*band;",
    " vec3 cc=mix(vec3(.20,.07,.22),vec3(1.,.52,.36),clamp(exp(-r*2.)*1.1+(1.-smoothstep(0.,.25,hn))*.35,0.,1.));",
    " c=mix(c,cc,dn*.8);",
    // the sun, sitting in the haze
    " float disk=smoothstep(uSR,uSR*.94,r);",
    " float atm=smoothstep(-.02,uSR*1.6,uv.y-uH);",
    " c=mix(c,mix(vec3(1.,.30,.10),vec3(1.,.64,.30),atm)*1.4*(1.-.22*pow(r/uSR,2.)),disk*(1.-dn*.55));",
    // far city: silhouettes take the haze colour, windows twinkle
    " if(city>0.){",
    "  float x=uv.x*A,cell=floor(x*120.);",
    "  float m=smoothstep(.40,.20,uv.x)+smoothstep(.86,.89,uv.x)*smoothstep(.99,.95,uv.x)*.5*step(1.,A);",
    "  float bh=(pow(h11(cell*1.37+3.),3.)*.05+h11(cell*.71)*.012+.003)*m;",
    "  if(h<bh){",
    "   vec2 wc=vec2(x*480.,h*900.);",
    "   float lit=step(.72,h21(floor(wc)+cell))*step(.25,fract(wc.x))*step(.3,fract(wc.y));",
    "   lit*=.6+.4*sin(uT*.7+h21(floor(wc))*40.);",
    "   c=mix(c,vec3(.20,.07,.20),.78)+vec3(1.,.72,.42)*lit*.55*smoothstep(0.,.004,bh-h);",
    "  }",
    " }",
    " return c;}",

    "float wv(vec2 p,float lod){",
    " float h=sin(dot(p,vec2(.20,.98))*.32+uT*.85)*.34+sin(dot(p,vec2(-.55,.83))*.53+uT*1.2)*.21",
    "  +sin(dot(p,vec2(.86,.5))*.87+uT*1.6)*.11+sin(dot(p,vec2(-.2,.98))*1.7+uT*2.3)*.05;",
    " return h+(fbm(p*vec2(.55,.85)+vec2(uT*.12,uT*.33))-.5)*.35*lod;}",

    "void main(){",
    " A=uR.x/uR.y;vec2 uv=gl_FragCoord.xy/uR;vec3 col;",
    " if(uv.y>=uH){col=sky(uv,1.);}",
    " else{",
    "  vec3 rd=dirOf(uv),ro=vec3(0.,2.4,uT*1.3);",
    "  float t=-ro.y/rd.y;vec3 p=ro+rd*t;",
    "  float lod=exp(-t*.025),e=.05+t*.003;",
    "  float h0=wv(p.xz,lod),hx=wv(p.xz+vec2(e,0.),lod),hz=wv(p.xz+vec2(0.,e),lod);",
    "  float k=mix(.10,.38,lod);",
    "  vec3 n=normalize(vec3(-(hx-h0)/e*k,1.,-(hz-h0)/e*k));",
    "  vec3 r=reflect(rd,n);vec3 deep=vec3(.018,.03,.06);",
    "  float fr=.02+.98*pow(1.-clamp(dot(n,-rd),0.,1.),5.);",
    // facets that reflect downward see other waves, not sky
    "  vec3 rs=mix(deep*1.6,sky(uvOf(vec3(r.x,max(r.y,.002),r.z)),1.),smoothstep(-.04,.02,r.y));",
    "  col=mix(deep,rs,clamp(fr,0.,1.));",
    "  float sp=max(dot(r,dirOf(uS)),0.);",
    "  col+=vec3(1.,.72,.48)*(pow(sp,700.)*5.+pow(sp,50.)*.25);",
    "  col=mix(col,sky(vec2(uv.x,uH+.001),0.),(1.-exp(-t*.006))*.8);",
    "  col*=.6+.4*smoothstep(0.,uH*.85,uv.y);",
    " }",
    " col*=uE;col+=uF*vec3(1.,.82,.72)*.35;",
    " col=(col*(2.51*col+.03))/(col*(2.43*col+.59)+.14);",
    " col=mix(vec3(dot(col,vec3(.299,.587,.114))),col,1.12);",
    " vec2 v=(uv-.5)*vec2(A*.75,1.);col*=mix(.62,1.,smoothstep(1.05,.30,length(v)));",
    " col+=(h21(gl_FragCoord.xy+fract(uT*13.)*91.)-.5)*uG;",
    " gl_FragColor=vec4(clamp(col,0.,1.),1.);",
    "}"
  ].join("\n");
  var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  // GL is only created when the scene is started, so the live page pays nothing for it
  var prog, U = {}, q = 1;
  function setup() {
    gl = cvs.getContext("webgl", { antialias: false, alpha: false, depth: false, preserveDrawingBuffer: manual, powerPreference: "high-performance" });
    if (!gl) return fail("no WebGL");
    function sh(type, src) {
      var o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    }
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (err) { return fail(err); }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ["uR", "uS", "uT", "uE", "uF", "uH", "uSR", "uG"].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });
    // render mode draws at full size; live mode renders below native and lets grain hide it
    q = manual ? 1 : Math.min(window.devicePixelRatio || 1, 1.5) * (innerWidth < 760 ? 0.6 : 0.8);
    addEventListener("resize", resize);
    return true;
  }
  function fail(why) { console.warn("Lowtide scene fell back to CSS:", why); document.documentElement.classList.add("no-gl"); api.ok = false; return false; }
  function resize() {
    var w = Math.max(2, Math.round(innerWidth * q)), h = Math.max(2, Math.round(innerHeight * q));
    if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; gl.viewport(0, 0, w, h); }
  }

  function tw(v) { return { v: v, a: v, b: v, s: 0, d: 0 }; }
  function step(o, t) { if (!o.d) return o.v; var k = Math.min(1, Math.max(0, (t - o.s) / o.d)); k = 1 - Math.pow(1 - k, 3); return o.a + (o.b - o.a) * k; }
  function to(o, v, ms) { o.a = step(o, api.clock()); o.b = v; o.s = api.clock(); o.d = ms || 0; o.v = ms ? o.a : v; if (!ms) o.a = v; }
  var EX = tw(1), FL = tw(0), running = false, t0 = 0, frames = 0, acc = 0, last = 0;

  function draw(now) {
    resize();
    var sn = sun();
    gl.uniform2f(U.uR, cvs.width, cvs.height); gl.uniform2f(U.uS, sn.x, sn.y);
    gl.uniform1f(U.uT, (now - t0) / 1000 + 37); gl.uniform1f(U.uE, step(EX, now)); gl.uniform1f(U.uF, step(FL, now));
    gl.uniform1f(U.uH, HOR); gl.uniform1f(U.uSR, sn.r); gl.uniform1f(U.uG, grain);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    if (!running) return;
    draw(now);
    if (last) { frames++; if (frames > 20) acc += now - last; if (frames === 60) { if (acc / 40 > 24 && q > 0.4) q *= 0.72; frames = 0; acc = 0; } }
    last = now;
    requestAnimationFrame(frame);
  }
  api.start = function () {
    if (running) return;
    if (!gl && !setup()) return;
    running = true; t0 = api.clock();
    if (!manual) requestAnimationFrame(frame);
  };
  api.exposure = function (v, ms) { to(EX, v, ms); };
  api.flash = function () { FL.v = 1; FL.a = 1; FL.d = 0; to(FL, 0, 900); };
  // render mode: caller owns the clock and asks for frames
  api.manual = function (clock, grainAmt) { manual = true; api.clock = clock; if (grainAmt !== undefined) grain = grainAmt; };
  api.renderAt = function () { if (running && gl) draw(api.clock()); };
})();
