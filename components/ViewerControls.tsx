"use client";

import type { LightingPreset } from "../lib/urlState";

type ViewerControlsProps = {
  animations: string[];
  activeAnimation: string | null;
  autoplay: boolean;
  speed: number;
  preset: LightingPreset;
  backgroundMode: "gradient" | "solid";
  onAnimationChange: (clip: string) => void;
  onAutoplayChange: (next: boolean) => void;
  onSpeedChange: (value: number) => void;
  onPresetChange: (preset: LightingPreset) => void;
  onBackgroundChange: (mode: "gradient" | "solid") => void;
  onResetCamera: () => void;
};

export default function ViewerControls({
  animations,
  activeAnimation,
  autoplay,
  speed,
  preset,
  backgroundMode,
  onAnimationChange,
  onAutoplayChange,
  onSpeedChange,
  onPresetChange,
  onBackgroundChange,
  onResetCamera,
}: ViewerControlsProps) {
  const hasAnimations = animations.length > 0;

  return (
    <section className="control-panel">
      <header>
        <p className="eyebrow">Hero Controls</p>
        <h2>Animation &amp; Lighting</h2>
      </header>

      <div className="control-panel__section">
        <label htmlFor="animation-select">Animation Clip</label>
        <select
          id="animation-select"
          value={activeAnimation ?? ""}
          onChange={(event) => onAnimationChange(event.target.value)}
          disabled={!hasAnimations}
        >
          {animations.map((clip) => (
            <option key={clip} value={clip}>
              {clip}
            </option>
          ))}
          {!hasAnimations && <option value="">No animations found</option>}
        </select>
      </div>

      <div className="control-panel__row">
        <button type="button" onClick={() => onAutoplayChange(!autoplay)}>
          {autoplay ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onResetCamera}>
          Reset Camera
        </button>
      </div>

      <div className="control-panel__section">
        <label htmlFor="speed-range">Playback Speed</label>
        <div className="control-panel__range">
          <input
            id="speed-range"
            type="range"
            min="0.25"
            max="2"
            step="0.05"
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
          />
          <span>{speed.toFixed(2)}x</span>
        </div>
      </div>

      <div className="control-panel__section">
        <label htmlFor="lighting-select">Lighting Preset</label>
        <select
          id="lighting-select"
          value={preset}
          onChange={(event) => onPresetChange(event.target.value as LightingPreset)}
        >
          <option value="studio">Studio</option>
          <option value="neutral">Neutral</option>
          <option value="rim">Rim</option>
        </select>
      </div>

      <div className="control-panel__section">
        <label htmlFor="background-select">Background</label>
        <select
          id="background-select"
          value={backgroundMode}
          onChange={(event) => onBackgroundChange(event.target.value as "gradient" | "solid")}
        >
          <option value="gradient">Gradient</option>
          <option value="solid">Solid</option>
        </select>
      </div>
    </section>
  );
}
