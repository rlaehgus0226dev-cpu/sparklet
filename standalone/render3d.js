// render3d.js — WebGL2 3D 렌더러와 카메라 UI. 시뮬레이션은 editor.js 와 공유
// ==================== WebGL2 3D 렌더러 ====================
// 시뮬레이션은 2D 와 공유. 패스별로 color/light 버퍼에 그려 넣으므로 블룸·자동 검수·내보내기가 그대로 동작
const GL3D_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec4 iShape;   // w, h, rotation, ground(0/1)
layout(location=3) in vec4 iUv;
layout(location=4) in vec4 iColor;
uniform vec4 uRot;      // cosYaw, sinYaw, cosPitch, sinPitch
uniform vec2 uView, uCenter;
uniform float uScale, uDist, uRoll;
out vec2 vUv; out vec4 vColor;
vec3 toCam(vec3 p) {
  float x = p.x * uRot.x + p.z * uRot.y, z = -p.x * uRot.y + p.z * uRot.x;
  return vec3(x, p.y * uRot.z + z * uRot.w, -p.y * uRot.w + z * uRot.z);
}
void main() {
  float c = cos(iShape.z), s = sin(iShape.z);
  vec2 q = aCorner * iShape.xy;
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec3 v;
  if (iShape.w > 0.5) {
    vec3 o = toCam(vec3(q.x, 0.0, q.y));
    float rc = cos(uRoll), rs = sin(uRoll);
    v = toCam(iPos) + vec3(o.x * rc - o.y * rs, o.x * rs + o.y * rc, o.z);
  } else {
    v = toCam(iPos) + vec3(q, 0.0);
  }
  float k = uDist > 0.0 ? uDist / max(1.0, uDist - v.z) : 1.0;
  vec2 px = uCenter + v.xy * k * uScale;
  vec2 ndc = vec2(px.x / uView.x * 2.0 - 1.0, 1.0 - px.y / uView.y * 2.0);
  float w = 1.0 / k;
  gl_Position = vec4(ndc * w, 0.0, w);
  vUv = iUv.xy + (aCorner + 0.5) * iUv.zw;
  vColor = iColor;
}`;
const GL3D_FS = `#version 300 es
precision mediump float;
in vec2 vUv; in vec4 vColor; out vec4 outColor;
uniform sampler2D uTex;
uniform int uMode;  // 0=단색 틴트, 1=그라디언트맵, 2=불투명 컷아웃
void main() {
  float m = texture(uTex, vUv).a;
  vec3 rgb = vColor.rgb; float a = m * vColor.a;
  if (uMode == 1) {
    float core = m <= 0.7 ? 0.0 : (m - 0.7) / 0.3;
    rgb = rgb * m; rgb += (vec3(1.0) - rgb) * core * 0.25;
  } else if (uMode == 2) {
    rgb *= 0.45 + 0.55 * min(1.0, m * 1.6);
    a = clamp((m - 0.08) / 0.1, 0.0, 1.0) * vColor.a;
  }
  outColor = vec4(rgb * a, a);
}`;

let _gl3d;
function webgl3d() {
  if (_gl3d !== undefined) return _gl3d;
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
  if (!gl) { console.warn('[3d] WebGL2 미지원 — 2D 로 표시'); return (_gl3d = null); }
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, GL3D_VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, GL3D_FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5,-.5, .5,-.5, -.5,.5, .5,.5]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  const STRIDE = 15 * 4;
  [[1, 3, 0], [2, 4, 12], [3, 4, 28], [4, 4, 44]].forEach(([loc, n, off]) => {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE, off);
    gl.vertexAttribDivisor(loc, 1);
  });
  gl.useProgram(prog);
  gl.enable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  const u = {};
  for (const n of ['uRot', 'uView', 'uCenter', 'uScale', 'uDist', 'uRoll', 'uMode', 'uTex']) u[n] = gl.getUniformLocation(prog, n);
  return (_gl3d = { gl, cv, u, inst, textures: new WeakMap(), shapes: new Map(), data: new Float32Array(15 * 4096) });
}

function gl3dTexture(source) {
  const r = _gl3d;
  let tex = r.textures.get(source);
  if (tex) return tex;
  const gl = r.gl;
  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  r.textures.set(source, tex);
  return tex;
}

// 도형 파티클은 흰색 마스크 텍스처로 구워 재사용
function gl3dShapeSource(shape) {
  const r = _gl3d;
  let cv = r.shapes.get(shape);
  if (cv) return cv;
  if (shape === 'soft') cv = getSoftSprite(255, 255, 255);
  else {
    cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    c.translate(64, 64);
    drawShape(c, shape, 64, '#fff', 0);
  }
  r.shapes.set(shape, cv);
  return cv;
}

function render3D(systems, color, light, bw, bh, bx, by, rs) {
  const r = _gl3d, gl = r.gl;
  if (r.cv.width !== bw || r.cv.height !== bh) { r.cv.width = bw; r.cv.height = bh; }
  gl.viewport(0, 0, bw, bh);
  const b = cameraBasis(fxCamera);
  gl.uniform4f(r.u.uRot, b.cy, b.sy, b.cx, b.sx);
  gl.uniform2f(r.u.uView, bw, bh);
  gl.uniform2f(r.u.uCenter, bx, by);
  gl.uniform1f(r.u.uScale, rs);
  // 기본 Z=0 평면이 2D 와 같은 크기가 되는 거리
  const dist = fxCamera.fov > 0 ? (bh / rs / 2) / Math.tan(fxCamera.fov * Math.PI / 360) : 0;
  gl.uniform1f(r.u.uDist, dist);

  const pass = (additive, target) => {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (additive) gl.blendFunc(gl.ONE, gl.ONE);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    let drew = false;
    for (const s of systems) {
      const pr = s.params;
      const isAdd = pr.blendMode === 'Additive';
      if (isAdd === additive) drew = gl3dDrawSystem(s, b, 1, 1) || drew;
      if (additive && pr.sheet && pr.sheetGlow) drew = gl3dDrawSystem(s, b, 1.18, 0.45) || drew;
    }
    if (drew) {
      target.c.globalCompositeOperation = 'source-over';
      target.c.drawImage(r.cv, 0, 0);
    }
  };
  pass(false, color);
  pass(true, light);
}

function gl3dDrawSystem(sys, b, sizeMul, alphaMul) {
  const r = _gl3d, gl = r.gl, pr = sys.params, d = r.data;
  if (!sys.particles.length) return false;
  const sheetTex = pr.sheet ? (sys._texture || sheetLibrary[pr.sheetAsset]) : null;
  const source = sheetTex || gl3dShapeSource(pr.particleShape || 'circle');
  const ground = pr.plane === 'ground' ? 1 : 0;
  let n = 0;
  for (const p of sys.particles) {
    if (n >= 4096) break;
    const t = p.life / p.maxLife;
    const sT = sampleCurve(pr.sizeCurve || 'linear', t);
    const size = Math.max(0, lerp(p.startSize, p.endSize, sT)) * sizeMul;
    if (size <= 0.1) continue;
    const col = sampleColor(pr.colorKeys, t);
    let alpha = col.a * pr.startColor.a * alphaMul;
    if (pr.fadeIn > 0 && t < pr.fadeIn) alpha *= t / pr.fadeIn;
    if (pr.fadeOut > 0 && t > 1 - pr.fadeOut) alpha *= (1 - t) / pr.fadeOut;
    if (alpha <= 0.001) continue;
    let rot = p.rotation, sx = 1;
    if (pr.stretch > 0 || pr.alignVelocity) {
      const v = ground ? { x: p.vx, y: p.vz || 0 } : cameraRotate(b, p.vx, p.vy, p.vz || 0);
      if (pr.alignVelocity) rot = Math.atan2(-v.x, v.y);
      else {
        rot = Math.atan2(v.y, v.x);
        sx = 1 + pr.stretch * Math.min(1, Math.sqrt(v.x * v.x + v.y * v.y) / 800);
      }
    }
    let u0 = 0, v0 = 0, uw = 1, vh = 1;
    if (sheetTex) {
      const fr = sheetFrameIndex(pr, p.life, t);
      uw = 1 / fr.cols; vh = 1 / fr.rows;
      u0 = fr.fx * uw; v0 = fr.fy * vh;
    }
    const o = n * 15;
    d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z || 0;
    d[o + 3] = size * sx * pr.scaleX; d[o + 4] = size * pr.scaleY; d[o + 5] = rot; d[o + 6] = ground;
    d[o + 7] = u0; d[o + 8] = v0; d[o + 9] = uw; d[o + 10] = vh;
    d[o + 11] = col.r; d[o + 12] = col.g; d[o + 13] = col.b; d[o + 14] = alpha;
    n++;
  }
  if (!n) return false;
  gl.bindTexture(gl.TEXTURE_2D, gl3dTexture(source));
  gl.uniform1f(r.u.uRoll, pr.planeRoll * Math.PI / 180);
  gl.uniform1i(r.u.uMode, !sheetTex ? 0 : pr.sheetCutout ? 2 : pr.sheetGrad ? 1 : 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, r.inst);
  gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 15), gl.DYNAMIC_DRAW);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  return true;
}

// 2D/3D 전환과 궤도 카메라
const CAMERA_PRESETS = {
  front:   { pitch: 0,  yaw: 0 },
  quarter: { pitch: 30, yaw: 40 },
  high:    { pitch: 55, yaw: 0 },
  top:     { pitch: 89, yaw: 0 },
  side:    { pitch: 8,  yaw: 90 },
  back:    { pitch: 25, yaw: 180 },
};
let savedCamera = { pitch: 30, yaw: 0 };  // 이펙트를 불러올 때의 시점

function setCameraPreset(name) {
  const p = name === 'saved' ? savedCamera : CAMERA_PRESETS[name];
  fxCamera.pitch = p.pitch;
  fxCamera.yaw = p.yaw;
  syncViewUI(name);
}

function toggleView3D() {
  fxCamera.view = fxCamera.view === '3d' ? '2d' : '3d';
  syncViewUI();
}
function syncViewUI(active) {
  const b = document.getElementById('view-btn');
  if (b) b.textContent = fxCamera.view === '3d' ? '🧊 3D' : '▭ 2D';
  const bar = document.getElementById('view-presets');
  bar.style.display = fxCamera.view === '3d' ? '' : 'none';
  bar.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('selected', !!active && btn.getAttribute('onclick').includes("'" + active + "'"));
  });
}
