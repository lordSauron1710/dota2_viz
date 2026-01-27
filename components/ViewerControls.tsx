"use client";

import type { LightingPreset } from "../lib/urlState";

type ViewerControlsProps = {
  animations: string[];
  activeAnimation: string | null;
  speed: number;
  preset: LightingPreset;
  backgroundMode: "gradient" | "solid";
  onAnimationChange: (clip: string) => void;
  onSpeedChange: (value: number) => void;
  onPresetChange: (preset: LightingPreset) => void;
  onBackgroundChange: (mode: "gradient" | "solid") => void;
};

export default function ViewerControls({
  animations,
  activeAnimation,
  speed,
  preset,
  backgroundMode,
  onAnimationChange,
  onSpeedChange,
  onPresetChange,
  onBackgroundChange,
}: ViewerControlsProps) {
  const hasAnimations = animations.length > 0;

  return (
    <aside className="panel panel--right">
      <div className="panel__header">
        <span>Animation</span>
        <span className="panel__badge">
          {hasAnimations ? `${animations.length} clips` : "No clips"}
        </span>
      </div>

      <div className="panel__section">
        <label htmlFor="animation-select">Clip</label>
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

      <div className="panel__section">
        <label htmlFor="speed-range">Speed</label>
        <div className="range-row">
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

      <div className="panel__divider" />

      <div className="panel__header">
        <span>Scene</span>
      </div>

      <div className="panel__section">
        <label htmlFor="lighting-select">Lighting</label>
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

      <div className="panel__section">
        <label htmlFor="background-select">Backdrop</label>
        <select
          id="background-select"
          value={backgroundMode}
          onChange={(event) => onBackgroundChange(event.target.value as "gradient" | "solid")}
        >
          <option value="gradient">Gradient</option>
          <option value="solid">Solid</option>
        </select>
      </div>
    </aside>
  );
}
