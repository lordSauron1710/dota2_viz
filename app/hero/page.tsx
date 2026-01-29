"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Viewer3D, { type Viewer3DHandle } from "../../components/Viewer3D";
import ViewerControls from "../../components/ViewerControls";
import { type UrlState, parseUrlState, serializeUrlState } from "../../lib/urlState";
import "./hero.css";

const HERO_SELECTION = ["Kez", "Doom"] as const;
type HeroName = (typeof HERO_SELECTION)[number];

const ASSET_BASE_URL = (process.env.NEXT_PUBLIC_ASSET_BASE_URL ?? "").replace(/\/$/, "");
const withAssetBase = (assetPath: string) =>
  ASSET_BASE_URL ? `${ASSET_BASE_URL}${assetPath}` : assetPath;

const HERO_ASSETS: Record<
  HeroName,
  {
    heroKey: string;
    modelUrl: string;
    materialsRoot?: string;
    baseMaterialsRoot?: string;
    materialsPrefix?: string;
  }
> = {
  Kez: {
    heroKey: "kez",
    modelUrl: withAssetBase("/models/kez_econ.fbx"),
    materialsRoot: withAssetBase("/assets/kez/materials/"),
    baseMaterialsRoot: withAssetBase("/assets/kez/materials/base/"),
  },
  Doom: {
    heroKey: "doom",
    modelUrl: withAssetBase("/models/doom_econ.fbx"),
    materialsRoot: withAssetBase("/assets/doom_bringer/materials/"),
    baseMaterialsRoot: withAssetBase("/assets/doom_bringer/materials/base/"),
  },
};

const HERO_ACCENTS: Record<HeroName, { accent: string; accentStrong: string }> = {
  Kez: { accent: "#6ec6ff", accentStrong: "#b7e4ff" },
  Doom: { accent: "#d64545", accentStrong: "#ff7b7b" },
};

const DEFAULT_ACCENT = HERO_ACCENTS.Kez;
const DEFAULT_BACKDROP_COLOR = DEFAULT_ACCENT.accent;
const HERO_LORE: Record<HeroName, { image?: string; text?: string }> = {
  Doom: {
    text:
      "He that burns and is not consumed, devours and is never sated, kills and is beyond all judgment--Lucifer brings doom to all who would stand against him. Bearing away souls on the tip of a fiery sword, he is the Fallen One, a once-favored general from the realm behind the light, cast out for the sin of defiance: he would not kneel.\n\nSix times his name was tolled from the great bell of Vashundol. Six and sixty times his wings were branded, until only smoking stumps remained. Without wings, he slipped loose from the tethers that bound him within the light and he fell screaming to earth. A crater in the desert, Paradise lost. Now he attacks without mercy, without motive, the only living being able to move freely between the seven dark dominions. Lashed by inescapable needs, twisted by unimaginable talents, Doom carries his own hell with him wherever he goes. Defiant to the last. Eventually, the world will belong to Doom.",
  },
  Kez: {
    text:
      "I was born with a price on my head. As I got better at causing trouble, that price went up. Every time Queen Imperia raised the bounty, I knew I must have done something right. I think that's the worst part about being gone so long in Icewrack... I've got to get that price back up to a respectable number.",
  },
};
const LORE_FALLBACK =
  "Lore entry incoming. Select a hero with a bio card to preview their story.";
const LORE_FONT_MIN = 9;
const LORE_FONT_MAX = 16;

function hexToRgbChannels(hex: string) {
  const normalized = hex.replace("#", "").trim();

  if (normalized.length === 3) {
    const r = Number.parseInt(normalized[0] + normalized[0], 16);
    const g = Number.parseInt(normalized[1] + normalized[1], 16);
    const b = Number.parseInt(normalized[2] + normalized[2], 16);
    return `${r}, ${g}, ${b}`;
  }

  if (normalized.length === 6) {
    const value = Number.parseInt(normalized, 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return `${r}, ${g}, ${b}`;
  }

  return "0, 0, 0";
}

function areUrlStatesEqual(a: UrlState, b: UrlState) {
  return (
    a.anim === b.anim &&
    a.pose === b.pose &&
    a.speed === b.speed &&
    a.autoplay === b.autoplay
  );
}

function HeroPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewerRef = useRef<Viewer3DHandle | null>(null);
  const lastSerializedRef = useRef<string | null>(null);
  const loreFrameRef = useRef<HTMLDivElement | null>(null);
  const loreTextRef = useRef<HTMLParagraphElement | null>(null);

  const parsedState = useMemo(() => {
    return parseUrlState(new URLSearchParams(searchParams.toString()));
  }, [searchParams]);

  const [urlState, setUrlState] = useState<UrlState>(parsedState);
  const [backgroundMode, setBackgroundMode] = useState<"gradient" | "solid">("gradient");
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKDROP_COLOR);
  const [environmentMode, setEnvironmentMode] = useState<"none" | "sky">("none");
  const [selectedHero, setSelectedHero] = useState<HeroName>(
    HERO_SELECTION[0] ?? "Kez",
  );
  const [loreFontSize, setLoreFontSize] = useState<number>(LORE_FONT_MAX);
  const heroAsset = HERO_ASSETS[selectedHero] ?? HERO_ASSETS.Kez;
  const modelUrl = heroAsset.modelUrl;
  const materialsRoot = heroAsset.materialsRoot;
  const baseMaterialsRoot = heroAsset.baseMaterialsRoot;
  const heroKey = heroAsset.heroKey;
  const materialsPrefix = heroAsset.materialsPrefix;
  const loreEntry = HERO_LORE[selectedHero];
  const loreText = loreEntry?.text ?? "";
  const loreImage = loreText ? null : loreEntry?.image ?? null;
  const loreContent = loreText || (loreImage ? "" : LORE_FALLBACK);
  const showLoreImage = Boolean(loreImage);
  const accentConfig = useMemo(
    () => HERO_ACCENTS[selectedHero] ?? DEFAULT_ACCENT,
    [selectedHero],
  );
  const accentStrong = accentConfig.accentStrong ?? accentConfig.accent;
  const accentRgb = useMemo(
    () => hexToRgbChannels(accentConfig.accent),
    [accentConfig.accent],
  );
  const accentStrongRgb = useMemo(
    () => hexToRgbChannels(accentStrong),
    [accentStrong],
  );
  const accentStyle = useMemo(
    () =>
      ({
        "--accent": accentConfig.accent,
        "--accent-strong": accentStrong,
        "--accent-rgb": accentRgb,
        "--accent-strong-rgb": accentStrongRgb,
      }) as CSSProperties,
    [accentConfig.accent, accentRgb, accentStrong, accentStrongRgb],
  );
  const previousAccentRef = useRef(accentConfig.accent);

  useEffect(() => {
    if (backgroundColor === previousAccentRef.current) {
      setBackgroundColor(accentConfig.accent);
    }
    previousAccentRef.current = accentConfig.accent;
  }, [accentConfig.accent, backgroundColor]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", accentConfig.accent);
    root.style.setProperty("--accent-strong", accentStrong);
    root.style.setProperty("--accent-rgb", accentRgb);
    root.style.setProperty("--accent-strong-rgb", accentStrongRgb);

    return () => {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-strong");
      root.style.removeProperty("--accent-rgb");
      root.style.removeProperty("--accent-strong-rgb");
    };
  }, [accentConfig.accent, accentRgb, accentStrong, accentStrongRgb]);

  useEffect(() => {
    const currentParams = searchParams.toString();
    if (currentParams === lastSerializedRef.current) {
      return;
    }
    setUrlState((prev) => (areUrlStatesEqual(prev, parsedState) ? prev : parsedState));
  }, [parsedState, searchParams]);

  useEffect(() => {
    const params = serializeUrlState(urlState).toString();
    if (params === lastSerializedRef.current) {
      return;
    }
    lastSerializedRef.current = params;
    router.replace(`/hero?${params}`);
  }, [router, urlState]);

  const handleClipsLoaded = useCallback((clips: string[]) => {
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
    viewerRef.current?.resetPose("static");
    setUrlState({ anim: null, pose: "static", speed: 1, autoplay: false });
    setBackgroundMode("gradient");
    setBackgroundColor(accentConfig.accent);
    setEnvironmentMode("none");
  }, [accentConfig.accent]);

  const handleToggleAutoplay = useCallback(() => {
    setUrlState((prev) => ({ ...prev, autoplay: !prev.autoplay }));
  }, []);

  const fitLoreText = useCallback(() => {
    const frame = loreFrameRef.current;
    const text = loreTextRef.current;
    if (!frame || !text) {
      return;
    }

    const { clientHeight, clientWidth } = frame;
    const computed = window.getComputedStyle(frame);
    const paddingY =
      Number.parseFloat(computed.paddingTop) + Number.parseFloat(computed.paddingBottom);
    const paddingX =
      Number.parseFloat(computed.paddingLeft) + Number.parseFloat(computed.paddingRight);
    const availableHeight = clientHeight - paddingY;
    const availableWidth = clientWidth - paddingX;

    if (availableHeight <= 0 || availableWidth <= 0) {
      return;
    }

    let low = LORE_FONT_MIN;
    let high = LORE_FONT_MAX;
    let best = LORE_FONT_MIN;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      text.style.fontSize = `${mid}px`;

      const fitsHeight = text.scrollHeight <= availableHeight;
      const fitsWidth = text.scrollWidth <= availableWidth;

      if (fitsHeight && fitsWidth) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    setLoreFontSize(best);
  }, [loreContent]);

  useLayoutEffect(() => {
    if (showLoreImage) {
      return;
    }

    let frame = 0;
    const runFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        fitLoreText();
      });
    };

    runFit();

    const observer = new ResizeObserver(runFit);
    if (loreFrameRef.current) {
      observer.observe(loreFrameRef.current);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fitLoreText, showLoreImage]);

  const { anim, pose, speed, autoplay } = urlState;
  const lightingPreset = "spotlight";

  return (
    <main className="hero-shell" style={accentStyle}>
      <header className="topbar">
        <h1 className="topbar__title">DotA2 Hero Viewer</h1>
      </header>

      <div className="hero-grid">
        <aside className="panel panel--left">
          <div className="panel__header">
            <span>Hero Selection</span>
          </div>

          <div className="panel__section">
            <label htmlFor="hero-select">Hero</label>
            <select
              id="hero-select"
              value={selectedHero}
              onChange={(event) => setSelectedHero(event.target.value as HeroName)}
            >
              {HERO_SELECTION.map((hero) => (
                <option key={hero} value={hero}>
                  {hero}
                </option>
              ))}
            </select>
          </div>

          <div className="panel__divider" />

          <div className="panel__header">
            <span>Hero Lore</span>
            <span className="panel__badge">Bio</span>
          </div>

          <div className="panel__section panel__section--lore">
            <div className="lore-frame" ref={loreFrameRef}>
              {showLoreImage ? (
                <img
                  src={loreImage ?? ""}
                  alt={`${selectedHero} bio`}
                  className="lore-image"
                />
              ) : (
                <p
                  ref={loreTextRef}
                  className="lore-text"
                  style={{ fontSize: `${loreFontSize}px` }}
                >
                  {loreContent}
                </p>
              )}
            </div>
          </div>
        </aside>

        <section className="viewer-frame">
          <Viewer3D
            ref={viewerRef}
            modelUrl={modelUrl}
            materialsRoot={materialsRoot}
            baseMaterialsRoot={baseMaterialsRoot}
            heroKey={heroKey}
            materialsPrefix={materialsPrefix}
            activeAnimation={anim}
            pose={pose}
            autoplay={autoplay}
            speed={speed}
            preset={lightingPreset}
            backgroundMode={backgroundMode}
            backgroundColor={backgroundColor}
            environmentMode={environmentMode}
            screenshotLabel={selectedHero}
            onClipsLoaded={handleClipsLoaded}
            onActiveClipChange={handleActiveClipChange}
          />
        </section>

        <ViewerControls
          pose={pose}
          speed={speed}
          backgroundMode={backgroundMode}
          backgroundColor={backgroundColor}
          environmentMode={environmentMode}
          autoplay={autoplay}
          onReset={handleResetCamera}
          onToggleAutoplay={handleToggleAutoplay}
          onScreenshot={() => viewerRef.current?.captureScreenshot()}
          onPoseChange={(value) =>
            setUrlState((prev) => ({
              ...prev,
              pose: value,
              autoplay: value === "static" ? prev.autoplay : true,
            }))
          }
          onSpeedChange={(value) => setUrlState((prev) => ({ ...prev, speed: value }))}
          onBackgroundChange={setBackgroundMode}
          onBackgroundColorChange={setBackgroundColor}
          onEnvironmentChange={setEnvironmentMode}
        />
      </div>
    </main>
  );
}

export default function HeroPage() {
  return (
    <Suspense fallback={<div />}>
      <HeroPageClient />
    </Suspense>
  );
}
