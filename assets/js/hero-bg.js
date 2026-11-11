// Animated hero background: flowing light filaments (WebGL fragment shader).
// Falls back to the CSS aurora if WebGL is unavailable.
(function () {
  const canvas = document.querySelector('.hero-canvas');
  if (!canvas) return;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false });
  if (!gl) { canvas.remove(); return; }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const vert = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
  const frag = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;

    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 5; i++){ v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
      return v;
    }

    void main(){
      vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
      float t = uTime * 0.035;
      vec2 m = (uMouse - 0.5) * 0.25;

      vec2 p = uv * 2.2 + m;
      vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
      vec2 r = vec2(fbm(p + 3.5 * q + vec2(1.7, 9.2) + t * 1.4), fbm(p + 3.5 * q + vec2(8.3, 2.8) - t));
      float f = fbm(p + 3.0 * r);

      // thin glowing filaments: contour lines of the warped field
      float d = abs(sin(f * 11.0)) / 11.0;
      float core = 0.0045 / (d + 0.0025);
      float glow = 0.022 / (d + 0.018);
      float lines = core * 0.7 + glow * 0.28;

      // keep it airy: filaments fade in and out with a slow mask
      float mask = smoothstep(0.42, 0.66, fbm(uv * 1.6 - t * 0.6 + 4.0));
      lines *= mask;

      // soft vignette so the edges and bottom stay calm
      float vig = smoothstep(1.6, 0.25, length(uv * vec2(0.7, 1.0)));
      lines *= vig;

      // dim the area right behind the headline for readability
      lines *= mix(0.35, 1.0, smoothstep(0.15, 0.75, length(uv * vec2(0.8, 1.5))));

      vec3 white = vec3(1.0);
      vec3 blue = vec3(0.05, 0.85, 0.98);
      vec3 violet = vec3(0.20, 0.42, 1.0);
      vec3 tint = mix(blue, violet, smoothstep(0.3, 0.7, q.x));
      vec3 col = mix(tint, white, clamp(core * 0.35, 0.0, 1.0)) * lines;

      float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
      gl_FragColor = vec4(col, a);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, vert);
  const fs = compile(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) { canvas.remove(); return; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uMouse = gl.getUniformLocation(prog, 'uMouse');

  // Render below native resolution for performance; the glow hides the upscale.
  const SCALE = 0.6;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr * SCALE));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
    gl.uniform2f(uRes, w, h);
  }

  const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  window.addEventListener('pointermove', (e) => {
    mouse.tx = e.clientX / window.innerWidth;
    mouse.ty = 1 - e.clientY / window.innerHeight;
  }, { passive: true });

  let visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) loop(); }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });

  const start = performance.now();
  let raf = 0;
  function draw(now) {
    resize();
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    gl.uniform1f(uTime, (now - start) / 1000 + 20.0);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function loop() {
    cancelAnimationFrame(raf);
    const tick = (now) => {
      if (!visible || document.hidden) return;
      draw(now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  canvas.classList.add('ready');
  if (reduced) { draw(performance.now()); window.addEventListener('resize', () => draw(performance.now())); }
  else loop();
})();
