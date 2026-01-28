"use client";

import type { PoseName } from "../lib/urlState";
import { POSE_OPTIONS } from "../lib/urlState";

type ViewerControlsProps = {
  pose: PoseName;
  speed: number;
  backgroundMode: "gradient" | "solid";
  backgroundColor: string;
  environmentMode: "none" | "sky";
  autoplay: boolean;
  onReset: () => void;
  onToggleAutoplay: () => void;
  onScreenshot?: () => void;
  onPoseChange: (pose: PoseName) => void;
  onSpeedChange: (value: number) => void;
  onBackgroundChange: (mode: "gradient" | "solid") => void;
  onBackgroundColorChange: (value: string) => void;
  onEnvironmentChange: (mode: "none" | "sky") => void;
};

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 12a8 8 0 1 0 2.3-5.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M4 5v5h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5l12 7-12 7V5z" fill="currentColor" />
    </svg>
  );
}

function ScreenshotIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M9 6l1.2-2h3.6L15 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default function ViewerControls({
  pose,
  speed,
  backgroundMode,
  backgroundColor,
  environmentMode,
  autoplay,
  onReset,
  onToggleAutoplay,
  onScreenshot,
  onPoseChange,
  onSpeedChange,
  onBackgroundChange,
  onBackgroundColorChange,
  onEnvironmentChange,
}: ViewerControlsProps) {
  return (
    <aside className="panel panel--right">
      <div className="panel__header">
        <span>Playback</span>
      </div>

      <div className="panel__section panel__section--actions">
        <button
          type="button"
          className="icon-button"
          onClick={onReset}
          aria-label="Reset view"
          title="Reset view"
        >
          <ResetIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onScreenshot}
          aria-label="Screenshot"
          title="Screenshot"
        >
          <ScreenshotIcon />
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onToggleAutoplay}
          aria-label={autoplay ? "Pause animation" : "Play animation"}
          title={autoplay ? "Pause animation" : "Play animation"}
        >
          {autoplay ? <PauseIcon /> : <PlayIcon />}
        </button>
      </div>

      <div className="panel__divider" />

      <div className="panel__header">
        <span>Animation</span>
      </div>

      <div className="panel__section">
        <label htmlFor="animation-select">Pose</label>
        <select
          id="animation-select"
          value={pose}
          onChange={(event) => {
            const nextPose = event.target.value as PoseName;
            onPoseChange(nextPose);
          }}
        >
          {POSE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option.toUpperCase()}
            </option>
          ))}
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
        <label htmlFor="background-select">Backdrop</label>
        <select
          id="background-select"
          value={backgroundMode}
          onChange={(event) => onBackgroundChange(event.target.value as "gradient" | "solid")}
        >
          <option value="gradient">Gradient</option>
          <option value="solid">Solid</option>
        </select>
        {backgroundMode !== "solid" && backgroundMode !== "gradient" ? null : (
          <>
            <label htmlFor="background-color">Backdrop color</label>
            <div className="color-row">
              <input
                id="background-color"
                type="color"
                value={backgroundColor}
                onChange={(event) => onBackgroundColorChange(event.target.value)}
              />
              <span>{backgroundColor.toUpperCase()}</span>
            </div>
          </>
        )}
      </div>

      <div className="panel__section">
        <label htmlFor="environment-select">Environment</label>
        <select
          id="environment-select"
          value={environmentMode}
          onChange={(event) => onEnvironmentChange(event.target.value as "none" | "sky")}
        >
          <option value="none">None</option>
          <option value="sky">Sky</option>
        </select>
      </div>
    </aside>
  );
}
