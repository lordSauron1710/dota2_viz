"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DDSLoader } from "three/examples/jsm/loaders/DDSLoader.js";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { SSAOPass } from "three/examples/jsm/postprocessing/SSAOPass.js";
import { fitCameraToObject } from "../lib/three/fitCamera";
import { createLightingPreset } from "../lib/three/lights";
import type { LightingPreset, PoseName } from "../lib/urlState";

type AssetRoots = {
  assetRoot: string;
  materialsRoot: string;
  baseMaterialsRoot: string;
};

const TEXTURE_EXTENSIONS = [".tga", ".png", ".jpg", ".jpeg", ".bmp", ".dds"];

type RigRestPose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

type RigGroups = {
  root: THREE.Bone | null;
  hips: THREE.Bone | null;
  spine: THREE.Bone[];
  head: THREE.Bone | null;
  jaw: THREE.Bone[];
  armL: THREE.Bone[];
  armR: THREE.Bone[];
  legL: THREE.Bone[];
  legR: THREE.Bone[];
};

type Rig = {
  bones: THREE.Bone[];
  rest: Map<string, RigRestPose>;
  depth: Map<string, number>;
  groups: RigGroups;
};

type PoseProfile = {
  frequency: number;
  bob: number;
  sway: number;
  lean: number;
  twist: number;
  stride: number;
  armSwing: number;
  spineBend: number;
  spineTwist: number;
  headNod: number;
  headTilt: number;
  slump: number;
  shake: number;
  armDrop: number;
  legBend: number;
  forward: number;
};

type PoseSignals = {
  bob: number;
  sway: number;
  lean: number;
  twist: number;
  stride: number;
  armSwing: number;
  spineBend: number;
  spineTwist: number;
  headNod: number;
  headTilt: number;
  slump: number;
  shake: number;
  armDrop: number;
  legBend: number;
  forward: number;
};

type PoseState = {
  from: PoseName;
  to: PoseName;
  blend: number;
  time: number;
};

const ARM_KEYWORDS = [
  "arm",
  "forearm",
  "upperarm",
  "lowerarm",
  "clav",
  "shoulder",
  "hand",
  "wrist",
  "elbow",
];
const LEG_KEYWORDS = [
  "leg",
  "thigh",
  "calf",
  "shin",
  "knee",
  "foot",
  "ankle",
  "toe",
];
const SPINE_KEYWORDS = ["spine", "chest", "torso", "back", "rib", "waist"];
const HEAD_KEYWORDS = ["head", "neck", "skull", "jaw"];
const JAW_KEYWORDS = ["jaw", "mouth", "lip", "tongue"];
const HIPS_KEYWORDS = ["hips", "pelvis", "hip", "root", "base", "bip"];

const LEFT_REGEX = /(^|[^a-z0-9])(left|l|lf|lft)([^a-z0-9]|$)/;
const RIGHT_REGEX = /(^|[^a-z0-9])(right|r|rt|rgt)([^a-z0-9]|$)/;

const POSE_PROFILES: Record<PoseName, PoseProfile> = {
  idle: {
    frequency: 0.8,
    bob: 0.018,
    sway: 0.015,
    lean: 0.05,
    twist: 0.04,
    stride: 0.12,
    armSwing: 0.18,
    spineBend: 0.06,
    spineTwist: 0.05,
    headNod: 0.05,
    headTilt: 0.04,
    slump: 0,
    shake: 0,
    armDrop: 0.08,
    legBend: 0.04,
    forward: 0.015,
  },
  static: {
    frequency: 0.35,
    bob: 0.004,
    sway: 0.004,
    lean: 0.01,
    twist: 0.01,
    stride: 0.02,
    armSwing: 0.02,
    spineBend: 0.01,
    spineTwist: 0.01,
    headNod: 0.01,
    headTilt: 0.01,
    slump: 0,
    shake: 0,
    armDrop: 0.02,
    legBend: 0.01,
    forward: 0,
  },
  seizure: {
    frequency: 1.4,
    bob: 0.03,
    sway: 0.02,
    lean: 0.08,
    twist: 0.06,
    stride: 0.08,
    armSwing: 0.22,
    spineBend: 0.14,
    spineTwist: 0.08,
    headNod: 0.16,
    headTilt: 0.1,
    slump: 0.05,
    shake: 0.12,
    armDrop: 0.18,
    legBend: 0.06,
    forward: 0.02,
  },
};

function getBoneDepth(bone: THREE.Bone) {
  let depth = 0;
  let current: THREE.Object3D | null = bone.parent;
  while (current && current instanceof THREE.Bone) {
    depth += 1;
    current = current.parent;
  }
  return depth;
}

function hasKeyword(name: string, keywords: string[]) {
  return keywords.some((keyword) => name.includes(keyword));
}

function detectSide(rawName: string, isLimb: boolean) {
  const name = rawName.toLowerCase();
  if (LEFT_REGEX.test(name)) {
    return "left";
  }
  if (RIGHT_REGEX.test(name)) {
    return "right";
  }
  if (isLimb && /^[lL][A-Z]/.test(rawName)) {
    return "left";
  }
  if (isLimb && /^[rR][A-Z]/.test(rawName)) {
    return "right";
  }
  if (isLimb && /^[lL][0-9]/.test(rawName)) {
    return "left";
  }
  if (isLimb && /^[rR][0-9]/.test(rawName)) {
    return "right";
  }
  return null;
}

function buildRig(model: THREE.Object3D): Rig | null {
  const bones: THREE.Bone[] = [];
  model.traverse((child) => {
    if (child instanceof THREE.Bone) {
      bones.push(child);
    }
  });
  if (bones.length === 0) {
    return null;
  }

  const rest = new Map<string, RigRestPose>();
  const depth = new Map<string, number>();
  bones.forEach((bone) => {
    rest.set(bone.uuid, {
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone(),
    });
    depth.set(bone.uuid, getBoneDepth(bone));
  });

  model.updateWorldMatrix(true, true);
  const worldPositions = new Map<string, THREE.Vector3>();
  bones.forEach((bone) => {
    const pos = new THREE.Vector3();
    bone.getWorldPosition(pos);
    worldPositions.set(bone.uuid, pos);
  });

  const bonesByDepth = [...bones].sort(
    (a, b) => (depth.get(a.uuid) ?? 0) - (depth.get(b.uuid) ?? 0),
  );
  const root = bonesByDepth[0] ?? null;

  const groups: RigGroups = {
    root,
    hips: null,
    spine: [],
    head: null,
    jaw: [],
    armL: [],
    armR: [],
    legL: [],
    legR: [],
  };

  bones.forEach((bone) => {
    const rawName = bone.name || "";
    const name = rawName.toLowerCase();
    const isArm = hasKeyword(name, ARM_KEYWORDS);
    const isLeg = hasKeyword(name, LEG_KEYWORDS);
    const isSpine = hasKeyword(name, SPINE_KEYWORDS);
    const isHead = hasKeyword(name, HEAD_KEYWORDS);
    const isJaw = hasKeyword(name, JAW_KEYWORDS);
    const isHips = hasKeyword(name, HIPS_KEYWORDS);
    const side = detectSide(rawName, isArm || isLeg);

    if (isHips && !groups.hips) {
      groups.hips = bone;
    }
    if (isSpine) {
      groups.spine.push(bone);
    }
    if (isHead && !groups.head) {
      groups.head = bone;
    }
    if (isJaw) {
      groups.jaw.push(bone);
    }
    if (isArm) {
      if (side === "left") {
        groups.armL.push(bone);
      } else if (side === "right") {
        groups.armR.push(bone);
      }
    }
    if (isLeg) {
      if (side === "left") {
        groups.legL.push(bone);
      } else if (side === "right") {
        groups.legR.push(bone);
      }
    }
  });

  const getWorld = (bone: THREE.Bone) =>
    worldPositions.get(bone.uuid) ?? new THREE.Vector3();
  const rootY = root ? getWorld(root).y : 0;

  if (!groups.hips) {
    groups.hips = root;
  }

  if (!groups.head) {
    const headCandidate = [...bones].sort((a, b) => getWorld(b).y - getWorld(a).y)[0];
    groups.head = headCandidate ?? null;
  }

  const headY = groups.head ? getWorld(groups.head).y : rootY + 1;
  const midY = (rootY + headY) * 0.5;

  if (groups.spine.length === 0) {
    const spineCandidates = bones.filter((bone) => {
      const pos = getWorld(bone);
      return Math.abs(pos.x) < 0.2 && pos.y > rootY && pos.y < headY;
    });
    groups.spine =
      spineCandidates.length > 0
        ? spineCandidates
        : bonesByDepth.slice(1, Math.min(5, bonesByDepth.length));
  }

  const leftBones = bones.filter((bone) => getWorld(bone).x <= 0);
  const rightBones = bones.filter((bone) => getWorld(bone).x >= 0);

  if (groups.armL.length === 0) {
    const leftUpper = leftBones
      .filter((bone) => getWorld(bone).y >= midY)
      .sort((a, b) => getWorld(b).y - getWorld(a).y);
    groups.armL = leftUpper.slice(0, 4);
  }
  if (groups.armR.length === 0) {
    const rightUpper = rightBones
      .filter((bone) => getWorld(bone).y >= midY)
      .sort((a, b) => getWorld(b).y - getWorld(a).y);
    groups.armR = rightUpper.slice(0, 4);
  }
  if (groups.legL.length === 0) {
    const leftLower = leftBones
      .filter((bone) => getWorld(bone).y < midY)
      .sort((a, b) => getWorld(a).y - getWorld(b).y);
    groups.legL = leftLower.slice(0, 4);
  }
  if (groups.legR.length === 0) {
    const rightLower = rightBones
      .filter((bone) => getWorld(bone).y < midY)
      .sort((a, b) => getWorld(a).y - getWorld(b).y);
    groups.legR = rightLower.slice(0, 4);
  }

  const dedupe = (group: THREE.Bone[]) => Array.from(new Set(group));
  const sortByDepth = (group: THREE.Bone[]) =>
    group.sort(
      (a, b) => (depth.get(a.uuid) ?? 0) - (depth.get(b.uuid) ?? 0),
    );

  groups.spine = sortByDepth(dedupe(groups.spine)).slice(0, 5);
  groups.armL = sortByDepth(dedupe(groups.armL)).slice(0, 4);
  groups.armR = sortByDepth(dedupe(groups.armR)).slice(0, 4);
  groups.legL = sortByDepth(dedupe(groups.legL)).slice(0, 4);
  groups.legR = sortByDepth(dedupe(groups.legR)).slice(0, 4);
  groups.jaw = sortByDepth(dedupe(groups.jaw)).slice(0, 3);

  return {
    bones,
    rest,
    depth,
    groups,
  };
}

function getPoseSignals(pose: PoseName, time: number): PoseSignals {
  const profile = POSE_PROFILES[pose];
  const phase = time * profile.frequency * Math.PI * 2;
  const gait = Math.sin(phase);
  const pace = Math.sin(phase + Math.PI / 2);
  const sway = Math.sin(phase * 0.5 + 0.6);
  const bob = Math.abs(Math.sin(phase));
  const breath = Math.sin(phase * 0.35 + 1.2);
  const jitter = Math.sin(phase * 2.7 + 0.4) * Math.sin(phase * 3.3 + 1.6);
  const drive = pose === "seizure" ? pace : gait;

  return {
    bob: bob * profile.bob,
    sway: sway * profile.sway,
    lean: profile.lean + breath * profile.lean * 0.2,
    twist: sway * profile.twist,
    stride: gait * profile.stride,
    armSwing: drive * profile.armSwing,
    spineBend: breath * profile.spineBend + gait * profile.spineBend * 0.15,
    spineTwist: sway * profile.spineTwist,
    headNod: breath * profile.headNod,
    headTilt: sway * profile.headTilt,
    slump: profile.slump,
    shake: jitter * profile.shake,
    armDrop: profile.armDrop,
    legBend: profile.legBend,
    forward: profile.forward * Math.max(0, Math.sin(phase)),
  };
}

function blendSignals(a: PoseSignals, b: PoseSignals, t: number): PoseSignals {
  const lerp = THREE.MathUtils.lerp;
  return {
    bob: lerp(a.bob, b.bob, t),
    sway: lerp(a.sway, b.sway, t),
    lean: lerp(a.lean, b.lean, t),
    twist: lerp(a.twist, b.twist, t),
    stride: lerp(a.stride, b.stride, t),
    armSwing: lerp(a.armSwing, b.armSwing, t),
    spineBend: lerp(a.spineBend, b.spineBend, t),
    spineTwist: lerp(a.spineTwist, b.spineTwist, t),
    headNod: lerp(a.headNod, b.headNod, t),
    headTilt: lerp(a.headTilt, b.headTilt, t),
    slump: lerp(a.slump, b.slump, t),
    shake: lerp(a.shake, b.shake, t),
    armDrop: lerp(a.armDrop, b.armDrop, t),
    legBend: lerp(a.legBend, b.legBend, t),
    forward: lerp(a.forward, b.forward, t),
  };
}

function applyPoseToRig(rig: Rig, signals: PoseSignals) {
  rig.bones.forEach((bone) => {
    const rest = rig.rest.get(bone.uuid);
    if (!rest) {
      return;
    }
    bone.position.copy(rest.position);
    bone.quaternion.copy(rest.quaternion);
    bone.scale.copy(rest.scale);
  });

  const euler = new THREE.Euler();
  const quat = new THREE.Quaternion();

  const root = rig.groups.hips ?? rig.groups.root;
  if (root) {
    const rest = rig.rest.get(root.uuid);
    if (rest) {
      root.position.copy(rest.position);
      root.position.y += signals.bob - signals.slump;
      root.position.x += signals.sway;
      root.position.z += signals.forward;
      const lean = -signals.lean - signals.slump * 0.6;
      const yaw = signals.twist + signals.shake * 0.4;
      const roll = signals.sway * 1.4;
      euler.set(lean, yaw, roll);
      quat.setFromEuler(euler);
      root.quaternion.copy(rest.quaternion).multiply(quat);
    }
  }

  const spine = rig.groups.spine;
  spine.forEach((bone, index) => {
    const rest = rig.rest.get(bone.uuid);
    if (!rest) {
      return;
    }
    const falloff = 1 - (index / Math.max(1, spine.length)) * 0.5;
    const bend = -signals.spineBend * falloff - signals.slump * 0.5 * falloff;
    const twist = signals.spineTwist * falloff + signals.shake * 0.6 * falloff;
    euler.set(bend, twist, 0);
    quat.setFromEuler(euler);
    bone.quaternion.copy(rest.quaternion).multiply(quat);
  });

  if (rig.groups.head) {
    const head = rig.groups.head;
    const rest = rig.rest.get(head.uuid);
    if (rest) {
      const laughBoost = signals.shake * 0.8;
      const nod = -signals.headNod - signals.slump * 0.4 + laughBoost;
      const tilt = signals.headTilt + signals.shake * 0.7;
      const yaw = signals.shake * 0.3 + laughBoost * 0.4;
      euler.set(nod, yaw, tilt);
      quat.setFromEuler(euler);
      head.quaternion.copy(rest.quaternion).multiply(quat);
    }
  }

  if (rig.groups.jaw.length > 0) {
    const jawOpen = Math.max(0, signals.shake + signals.headNod * 0.6) * 0.6;
    rig.groups.jaw.forEach((jaw, index) => {
      const rest = rig.rest.get(jaw.uuid);
      if (!rest) {
        return;
      }
      const falloff = 1 - (index / rig.groups.jaw.length) * 0.5;
      euler.set(jawOpen * falloff, 0, 0);
      quat.setFromEuler(euler);
      jaw.quaternion.copy(rest.quaternion).multiply(quat);
    });
  }

  const applyLimb = (
    bones: THREE.Bone[],
    swing: number,
    side: "left" | "right",
    drop: number,
  ) => {
    const count = Math.max(1, bones.length);
    const sideSign = side === "left" ? 1 : -1;
    bones.forEach((bone, index) => {
      const rest = rig.rest.get(bone.uuid);
      if (!rest) {
        return;
      }
      const falloff = 1 - (index / count) * 0.6;
      const swingX = swing * falloff + drop * falloff;
      const roll = sideSign * drop * 0.4 * falloff;
      const jitter = signals.shake * 0.5 * falloff;
      euler.set(swingX, 0, roll + jitter);
      quat.setFromEuler(euler);
      bone.quaternion.copy(rest.quaternion).multiply(quat);
    });
  };

  const legSwing = signals.stride;
  const armSwing = signals.armSwing;
  applyLimb(rig.groups.legL, legSwing + signals.legBend, "left", 0);
  applyLimb(rig.groups.legR, -legSwing + signals.legBend, "right", 0);
  applyLimb(rig.groups.armL, -armSwing, "left", signals.armDrop);
  applyLimb(rig.groups.armR, armSwing, "right", signals.armDrop);
}

function setPoseTarget(state: PoseState, nextPose: PoseName) {
  if (state.to === nextPose) {
    return;
  }
  state.from = state.to;
  state.to = nextPose;
  state.blend = 0;
}

function updatePoseState(
  state: PoseState,
  delta: number,
  speed: number,
  autoplay: boolean,
) {
  if (autoplay) {
    state.time += delta * speed;
  }
  if (state.blend < 1) {
    state.blend = Math.min(1, state.blend + delta * 3);
  } else {
    state.from = state.to;
  }
}

function resolveAssetRoots(modelUrl: string): AssetRoots | null {
  if (modelUrl.startsWith("blob:") || modelUrl.startsWith("data:")) {
    return null;
  }
  try {
    const absoluteUrl = new URL(modelUrl, window.location.href);
    const assetRoot = new URL("./", absoluteUrl).toString();
    return {
      assetRoot,
      materialsRoot: new URL("materials/", assetRoot).toString(),
      baseMaterialsRoot: new URL("materials/base/", assetRoot).toString(),
    };
  } catch {
    return null;
  }
}

function createTextureUrlResolver(modelUrl: string) {
  const roots = resolveAssetRoots(modelUrl);
  if (!roots) {
    return null;
  }
  const { materialsRoot, baseMaterialsRoot } = roots;

  return (url: string) => {
    if (!url || url.startsWith("data:") || url.startsWith("blob:")) {
      return url;
    }

    const stripped = url.split("?")[0].split("#")[0];
    const normalized = stripped.replace(/\\/g, "/");
    const lower = normalized.toLowerCase();
    const materialsIndex = lower.lastIndexOf("/materials/");

    if (materialsIndex !== -1) {
      const relative = normalized.slice(materialsIndex + "/materials/".length);
      if (relative.toLowerCase().startsWith("base/")) {
        return `${baseMaterialsRoot}${relative.slice("base/".length)}`;
      }
      return `${materialsRoot}${relative}`;
    }

    const filename = normalized.substring(normalized.lastIndexOf("/") + 1);
    if (filename.startsWith("__")) {
      return `${baseMaterialsRoot}${filename}`;
    }

    const isTexture = TEXTURE_EXTENSIONS.some((ext) =>
      filename.toLowerCase().endsWith(ext),
    );
    if (isTexture) {
      return `${materialsRoot}${filename}`;
    }

    return url;
  };
}

function configureMaterials(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    if (child instanceof THREE.SkinnedMesh) {
      child.frustumCulled = false;
    }
    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    materials.forEach((material) => {
      if (!material) {
        return;
      }
      material.side = THREE.DoubleSide;
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
      }
      if (material.emissiveMap) {
        material.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      }
      material.needsUpdate = true;
    });
  });
}

export type Viewer3DHandle = {
  resetCamera: () => void;
  resetPose: (pose?: PoseName) => void;
  captureScreenshot: () => void;
};

const SKY_EXR_URL = "/env_assets/citrus_orchard_road_puresky_4k.exr";

type BackgroundMode = "gradient" | "solid";
type EnvironmentMode = "none" | "sky";

const DEFAULT_BG_COLOR = "#30180c";

function hexToRgbChannels(value: string) {
  const hex = value.trim().replace(/^#/, "");
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16);
    const g = parseInt(hex[1] + hex[1], 16);
    const b = parseInt(hex[2] + hex[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }
    return `${r}, ${g}, ${b}`;
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return null;
    }
    return `${r}, ${g}, ${b}`;
  }
  return null;
}

type Viewer3DProps = {
  modelUrl: string;
  activeAnimation: string | null;
  pose: PoseName;
  autoplay: boolean;
  speed: number;
  preset: LightingPreset;
  backgroundMode: BackgroundMode;
  backgroundColor: string;
  environmentMode: EnvironmentMode;
  screenshotLabel?: string;
  onClipsLoaded: (clips: string[]) => void;
  onActiveClipChange: (clip: string | null) => void;
};

function Viewer3D(
  {
    modelUrl,
    activeAnimation,
    pose,
    autoplay,
    speed,
    preset,
    backgroundMode,
    backgroundColor,
    environmentMode,
    screenshotLabel,
    onClipsLoaded,
    onActiveClipChange,
  }: Viewer3DProps,
  ref: Ref<Viewer3DHandle>,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentActionRef = useRef<THREE.AnimationAction | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const lightsGroupRef = useRef<THREE.Group | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const ssaoPassRef = useRef<SSAOPass | null>(null);
  const rigRef = useRef<Rig | null>(null);
  const pmremGeneratorRef = useRef<THREE.PMREMGenerator | null>(null);
  const skyEnvMapRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const environmentRequestRef = useRef(0);
  const poseStateRef = useRef<PoseState>({
    from: pose,
    to: pose,
    blend: 1,
    time: 0,
  });
  const autoplayRef = useRef(autoplay);
  const speedRef = useRef(speed);
  const resetPose = useCallback(
    (targetPose?: PoseName) => {
      const nextPose = targetPose ?? pose;
      const poseState = poseStateRef.current;
      poseState.time = 0;
      poseState.from = nextPose;
      poseState.to = nextPose;
      poseState.blend = 1;
      autoplayRef.current = false;

      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current.setTime(0);
      }
      currentActionRef.current = null;
    },
    [pose],
  );

  const ensureSkyEnvironment = useCallback(async () => {
    const scene = sceneRef.current;
    const renderer = rendererRef.current;
    if (!scene || !renderer) {
      return;
    }

    if (!pmremGeneratorRef.current) {
      pmremGeneratorRef.current = new THREE.PMREMGenerator(renderer);
    }

    if (skyEnvMapRef.current) {
      scene.environment = skyEnvMapRef.current.texture;
      scene.background = skyEnvMapRef.current.texture;
      return;
    }

    const requestId = (environmentRequestRef.current += 1);

    try {
      const texture = await new EXRLoader().loadAsync(SKY_EXR_URL);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.colorSpace = THREE.LinearSRGBColorSpace;

      const envMap = pmremGeneratorRef.current.fromEquirectangular(texture);
      texture.dispose();

      if (requestId !== environmentRequestRef.current) {
        envMap.dispose();
        return;
      }

      if (skyEnvMapRef.current) {
        skyEnvMapRef.current.dispose();
      }
      skyEnvMapRef.current = envMap;
      scene.environment = envMap.texture;
      scene.background = envMap.texture;
    } catch (error) {
      console.warn("Failed to load sky environment.", error);
    }
  }, []);

  const applyEnvironmentMode = useCallback(
    (mode: EnvironmentMode) => {
      const scene = sceneRef.current;
      if (!scene) {
        return;
      }

      if (mode === "sky") {
        void ensureSkyEnvironment();
        return;
      }

      environmentRequestRef.current += 1;
      scene.environment = null;
      scene.background = null;
    },
    [ensureSkyEnvironment],
  );

  const captureScreenshot = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !scene || !camera || !canvas) {
      return;
    }

    const composer = composerRef.current;
    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sanitizedLabel = (screenshotLabel || "hero")
      .trim()
      .replace(/[^a-z0-9._-]+/gi, "_")
      .replace(/^_+|_+$/g, "");
    const filename = `${sanitizedLabel || "hero"}_${timestamp}.png`;

    const downloadUrl = (url: string) => {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    };

    if (canvas.toBlob) {
      canvas.toBlob((blob) => {
        if (!blob) {
          return;
        }
        const url = URL.createObjectURL(blob);
        downloadUrl(url);
        URL.revokeObjectURL(url);
      }, "image/png");
      return;
    }

    try {
      const dataUrl = canvas.toDataURL("image/png");
      downloadUrl(dataUrl);
    } catch (error) {
      console.warn("Screenshot capture failed.", error);
    }
  };

  useImperativeHandle(ref, () => ({
    resetCamera: () => resetRef.current(),
    resetPose,
    captureScreenshot,
  }));

  useEffect(() => {
    autoplayRef.current = autoplay;
  }, [autoplay]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    setPoseTarget(poseStateRef.current, pose);
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
    }
    currentActionRef.current = null;
  }, [pose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    camera.position.set(0, 1.8, 6);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controlsRef.current = controls;

    const initialWidth = Math.max(container.clientWidth, 1);
    const initialHeight = Math.max(container.clientHeight, 1);
    const composer = new EffectComposer(renderer);
    composer.setSize(initialWidth, initialHeight);
    composer.addPass(new RenderPass(scene, camera));
    const ssaoPass = new SSAOPass(scene, camera, initialWidth, initialHeight);
    ssaoPass.output = SSAOPass.OUTPUT.Default;
    composer.addPass(ssaoPass);
    composerRef.current = composer;
    ssaoPassRef.current = ssaoPass;

    const lightsGroup = new THREE.Group();
    lightsGroupRef.current = lightsGroup;
    scene.add(lightsGroup);

    const floorGeometry = new THREE.CircleGeometry(6, 64);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b0b0b,
      roughness: 0.85,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.4;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(12, 24, 0xf06a1d, 0x1a1a1a);
    grid.position.y = -1.39;
    if (!Array.isArray(grid.material)) {
      grid.material.opacity = 0.35;
      grid.material.transparent = true;
    }
    scene.add(grid);

    const syncSSAOCamera = () => {
      const ssao = ssaoPassRef.current;
      if (!ssao) {
        return;
      }
      ssao.camera = camera;
      ssao.ssaoMaterial.uniforms["cameraNear"].value = camera.near;
      ssao.ssaoMaterial.uniforms["cameraFar"].value = camera.far;
      ssao.depthRenderMaterial.uniforms["cameraNear"].value = camera.near;
      ssao.depthRenderMaterial.uniforms["cameraFar"].value = camera.far;
      ssao.ssaoMaterial.uniforms["cameraProjectionMatrix"].value.copy(camera.projectionMatrix);
      ssao.ssaoMaterial.uniforms["cameraInverseProjectionMatrix"].value.copy(
        camera.projectionMatrixInverse,
      );
    };

    const focusLightsOnModel = (object: THREE.Object3D) => {
      const targetCenter = new THREE.Vector3();
      new THREE.Box3().setFromObject(object).getCenter(targetCenter);
      lightsGroup.children.forEach((child) => {
        if (child instanceof THREE.DirectionalLight || child instanceof THREE.SpotLight) {
          if (!child.target.parent) {
            lightsGroup.add(child.target);
          }
          const offset = child.target.userData.focusOffset;
          if (offset instanceof THREE.Vector3) {
            child.target.position.copy(targetCenter).add(offset);
          } else {
            child.target.position.copy(targetCenter);
          }
          child.target.updateMatrixWorld();
        }
      });
    };

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) {
        return;
      }
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      composer.setSize(clientWidth, clientHeight);
      ssaoPass.setSize(clientWidth, clientHeight);
      syncSSAOCamera();
    };

    const applyLights = (nextPreset: LightingPreset) => {
      lightsGroup.clear();
      const rig = createLightingPreset(nextPreset);
      rig.objects.forEach((object) => lightsGroup.add(object));
      renderer.toneMappingExposure = rig.exposure;
      ssaoPass.kernelRadius = rig.ssao.kernelRadius;
      ssaoPass.minDistance = rig.ssao.minDistance;
      ssaoPass.maxDistance = rig.ssao.maxDistance;
      if (modelRef.current) {
        focusLightsOnModel(modelRef.current);
      }
    };
    applyLights(preset);
    applyEnvironmentMode(environmentMode);

    const clock = new THREE.Clock();
    let rafId = 0;

    const renderLoop = () => {
      rafId = requestAnimationFrame(renderLoop);
      const delta = clock.getDelta();
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }
      if (rigRef.current) {
        const poseState = poseStateRef.current;
        updatePoseState(poseState, delta, speedRef.current, autoplayRef.current);
        const toSignals = getPoseSignals(poseState.to, poseState.time);
        const blendedSignals =
          poseState.blend < 1
            ? blendSignals(getPoseSignals(poseState.from, poseState.time), toSignals, poseState.blend)
            : toSignals;
        applyPoseToRig(rigRef.current, blendedSignals);
        const model = modelRef.current;
        if (model) {
          model.updateMatrixWorld(true);
          model.traverse((child) => {
            if (child instanceof THREE.SkinnedMesh) {
              child.skeleton.update();
            }
          });
        }
      }
      controls.update();
      composer.render();
    };

    const loadModel = () => {
      setIsLoading(true);
      setLoadingProgress(0);
      setError(null);

      const manager = new THREE.LoadingManager();
      manager.onProgress = (_, loaded, total) => {
        if (total > 0) {
          setLoadingProgress(Math.round((loaded / total) * 100));
        }
      };
      manager.onError = (url) => {
        console.warn("Failed to load texture", url);
      };
      manager.addHandler(/\.tga$/i, new TGALoader(manager));
      manager.addHandler(/\.dds$/i, new DDSLoader(manager));

      const urlResolver = createTextureUrlResolver(modelUrl);
      if (urlResolver) {
        manager.setURLModifier(urlResolver);
      }

      const loader = new FBXLoader(manager);
      loader.load(
        modelUrl,
        (model) => {
          configureMaterials(model);
          scene.add(model);
          modelRef.current = model;
          rigRef.current = buildRig(model);
          if (rigRef.current) {
            poseStateRef.current.time = 0;
            poseStateRef.current.from = poseStateRef.current.to;
            poseStateRef.current.blend = 1;
          }

          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
          const actions: Record<string, THREE.AnimationAction> = {};
          model.animations.forEach((clip) => {
            actions[clip.name] = mixer.clipAction(clip);
          });
          actionsRef.current = actions;
          onClipsLoaded(Object.keys(actions));

          fitCameraToObject({
            camera,
            controls,
            object: model,
            offset: 1.3,
          });
          resetRef.current = () =>
            fitCameraToObject({
              camera,
              controls,
              object: model,
              offset: 1.3,
            });

          focusLightsOnModel(model);
          syncSSAOCamera();

          setIsLoading(false);
        },
        undefined,
        (loadError) => {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load the hero model.",
          );
          setIsLoading(false);
        },
      );
    };

    loadModel();
    resize();
    renderLoop();
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      controls.dispose();
      ssaoPass.dispose();
      composer.dispose();
      renderer.dispose();
      lightsGroup.clear();
      floor.geometry.dispose();
      floorMaterial.dispose();
      grid.geometry.dispose();
      if (!Array.isArray(grid.material)) {
        grid.material.dispose();
      } else {
        grid.material.forEach((material) => material.dispose());
      }
      if (modelRef.current) {
        modelRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (Array.isArray(child.material)) {
              child.material.forEach((material) => material.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }
      scene.clear();
      if (skyEnvMapRef.current) {
        skyEnvMapRef.current.dispose();
        skyEnvMapRef.current = null;
      }
      if (pmremGeneratorRef.current) {
        pmremGeneratorRef.current.dispose();
        pmremGeneratorRef.current = null;
      }
      mixerRef.current = null;
      actionsRef.current = {};
      currentActionRef.current = null;
      modelRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      lightsGroupRef.current = null;
      ssaoPassRef.current = null;
      composerRef.current = null;
      rigRef.current = null;
    };
  }, [applyEnvironmentMode, modelUrl, onClipsLoaded, retryKey]);

  useEffect(() => {
    applyEnvironmentMode(environmentMode);
  }, [applyEnvironmentMode, environmentMode]);

  useEffect(() => {
    const lightsGroup = lightsGroupRef.current;
    const renderer = rendererRef.current;
    const ssaoPass = ssaoPassRef.current;
    if (!lightsGroup || !renderer || !ssaoPass) {
      return;
    }
    lightsGroup.clear();
    const rig = createLightingPreset(preset);
    rig.objects.forEach((object) => lightsGroup.add(object));
    renderer.toneMappingExposure = rig.exposure;
    ssaoPass.kernelRadius = rig.ssao.kernelRadius;
    ssaoPass.minDistance = rig.ssao.minDistance;
    ssaoPass.maxDistance = rig.ssao.maxDistance;

    const model = modelRef.current;
    if (!model) {
      return;
    }

    const targetCenter = new THREE.Vector3();
    new THREE.Box3().setFromObject(model).getCenter(targetCenter);
    lightsGroup.children.forEach((child) => {
      if (child instanceof THREE.DirectionalLight || child instanceof THREE.SpotLight) {
        if (!child.target.parent) {
          lightsGroup.add(child.target);
        }
        const offset = child.target.userData.focusOffset;
        if (offset instanceof THREE.Vector3) {
          child.target.position.copy(targetCenter).add(offset);
        } else {
          child.target.position.copy(targetCenter);
        }
        child.target.updateMatrixWorld();
      }
    });
  }, [preset]);

  useEffect(() => {
    if (pose) {
      return;
    }
    const actions = actionsRef.current;
    const mixer = mixerRef.current;
    if (!mixer || Object.keys(actions).length === 0) {
      return;
    }
    const clipName = activeAnimation && actions[activeAnimation] ? activeAnimation : null;
    const fallbackClip = Object.keys(actions)[0] ?? null;
    const nextClip = clipName ?? fallbackClip;

    if (!nextClip) {
      return;
    }

    if (nextClip !== activeAnimation) {
      onActiveClipChange(nextClip);
    }

    const nextAction = actions[nextClip];
    if (!nextAction) {
      return;
    }

    const currentAction = currentActionRef.current;
    if (currentAction && currentAction !== nextAction) {
      currentAction.crossFadeTo(nextAction, 0.3, false);
    }

    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveTimeScale(speed);
    nextAction.paused = !autoplay;
    nextAction.fadeIn(0.2).play();
    currentActionRef.current = nextAction;
  }, [activeAnimation, autoplay, speed, onActiveClipChange, pose]);

  useEffect(() => {
    if (mixerRef.current) {
      mixerRef.current.timeScale = speed;
    }
  }, [speed]);

  const handleRetry = () => {
    setRetryKey((prev) => prev + 1);
  };

  return (
    <div
      ref={containerRef}
      className={`viewer ${
        backgroundMode === "gradient" ? "viewer--gradient" : "viewer--solid"
      }`}
      style={
        {
          "--viewer-solid": backgroundColor,
          "--viewer-gradient-rgb":
            hexToRgbChannels(backgroundColor) ?? hexToRgbChannels(DEFAULT_BG_COLOR),
        } as CSSProperties
      }
    >
      <canvas ref={canvasRef} />
      {isLoading && (
        <div className="viewer__overlay">
          <div>
            <p>Loading hero asset...</p>
            <strong>{loadingProgress}%</strong>
          </div>
        </div>
      )}
      {error && (
        <div className="viewer__overlay viewer__overlay--error">
          <div>
            <p>We couldn’t load the hero asset.</p>
            <small>{error}</small>
            <button type="button" onClick={handleRetry}>
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default forwardRef(Viewer3D);
