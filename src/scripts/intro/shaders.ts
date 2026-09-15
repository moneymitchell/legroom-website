/**
 * ============================================================================
 * Two programs. The quad is the illustration with a camera in it; the clouds
 * are instanced billboards. GLSL ES 3.00, so WebGL2 only, which the gate in
 * Base.astro has already checked before any of this is fetched.
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
 * The camera, per pixel.
 *
 * Order matters and reads bottom up from the sample: lens first, in screen
 * space (barrel, roll, breathing zoom), then the fly's scale about the
 * vanishing point where the scale itself depends on the depth under the
 * pixel, then the look around's parallax, again depth weighted, then the
 * cover mapping into the plate, then the streak taps along the radial.
 *
 * The depth for the fly is sampled twice. Depth is the depth at the point we
 * end up sampling, not the point we started from, so one refinement step is
 * cheap and stops the legs' scale being driven by the sky behind them.
 */
export const QUAD_FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uRes;
uniform float uPlateAspect;
uniform vec2 uShift;
uniform float uRoll;
uniform float uZoom;
uniform vec2 uVP;
uniform float uScaleSky;
uniform float uScaleNear;
uniform float uFarFollow;
uniform float uNearFade;
uniform float uLift;
uniform vec3 uSky;
uniform vec3 uBone;
uniform float uStreak;
uniform float uBarrel;
uniform float uVig;

vec2 cover(vec2 p) {
  float ca = uRes.x / uRes.y;
  vec2 s = ca > uPlateAspect ? vec2(1.0, uPlateAspect / ca) : vec2(ca / uPlateAspect, 1.0);
  return (p - 0.5) * s + 0.5;
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 d = vUv - 0.5;

  // radius, 0 at centre, 1 at the corner, aspect corrected
  vec2 da = vec2(d.x * asp, d.y);
  float r2 = dot(da, da) / (0.25 * asp * asp + 0.25);

  // lens: barrel, roll, breathing
  d *= 1.0 + uBarrel * r2;
  float c = cos(uRoll), s = sin(uRoll);
  da = vec2(d.x * asp, d.y);
  d = vec2((da.x * c - da.y * s) / asp, da.x * s + da.y * c);
  d /= uZoom;
  vec2 p = d + 0.5;

  // the fly: scale about the vanishing point, near faster than far
  // The depth map is honest about the shoes: they are further from the eye
  // than the thighs, 0.24 against 0.54, with sky at 0.10. Used raw, that gave
  // the shoes half the scale and almost none of the fade, and they hung in
  // the frame as ghosts for a second after the legs had gone. So depth is
  // remapped to nearness: sky pinned at 0, the shoes at 0.87, and the walls
  // and legs at 1. The ramp is narrow on purpose. Widening it to 0.42 left a
  // shoe outline in the lift.
  vec2 q = p;
  float dep = texture(uDepth, cover(q)).r;
  float near = smoothstep(0.13, 0.26, dep);
  for (int i = 0; i < 2; i++) {
    float sc = mix(uScaleSky, uScaleNear, near);
    q = uVP + (p - uVP) / sc;
    dep = texture(uDepth, cover(q)).r;
    near = smoothstep(0.13, 0.26, dep);
  }

  // the look around: near moves, far mostly does not
  q += uShift * mix(uFarFollow, 1.0, near);
  vec2 uv = cover(q);

  vec3 col;
  if (uStreak > 0.001) {
    vec2 dir = (q - uVP) * (uStreak * r2 * 0.03);
    col = texture(uColor, uv).rgb;
    col += texture(uColor, cover(q - dir)).rgb;
    col += texture(uColor, cover(q - dir * 2.0)).rgb;
    col += texture(uColor, cover(q - dir * 3.0)).rgb;
    col *= 0.25;
  } else {
    col = texture(uColor, uv).rgb;
  }

  // near geometry dissolves to whatever the sky is right now, then the whole
  // frame lifts to paper
  vec3 skyNow = mix(uSky, uBone, uLift);
  col = mix(col, skyNow, uNearFade * near);
  col = mix(col, uBone, uLift);

  col *= 1.0 - uVig * r2;
  o = vec4(col, 1.0);
}`;

/**
 * Billboards. One quad per instance from gl_VertexID, positioned by a pinhole
 * projection about the vanishing point. Per instance: position and size, then
 * atlas cell, horizontal flip, alpha, roll.
 */
export const CLOUD_VS = `#version 300 es
layout(location = 0) in vec4 aP;
layout(location = 1) in vec4 aB;
uniform vec2 uRes;
uniform float uFocal;
uniform vec2 uVPndc;
out vec2 vUv;
out float vA;
void main() {
  int id = gl_VertexID;
  vec2 corner = vec2(float(id & 1), float(id >> 1)) * 2.0 - 1.0;
  float c = cos(aB.w), s = sin(aB.w);
  vec2 rc = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
  float f = uFocal / aP.z;
  vec2 pos = aP.xy * f + rc * (aP.w * f);
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
