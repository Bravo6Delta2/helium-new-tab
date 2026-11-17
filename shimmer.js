// Helium Prism's GradientShimmer, ported from Svelte + ogl to plain WebGL2 so the page
// needs no build step. Shaders and constants are Prism's, unchanged.
// Source: https://github.com/imputnet/helium-prism (GPL-3.0)
(() => {
  const STRIPE_WIDTH = { min: 64, target: 110, max: 120 };
  const GRADIENT = { bandWidth: 0.48, minStop: 0.14, maxStop: 0.96 };
  const INTRO = { delay: 700, revealDuration: 840, idleBlendDuration: 500, stagger: 45, startCenter: 0.96, idleCenter: 0.5 };
  const WAVE_SPEED_UP = { multiplier: 2.15, rampUpDuration: 140, waveDuration: 320, rampDownDuration: 480 };
  const IDLE_WAVE = {
    speed: 0.42, stripePhase: 0.74, secondarySpeed: 0.26, secondaryStripePhase: 1.28,
    primaryAmplitude: 0.19, secondaryAmplitude: 0.055,
  };
  const GRAIN = {
    size: 180,
    hashScale: [127.1, 311.7],
    hashOffset: 43758.5,
    // Luminance, then the red, green and blue color shifts.
    channelOffsets: [[0, 0], [17, 3], [7, 29], [31, 11]],
  };

  const VERTEX_SHADER = `#version 300 es

precision highp float;

// X is 0 at the stripe's left edge and 1 at its right edge, Y is in clip space.
in vec2 position;

uniform vec2 u_size;
uniform float u_stripe_max_index;
uniform float u_stripe_width;
uniform float u_wave_phase;
uniform float u_secondary_wave_phase;
uniform float u_intro_active;
uniform float u_intro_elapsed;
uniform float u_shine_progress;

uniform float u_alpha;
uniform float u_intro_alpha;
uniform float u_speed_up_shine_boost;

uniform float u_gradient_band_width;
uniform float u_gradient_min_stop;
uniform float u_gradient_max_stop;
uniform float u_intro_reveal_duration;
uniform float u_intro_reveal_duration_inverse;
uniform float u_intro_idle_blend_duration_inverse;
uniform float u_intro_stagger;
uniform float u_intro_center_index;
uniform float u_intro_center_distance;
uniform float u_intro_start_center;
uniform float u_intro_idle_center;
uniform float u_idle_stripe_phase;
uniform float u_idle_secondary_stripe_phase;
uniform float u_idle_primary_amplitude;
uniform float u_idle_secondary_amplitude;

// Everything below is constant across a stripe, so it's computed per stripe
// instead of per pixel.
flat out float v_stripe_start;
// Band start, center and band end.
flat out vec3 v_band;
// Inverse lengths of the three gradient segments.
flat out vec3 v_band_inverse;
flat out float v_out_alpha;
flat out float v_highlight_strength;

const float EPSILON = 0.0001;

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

float easeOutCubic(float value) {
    float inverse = 1.0 - value;
    return 1.0 - inverse * inverse * inverse;
}

float introRevealProgress(float delayed_elapsed) {
    if (u_intro_active < 0.5) {
        return 1.0;
    }

    return easeOutCubic(
        clamp01(delayed_elapsed * u_intro_reveal_duration_inverse)
    );
}

float introIdleProgress(float delayed_elapsed) {
    if (u_intro_active < 0.5) {
        return 1.0;
    }

    return easeOutCubic(
        clamp01(
            (delayed_elapsed - u_intro_reveal_duration) *
                u_intro_idle_blend_duration_inverse
        )
    );
}

void main() {
    float stripe_index = float(gl_InstanceID);
    float stripe_start = stripe_index * u_stripe_width;
    float edge_x = (stripe_index + position.x) * u_stripe_width;

    // Avoid a gap at the right edge from float error.
    if (stripe_index == u_stripe_max_index && position.x > 0.5) {
        edge_x = u_size.x;
    }

    gl_Position = vec4(edge_x / u_size.x * 2.0 - 1.0, position.y, 0.0, 1.0);

    float reveal_delay = max(
        0.0,
        abs(stripe_index - u_intro_center_index) - u_intro_center_distance
    ) * u_intro_stagger;
    float delayed_intro_elapsed = u_intro_elapsed - reveal_delay;
    float reveal_progress = introRevealProgress(delayed_intro_elapsed);
    float idle_progress = introIdleProgress(delayed_intro_elapsed);
    float alpha = u_intro_alpha + (u_alpha - u_intro_alpha) * idle_progress;
    float stripe_phase = stripe_index * u_idle_stripe_phase;
    float secondary_stripe_phase = stripe_index * u_idle_secondary_stripe_phase;
    float primary_wave = sin(u_wave_phase - stripe_phase);
    float secondary_wave = sin(
        u_secondary_wave_phase + secondary_stripe_phase
    );
    float idle_center = 0.5 +
        primary_wave * u_idle_primary_amplitude +
        secondary_wave * u_idle_secondary_amplitude;
    float intro_center = mix(
        u_intro_start_center,
        u_intro_idle_center,
        reveal_progress
    );
    float center = mix(intro_center, idle_center, idle_progress);
    float band_start = clamp(
        center - u_gradient_band_width,
        u_gradient_min_stop,
        u_gradient_max_stop
    );
    float band_end = clamp(
        center + u_gradient_band_width,
        u_gradient_min_stop,
        u_gradient_max_stop
    );
    float gradient_alpha = clamp01(
        alpha * (1.0 + u_shine_progress * u_speed_up_shine_boost)
    ) * reveal_progress;
    float out_alpha = gradient_alpha + alpha * (1.0 - gradient_alpha);

    v_stripe_start = stripe_start;
    v_band = vec3(band_start, center, band_end);
    v_band_inverse = 1.0 / max(
        vec3(band_start, center - band_start, band_end - center),
        EPSILON
    );
    v_out_alpha = out_alpha;
    // Compositing the gradient over the start color reduces to
    // start + delta * amount * gradient_alpha / out_alpha.
    v_highlight_strength = gradient_alpha / max(out_alpha, EPSILON);
}`;

  const FRAGMENT_SHADER = `#version 300 es

precision highp float;

uniform vec2 u_size;
uniform float u_inverse_dpr;
uniform float u_stripe_width;
uniform float u_gradient_top;
uniform float u_gradient_vertical_span;
uniform float u_inverse_gradient_denominator;

uniform vec3 u_start_color;
uniform vec3 u_highlight_delta;
uniform float u_grain_alpha;
uniform float u_grain_luminance;
uniform float u_grain_contrast;
uniform float u_grain_saturation;
uniform sampler2D u_grain_noise;

flat in float v_stripe_start;
flat in vec3 v_band;
flat in vec3 v_band_inverse;
flat in float v_out_alpha;
flat in float v_highlight_strength;

const float GRAIN_SIZE = 180.0;

out vec4 fragment_color;

float clamp01(float value) {
    return clamp(value, 0.0, 1.0);
}

vec3 overlayBlend(vec3 base, vec3 blend) {
    vec3 low = 2.0 * base * blend;
    vec3 high = 1.0 - 2.0 * (1.0 - base) * (1.0 - blend);

    return mix(low, high, step(vec3(0.5), base));
}

float gradientHighlightAmount(float position) {
    if (position < v_band.x) {
        return 1.0 - clamp01(position * v_band_inverse.x);
    }

    if (position < v_band.y) {
        return clamp01((position - v_band.x) * v_band_inverse.y);
    }

    if (position < v_band.z) {
        return 1.0 - clamp01((position - v_band.y) * v_band_inverse.z);
    }

    return 0.0;
}

void main() {
    vec2 css_position = vec2(
        gl_FragCoord.x * u_inverse_dpr,
        u_size.y - gl_FragCoord.y * u_inverse_dpr
    );
    vec2 gradient_offset = vec2(
        css_position.x - v_stripe_start,
        css_position.y - u_gradient_top
    );
    vec2 gradient_axis = vec2(
        u_stripe_width,
        u_gradient_vertical_span
    );
    float gradient_position = clamp01(
        dot(gradient_offset, gradient_axis) * u_inverse_gradient_denominator
    );
    vec3 color = u_start_color + u_highlight_delta * (
        gradientHighlightAmount(gradient_position) * v_highlight_strength
    );

    ivec2 grain_position = min(
        ivec2(mod(css_position, GRAIN_SIZE)),
        ivec2(GRAIN_SIZE - 1.0)
    );
    vec4 noise = texelFetch(u_grain_noise, grain_position, 0) - 0.5;
    float luminance = u_grain_luminance + noise.r * u_grain_contrast;
    vec3 color_shift = noise.gba * u_grain_saturation;
    vec3 grain = clamp((vec3(luminance) + color_shift) / 255.0, 0.0, 1.0);

    color = mix(color, overlayBlend(color, grain), u_grain_alpha);

    fragment_color = vec4(color * v_out_alpha, v_out_alpha);
}`;

  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, progress) => start + (end - start) * progress;
  const easeOutCubic = (value) => 1 - Math.pow(1 - value, 3);
  const easeInOutCubic = (value) => (value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2);

  // Grain is static, so it's hashed once here instead of per pixel every frame.
  function createGrainNoise() {
    const { size, hashScale, hashOffset, channelOffsets } = GRAIN;
    const data = new Uint8Array(size * size * channelOffsets.length);
    let index = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        for (const [offsetX, offsetY] of channelOffsets) {
          const hash = Math.sin((x + offsetX) * hashScale[0] + (y + offsetY) * hashScale[1]) * hashOffset;
          data[index++] = Math.round((hash - Math.floor(hash)) * 255);
        }
      }
    }
    return data;
  }

  function getStripeMetrics(width) {
    const minCount = Math.max(1, Math.ceil(width / STRIPE_WIDTH.max));
    const maxCount = Math.max(1, Math.floor(width / STRIPE_WIDTH.min));
    const count = Math.max(minCount, Math.min(maxCount, Math.max(1, Math.round(width / STRIPE_WIDTH.target))));
    const maxIndex = count - 1;
    return {
      count,
      width: width / count,
      maxIndex,
      introCenterIndex: maxIndex / 2,
      introCenterDistance: count % 2 === 0 ? 0.5 : 0,
    };
  }

  function introCompleteAt(startedAt, stripeCount) {
    const center = (stripeCount - 1) / 2;
    const centerDistance = stripeCount % 2 === 0 ? 0.5 : 0;
    const maxRevealDelay = Math.max(0, Math.abs(0 - center) - centerDistance) * INTRO.stagger;
    return startedAt + INTRO.delay + maxRevealDelay + INTRO.revealDuration + INTRO.idleBlendDuration;
  }

  // Reads a CSS color through a 2D context, which normalizes any CSS color to hex or rgba().
  const colorContext = document.createElement("canvas").getContext("2d");
  function readColor(styles, name) {
    colorContext.fillStyle = "#000000";
    colorContext.fillStyle = styles.getPropertyValue(name).trim();
    const value = colorContext.fillStyle;
    if (value.startsWith("#")) return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
    return value.match(/[\d.]+/g).slice(0, 3).map((channel) => Number(channel) / 255);
  }
  const readNumber = (styles, name) => Number(styles.getPropertyValue(name).trim());

  function createRenderer(canvas) {
    const gl = canvas.getContext("webgl2", {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, preserveDrawingBuffer: false,
    });
    if (!gl) return null;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    try {
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } catch (err) {
      console.warn("Shimmer disabled:", err);
      return null;
    }
    gl.useProgram(program);

    // One instanced quad per stripe. The vertex shader takes the stripe index
    // from gl_InstanceID, so no per-instance attribute is needed.
    gl.bindVertexArray(gl.createVertexArray());
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 0, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, GRAIN.size, GRAIN.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, createGrainNoise());
    for (const [key, value] of [
      [gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST],
      [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    ]) gl.texParameteri(gl.TEXTURE_2D, key, value);

    const locations = {};
    const set = (name, value) => {
      const loc = locations[name] ??= gl.getUniformLocation(program, name);
      if (typeof value === "number") gl.uniform1f(loc, value);
      else if (value.length === 2) gl.uniform2fv(loc, value);
      else gl.uniform3fv(loc, value);
    };
    gl.uniform1i(gl.getUniformLocation(program, "u_grain_noise"), 0);
    set("u_gradient_band_width", GRADIENT.bandWidth);
    set("u_gradient_min_stop", GRADIENT.minStop);
    set("u_gradient_max_stop", GRADIENT.maxStop);
    set("u_intro_reveal_duration", INTRO.revealDuration);
    set("u_intro_reveal_duration_inverse", 1 / INTRO.revealDuration);
    set("u_intro_idle_blend_duration_inverse", 1 / INTRO.idleBlendDuration);
    set("u_intro_stagger", INTRO.stagger);
    set("u_intro_start_center", INTRO.startCenter);
    set("u_intro_idle_center", INTRO.idleCenter);
    set("u_idle_stripe_phase", IDLE_WAVE.stripePhase);
    set("u_idle_secondary_stripe_phase", IDLE_WAVE.secondaryStripePhase);
    set("u_idle_primary_amplitude", IDLE_WAVE.primaryAmplitude);
    set("u_idle_secondary_amplitude", IDLE_WAVE.secondaryAmplitude);
    gl.clearColor(0, 0, 0, 0);

    let stripes = getStripeMetrics(1);

    return {
      resize() {
        // Grain cells are CSS pixels and the gradient is smooth, so rendering
        // above CSS resolution adds nothing. The canvas is upscaled pixelated.
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
        canvas.width = Math.round(width);
        canvas.height = Math.round(height);
        gl.viewport(0, 0, canvas.width, canvas.height);
        stripes = getStripeMetrics(width);
        const verticalSpan = height * 1.7;
        set("u_size", [width, height]);
        set("u_inverse_dpr", 1);
        set("u_stripe_max_index", stripes.maxIndex);
        set("u_stripe_width", stripes.width);
        set("u_gradient_top", height * -0.35);
        set("u_gradient_vertical_span", verticalSpan);
        set("u_inverse_gradient_denominator", 1 / (stripes.width * stripes.width + verticalSpan * verticalSpan));
        set("u_intro_center_index", stripes.introCenterIndex);
        set("u_intro_center_distance", stripes.introCenterDistance);
      },
      readColors() {
        const styles = getComputedStyle(canvas);
        const start = readColor(styles, "--shimmer-start");
        const highlight = readColor(styles, "--shimmer-highlight");
        set("u_start_color", start);
        set("u_highlight_delta", highlight.map((value, i) => value - start[i]));
        set("u_alpha", readNumber(styles, "--shimmer-alpha"));
        set("u_intro_alpha", readNumber(styles, "--shimmer-intro-alpha"));
        set("u_speed_up_shine_boost", readNumber(styles, "--shimmer-speed-up-shine-boost"));
        set("u_grain_alpha", readNumber(styles, "--shimmer-grain-alpha"));
        set("u_grain_luminance", readNumber(styles, "--shimmer-grain-luminance"));
        set("u_grain_contrast", readNumber(styles, "--shimmer-grain-contrast"));
        set("u_grain_saturation", readNumber(styles, "--shimmer-grain-saturation"));
      },
      render({ time, wavePhase, secondaryWavePhase, introStartedAt, shineProgress }) {
        set("u_wave_phase", wavePhase);
        set("u_secondary_wave_phase", secondaryWavePhase);
        set("u_intro_active", introStartedAt === null ? 0 : 1);
        set("u_intro_elapsed", introStartedAt === null ? 0 : time - introStartedAt - INTRO.delay);
        set("u_shine_progress", shineProgress);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, stripes.count);
      },
      stripeCount: () => stripes.count,
    };
  }

  // The speed-up wave: ramp up, hold at peak, ease back down.
  const IDLE = { multiplier: 1, shineProgress: 0 };
  const PEAK = { multiplier: WAVE_SPEED_UP.multiplier, shineProgress: 1 };
  const lerpValues = (from, to, progress) => ({
    multiplier: lerp(from.multiplier, to.multiplier, progress),
    shineProgress: lerp(from.shineProgress, to.shineProgress, progress),
  });
  const progressOf = (time, startedAt, duration) => clamp((time - startedAt) / duration);

  function updateSpeedUp(time, anim) {
    if (!anim) return { animation: null, ...IDLE };
    if (anim.phase === "ramp-up") {
      const progress = progressOf(time, anim.startedAt, anim.duration);
      const values = lerpValues(anim.from, PEAK, easeOutCubic(progress));
      return { animation: progress >= 1 ? { phase: "hold", startedAt: time } : anim, ...values };
    }
    if (anim.phase === "hold") {
      const done = progressOf(time, anim.startedAt, WAVE_SPEED_UP.waveDuration) >= 1;
      return { animation: done ? { phase: "ramp-down", startedAt: time, from: PEAK } : anim, ...PEAK };
    }
    const progress = progressOf(time, anim.startedAt, WAVE_SPEED_UP.rampDownDuration);
    return { animation: progress >= 1 ? null : anim, ...lerpValues(anim.from, IDLE, easeInOutCubic(progress)) };
  }

  function triggerSpeedUp(time, anim) {
    const { multiplier, shineProgress } = updateSpeedUp(time, anim);
    const from = { multiplier, shineProgress };
    if (multiplier >= PEAK.multiplier && shineProgress >= 1) return { phase: "hold", startedAt: time };
    const remaining = Math.max(
      clamp((PEAK.multiplier - multiplier) / (PEAK.multiplier - 1)),
      1 - shineProgress,
    );
    return { phase: "ramp-up", startedAt: time, duration: Math.max(1, WAVE_SPEED_UP.rampUpDuration * remaining), from };
  }

  // Starts the shimmer on a canvas. Returns { emphasize } to speed the wave up briefly.
  window.startShimmer = (canvas) => {
    const renderer = createRenderer(canvas);
    if (!renderer) {
      canvas.classList.add("fallback", "visible");
      return { emphasize() {} };
    }

    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let wavePhase = Math.random() * Math.PI * 2;
    let secondaryWavePhase = -wavePhase * 0.7;
    let intro = reducedMotion.matches ? null : { startedAt: performance.now() };
    let speedUp = null;
    let lastFrameTime = null;
    let frame = null;

    const drawFrame = (time) => {
      const still = reducedMotion.matches;
      const delta = still || lastFrameTime === null ? 0 : Math.min((time - lastFrameTime) / 1000, 0.064);
      const state = updateSpeedUp(time, still ? null : speedUp);
      lastFrameTime = still ? null : time;
      speedUp = state.animation;
      wavePhase += IDLE_WAVE.speed * state.multiplier * delta;
      secondaryWavePhase += IDLE_WAVE.secondarySpeed * state.multiplier * delta;
      renderer.render({
        time, wavePhase, secondaryWavePhase,
        introStartedAt: still || !intro ? null : intro.startedAt,
        shineProgress: still ? 0 : state.shineProgress,
      });
      if (intro && time >= introCompleteAt(intro.startedAt, renderer.stripeCount())) intro = null;
    };

    // The idle wave is slow, so it's drawn at about 30 fps. Every frame also redraws the
    // blur of the glass on top. The intro and the speed-up wave get every frame.
    const IDLE_FRAME = 1000 / 30 - 2;
    let drawnAt = -Infinity;
    const loop = (time) => {
      frame = null;
      if (intro || speedUp || time - drawnAt >= IDLE_FRAME) {
        drawnAt = time;
        drawFrame(time);
      }
      if (!reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const resume = () => {
      if (frame !== null) return;
      lastFrameTime = null;
      frame = requestAnimationFrame(loop);
    };

    renderer.resize();
    renderer.readColors();
    drawFrame(performance.now());
    // Reveal after the first frame has been painted
    requestAnimationFrame(() => canvas.classList.add("visible"));
    resume();

    new ResizeObserver(() => requestAnimationFrame((time) => { renderer.resize(); drawFrame(time); })).observe(canvas);
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
      requestAnimationFrame((time) => { renderer.readColors(); drawFrame(time); }));
    reducedMotion.addEventListener("change", () => (reducedMotion.matches ? drawFrame(performance.now()) : resume()));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) resume(); });

    return {
      emphasize() {
        if (reducedMotion.matches) return;
        speedUp = triggerSpeedUp(performance.now(), speedUp);
        resume();
      },
    };
  };
})();
