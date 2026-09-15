/**
 * ============================================================================
 * The renderer. Hand rolled WebGL2 rather than a library: the scene is one
 * full screen triangle for the plate, one instanced draw for the clouds and
 * one more full screen triangle for the lines and the sun, and everything a
 * library would add is plumbing for things this does not do. The whole intro,
 * shaders included, has to come in under 30KB gzipped.
 *
 * SHADER COMPILATION DOES NOT BLOCK. Linking a program and then asking for
 * LINK_STATUS, or for a uniform location, stalls the main thread until the
 * driver is done. On the M2 that is 17ms. On SwiftShader, which is what
 * Lighthouse and any machine without GPU acceleration have, it was measured
 * at 894ms in one audit run: a single long task, 848ms of Total Blocking
 * Time, and a performance score of 58 where the other two runs scored 100.
 *
 * So no such question is asked until the driver has answered a cheap one.
 * With KHR_parallel_shader_compile, COMPLETION_STATUS_KHR is polled. Without
 * it, a fence is placed after the links and clientWaitSync with a zero timeout
 * reports whether the GPU process has got that far, which it answers from its
 * last known state without waiting. Only once the fence has signalled does the
 * renderer ask for LINK_STATUS and the uniform locations, and by then the
 * answers are already there.
 *
 * TEXTURE UPLOADS ARE SPREAD OUT. Each texImage2D copies the whole bitmap on
 * the main thread. The caller uploads the plate and the depth map on separate
 * frames as they decode, and the atlas later still, since nothing needs it
 * until the click.
 * ========================================================================= */

import { QUAD_VS, QUAD_FS, CLOUD_VS, CLOUD_FS, OVER_FS } from "./shaders";

export interface QuadState {
  scaleSky: number;
  scaleNear: number;
  nearFade: number;
  lift: number;
  streak: number;
}

export interface Constants {
  plateAspect: number;
  /** The vanishing point, y up. */
  vp: [number, number];
  sky: [number, number, number];
  bone: [number, number, number];
  ink: [number, number, number];
  focal: number;
  /** The sun, y up. */
  glare: [number, number];
}

/** Floats per billboard instance: x y z size, cell flip alpha roll. */
export const INSTANCE_FLOATS = 8;

const QUAD_U = [
  "uColor",
  "uDepth",
  "uRes",
  "uPlateAspect",
  "uVP",
  "uScaleSky",
  "uScaleNear",
  "uNearFade",
  "uLift",
  "uSky",
  "uBone",
  "uStreak",
];
const CLOUD_U = ["uAtlas", "uRes", "uFocal", "uVPndc", "uStretch"];
const OVER_U = [
  "uRes",
  "uVP",
  "uTime",
  "uLines",
  "uGlare",
  "uGlarePos",
  "uInk",
];

export class Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly parallel: { COMPLETION_STATUS_KHR: number } | null;
  private readonly quad: WebGLProgram;
  private readonly cloud: WebGLProgram;
  private readonly over: WebGLProgram;
  private fence: WebGLSync | null = null;
  private linked = false;
  private qu = new Map<string, WebGLUniformLocation | null>();
  private cu = new Map<string, WebGLUniformLocation | null>();
  private ou = new Map<string, WebGLUniformLocation | null>();
  private color: WebGLTexture | null = null;
  private depth: WebGLTexture | null = null;
  private atlas: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private ibuf: WebGLBuffer | null = null;
  private capacity = 0;
  private dead = false;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.parallel = gl.getExtension("KHR_parallel_shader_compile");
    this.quad = this.program(QUAD_VS, QUAD_FS);
    this.cloud = this.program(CLOUD_VS, CLOUD_FS);
    this.over = this.program(QUAD_VS, OVER_FS);
    if (!this.parallel) {
      this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
    }
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 1);
  }

  private program(vs: string, fs: string): WebGLProgram {
    const gl = this.gl;
    const p = gl.createProgram();
    if (!p) throw new Error("intro: createProgram failed");
    for (const [type, src] of [
      [gl.VERTEX_SHADER, vs],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const sh = gl.createShader(type);
      if (!sh) throw new Error("intro: createShader failed");
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    return p;
  }

  /** True once all three programs are usable. Non blocking where the driver allows. */
  ready(): boolean {
    if (this.linked) return true;
    if (this.dead) return false;
    const gl = this.gl;
    const programs = [this.quad, this.cloud, this.over];
    if (this.parallel) {
      const k = this.parallel.COMPLETION_STATUS_KHR;
      for (const p of programs) if (!gl.getProgramParameter(p, k)) return false;
    } else if (this.fence) {
      const st = gl.clientWaitSync(this.fence, 0, 0);
      if (st === gl.TIMEOUT_EXPIRED) return false;
      gl.deleteSync(this.fence);
      this.fence = null;
    }
    for (const p of programs) {
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        // Surface the compiler's message once, then let the caller bail to
        // the homepage. A dead intro must never be a dead page.
        console.error("intro: shader link failed:", gl.getProgramInfoLog(p));
        this.dead = true;
        return false;
      }
    }
    for (const n of QUAD_U) this.qu.set(n, gl.getUniformLocation(this.quad, n));
    for (const n of CLOUD_U)
      this.cu.set(n, gl.getUniformLocation(this.cloud, n));
    for (const n of OVER_U) this.ou.set(n, gl.getUniformLocation(this.over, n));
    gl.useProgram(this.quad);
    gl.uniform1i(this.qu.get("uColor") ?? null, 0);
    gl.uniform1i(this.qu.get("uDepth") ?? null, 1);
    gl.useProgram(this.cloud);
    gl.uniform1i(this.cu.get("uAtlas") ?? null, 2);
    this.linked = true;
    return true;
  }

  failed(): boolean {
    return this.dead;
  }

  private texture(img: TexImageSource, mip: boolean): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture();
    if (!t) throw new Error("intro: createTexture failed");
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (mip) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(
        gl.TEXTURE_2D,
        gl.TEXTURE_MIN_FILTER,
        gl.LINEAR_MIPMAP_LINEAR,
      );
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    return t;
  }

  setPlate(img: TexImageSource): void {
    this.color = this.texture(img, false);
  }
  setDepth(img: TexImageSource): void {
    this.depth = this.texture(img, false);
  }
  setAtlas(img: TexImageSource): void {
    // Mipmapped: a cloud spends most of its life small and far away, and
    // minifying a 512 cell without mips shimmers.
    this.atlas = this.texture(img, true);
  }
  hasPlate(): boolean {
    return !!this.color && !!this.depth;
  }
  hasAtlas(): boolean {
    return !!this.atlas;
  }

  resize(width: number, height: number): void {
    const c = this.gl.canvas as HTMLCanvasElement;
    if (c.width !== width || c.height !== height) {
      c.width = width;
      c.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  drawQuad(k: Constants, s: QuadState): void {
    const gl = this.gl;
    const u = (n: string) => this.qu.get(n) ?? null;
    gl.useProgram(this.quad);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.color);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.depth);
    gl.uniform2f(u("uRes"), gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(u("uPlateAspect"), k.plateAspect);
    gl.uniform2f(u("uVP"), k.vp[0], k.vp[1]);
    gl.uniform1f(u("uScaleSky"), s.scaleSky);
    gl.uniform1f(u("uScaleNear"), s.scaleNear);
    gl.uniform1f(u("uNearFade"), s.nearFade);
    gl.uniform1f(u("uLift"), s.lift);
    gl.uniform3f(u("uSky"), k.sky[0], k.sky[1], k.sky[2]);
    gl.uniform3f(u("uBone"), k.bone[0], k.bone[1], k.bone[2]);
    gl.uniform1f(u("uStreak"), s.streak);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Uploads `count` instances from `data` and draws them, back to front as
   *  given. Straight alpha over what is already there. */
  drawClouds(
    k: Constants,
    data: Float32Array,
    count: number,
    stretch: number,
  ): void {
    if (count === 0 || !this.atlas) return;
    const gl = this.gl;
    if (!this.vao) {
      this.vao = gl.createVertexArray();
      this.ibuf = gl.createBuffer();
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
      const stride = INSTANCE_FLOATS * 4;
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0);
      gl.vertexAttribDivisor(0, 1);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 16);
      gl.vertexAttribDivisor(1, 1);
    }
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    if (this.capacity < data.byteLength) {
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      this.capacity = data.byteLength;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * INSTANCE_FLOATS);
    }
    gl.useProgram(this.cloud);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform2f(
      this.cu.get("uRes") ?? null,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );
    gl.uniform1f(this.cu.get("uFocal") ?? null, k.focal);
    gl.uniform2f(
      this.cu.get("uVPndc") ?? null,
      k.vp[0] * 2 - 1,
      k.vp[1] * 2 - 1,
    );
    gl.uniform1f(this.cu.get("uStretch") ?? null, stretch);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /** The lines and the sun, premultiplied over everything. */
  drawOverlay(k: Constants, time: number, lines: number, glare: number): void {
    if (lines <= 0.001 && glare <= 0.001) return;
    const gl = this.gl;
    const u = (n: string) => this.ou.get(n) ?? null;
    gl.useProgram(this.over);
    gl.uniform2f(u("uRes"), gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform2f(u("uVP"), k.vp[0], k.vp[1]);
    gl.uniform1f(u("uTime"), time);
    gl.uniform1f(u("uLines"), lines);
    gl.uniform1f(u("uGlare"), glare);
    gl.uniform2f(u("uGlarePos"), k.glare[0], k.glare[1]);
    gl.uniform3f(u("uInk"), k.ink[0], k.ink[1], k.ink[2]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(null);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  /** Frees everything and releases the context. The canvas is the caller's. */
  destroy(): void {
    const gl = this.gl;
    for (const t of [this.color, this.depth, this.atlas])
      if (t) gl.deleteTexture(t);
    if (this.fence) gl.deleteSync(this.fence);
    if (this.ibuf) gl.deleteBuffer(this.ibuf);
    if (this.vao) gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.quad);
    gl.deleteProgram(this.cloud);
    gl.deleteProgram(this.over);
    this.color = this.depth = this.atlas = null;
    this.dead = true;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
