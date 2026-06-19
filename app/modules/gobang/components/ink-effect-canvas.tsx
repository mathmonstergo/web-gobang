import { useCallback, useEffect, useRef, type ReactElement } from "react";

import { BOARD_VIEW_SIZE, getCanvasPoint } from "@/modules/gobang/board-geometry";
import {
  WAVE_DURATION_MS,
  type PlacementEffect,
  type Player,
  type WaveBurst,
  type WaveHighlight
} from "@/modules/gobang/types";

type InkEffectCanvasProps = {
  placement: PlacementEffect | null;
  waveBursts: readonly WaveBurst[];
};

type InkParticle = {
  angle: number;
  maxDistance: number;
  radius: number;
  alpha: number;
  wobble: number;
  stretch: number;
};

type InkConfig = {
  count: number;
  duration: number;
  rgb: string;
  impactRgb: string;
  veinRgb: string;
  maxDistance: number;
  radius: number;
  blur: number;
  branchiness: number;
};

type CanvasPoint = {
  x: number;
  y: number;
};

type PlacementRender = {
  config: InkConfig;
  id: string;
  origin: CanvasPoint;
  particles: readonly InkParticle[];
  startedAt: number;
};

type WaveRender = {
  delayMs: number;
  player: Player;
  point: CanvasPoint;
  startedAt: number;
};

export function InkEffectCanvas({
  placement,
  waveBursts
}: InkEffectCanvasProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const placementRendersRef = useRef<Map<string, PlacementRender>>(new Map());
  const waveRendersRef = useRef<readonly WaveRender[]>([]);
  const animationFrameId = useRef<number | null>(null);

  const clearCanvas = useCallback((): void => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;

    if (canvas === null) {
      return;
    }

    const context: CanvasRenderingContext2D | null = resizeCanvas(canvas);

    if (context === null) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const startAnimationLoop = useCallback((): void => {
    if (animationFrameId.current !== null) {
      return;
    }

    const drawFrame = (timestamp: number): void => {
      const canvas: HTMLCanvasElement | null = canvasRef.current;

      if (canvas === null) {
        animationFrameId.current = null;
        return;
      }

      const context: CanvasRenderingContext2D | null = resizeCanvas(canvas);

      if (context === null) {
        animationFrameId.current = null;
        return;
      }

      const devicePixelRatio: number = getDevicePixelRatio();
      let hasActivePlacement = false;

      context.clearRect(0, 0, canvas.width, canvas.height);

      for (const placementRender of placementRendersRef.current.values()) {
        const elapsed: number = Math.max(
          0,
          timestamp - placementRender.startedAt
        );

        if (elapsed > placementRender.config.duration + 80) {
          placementRendersRef.current.delete(placementRender.id);
          continue;
        }

        hasActivePlacement = true;

        const progress: number = Math.min(
          1,
          elapsed / placementRender.config.duration
        );

        context.save();
        context.filter = `blur(${placementRender.config.blur * devicePixelRatio}px) contrast(126%)`;
        context.globalCompositeOperation = "source-over";

        drawImpact(
          context,
          placementRender.origin.x,
          placementRender.origin.y,
          progress,
          placementRender.config
        );

        for (const particle of placementRender.particles) {
          drawParticle(
            context,
            placementRender.origin.x,
            placementRender.origin.y,
            progress,
            particle,
            placementRender.config
          );
        }

        context.restore();
      }

      const hasActiveWave: boolean = drawWaveMists(
        context,
        waveRendersRef.current,
        timestamp,
        Math.min(canvas.width, canvas.height) / BOARD_VIEW_SIZE
      );

      if (hasActivePlacement || hasActiveWave) {
        animationFrameId.current = window.requestAnimationFrame(drawFrame);
        return;
      }

      animationFrameId.current = null;
      window.setTimeout(() => {
        clearCanvas();
      }, 80);
    };

    animationFrameId.current = window.requestAnimationFrame(drawFrame);
  }, [clearCanvas]);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;

    if (canvas === null) {
      return;
    }

    resizeCanvas(canvas);

    const observer = new ResizeObserver(() => {
      resizeCanvas(canvas);
    });

    observer.observe(canvas);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;

    if (canvas === null) {
      return;
    }

    const context: CanvasRenderingContext2D | null = resizeCanvas(canvas);

    if (context === null) {
      return;
    }

    if (placement === null && waveBursts.length === 0) {
      placementRendersRef.current.clear();
      waveRendersRef.current = [];
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const prefersReducedMotion: boolean = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const rect: DOMRect = canvas.getBoundingClientRect();
    const devicePixelRatio: number = getDevicePixelRatio();
    if (placement !== null && !placementRendersRef.current.has(placement.id)) {
      placementRendersRef.current.set(
        placement.id,
        createPlacementRender(
          placement,
          rect.width * devicePixelRatio,
          rect.height * devicePixelRatio,
          prefersReducedMotion,
          performance.now()
        )
      );
    }
  }, [placement, waveBursts.length]);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;

    if (canvas === null) {
      return;
    }

    const rect: DOMRect = canvas.getBoundingClientRect();
    const devicePixelRatio: number = getDevicePixelRatio();

    waveRendersRef.current = createWaveRenders(
      waveBursts,
      rect.width * devicePixelRatio,
      rect.height * devicePixelRatio
    );

    if (waveBursts.length > 0) {
      startAnimationLoop();
    }
  }, [startAnimationLoop, waveBursts]);

  useEffect(() => {
    if (placement !== null || waveBursts.length > 0) {
      startAnimationLoop();
    }
  }, [placement, startAnimationLoop, waveBursts.length]);

  useEffect(() => {
    return () => {
      if (animationFrameId.current !== null) {
        window.cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="ink-effect-canvas"
    />
  );
}

function createPlacementRender(
  placement: PlacementEffect,
  canvasWidth: number,
  canvasHeight: number,
  isReducedMotion: boolean,
  startedAt: number
): PlacementRender {
  const config: InkConfig = getInkConfig(placement.player, isReducedMotion);

  return {
    config,
    id: placement.id,
    origin: getCanvasPoint(placement.position, canvasWidth, canvasHeight),
    particles: createParticles(config),
    startedAt
  };
}

function createWaveRenders(
  waveBursts: readonly WaveBurst[],
  canvasWidth: number,
  canvasHeight: number
): readonly WaveRender[] {
  return waveBursts.flatMap((burst: WaveBurst) =>
    burst.highlights.map((highlight: WaveHighlight) => ({
      delayMs: highlight.delayMs,
      player: highlight.player,
      point: getCanvasPoint(highlight.position, canvasWidth, canvasHeight),
      startedAt: burst.startedAt
    }))
  );
}

function resizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const rect: DOMRect = canvas.getBoundingClientRect();
  const ratio: number = getDevicePixelRatio();
  const width: number = Math.max(1, Math.round(rect.width * ratio));
  const height: number = Math.max(1, Math.round(rect.height * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  return canvas.getContext("2d");
}

function getDevicePixelRatio(): number {
  return Math.min(2, Math.max(1, window.devicePixelRatio));
}

function getInkConfig(player: Player, isReducedMotion: boolean): InkConfig {
  if (player === "black") {
    return {
      count: isReducedMotion ? 12 : 54,
      duration: isReducedMotion ? 220 : 620,
      rgb: "10, 12, 11",
      impactRgb: "0, 0, 0",
      veinRgb: "14, 15, 12",
      maxDistance: isReducedMotion ? 18 : 58,
      radius: isReducedMotion ? 3 : 7,
      blur: 0.72,
      branchiness: isReducedMotion ? 0.25 : 0.75
    };
  }

  return {
    count: isReducedMotion ? 10 : 44,
    duration: isReducedMotion ? 220 : 680,
    rgb: "250, 248, 235",
    impactRgb: "255, 255, 255",
    veinRgb: "255, 250, 229",
    maxDistance: isReducedMotion ? 14 : 42,
    radius: isReducedMotion ? 3 : 8,
    blur: 1.08,
    branchiness: isReducedMotion ? 0.05 : 0.22
  };
}

function createParticles(config: InkConfig): readonly InkParticle[] {
  return Array.from({ length: config.count }, (_, index: number) => {
    const angle: number = (Math.PI * 2 * index) / config.count + Math.random() * 0.7;
    const distanceNoise: number = 0.48 + Math.random() * 0.72;

    return {
      angle,
      maxDistance: config.maxDistance * distanceNoise,
      radius: config.radius * (0.45 + Math.random() * 0.85),
      alpha: 0.22 + Math.random() * 0.42,
      wobble: Math.random() * Math.PI * 2,
      stretch: 0.72 + Math.random() * 1.4
    };
  });
}

function drawImpact(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  config: InkConfig
): void {
  const impactProgress: number = Math.min(1, progress / 0.22);
  const radius: number = config.radius * 2.1 * easeOutCubic(impactProgress);
  const alpha: number = Math.max(0, 0.42 * (1 - impactProgress));

  context.beginPath();
  context.fillStyle = `rgba(${config.impactRgb}, ${alpha})`;
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawParticle(
  context: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  progress: number,
  particle: InkParticle,
  config: InkConfig
): void {
  const spreadProgress: number = Math.min(1, progress / 0.56);
  const collapseProgress: number =
    progress <= 0.56 ? 0 : Math.min(1, (progress - 0.56) / 0.44);
  const spreadDistance: number =
    particle.maxDistance * easeOutCubic(spreadProgress);
  const collapseDistance: number =
    spreadDistance * (1 - 0.68 * easeInCubic(collapseProgress));
  const wobble: number = Math.sin(progress * Math.PI * 4 + particle.wobble) * 3;
  const x: number =
    originX + Math.cos(particle.angle) * collapseDistance + wobble;
  const y: number =
    originY +
    Math.sin(particle.angle) * collapseDistance +
    wobble * 0.38;
  const fade: number = Math.max(0, 1 - easeInCubic(progress));
  const radius: number = particle.radius * (1 - progress * 0.46);

  context.beginPath();
  context.ellipse(
    x,
    y,
    Math.max(0.4, radius * particle.stretch),
    Math.max(0.4, radius * 0.62),
    particle.angle,
    0,
    Math.PI * 2
  );
  context.fillStyle = `rgba(${config.rgb}, ${particle.alpha * fade})`;
  context.fill();

  if (config.branchiness > 0 && particle.alpha > 0.38) {
    const branchAlpha: number =
      particle.alpha * fade * config.branchiness * 0.42;

    context.beginPath();
    context.strokeStyle = `rgba(${config.veinRgb}, ${branchAlpha})`;
    context.lineWidth = Math.max(0.35, radius * 0.22);
    context.moveTo(originX, originY);
    context.quadraticCurveTo(
      (originX + x) / 2 + Math.sin(progress * 12 + particle.wobble) * 3,
      (originY + y) / 2 + Math.cos(progress * 10 + particle.wobble) * 2,
      x,
      y
    );
    context.stroke();
  }
}

function drawWaveMists(
  context: CanvasRenderingContext2D,
  waveRenders: readonly WaveRender[],
  now: number,
  cellSize: number
): boolean {
  let hasActiveWave = false;

  context.save();
  context.globalCompositeOperation = "source-over";
  context.filter = "blur(2px) contrast(116%)";

  for (const wave of waveRenders) {
    const localElapsed: number = now - wave.startedAt - wave.delayMs;

    if (localElapsed < 0) {
      hasActiveWave = true;
      continue;
    }

    if (localElapsed > WAVE_DURATION_MS) {
      continue;
    }

    hasActiveWave = true;
    drawWaveMist(context, wave, localElapsed / WAVE_DURATION_MS, cellSize);
  }

  context.restore();

  return hasActiveWave;
}

function drawWaveMist(
  context: CanvasRenderingContext2D,
  wave: WaveRender,
  progress: number,
  cellSize: number
): void {
  const breath: number = Math.sin(progress * Math.PI);
  const radius: number = cellSize * (0.34 + breath * 0.2);
  const alpha: number = (wave.player === "black" ? 0.22 : 0.32) * breath;
  const rgb: string = wave.player === "black" ? "8, 10, 9" : "255, 250, 232";

  context.beginPath();
  context.fillStyle = `rgba(${rgb}, ${alpha})`;
  context.arc(wave.point.x, wave.point.y, radius, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.strokeStyle = `rgba(${rgb}, ${alpha * 0.72})`;
  context.lineWidth = Math.max(1, cellSize * 0.035);
  context.arc(wave.point.x, wave.point.y, radius * 1.08, 0, Math.PI * 2);
  context.stroke();
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function easeInCubic(value: number): number {
  return value * value * value;
}
