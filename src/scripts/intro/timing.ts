/**
 * ============================================================================
 * Every duration, amplitude and count in the intro, in one place, so retuning
 * is a matter of changing a number here and never of hunting through a shader.
 *
 * Times are milliseconds from the first frame. Amplitudes are fractions of the
 * frame width unless a unit is named.
 * ========================================================================= */

/** The four stages and the beats inside them. */
export const T = {
  /** Stage 1, the look around, ends and the fly begins. */
  LOOK_END: 1300,
  /** Stage 2, the fly, ends and the lockup comes in. */
  FLY_END: 3500,
  /** Stage 3 ends: the lockup has arrived at the nav's box. */
  LOGO_END: 4250,
  /** Stage 4 ends: the overlay is gone. */
  TOTAL: 4600,

  /** Cloud speed and cloud alpha ramp from zero over this long at the start of
   *  the fly, so leaving the cabin is a push and not a cut. The look around's
   *  parallax decays over the same window. */
  FLY_RAMP: 400,
  /** Near geometry, the legs and the seat edges, has faded to sky by here. */
  CABIN_GONE: 2400,
  /** The sky lifts from the illustration's blue to the paper token. */
  SKY_LIFT_START: 1600,
  SKY_LIFT_END: 3300,
  /** The radial streak rises to its peak and falls away between these. */
  STREAK_START: 1500,
  STREAK_END: 3300,

  /** The lockup's fade in, then a hold, then the travel to the nav. */
  LOGO_FADE_IN: 180,
  LOGO_HOLD_END: 3950,
  /** The cross dissolve of the overlay lockup into the real one. */
  HANDOFF: 120,

  /** Cursor influence eases in over this, rather than snapping to wherever the
   *  pointer happened to be when the page loaded. */
  POINTER_EASE_IN: 300,
  /** The exit when a visitor skips. */
  SKIP_FADE: 200,
  /** How long to wait for the plate to decode before starting on flat sky. */
  DECODE_WAIT: 600,
} as const;

/** Stage 1. */
export const LOOK = {
  /** Two incommensurate frequencies, so the drift never visibly repeats. */
  IDLE_AMP: 0.022,
  IDLE_HZ_X: 0.11,
  IDLE_HZ_Y: 0.17,
  /** The cursor's share of the total, on top of the idle drift. */
  POINTER_WEIGHT: 0.4,
  /** Per frame. Heavy lag on purpose: a head has mass. */
  POINTER_LERP: 0.06,
  /** THE HARD CEILING on total camera translation. Above about 4 percent of
   *  the width the window frames begin to smear on the depth warp. Measured on
   *  the DIBR test before any of this was written. Do not raise it. */
  CEILING: 0.04,
  /** Degrees. A head that turns also tilts, a little, out of phase. */
  ROLL_DEG: 0.5,
  ROLL_HZ: 0.13,
  /** FOV breathing, as a scale. 0.4 percent is well under a degree. */
  BREATHE: 0.004,
  BREATHE_HZ: 0.2,
  /** How much the far sky follows the camera. The brief has far geometry not
   *  moving at all; a real head that turns pans everything, and a frozen sky
   *  reads as a diorama. Twenty percent keeps it honest. Set to 0 for pure
   *  translation. */
  FAR_FOLLOW: 0.2,
  /** Lens. Both are below the threshold of being nameable. */
  BARREL: 0.035,
  VIGNETTE: 0.22,
  /** Overscan, as a zoom. Must cover CEILING plus BARREL, or the warp walks
   *  the plate's edge into view. */
  OVERSCAN: 1.07,
} as const;

/** Stage 2. */
export const FLY = {
  /** Two scales, blended per pixel by nearness. One curve for everything
   *  left the legs full size until they had already faded, because the ease
   *  in that looks right on the sky is far too slow on the thing nearest the
   *  lens. The legs have to be past the frame edges by CABIN_GONE, which
   *  means near geometry at about 2.7x when the fly is half done. */
  SKY_SCALE_END: 1.8,
  SKY_CURVE: 1.5,
  NEAR_SCALE_END: 5.0,
  NEAR_CURVE: 1.2,
  /** Radial streak strength at its peak. If it looks like a filter, lower it. */
  STREAK: 0.5,
  /** The window vanishing point, as a fraction of the frame, y from the top. */
  VP_X: 0.5,
  VP_Y: 0.42,
} as const;

/** The billboard pool. World units: at z = 1 a radius of 1 is roughly the
 *  frame edge. */
export const CLOUDS = {
  /** Cut this first if any frame goes over 20ms. */
  COUNT: 36,
  Z_NEAR: 1.0,
  Z_FAR: 24,
  /** Spawn radius around the camera axis, biased outward so the centre of the
   *  frame stays readable. */
  R_MIN: 1.5,
  R_MAX: 4.2,
  /** A cloud is invisible when it spawns and fades in over this much of its
   *  approach. Far clouds all project to within a few pixels of the vanishing
   *  point, and with a short fade the fly opened on a clump of confetti there.
   *  By the time one is a third of the way in it has spread out. */
  FADE_IN_Z: 14,
  /** And fades out over this as it passes the camera, so nothing pops. */
  FADE_OUT_Z: 1.2,
  SIZE_MIN: 0.85,
  SIZE_MAX: 1.6,
  /** World units per second at full speed. */
  SPEED: 13,
  FOCAL: 1.2,
  /** Cells in the atlas, 4 across by 2 down. */
  CELLS: 8,
} as const;

/** The illustration's own sky blue, sampled at 50%, 30% by
 *  scripts/build-intro-assets.mjs, which prints it on every run so this can be
 *  checked against it. #187ee0. Near geometry fades to this and the sky lifts
 *  from it to the paper token, which is read from the stylesheet at runtime. */
export const SKY_RGB: readonly [number, number, number] = [24, 126, 224];

/** Stage 3. */
export const LOGO = {
  /** The lockup's width on the sky, before it travels to the nav. Capped so
   *  it can never out-area the headline and become the LCP element. */
  WIDTH_VW: 0.34,
  MAX_WIDTH: 500,
  SCALE_IN: 1.05,
} as const;

/** Canvas resolution is capped here. On a 2x display the fragment shader runs
 *  over every physical pixel, and the streak alone is four taps. */
export const RENDER_DPR_MAX = 2;
