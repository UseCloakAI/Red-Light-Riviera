/* Lowtide title scene: a dusk ocean drawn by one fragment shader.
   Sky gradient with long lit stratus, a hazed far city with window lights,
   a low sun reddened by the haze, wave normals that reflect the sky with
   Fresnel, a glitter path under the sun, aerial perspective, filmic tone
   curve, vignette and moving grain. No images, nothing generated offline. */
(function () {
  "use strict";
  var HOR = 0.43;
  // the sun shrinks and slides right on tall screens so it never sits behind the logo
  function sun() {
    var A = innerWidth / innerHeight, r = 0.058 * Math.min(1, A / 1.1);
    return { x: A < 1 ? 0.87 : 0.79, y: HOR + r * 0.72, r: r };
  }
  var cvs = document.getElementById("sea");
  var gl = cvs && cvs.getContext("webgl", { antialias: false, alpha: false, depth: false, powerPreference: "high-performance" });

  var api = {
    ok: !!gl,
    horizonY: function () { return (1 - HOR) * innerHeight; },
    sunRect: function () { var s = sun(); return { x: s.x * innerWidth, y: (1 - s.y) * innerHeight, r: s.r * innerHeight }; },
    start: function () {}, exposure: function () {}, flash: function () {}
  };
  window.LTScene = api;
  if (!gl) { document.documentElement.classList.add("no-gl"); return; }

  var FS = [
    "#ifdef GL_FRAGMENT_PRECISION_HIGH", "precision highp float;", "#else", "precision mediump float;", "#endif",
    "uniform vec2 uR,uS;uniform float uT,uE,uF,uH,uSR;float A;",
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
    "  float m=smoothstep(.40,.20,uv.x)+smoothstep(.86,.89,uv.x)*smoothstep(.99,.95,uv.x)*.5;",
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
    " col+=(h21(gl_FragCoord.xy+fract(uT*13.)*91.)-.5)*.05;",
    " gl_FragColor=vec4(clamp(col,0.,1.),1.);",
    "}"
  ].join("\n");
  var VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  var prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (err) {
    console.warn("Lowtide scene fell back to CSS:", err);
    document.documentElement.classList.add("no-gl"); api.ok = false; return;
  }
  gl.useProgram(prog);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  var U = {}; ["uR", "uS", "uT", "uE", "uF", "uH", "uSR"].forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });

  // Render below native resolution and let the grain hide it; drop further if frames run long.
  var q = Math.min(window.devicePixelRatio || 1, 1.5) * (innerWidth < 760 ? 0.6 : 0.8);
  function resize() {
    var w = Math.max(2, Math.round(innerWidth * q)), h = Math.max(2, Math.round(innerHeight * q));
    if (cvs.width !== w || cvs.height !== h) { cvs.width = w; cvs.height = h; gl.viewport(0, 0, w, h); }
  }
  addEventListener("resize", resize);

  function tw(v) { return { v: v, a: v, b: v, s: 0, d: 0 }; }
  function step(o, t) { if (!o.d) return o.v; var k = Math.min(1, (t - o.s) / o.d); k = 1 - Math.pow(1 - k, 3); o.v = o.a + (o.b - o.a) * k; if (k >= 1) o.d = 0; return o.v; }
  function to(o, v, ms) { o.a = o.v; o.b = v; o.s = performance.now(); o.d = ms || 0; if (!ms) { o.v = v; o.d = 0; } }
  var EX = tw(1), FL = tw(0), running = false, t0 = 0, frames = 0, acc = 0, last = 0;

  function frame(now) {
    if (!running) return;
    resize();
    var t = (now - t0) / 1000 + 37;
    var sn = sun(); gl.uniform2f(U.uR, cvs.width, cvs.height); gl.uniform2f(U.uS, sn.x, sn.y);
    gl.uniform1f(U.uT, t); gl.uniform1f(U.uE, step(EX, now)); gl.uniform1f(U.uF, step(FL, now));
    gl.uniform1f(U.uH, HOR); gl.uniform1f(U.uSR, sn.r);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (last) { var dt = now - last; frames++; if (frames > 20) acc += dt; if (frames === 60) { if (acc / 40 > 24 && q > 0.4) { q *= 0.72; } frames = 0; acc = 0; } }
    last = now;
    requestAnimationFrame(frame);
  }
  api.start = function () { if (running) return; running = true; t0 = performance.now(); resize(); requestAnimationFrame(frame); };
  api.exposure = function (v, ms) { to(EX, v, ms); };
  api.flash = function () { FL.v = 1; to(FL, 0, 900); };
})();
