/**
 * ============================================================================
 * The billboard pool. A fixed number of clouds in a loose cylinder around the
 * camera axis, travelling toward the viewer and recycled to the far end when
 * they pass. Positions are updated on the CPU, which for a few dozen items is
 * nothing, and written into one instance buffer sorted back to front so the
 * outlines composite correctly where clouds overlap.
 *
 * Seeded, not Math.random, so two runs place the same clouds. That makes the
 * frame strip reproducible and a visual regression possible.
 * ========================================================================= */

import { CLOUDS, FLY } from "./timing";
import { INSTANCE_FLOATS } from "./gl";

/** mulberry32. Small, fast, and good enough for cloud placement. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class CloudPool {
  readonly count: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly z: Float32Array;
  private readonly size: Float32Array;
  private readonly cell: Float32Array;
  private readonly flip: Float32Array;
  private readonly roll: Float32Array;
  private readonly order: Int32Array;
  private readonly rand: () => number;
  /** What drawClouds uploads. */
  readonly buffer: Float32Array;

  constructor(count: number, seed = 1845) {
    this.count = count;
    this.rand = rng(seed);
    this.x = new Float32Array(count);
    this.y = new Float32Array(count);
    this.z = new Float32Array(count);
    this.size = new Float32Array(count);
    this.cell = new Float32Array(count);
    this.flip = new Float32Array(count);
    this.roll = new Float32Array(count);
    this.order = new Int32Array(count);
    this.buffer = new Float32Array(count * INSTANCE_FLOATS);
    // Fill the whole depth range up front, so the fly does not begin with an
    // empty sky that then fills from the back.
    for (let i = 0; i < count; i++) {
      this.spawn(
        i,
        CLOUDS.Z_NEAR + (CLOUDS.Z_FAR - CLOUDS.Z_NEAR) * this.rand(),
      );
      this.order[i] = i;
    }
  }

  private spawn(i: number, z: number): void {
    const r = this.rand;
    const a = r() * Math.PI * 2;
    // sqrt biases the radius outward: more clouds at the edges of the frame,
    // fewer through the middle where the eye is heading
    const rad = CLOUDS.R_MIN + (CLOUDS.R_MAX - CLOUDS.R_MIN) * Math.sqrt(r());
    this.x[i] = Math.cos(a) * rad;
    this.y[i] = Math.sin(a) * rad;
    this.z[i] = z;
    this.size[i] = CLOUDS.SIZE_MIN + (CLOUDS.SIZE_MAX - CLOUDS.SIZE_MIN) * r();
    this.cell[i] = Math.floor(r() * CLOUDS.CELLS);
    this.flip[i] = r() < 0.5 ? 0 : 1;
    this.roll[i] = (r() - 0.5) * 0.18;
  }

  /** Advances every cloud by `speed` world units per second. */
  update(dtSeconds: number, speed: number): void {
    const step = speed * dtSeconds;
    for (let i = 0; i < this.count; i++) {
      const z = (this.z[i] ?? 0) - step;
      if (z < CLOUDS.Z_NEAR) this.spawn(i, CLOUDS.Z_FAR - (CLOUDS.Z_NEAR - z));
      else this.z[i] = z;
    }
  }

  /**
   * Writes the instance buffer back to front and returns how many to draw.
   * Each cloud fades in at the far end and out again as it passes the camera,
   * so nothing pops at either end of its life, and the whole set is scaled by
   * `alpha`, which the timeline lowers as the sky lifts.
   */
  write(alpha: number): number {
    const z = this.z;
    const ord = this.order;
    // insertion sort on z descending: the order barely changes frame to frame
    for (let i = 1; i < this.count; i++) {
      const v = ord[i] ?? 0;
      const zv = z[v] ?? 0;
      let j = i - 1;
      while (j >= 0 && (z[ord[j] ?? 0] ?? 0) < zv) {
        ord[j + 1] = ord[j] ?? 0;
        j--;
      }
      ord[j + 1] = v;
    }
    let n = 0;
    const b = this.buffer;
    for (let k = 0; k < this.count; k++) {
      const i = ord[k] ?? 0;
      const zi = z[i] ?? 0;
      const a =
        alpha *
        smooth(CLOUDS.Z_NEAR, CLOUDS.Z_NEAR + CLOUDS.FADE_OUT_Z, zi) *
        (1 - smooth(CLOUDS.Z_FAR - CLOUDS.FADE_IN_Z, CLOUDS.Z_FAR, zi));
      if (a <= 0.004) continue;
      const o = n * INSTANCE_FLOATS;
      b[o] = this.x[i] ?? 0;
      b[o + 1] = this.y[i] ?? 0;
      b[o + 2] = zi;
      b[o + 3] = this.size[i] ?? 1;
      b[o + 4] = this.cell[i] ?? 0;
      b[o + 5] = this.flip[i] ?? 0;
      b[o + 6] = a;
      b[o + 7] = this.roll[i] ?? 0;
      n++;
    }
    return n;
  }
}

/** The vanishing point in y-up screen space, for the renderer. */
export const VP_SCREEN: [number, number] = [FLY.VP_X, 1 - FLY.VP_Y];
