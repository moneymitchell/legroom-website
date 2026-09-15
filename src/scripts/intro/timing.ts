/**
 * ============================================================================
 * Every duration, amplitude and count in the intro, in one place, so retuning
 * is a matter of changing a number here and never of hunting through a shader.
 *
 * The intro has two halves. Before the click it is a still: the illustration,
 * the lockup, the sign. Nothing moves except the sign pressing itself. Every
 * time below is MILLISECONDS AFTER THE CLICK.
 * ========================================================================= */

export const T = {
  /** The sign depresses. */
  PRESS: 90,
  /** The lockup and the sign scale down and fade, from here for this long. */
  UI_OUT_START: 60,
  UI_OUT: 200,
  /** Cloud speed, cloud alpha and the plate's push ramp in over this, so the
   *  launch is a shove and not a cut. */
  FLY_RAMP: 350,
  /** The whiteout: the frame washes to the paper token between these. */
  WASH_START: 900,
  WASH_END: 1200,
  /** The lockup beat, unchanged from before: in on paper, hold, travel to the
   *  nav lockup's box, then a cross dissolve into the real one. */
  LOGO_START: 1200,
  LOGO_FADE_IN: 180,
  LOGO_HOLD_END: 1650,
  LOGO_END: 1950,
  HANDOFF: 120,
  TOTAL: 2070,
  /** The exit when a visitor skips. */
  SKIP_FADE: 200,
  /** How long to wait for the plate to decode before starting on flat sky. */
  DECODE_WAIT: 600,
} as const;

/** The flight. Straight down Z: no pan, no tilt, no drift. */
export const FLY = {
  /** Two scales blended per pixel by nearness. The cabin and the legs go
   *  hard, so the frame reads as breaking out of the seat; the sky goes
   *  gently, so it reads as depth rather than a zoom. */
  SKY_SCALE_END: 2.0,
  SKY_CURVE: 1.4,
  /** The seat frame HOLDS while the sky starts to move, the way the reference
   *  frame keeps the legs sharp with the world streaking past them, and only
   *  then breaks out: near geometry starts scaling here and is at full scale
   *  and faded to sky by the whiteout. */
  NEAR_START: 420,
  NEAR_END: 1150,
  NEAR_SCALE_END: 6.0,
  NEAR_CURVE: 1.3,
  /** Near geometry has faded to sky by here. */
  CABIN_GONE: 1080,
  /** The radial zoom smear on the plate. */
  STREAK: 1.0,
  STREAK_START: 150,
  STREAK_PEAK: 800,
  /** The speed lines. */
  LINES: 1.0,
  LINES_START: 180,
  LINES_FULL: 550,
  /** The sun. Positions are y up. It sweeps in from off the top right corner
   *  to its resting spot as the speed comes up. */
  GLARE: 1.0,
  GLARE_START: 220,
  GLARE_FULL: 850,
  GLARE_FROM_X: 1.35,
  GLARE_FROM_Y: 1.3,
  GLARE_X: 0.9,
  GLARE_Y: 0.94,
  /** The vanishing point, as a fraction of the frame, y from the top. */
  VP_X: 0.5,
  VP_Y: 0.42,
} as const;

/** The billboard pool. World units: at z = 1 a radius of 1 is about the
 *  frame edge. */
export const CLOUDS = {
  /** Cut this first if any frame goes over 20ms. */
  COUNT: 56,
  Z_NEAR: 0.9,
  Z_FAR: 22,
  /** Spawn radius around the axis, biased outward so the centre stays
   *  readable and the clouds go PAST the viewer rather than into them. */
  R_MIN: 1.0,
  R_MAX: 4.0,
  SIZE_MIN: 0.8,
  SIZE_MAX: 1.9,
  /** World units per second at full speed. */
  SPEED: 30,
  FOCAL: 1.2,
  /** Cells in the atlas, 4 across by 2 down. */
  CELLS: 8,
  /** Fade in over this much of the approach, and out over this as a cloud
   *  passes the camera, so nothing pops at either end. */
  FADE_IN_Z: 10,
  FADE_OUT_Z: 0.8,
  /** Radial motion stretch at full speed, per unit of screen radius. A cloud
   *  at the frame edge is drawn this much longer along its own direction of
   *  travel, which is what "whizzing past" looks like in a still frame. */
  STRETCH: 1.0,
} as const;

/** The illustration's own sky blue, sampled at 50%, 30% by
 *  scripts/build-intro-assets.mjs, which prints it on every run so this can be
 *  checked against it. #187ee0. Near geometry fades to this and the sky lifts
 *  from it to the paper token, which is read from the stylesheet at runtime. */
export const SKY_RGB: readonly [number, number, number] = [24, 126, 224];

/** The lockup beat. */
export const LOGO = {
  /** The lockup's width on paper, before it travels to the nav. Capped so it
   *  can never out-area the headline and become the LCP element. */
  WIDTH_VW: 0.34,
  MAX_WIDTH: 500,
  SCALE_IN: 1.05,
} as const;

/** Canvas resolution is capped here. On a 2x display the fragment shader runs
 *  over every physical pixel, and the streak alone is six taps. */
export const RENDER_DPR_MAX = 2;
