"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Viewer3D, { type Viewer3DHandle } from "../../components/Viewer3D";
import ViewerControls from "../../components/ViewerControls";
import { HEROES } from "../../lib/heroes";
import { type UrlState, parseUrlState, serializeUrlState } from "../../lib/urlState";
import "./hero.css";

const DEFAULT_MODEL_URL = "/assets/kez/kez_econ.fbx";
const DEFAULT_MODEL_LABEL = "kez_econ.fbx";

function areUrlStatesEqual(a: UrlState, b: UrlState) {
  return (
    a.anim === b.anim &&
    a.speed === b.speed &&
    a.preset === b.preset &&
    a.autoplay === b.autoplay
  );
}

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

export default function HeroPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewerRef = useRef<Viewer3DHandle | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const parsedState = useMemo(() => {
    return parseUrlState(new URLSearchParams(searchParams.toString()));
  }, [searchParams]);

  const [urlState, setUrlState] = useState<UrlState>(parsedState);
  const [animations, setAnimations] = useState<string[]>([]);
  const [backgroundMode, setBackgroundMode] = useState<"gradient" | "solid">("gradient");
  const [selectedHero, setSelectedHero] = useState<string>(
    HEROES.includes("Kez") ? "Kez" : HEROES[0] ?? "Kez",
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileLabel, setFileLabel] = useState("No file selected");
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL_URL);
  const [modelLabel, setModelLabel] = useState(DEFAULT_MODEL_LABEL);
  const [modelSource, setModelSource] = useState<"bundled" | "upload">("bundled");

  useEffect(() => {
    if (!areUrlStatesEqual(urlState, parsedState)) {
      setUrlState(parsedState);
    }
  }, [parsedState, urlState]);

  useEffect(() => {
    const params = serializeUrlState(urlState).toString();
    router.replace(`/hero?${params}`);
  }, [router, urlState]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handleClipsLoaded = useCallback((clips: string[]) => {
    setAnimations(clips);
    setUrlState((prev) => {
      if (clips.length > 0 && (!prev.anim || !clips.includes(prev.anim))) {
        return { ...prev, anim: clips[0] };
      }
      if (clips.length === 0 && prev.anim) {
        return { ...prev, anim: null };
      }
      return prev;
    });
  }, []);

  const handleActiveClipChange = useCallback((clip: string | null) => {
    setUrlState((prev) => {
      if (clip && clip !== prev.anim) {
        return { ...prev, anim: clip };
      }
      return prev;
    });
  }, []);

  const handleResetCamera = useCallback(() => {
    viewerRef.current?.resetCamera();
  }, []);

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setFileLabel(file ? file.name : "No file selected");
  }, []);

  const handleLoadFile = useCallback(() => {
    if (!selectedFile) {
      return;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    objectUrlRef.current = objectUrl;
    setModelUrl(objectUrl);
    setModelLabel(selectedFile.name);
    setModelSource("upload");
    setAnimations([]);
    setUrlState((prev) => ({ ...prev, anim: null }));
  }, [selectedFile]);

  const { anim, speed, preset, autoplay } = urlState;

  return (
    <main className="hero-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand__mark">D2</div>
          <div>
            <p className="brand__eyebrow">Three.js Playground</p>
            <h1>DotA2 Hero Viewer</h1>
          </div>
        </div>
        <div className="topbar__actions">
          <button
            type="button"
            className="icon-button"
            onClick={handleResetCamera}
            aria-label="Reset view"
            title="Reset view"
          >
            <ResetIcon />
          </button>
          <button
            type="button"
            className={`icon-button ${autoplay ? "is-active" : ""}`}
            onClick={() => setUrlState((prev) => ({ ...prev, autoplay: !prev.autoplay }))}
            aria-label={autoplay ? "Pause animation" : "Play animation"}
            title={autoplay ? "Pause animation" : "Play animation"}
          >
            {autoplay ? <PauseIcon /> : <PlayIcon />}
          </button>
        </div>
      </header>

      <div className="hero-grid">
        <aside className="panel panel--left">
          <div className="panel__header">
            <span>Asset</span>
            <span className="panel__badge">
              {modelSource === "upload" ? "Local" : "Bundled"}
            </span>
          </div>

          <div className="panel__section">
            <label htmlFor="hero-select">Hero</label>
            <select
              id="hero-select"
              value={selectedHero}
              onChange={(event) => setSelectedHero(event.target.value)}
            >
              {HEROES.map((hero) => (
                <option key={hero} value={hero}>
                  {hero}
                </option>
              ))}
            </select>
          </div>

          <div className="panel__section">
            <label htmlFor="fbx-input">Load FBX</label>
            <div className="file-row">
              <input
                id="fbx-input"
                type="file"
                accept=".fbx"
                onChange={handleFileChange}
              />
              <button type="button" onClick={handleLoadFile} disabled={!selectedFile}>
                Load FBX
              </button>
            </div>
            <p className="panel__helper">{fileLabel}</p>
          </div>

          <div className="panel__section">
            <label>Current asset</label>
            <div className="panel__meta">
              {modelSource === "upload" ? modelLabel : DEFAULT_MODEL_URL}
            </div>
          </div>
        </aside>

        <section className="viewer-frame">
          <Viewer3D
            ref={viewerRef}
            modelUrl={modelUrl}
            activeAnimation={anim}
            autoplay={autoplay}
            speed={speed}
            preset={preset}
            backgroundMode={backgroundMode}
            onClipsLoaded={handleClipsLoaded}
            onActiveClipChange={handleActiveClipChange}
          />
          <div className="viewer-hud">
            <div>
              <span className="hud-label">Hero</span>
              <strong>{selectedHero}</strong>
            </div>
            <div>
              <span className="hud-label">Clip</span>
              <strong>{anim ?? "None"}</strong>
            </div>
          </div>
        </section>

        <ViewerControls
          animations={animations}
          activeAnimation={anim}
          speed={speed}
          preset={preset}
          backgroundMode={backgroundMode}
          onAnimationChange={(clip) => setUrlState((prev) => ({ ...prev, anim: clip }))}
          onSpeedChange={(value) => setUrlState((prev) => ({ ...prev, speed: value }))}
          onPresetChange={(value) => setUrlState((prev) => ({ ...prev, preset: value }))}
          onBackgroundChange={setBackgroundMode}
        />
      </div>
    </main>
  );
}
