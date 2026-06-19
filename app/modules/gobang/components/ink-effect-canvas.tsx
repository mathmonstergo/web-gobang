import { useEffect, useRef, type ReactElement } from "react";

import { getCanvasPoint } from "@/modules/gobang/board-geometry";
import { type PlacementEffect, type Player } from "@/modules/gobang/types";

type InkEffectCanvasProps = {
  placement: PlacementEffect | null;
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
  maxDistance: number;
  radius: number;
  blur: number;
};

export function InkEffectCanvas({
  placement
}: InkEffectCanvasProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    if (canvas === null || placement === null) {
      return;
    }

    const context: CanvasRenderingContext2D | null = resizeCanvas(canvas);

    if (context === null) {
      return;
    }

    const prefersReducedMotion: boolean = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const rect: DOMRect = canvas.getBoundingClientRect();
    const devicePixelRatio: number = getDevicePixelRatio();
    const origin = getCanvasPoint(
      placement.position,
      rect.width * devicePixelRatio,
      rect.height * devicePixelRatio
    );
    const config: InkConfig = getInkConfig(placement.player, prefersReducedMotion);
    const particles: readonly InkParticle[] = createParticles(config);
    let animationFrameId: number | null = null;
    let startTime: number | null = null;

    const drawFrame = (timestamp: number): void => {
      startTime ??= timestamp;

      const elapsed: number = timestamp - startTime;
      const progress: number = Math.min(1, elapsed / config.duration);

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.filter = `blur(${config.blur * devicePixelRatio}px) contrast(126%)`;
      context.globalCompositeOperation = "source-over";

      drawImpact(context, origin.x, origin.y, progress, config);

      for (const particle of particles) {
        drawParticle(context, origin.x, origin.y, progress, particle, config);
      }

      context.restore();

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(drawFrame);
        return;
      }

      window.setTimeout(() => {
        context.clearRect(0, 0, canvas.width, canvas.height);
      }, 80);
    };

    animationFrameId = window.requestAnimationFrame(drawFrame);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [placement]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="ink-effect-canvas"
    />
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
      maxDistance: isReducedMotion ? 18 : 58,
      radius: isReducedMotion ? 3 : 7,
      blur: 0.72
    };
  }

  return {
    count: isReducedMotion ? 10 : 44,
    duration: isReducedMotion ? 220 : 680,
    rgb: "250, 248, 235",
    impactRgb: "255, 255, 255",
    maxDistance: isReducedMotion ? 14 : 42,
    radius: isReducedMotion ? 3 : 8,
    blur: 1.08
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
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function easeInCubic(value: number): number {
  return value * value * value;
}
