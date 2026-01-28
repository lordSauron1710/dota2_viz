"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Viewer3D, { type Viewer3DHandle } from "../../components/Viewer3D";
import ViewerControls from "../../components/ViewerControls";
import { HEROES } from "../../lib/heroes";
import { type UrlState, parseUrlState, serializeUrlState } from "../../lib/urlState";
import "./hero.css";

const DEFAULT_MODEL_URL = "/assets/kez/kez_econ.fbx";
const DEFAULT_BACKDROP_COLOR = "#30180c";
const HERO_SELECTION = ["Kez", "Lion", "Brewmaster", "Doom", "Monkey King"] as const;
const HERO_LORE: Record<string, { image?: string; text?: string }> = {
  Brewmaster: {
    text:
      "Deep in the Wailing Mountains, in a valley beneath the Ruined City, the ancient Order of the Oyo has for centuries practiced its rites of holy reverie, communing with the spirit realm in grand festivals of drink. Born to a mother's flesh by a Celestial father, the youth known as Mangix was the first to grow up with the talents of both lineages. He trained with the greatest aesthetes of the Order, eventually earning, through diligent drunkenness, the right to challenge for the title of Brewmaster, that appellation most honored among the contemplative malt-brewing sect.\n\nAs much drinking competition as mortal combat, Mangix for nine days drank and fought the elder master. For nine nights they stumbled and whirled, chugged and struck, until at last the elder warrior collapsed into a drunken stupor, and a new Brewmaster was named. Now the new, young Brewmaster calls upon the strength of his Oyo forebears to speed his staff. When using magic, it is to his spirit ancestors that he turns. Like all Brewmasters before him, he was sent out from his people with a single mission. He wanders the land, striving toward enlightenment through drink, searching for the answer to the ancient spiritual schism. Hoping to think the single thought that will unite the spirit and physical planes again.",
  },
  Doom: {
    text:
      "He that burns and is not consumed, devours and is never sated, kills and is beyond all judgment--Lucifer brings doom to all who would stand against him. Bearing away souls on the tip of a fiery sword, he is the Fallen One, a once-favored general from the realm behind the light, cast out for the sin of defiance: he would not kneel.\n\nSix times his name was tolled from the great bell of Vashundol. Six and sixty times his wings were branded, until only smoking stumps remained. Without wings, he slipped loose from the tethers that bound him within the light and he fell screaming to earth. A crater in the desert, Paradise lost. Now he attacks without mercy, without motive, the only living being able to move freely between the seven dark dominions. Lashed by inescapable needs, twisted by unimaginable talents, Doom carries his own hell with him wherever he goes. Defiant to the last. Eventually, the world will belong to Doom.",
  },
  Kez: {
    text:
      "I was born with a price on my head. As I got better at causing trouble, that price went up. Every time Queen Imperia raised the bounty, I knew I must have done something right. I think that's the worst part about being gone so long in Icewrack... I've got to get that price back up to a respectable number.",
  },
  Lion: {
    text:
      "Once a Grandmaster of the Demon Witch tradition of sorcery, Lion earned fame among his brethren for fighting on the side of light and righteousness. But adulation corrupts. With powers surpassed only by his ambition, the mage was seduced by a demon and turned to evil, trading his soul for prestige. After committing horrible crimes that marred his soul, he was abandoned. The demon betrayed him, striking better deals with his enemies. Such was Lion's rage that he followed the demon back to hell and slew it, ripping it limb from limb, taking its demonic hand for his own. However, such demonoplasty comes at a cost. Lion was transfigured by the process, his body transformed into something unrecognizable. He rose from hell, rage incarnate, slaying even those who had once called him master, and laying waste to the lands where he had once been so adored. He survives now as the sole practitioner of the Demon Witch tradition, and those who present themselves as acolytes or students are soon relieved of their mana and carried off by the faintest gust of wind.",
  },
  "Monkey King": {
    text:
      "For 500 years the mountain pressed down upon him, only his head free from the crushing weight of the stonewrought prison the elder gods had summoned to halt his childish rebellion. Moss grew along the lines of his exposed face, tufts of grass sprouted from his ears; his vision was framed in wildflowers reaching from the soil around his cheeks. Most thought him long dead, tormented by the gods for waging war against the heavens until naught but his legend survived. But, as the stories go, the Monkey King cannot die.\n\nSo he waited. Until the gods came to offer a chance at absolution, he endured. And when they did come to name the price, Sun Wukong accepted their charge: he would accompany a young acolyte on a secret pilgrimage, protect him from demons and dangers of the road, and guide the man home in possession of a coveted relic. Do that, and humbly obey the human's commands in service to their holy mission, and Wukong would prove himself reformed.\n\nFor a change, Sun Wukong fulfilled his oath to the gods with honor, and atoned for the sins of past insurrections. The acolyte, much learned in hardships, was returned to his home temple, relic in hand; and Wukong-finding himself for the first time in proper standing with any gods of consequence-was content for a short while to give up his old thirst for adventure and glory. But the Monkey King was born for mischief...and offending the gods never gets old.",
  },
};
const LORE_FALLBACK =
  "Lore entry incoming. Select a hero with a bio card to preview their story.";
const LORE_FONT_MIN = 9;
const LORE_FONT_MAX = 16;

function areUrlStatesEqual(a: UrlState, b: UrlState) {
  return (
    a.anim === b.anim &&
    a.pose === b.pose &&
    a.speed === b.speed &&
    a.autoplay === b.autoplay
  );
}

export default function HeroPage() {
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
  const [selectedHero, setSelectedHero] = useState<string>(
    HERO_SELECTION[0] ?? "Kez",
  );
  const [loreFontSize, setLoreFontSize] = useState<number>(LORE_FONT_MAX);
  const modelUrl = DEFAULT_MODEL_URL;
  const loreEntry = HERO_LORE[selectedHero];
  const loreText = loreEntry?.text ?? "";
  const loreImage = loreText ? null : loreEntry?.image ?? null;
  const loreContent = loreText || (loreImage ? "" : LORE_FALLBACK);
  const showLoreImage = Boolean(loreImage);

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
    setUrlState((prev) => ({ ...prev, pose: "static" }));
    setBackgroundMode("gradient");
    setBackgroundColor(DEFAULT_BACKDROP_COLOR);
    setEnvironmentMode("none");
  }, []);

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
    <main className="hero-shell">
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
              onChange={(event) => setSelectedHero(event.target.value)}
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
          onPoseChange={(value) => setUrlState((prev) => ({ ...prev, pose: value }))}
          onSpeedChange={(value) => setUrlState((prev) => ({ ...prev, speed: value }))}
          onBackgroundChange={setBackgroundMode}
          onBackgroundColorChange={setBackgroundColor}
          onEnvironmentChange={setEnvironmentMode}
        />
      </div>
    </main>
  );
}
