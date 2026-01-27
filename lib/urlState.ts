export type LightingPreset = "studio" | "neutral" | "rim";

export type UrlState = {
  anim: string | null;
  speed: number;
  preset: LightingPreset;
  autoplay: boolean;
};

export const DEFAULT_URL_STATE: UrlState = {
  anim: null,
  speed: 1,
  preset: "studio",
  autoplay: true,
};

export function parseUrlState(params: URLSearchParams): UrlState {
  const anim = params.get("anim");
  const speedParam = Number(params.get("speed"));
  const preset = params.get("preset") as LightingPreset | null;
  const autoplayParam = params.get("autoplay");
  const clampedSpeed = Number.isFinite(speedParam)
    ? Math.min(Math.max(speedParam, 0.25), 2)
    : DEFAULT_URL_STATE.speed;

  return {
    anim: anim && anim.length > 0 ? anim : null,
    speed: clampedSpeed,
    preset: preset === "studio" || preset === "neutral" || preset === "rim" ? preset : DEFAULT_URL_STATE.preset,
    autoplay: autoplayParam === "0" ? false : DEFAULT_URL_STATE.autoplay,
  };
}

export function serializeUrlState(state: UrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.anim) {
    params.set("anim", state.anim);
  }
  params.set("speed", state.speed.toFixed(2));
  params.set("preset", state.preset);
  params.set("autoplay", state.autoplay ? "1" : "0");
  return params;
}
