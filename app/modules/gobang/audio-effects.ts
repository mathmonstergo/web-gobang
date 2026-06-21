import { type Player } from "@/modules/gobang/types";

const MASTER_GAIN = 0.34;
const COLLISION_THROTTLE_SECONDS = 0.045;
const FOOTSTEP_THROTTLE_SECONDS = 0.11;

type AudioWindow = Window & {
  AudioContext?: AudioContextConstructor;
  webkitAudioContext?: AudioContextConstructor;
};

type AudioContextConstructor = new () => AudioContext;

let audioEngine: GobangAudioEngine | null = null;

export function primeGobangAudio(): void {
  getAudioEngine()?.prime();
}

export function playPlacementSound(player: Player): void {
  getAudioEngine()?.playPlacement(player);
}

export function playStoneWaveSound(player: Player): void {
  getAudioEngine()?.playStoneWave(player);
}

export function playResetWaveSound(): void {
  getAudioEngine()?.playResetWave();
}

export function playCollisionSound(intensity: number): void {
  getAudioEngine()?.playCollision(intensity);
}

export function playCatFootstepSound(): void {
  getAudioEngine()?.playCatFootstep();
}

export function playCatSwatSound(): void {
  getAudioEngine()?.playCatSwat();
}

function getAudioEngine(): GobangAudioEngine | null {
  if (typeof window === "undefined") {
    return null;
  }

  if (audioEngine !== null) {
    return audioEngine;
  }

  const audioWindow = window as AudioWindow;
  const AudioContextCtor: AudioContextConstructor | undefined =
    audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (AudioContextCtor === undefined) {
    return null;
  }

  audioEngine = new GobangAudioEngine(new AudioContextCtor());
  return audioEngine;
}

class GobangAudioEngine {
  private readonly context: AudioContext;
  private readonly master: GainNode;
  private lastCollisionAt = -Infinity;
  private lastFootstepAt = -Infinity;

  constructor(context: AudioContext) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(context.destination);
  }

  prime(): void {
    if (this.context.state === "suspended") {
      void this.context.resume();
    }
  }

  playPlacement(player: Player): void {
    this.prime();
    const now = this.context.currentTime;
    const isBlack = player === "black";

    this.playTone({
      type: "triangle",
      start: now,
      duration: 0.105,
      frequencyStart: isBlack ? 360 : 520,
      frequencyEnd: isBlack ? 235 : 360,
      gain: isBlack ? 0.22 : 0.17
    });
    this.playTone({
      type: "sine",
      start: now + 0.008,
      duration: 0.16,
      frequencyStart: isBlack ? 115 : 155,
      frequencyEnd: isBlack ? 74 : 96,
      gain: isBlack ? 0.16 : 0.1
    });
    this.playNoise({
      start: now,
      duration: 0.045,
      gain: isBlack ? 0.055 : 0.04,
      frequency: isBlack ? 1350 : 1800,
      type: "bandpass",
      q: 5
    });
  }

  playStoneWave(player: Player): void {
    this.prime();
    const now = this.context.currentTime;
    const isBlack = player === "black";

    this.playTone({
      type: "sine",
      start: now,
      duration: 0.26,
      frequencyStart: isBlack ? 180 : 260,
      frequencyEnd: isBlack ? 390 : 620,
      gain: isBlack ? 0.055 : 0.047
    });
    this.playNoise({
      start: now + 0.025,
      duration: 0.24,
      gain: 0.035,
      frequency: isBlack ? 640 : 980,
      type: "bandpass",
      q: 1.6
    });
  }

  playResetWave(): void {
    this.prime();
    const now = this.context.currentTime;

    this.playTone({
      type: "sine",
      start: now,
      duration: 0.62,
      frequencyStart: 78,
      frequencyEnd: 42,
      gain: 0.14
    });
    this.playNoise({
      start: now,
      duration: 0.56,
      gain: 0.11,
      frequency: 310,
      type: "lowpass",
      q: 0.6
    });
  }

  playCollision(intensity: number): void {
    this.prime();
    const now = this.context.currentTime;
    if (now - this.lastCollisionAt < COLLISION_THROTTLE_SECONDS) {
      return;
    }

    this.lastCollisionAt = now;
    const clampedIntensity = clampNumber(intensity, 0, 1);
    this.playTone({
      type: "triangle",
      start: now,
      duration: 0.075,
      frequencyStart: 280 + clampedIntensity * 280,
      frequencyEnd: 145 + clampedIntensity * 120,
      gain: 0.055 + clampedIntensity * 0.08
    });
    this.playNoise({
      start: now,
      duration: 0.035,
      gain: 0.035 + clampedIntensity * 0.05,
      frequency: 1150 + clampedIntensity * 800,
      type: "bandpass",
      q: 4
    });
  }

  playCatFootstep(): void {
    this.prime();
    const now = this.context.currentTime;
    if (now - this.lastFootstepAt < FOOTSTEP_THROTTLE_SECONDS) {
      return;
    }

    this.lastFootstepAt = now;
    this.playTone({
      type: "sine",
      start: now,
      duration: 0.052,
      frequencyStart: 190,
      frequencyEnd: 118,
      gain: 0.052
    });
    this.playNoise({
      start: now,
      duration: 0.028,
      gain: 0.028,
      frequency: 520,
      type: "lowpass",
      q: 0.9
    });
  }

  playCatSwat(): void {
    this.prime();
    const now = this.context.currentTime;

    this.playNoise({
      start: now,
      duration: 0.16,
      gain: 0.12,
      frequency: 950,
      type: "bandpass",
      q: 0.9
    });
    this.playTone({
      type: "triangle",
      start: now + 0.052,
      duration: 0.12,
      frequencyStart: 260,
      frequencyEnd: 92,
      gain: 0.16
    });
  }

  private playTone(input: {
    type: OscillatorType;
    start: number;
    duration: number;
    frequencyStart: number;
    frequencyEnd: number;
    gain: number;
  }): void {
    const oscillator = this.context.createOscillator();
    const gain = this.createEnvelope(
      input.start,
      Math.min(0.012, input.duration * 0.22),
      input.duration,
      input.gain
    );

    oscillator.type = input.type;
    oscillator.frequency.setValueAtTime(input.frequencyStart, input.start);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, input.frequencyEnd),
      input.start + input.duration
    );
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(input.start);
    oscillator.stop(input.start + input.duration + 0.02);
  }

  private playNoise(input: {
    start: number;
    duration: number;
    gain: number;
    frequency: number;
    type: BiquadFilterType;
    q: number;
  }): void {
    const source = this.context.createBufferSource();
    source.buffer = this.createNoiseBuffer(input.duration);

    const filter = this.context.createBiquadFilter();
    filter.type = input.type;
    filter.frequency.setValueAtTime(input.frequency, input.start);
    filter.Q.setValueAtTime(input.q, input.start);

    const gain = this.createEnvelope(
      input.start,
      Math.min(0.015, input.duration * 0.2),
      input.duration,
      input.gain
    );

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(input.start);
    source.stop(input.start + input.duration + 0.02);
  }

  private createEnvelope(
    start: number,
    attack: number,
    duration: number,
    peak: number
  ): GainNode {
    const gain = this.context.createGain();
    const end = start + duration;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    return gain;
  }

  private createNoiseBuffer(duration: number): AudioBuffer {
    const frameCount = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data: Float32Array = buffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }

    return buffer;
  }
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
