/**
 * ============================================================================
 * Three programs. The quad is the illustration, held still and then pushed
 * down Z; the clouds are instanced billboards streaming out of the vanishing
 * point; the overlay is the speed lines and the sun, drawn last. GLSL ES 3.00,
 * so WebGL2 only, which the gate in Base.astro has already checked before any
 * of this is fetched.
 *
 * Texture uploads flip Y, so v = 0 is the bottom row everywhere in here and
 * screen space is y up to match.
 * ========================================================================= */

/** A full screen triangle from gl_VertexID. No buffer, no attributes. */
export const QUAD_VS = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * The plate. At rest it is the illustration, cover fitted. On the click it
 * scales about the vanishing point, and the scale itself depends on the depth
 * under each pixel, so the legs and the cabin come at the camera faster than
 * the sky does. Depth is sampled twice: the depth that matters is the depth at
 * the point actually sampled, and one refinement step stops the legs being
 * driven by the sky behind them.
 *
 * The depth map puts the shoes further away than the thighs, 0.24 against
 * 0.54, with sky at 0.10. Depth is remapped to nearness with a narrow ramp so
 * the shoes count as near and the sky counts as nothing.
 */
export const QUAD_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uRes;
uniform float uPlateAspect;
uniform vec2 uVP;
uniform float uScaleSky;
uniform float uScaleNear;
uniform float uNearFade;
uniform float uLift;
uniform vec3 uSky;
uniform vec3 uBone;
uniform float uStreak;

vec2 cover(vec2 p) {
  float ca = uRes.x / uRes.y;
  vec2 s = ca > uPlateAspect ? vec2(1.0, uPlateAspect / ca) : vec2(ca / uPlateAspect, 1.0);
  return (p - 0.5) * s + 0.5;
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 p = vUv;
  vec2 da = (p - uVP) * vec2(asp, 1.0);
  float r2 = dot(da, da) / (0.25 * asp * asp + 0.25);

  vec2 q = p;
  float dep = texture(uDepth, cover(q)).r;
  float near = smoothstep(0.13, 0.26, dep);
  for (int i = 0; i < 2; i++) {
    float sc = mix(uScaleSky, uScaleNear, near);
    q = uVP + (p - uVP) / sc;
    dep = texture(uDepth, cover(q)).r;
    near = smoothstep(0.13, 0.26, dep);
  }

  vec3 col;
  if (uStreak > 0.001) {
    // six taps back along the radial: a zoom smear, strongest at the edges
    vec2 dir = (q - uVP) * (uStreak * (0.3 + r2) * 0.05);
    col = vec3(0.0);
    for (int i = 0; i < 6; i++) col += texture(uColor, cover(q - dir * float(i) * 0.4)).rgb;
    col /= 6.0;
  } else {
    col = texture(uColor, cover(q)).rgb;
  }

  vec3 skyNow = mix(uSky, uBone, uLift);
  col = mix(col, skyNow, uNearFade * near);
  col = mix(col, uBone, uLift);
  o = vec4(col, 1.0);
}`;

/**
 * Billboards. One quad per instance from gl_VertexID, positioned by a pinhole
 * projection about the vanishing point. Per instance: position and size, then
 * atlas cell, horizontal flip, alpha, roll.
 *
 * uStretch elongates each quad along its own direction of travel, in
 * proportion to how far from the centre it is, which is exactly where the
 * apparent speed is highest. The atlas stretches with it, so the cloud
 * smears rather than just growing: motion blur for the price of a dot
 * product.
 */
export const CLOUD_VS = `#version 300 es
layout(location = 0) in vec4 aP;
layout(location = 1) in vec4 aB;
uniform vec2 uRes;
uniform float uFocal;
uniform vec2 uVPndc;
uniform float uStretch;
out vec2 vUv;
out float vA;
void main() {
  int id = gl_VertexID;
  vec2 corner = vec2(float(id & 1), float(id >> 1)) * 2.0 - 1.0;
  float c = cos(aB.w), s = sin(aB.w);
  vec2 rc = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
  float f = uFocal / aP.z;
  vec2 centre = aP.xy * f;
  vec2 off = rc * (aP.w * f);
  float rad = length(centre);
  if (rad > 1e-4 && uStretch > 0.0) {
    vec2 dir = centre / rad;
    float along = dot(off, dir);
    vec2 tang = off - dir * along;
    off = dir * along * (1.0 + uStretch * rad) + tang;
  }
  vec2 pos = centre + off;
  pos.x *= uRes.y / uRes.x;
  gl_Position = vec4(pos + uVPndc, 0.0, 1.0);
  vec2 uv = corner * 0.5 + 0.5;
  if (aB.y > 0.5) uv.x = 1.0 - uv.x;
  float col = mod(aB.x, 4.0);
  float row = 1.0 - floor(aB.x / 4.0);
  vUv = vec2((col + uv.x) * 0.25, (row + uv.y) * 0.5);
  vA = aB.z;
}`;

export const CLOUD_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
in float vA;
uniform sampler2D uAtlas;
out vec4 o;
void main() {
  vec4 t = texture(uAtlas, vUv);
  o = vec4(t.rgb, t.a * vA);
}`;

/**
 * The overlay: speed lines and the sun. Drawn last, premultiplied, over
 * everything.
 *
 * SPEED LINES. Two layers of thin radial segments, each with its own random
 * width, length, speed and phase from a hash of its angle, rushing outward
 * from the vanishing point and absent from the middle of the frame. About a
 * third of them are ink rather than white, because that is how the reference
 * frame draws them and it is what makes them read as drawn rather than as a
 * filter.
 *
 * THE SUN. A warm core off the top right, a wide falloff, an anamorphic
 * streak through it, three ghost discs along the line to the vanishing point,
 * and a warm wash over the whole upper right that comes up with speed.
 */
export const OVER_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uRes;
uniform vec2 uVP;
uniform float uTime;
uniform float uLines;
uniform float uGlare;
uniform vec2 uGlarePos;
uniform vec3 uInk;

float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

void main() {
  float asp = uRes.x / uRes.y;
  vec2 d = (vUv - uVP) * vec2(asp, 1.0);
  float r = length(d);
  float ang = atan(d.y, d.x) / 6.2831853 + 0.5;

  // Three layers: a few bold strokes, a middle band, and a fine hatch. Each
  // stroke tapers in from its inner end and stops dead at its outer end,
  // which is how a pen draws them.
  vec3 lc = vec3(0.0);
  float la = 0.0;
  for (int L = 0; L < 3; L++) {
    float N = L == 0 ? 44.0 : (L == 1 ? 84.0 : 136.0);
    float seed = float(L) * 31.7;
    float u = ang * N;
    float seg = floor(u);
    float f = fract(u) - 0.5;
    float h = hash(seg + seed);
    float w = (L == 0 ? mix(0.10, 0.26, hash(seg + seed + 1.7)) : mix(0.05, 0.16, hash(seg + seed + 1.7)));
    float line = 1.0 - smoothstep(w * 0.35, w, abs(f));
    float sp = 1.2 + hash(seg + seed + 3.3) * 1.8;
    float r0 = fract(h * 5.0 + uTime * sp) * 1.5 - 0.15;
    float len = mix(0.35, 1.0, hash(seg + seed + 5.1));
    float taper = smoothstep(r0, r0 + len * 0.45, r);
    float ext = taper * (1.0 - smoothstep(r0 + len - 0.03, r0 + len, r));
    float a = line * ext * smoothstep(0.16, 0.5, r) * mix(0.6, 1.0, hash(seg + seed + 7.9));
    float dark = step(0.66, hash(seg + seed + 9.2));
    vec3 col = mix(vec3(1.0), uInk, dark);
    a *= mix(0.92, 0.7, dark) * uLines;
    lc = lc * (1.0 - a) + col * a;
    la = la + a * (1.0 - la);
  }

  vec2 g = (vUv - uGlarePos) * vec2(asp, 1.0);
  float gr = length(g);
  float core = exp(-gr * gr * 6.0);
  float wide = exp(-gr * 1.6) * 0.45;
  float streak = exp(-abs(g.y) * 16.0) * exp(-abs(g.x) * 1.4) * 0.35;
  float wash = smoothstep(1.6, 0.2, gr) * 0.22;
  float ghosts = 0.0;
  for (int k = 1; k <= 3; k++) {
    float t = float(k) * 0.25;
    vec2 gp = mix(uGlarePos, uVP, t);
    vec2 dd = (vUv - gp) * vec2(asp, 1.0);
    float rr = 0.05 + float(k) * 0.035;
    ghosts += (1.0 - smoothstep(rr - 0.015, rr, length(dd))) * 0.10;
  }
  float ga = clamp((core + wide + streak + wash + ghosts) * uGlare, 0.0, 0.95);
  vec3 gc = mix(vec3(1.0, 0.78, 0.42), vec3(1.0, 0.96, 0.88), core);

  // premultiplied: the sun over the lines
  vec3 rgb = lc * la * (1.0 - ga) + gc * ga;
  float a = la * (1.0 - ga) + ga;
  o = vec4(rgb, a);
}`;
