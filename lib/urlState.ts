export type LightingPreset = "spotlight" | "neutral" | "dim";

export const POSE_OPTIONS = ["static", "idle", "seizure"] as const;
export type PoseName = (typeof POSE_OPTIONS)[number];

export type UrlState = {
  anim: string | null;
  pose: PoseName;
  speed: number;
  autoplay: boolean;
};

export const DEFAULT_URL_STATE: UrlState = {
  anim: null,
  pose: "static",
  speed: 1,
  autoplay: false,
};

function isPose(value: string | null): value is PoseName {
  return value !== null && POSE_OPTIONS.includes(value as PoseName);
}

function normalizeLegacyPose(value: string | null): PoseName | null {
  if (!value) {
    return null;
  }
  const lower = value.toLowerCase();
  if (lower === "running" || lower === "sprinting" || lower === "laugh") {
    return "seizure";
  }
  if (lower === "walking" || lower === "stunned") {
    return "idle";
  }
  return null;
}

export function parseUrlState(params: URLSearchParams): UrlState {
  const anim = params.get("anim");
  const poseParam = params.get("pose");
  const speedParam = Number(params.get("speed"));
  const autoplayParam = params.get("autoplay");
  const clampedSpeed = Number.isFinite(speedParam)
    ? Math.min(Math.max(speedParam, 0.25), 2)
    : DEFAULT_URL_STATE.speed;

  return {
    anim: anim && anim.length > 0 ? anim : null,
    pose: isPose(poseParam)
      ? poseParam
      : normalizeLegacyPose(poseParam) ?? DEFAULT_URL_STATE.pose,
    speed: clampedSpeed,
    autoplay: autoplayParam === "0" ? false : DEFAULT_URL_STATE.autoplay,
  };
}

export function serializeUrlState(state: UrlState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.anim) {
    params.set("anim", state.anim);
  }
  params.set("pose", state.pose);
  params.set("speed", state.speed.toFixed(2));
  params.set("autoplay", state.autoplay ? "1" : "0");
  return params;
}
