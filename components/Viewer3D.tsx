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

type TextureRootOverrides = {
  materialsRoot?: string;
  baseMaterialsRoot?: string;
};

type RenderTier = {
  maxPixelRatio: number;
  ssaoScale: number;
  idleFps: number;
};

const DEFAULT_RENDER_TIER: RenderTier = {
  maxPixelRatio: 2,
  ssaoScale: 1,
  idleFps: 24,
};

function getRenderTier(): RenderTier {
  if (typeof window === "undefined") {
    return DEFAULT_RENDER_TIER;
  }
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const cores = navigator.hardwareConcurrency ?? 8;
  const minViewport = Math.min(window.innerWidth, window.innerHeight);
  const isLowEnd = deviceMemory <= 4 || cores <= 4 || minViewport < 720;
  if (!isLowEnd) {
    return DEFAULT_RENDER_TIER;
  }
  return {
    maxPixelRatio: 1.5,
    ssaoScale: 0.75,
    idleFps: 20,
  };
}

const TEXTURE_EXTENSIONS = [".tga", ".png", ".jpg", ".jpeg", ".bmp", ".dds"];
THREE.Cache.enabled = true;
const HERO_FORCE_TEXTURES = new Set(["monkey_king"]);
const HERO_TANGENT_FIX = new Set(["monkey_king"]);
const HERO_PART_ALIASES: Record<
  string,
  Record<string, string[]>
> = {
  kez: {
    armor: ["armor", "body", "torso"],
    head: ["head", "face"],
    hair: ["hair"],
    rope: ["rope"],
    pearl: ["pearl"],
    sai: ["sai"],
    shoulder: ["shoulder", "shoulders", "pad", "pads"],
    tail: ["tail"],
    weapon: ["weapon", "blade", "sword", "staff"],
    weapon_handle: ["handle", "hilt"],
    weapon_scabbard: ["scabbard", "sheath"],
    weapon_smear_sai: ["smear"],
    base: ["base"],
  },
  doom: {
    arms: ["arm", "arms"],
    back: ["back", "cape"],
    belt: ["belt", "waist"],
    head: ["head", "horn", "face"],
    shoulder: ["shoulder", "shoulders", "pad", "pads"],
    tail: ["tail"],
    weapon: ["weapon", "blade", "sword"],
    base: ["base"],
  },
  monkey_king: {
    armor: ["armor", "body", "torso"],
    head: ["head", "face"],
    shoulders: ["shoulder", "shoulders", "pad", "pads"],
    weapon: ["weapon", "staff", "rod", "jingu", "bang"],
    base: ["base"],
  },
};

const HERO_DEFAULT_PART: Record<string, string> = {
  kez: "base",
  doom: "base",
  monkey_king: "base",
};

const HERO_PREFIX: Record<string, string> = {};

const HERO_MATERIAL_TUNING: Record<
  string,
  {
    albedoBoost: number;
    emissiveIntensity: number;
    emissiveColor: number;
    specular?: number;
    shininess?: number;
  }
> = {
  monkey_king: {
    albedoBoost: 1.6,
    emissiveIntensity: 0.45,
    emissiveColor: 0xffffff,
    specular: 0x9c9c9c,
    shininess: 18,
  },
};

const HERO_WEAPON_ALIGNMENT: Record<
  string,
  {
    weaponBones?: string[];
    handBones: string[];
    meshHints: string[];
  }
> = {
  monkey_king: {
    weaponBones: ["weapon_base", "weapon"],
    handBones: ["wrist_r", "hand_r"],
    meshHints: ["weapon", "staff", "jingu", "bang"],
  },
};

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

type WeaponAttachment = {
  heroKey: string;
  handBone: THREE.Bone;
  weaponBone?: THREE.Bone;
  weaponMesh?: THREE.Mesh;
  parent: THREE.Object3D;
  meshCenter?: THREE.Vector3;
  offset?: THREE.Vector3;
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

function normalizeRootUrl(value: string) {
  const resolved = new URL(value, window.location.href).toString();
  return resolved.endsWith("/") ? resolved : `${resolved}/`;
}

function resolveTextureRoots(
  modelUrl: string,
  overrides?: TextureRootOverrides,
): Pick<AssetRoots, "materialsRoot" | "baseMaterialsRoot"> | null {
  const hasOverrides = Boolean(overrides?.materialsRoot || overrides?.baseMaterialsRoot);
  if (hasOverrides) {
    try {
      const materialsRoot = overrides?.materialsRoot
        ? normalizeRootUrl(overrides.materialsRoot)
        : null;
      const baseMaterialsRoot = overrides?.baseMaterialsRoot
        ? normalizeRootUrl(overrides.baseMaterialsRoot)
        : null;
      const fallbackRoot = materialsRoot ?? baseMaterialsRoot;
      if (fallbackRoot) {
        return {
          materialsRoot: materialsRoot ?? fallbackRoot,
          baseMaterialsRoot: baseMaterialsRoot ?? fallbackRoot,
        };
      }
    } catch {
      // Fall back to resolving from the model URL.
    }
  }

  const roots = resolveAssetRoots(modelUrl);
  if (!roots) {
    return null;
  }
  return {
    materialsRoot: roots.materialsRoot,
    baseMaterialsRoot: roots.baseMaterialsRoot,
  };
}

function remapValveTexturePath(value: string) {
  if (value.toLowerCase().endsWith(".vtf")) {
    return `${value.slice(0, -4)}.tga`;
  }
  return value;
}

function getTextureDimensions(texture: THREE.Texture) {
  const image = texture.image as { width?: number; height?: number } | undefined;
  if (!image) {
    return null;
  }
  const width = typeof image.width === "number" ? image.width : 0;
  const height = typeof image.height === "number" ? image.height : 0;
  return { width, height };
}

function hasUsableTexture(texture: THREE.Texture | null | undefined) {
  if (!texture) {
    return false;
  }
  const dimensions = getTextureDimensions(texture);
  if (!dimensions) {
    return false;
  }
  return !(dimensions.width <= 2 && dimensions.height <= 2);
}

function queueIdleWork(task: () => void, timeout = 1200) {
  if (typeof window === "undefined") {
    task();
    return;
  }
  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback(task, { timeout });
    return;
  }
  window.setTimeout(task, 0);
}

async function runTaskQueue(tasks: Array<() => Promise<void>>, concurrency = 3) {
  if (tasks.length === 0) {
    return;
  }
  let index = 0;
  const workers = new Array(Math.min(concurrency, tasks.length)).fill(0).map(async () => {
    while (index < tasks.length) {
      const task = tasks[index];
      index += 1;
      try {
        await task();
      } catch {
        // Ignore failed texture attempts.
      }
    }
  });
  await Promise.all(workers);
}

function loadTextureWithFallback(
  url: string,
  manager: THREE.LoadingManager,
  cache: Map<string, THREE.Texture>,
): Promise<THREE.Texture> {
  const cached = cache.get(url);
  if (cached) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    const lower = url.toLowerCase();
    const onLoad = (texture: THREE.Texture) => {
      cache.set(url, texture);
      resolve(texture);
    };
    if (lower.endsWith(".tga")) {
      new TGALoader(manager).load(url, onLoad, undefined, reject);
      return;
    }
    if (lower.endsWith(".dds")) {
      new DDSLoader(manager).load(url, onLoad, undefined, reject);
      return;
    }
    new THREE.TextureLoader(manager).load(url, onLoad, undefined, reject);
  });
}

function resolveHeroPart(heroKey: string, hint: string) {
  const aliases = HERO_PART_ALIASES[heroKey] ?? {};
  const normalized = hint.toLowerCase();
  for (const [part, keys] of Object.entries(aliases)) {
    if (keys.some((key) => normalized.includes(key))) {
      return part;
    }
  }
  return HERO_DEFAULT_PART[heroKey] ?? "base";
}

function getHeroTextureCandidates(
  heroKey: string,
  part: string,
  materialsRoot: string,
  baseMaterialsRoot: string,
  materialsPrefix: string,
) {
  const stem = `${heroKey}_${part}`;
  const baseStem = `__${heroKey}_base`;
  const prefix = materialsPrefix;
  return {
    color: [
      `${materialsRoot}${prefix}${stem}_color.tga`,
      `${materialsRoot}${prefix}${stem}_diffuse.tga`,
    ],
    normal: [`${materialsRoot}${prefix}${stem}_normal.tga`],
    specular: [`${materialsRoot}${prefix}${stem}_specularMask.tga`],
    metalness: [`${materialsRoot}${prefix}${stem}_metalnessMask.tga`],
    emissive: [`${materialsRoot}${prefix}${stem}_selfIllumMask.tga`],
    rim: [`${materialsRoot}${prefix}${stem}_rimMask.tga`],
    baseColor: [`${baseMaterialsRoot}${baseStem}_color.tga`],
    baseNormal: [`${baseMaterialsRoot}${baseStem}_normal.tga`],
    baseSpecular: [`${baseMaterialsRoot}${baseStem}_specularMask.tga`],
    baseMetalness: [`${baseMaterialsRoot}${baseStem}_metalnessMask.tga`],
    baseEmissive: [`${baseMaterialsRoot}${baseStem}_selfIllumMask.tga`],
    baseRim: [`${baseMaterialsRoot}${baseStem}_rimMask.tga`],
  };
}

async function loadTextureWithFallbacks(
  urls: string[],
  manager: THREE.LoadingManager,
  cache: Map<string, THREE.Texture>,
) {
  for (const url of urls) {
    try {
      const texture = await loadTextureWithFallback(url, manager, cache);
      if (texture) {
        return texture;
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

async function applyHeroMaterialFallbacks(
  model: THREE.Object3D,
  manager: THREE.LoadingManager,
  heroKey?: string,
  materialsRoot?: string,
  baseMaterialsRoot?: string,
  materialsPrefix?: string,
  isCancelled?: () => boolean,
) {
  if (!heroKey) {
    return;
  }

  const forceTextures = HERO_FORCE_TEXTURES.has(heroKey);
  const root = normalizeRootUrl(
    materialsRoot ?? `/assets/${heroKey}/materials/`,
  );
  const baseRoot = normalizeRootUrl(
    baseMaterialsRoot ?? `${root}base/`,
  );
  const prefix = materialsPrefix ?? HERO_PREFIX[heroKey] ?? "";
  const cache = new Map<string, THREE.Texture>();
  const pending: Promise<void>[] = [];
  const deferred: Array<() => Promise<void>> = [];

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      if (!material) {
        return;
      }
      const hint = `${child.name} ${material.name}`;
      const part = resolveHeroPart(heroKey, hint);
      const candidates = getHeroTextureCandidates(
        heroKey,
        part,
        root,
        baseRoot,
        prefix,
      );

      const applyMap = async () => {
        if (isCancelled?.()) {
          return;
        }
        if (!forceTextures && hasUsableTexture(material.map)) {
          return;
        }
        const texture =
          (await loadTextureWithFallbacks(candidates.color, manager, cache)) ||
          (await loadTextureWithFallbacks(candidates.baseColor, manager, cache));
        if (!texture) {
          return;
        }
        if (isCancelled?.()) {
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        material.map = texture;
        if ("color" in material && material.color) {
          material.color.set(0xffffff);
        }
        material.needsUpdate = true;
      };

      const applyNormal = async () => {
        if (isCancelled?.()) {
          return;
        }
        if (!forceTextures && hasUsableTexture(material.normalMap)) {
          return;
        }
        const texture =
          (await loadTextureWithFallbacks(candidates.normal, manager, cache)) ||
          (await loadTextureWithFallbacks(candidates.baseNormal, manager, cache));
        if (!texture) {
          return;
        }
        if (isCancelled?.()) {
          return;
        }
        material.normalMap = texture;
        material.needsUpdate = true;
      };

      const applySpecular = async () => {
        if (isCancelled?.()) {
          return;
        }
        if (!("specularMap" in material)) {
          return;
        }
        if (
          !forceTextures &&
          hasUsableTexture((material as THREE.MeshPhongMaterial).specularMap)
        ) {
          return;
        }
        const texture =
          (await loadTextureWithFallbacks(candidates.specular, manager, cache)) ||
          (await loadTextureWithFallbacks(candidates.baseSpecular, manager, cache));
        if (!texture) {
          return;
        }
        if (isCancelled?.()) {
          return;
        }
        (material as THREE.MeshPhongMaterial).specularMap = texture;
        (material as THREE.MeshPhongMaterial).specular?.set(0xffffff);
        material.needsUpdate = true;
      };

      const applyEmissive = async () => {
        if (isCancelled?.()) {
          return;
        }
        if (!("emissiveMap" in material)) {
          return;
        }
        if (
          !forceTextures &&
          hasUsableTexture((material as THREE.MeshPhongMaterial).emissiveMap)
        ) {
          return;
        }
        const texture =
          (await loadTextureWithFallbacks(candidates.emissive, manager, cache)) ||
          (await loadTextureWithFallbacks(candidates.baseEmissive, manager, cache));
        if (!texture) {
          return;
        }
        if (isCancelled?.()) {
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        (material as THREE.MeshPhongMaterial).emissiveMap = texture;
        (material as THREE.MeshPhongMaterial).emissive?.set(0xffffff);
        (material as THREE.MeshPhongMaterial).emissiveIntensity = 0.45;
        material.needsUpdate = true;
      };

      const applyMetalness = async () => {
        if (isCancelled?.()) {
          return;
        }
        if (!("metalnessMap" in material)) {
          return;
        }
        if (
          !forceTextures &&
          hasUsableTexture((material as THREE.MeshStandardMaterial).metalnessMap)
        ) {
          return;
        }
        const texture =
          (await loadTextureWithFallbacks(candidates.metalness, manager, cache)) ||
          (await loadTextureWithFallbacks(candidates.baseMetalness, manager, cache));
        if (!texture) {
          return;
        }
        if (isCancelled?.()) {
          return;
        }
        (material as THREE.MeshStandardMaterial).metalnessMap = texture;
        (material as THREE.MeshStandardMaterial).metalness = 0.6;
        (material as THREE.MeshStandardMaterial).roughness = 0.55;
        material.needsUpdate = true;
      };

      pending.push(applyMap(), applyNormal());
      deferred.push(applySpecular, applyEmissive, applyMetalness);
    });
  });

  await Promise.all(pending);
  applyHeroMaterialTuning(model, heroKey);
  ensureHeroTangents(model, heroKey);
  if (isCancelled?.()) {
    return;
  }
  queueIdleWork(() => {
    if (isCancelled?.()) {
      return;
    }
    void runTaskQueue(deferred, 3);
  });
}

function applyHeroMaterialTuning(model: THREE.Object3D, heroKey?: string) {
  if (!heroKey) {
    return;
  }
  const tuning = HERO_MATERIAL_TUNING[heroKey];
  if (!tuning) {
    return;
  }

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    materials.forEach((material) => {
      if (!material || material.userData?.heroTuned) {
        return;
      }
      material.userData = {
        ...material.userData,
        heroTuned: true,
      };

      if ("color" in material && material.color) {
        material.color.multiplyScalar(tuning.albedoBoost);
      }
      if ("emissive" in material && material.emissive) {
        material.emissive.setHex(tuning.emissiveColor);
        const currentIntensity =
          "emissiveIntensity" in material ? material.emissiveIntensity ?? 0 : 0;
        if ("emissiveIntensity" in material) {
          material.emissiveIntensity = Math.max(
            currentIntensity,
            tuning.emissiveIntensity,
          );
        }
      }
      if ("specular" in material && tuning.specular !== undefined) {
        (material as THREE.MeshPhongMaterial).specular.setHex(tuning.specular);
      }
      if ("shininess" in material && tuning.shininess !== undefined) {
        (material as THREE.MeshPhongMaterial).shininess = Math.max(
          (material as THREE.MeshPhongMaterial).shininess ?? 0,
          tuning.shininess,
        );
      }
      material.needsUpdate = true;
    });
  });
}

function ensureHeroTangents(model: THREE.Object3D, heroKey?: string) {
  if (!heroKey || !HERO_TANGENT_FIX.has(heroKey)) {
    return;
  }

  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const usesNormalMap = materials.some((material) => material?.normalMap);
    if (!usesNormalMap) {
      return;
    }

    const geometry = child.geometry as THREE.BufferGeometry | undefined;
    if (!geometry) {
      return;
    }
    if (geometry.userData?.tangentsComputed) {
      return;
    }
    if (!geometry.attributes?.position || !geometry.attributes?.normal || !geometry.attributes?.uv) {
      return;
    }

    if (!geometry.index) {
      const vertexCount = geometry.attributes.position.count;
      const indices = new Array<number>(vertexCount);
      for (let i = 0; i < vertexCount; i += 1) {
        indices[i] = i;
      }
      geometry.setIndex(indices);
    }

    try {
      geometry.computeTangents();
      geometry.userData = { ...geometry.userData, tangentsComputed: true };
    } catch (error) {
      console.warn("Failed to compute tangents for hero mesh.", error);
    }
  });
}

function findBoneByNames(model: THREE.Object3D, names: string[]) {
  const normalized = names.map((name) => name.toLowerCase());
  let result: THREE.Bone | null = null;
  model.traverse((child) => {
    if (result || !(child instanceof THREE.Bone)) {
      return;
    }
    const name = child.name.toLowerCase();
    if (normalized.some((candidate) => candidate === name)) {
      result = child;
    }
  });
  return result;
}

function findMeshByHints(model: THREE.Object3D, hints: string[]) {
  const normalized = hints.map((hint) => hint.toLowerCase());
  let result: THREE.Mesh | null = null;
  model.traverse((child) => {
    if (result || !(child instanceof THREE.Mesh)) {
      return;
    }
    const name = child.name.toLowerCase();
    if (normalized.some((hint) => name.includes(hint))) {
      result = child;
    }
  });
  return result;
}

function alignHeroWeapon(model: THREE.Object3D, heroKey?: string) {
  if (!heroKey) {
    return;
  }
  const config = HERO_WEAPON_ALIGNMENT[heroKey];
  if (!config) {
    return;
  }
  if (model.userData?.weaponAligned || model.userData?.weaponAttachment) {
    return;
  }

  model.updateMatrixWorld(true);

  const handBone = findBoneByNames(model, config.handBones);
  if (!handBone) {
    return;
  }

  const handPosition = new THREE.Vector3();
  handBone.getWorldPosition(handPosition);

  const weaponBone = config.weaponBones
    ? findBoneByNames(model, config.weaponBones)
    : null;

  if (weaponBone) {
    const weaponPosition = new THREE.Vector3();
    weaponBone.getWorldPosition(weaponPosition);
    const parent = weaponBone.parent;
    if (parent) {
      const localHand = handPosition.clone();
      const localWeapon = weaponPosition.clone();
      parent.worldToLocal(localHand);
      parent.worldToLocal(localWeapon);
      weaponBone.position.add(localHand.sub(localWeapon));
      model.userData = {
        ...model.userData,
        weaponAttachment: {
          heroKey,
          handBone,
          weaponBone,
          parent,
          offset: new THREE.Vector3(),
        } satisfies WeaponAttachment,
      };
    } else {
      weaponBone.position.add(handPosition.sub(weaponPosition));
      model.userData = {
        ...model.userData,
        weaponAttachment: {
          heroKey,
          handBone,
          weaponBone,
          parent: model,
          offset: new THREE.Vector3(),
        } satisfies WeaponAttachment,
      };
    }
    weaponBone.updateMatrixWorld(true);
    model.userData = { ...model.userData, weaponAligned: true };
    return;
  }

  const weaponMesh = findMeshByHints(model, config.meshHints);
  if (!weaponMesh || weaponMesh.userData?.weaponAligned) {
    return;
  }

  weaponMesh.geometry.computeBoundingBox();
  const meshCenter = new THREE.Vector3();
  weaponMesh.geometry.boundingBox?.getCenter(meshCenter);
  const parent = weaponMesh.parent ?? model;
  const localHand = handPosition.clone();
  parent.worldToLocal(localHand);
  weaponMesh.position.copy(localHand.sub(meshCenter));
  weaponMesh.updateMatrixWorld(true);
  weaponMesh.userData = { ...weaponMesh.userData, weaponAligned: true };
  model.userData = {
    ...model.userData,
    weaponAligned: true,
    weaponAttachment: {
      heroKey,
      handBone,
      weaponMesh,
      parent,
      meshCenter,
    } satisfies WeaponAttachment,
  };
}

function updateHeroWeaponAttachment(model: THREE.Object3D, heroKey?: string) {
  if (!heroKey) {
    return;
  }
  const attachment = model.userData?.weaponAttachment as WeaponAttachment | undefined;
  if (!attachment || attachment.heroKey !== heroKey) {
    return;
  }

  const handPosition = new THREE.Vector3();
  attachment.handBone.getWorldPosition(handPosition);

  const parent = attachment.parent ?? model;
  const localHand = handPosition.clone();
  parent.worldToLocal(localHand);

  if (attachment.weaponBone) {
    const offset = attachment.offset ?? new THREE.Vector3();
    attachment.weaponBone.position.copy(localHand.add(offset));
    attachment.weaponBone.updateMatrixWorld(true);
    return;
  }

  if (attachment.weaponMesh && attachment.meshCenter) {
    attachment.weaponMesh.position.copy(localHand.sub(attachment.meshCenter));
    attachment.weaponMesh.updateMatrixWorld(true);
  }
}

function createTextureUrlResolver(modelUrl: string, overrides?: TextureRootOverrides) {
  const roots = resolveTextureRoots(modelUrl, overrides);
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
    const remapped = remapValveTexturePath(normalized);
    const lower = remapped.toLowerCase();
    const materialsIndex = lower.lastIndexOf("/materials/");

    if (materialsIndex !== -1) {
      const relative = remapped.slice(materialsIndex + "/materials/".length);
      if (relative.toLowerCase().startsWith("base/")) {
        return `${baseMaterialsRoot}${relative.slice("base/".length)}`;
      }
      return `${materialsRoot}${relative}`;
    }

    const filename = remapped.substring(remapped.lastIndexOf("/") + 1);
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

    const isBackfaceMesh =
      child.name.toLowerCase().includes("backfaces") ||
      child.name.toLowerCase().includes("_backface");

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
      material.side = isBackfaceMesh ? THREE.FrontSide : THREE.DoubleSide;
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
  materialsRoot?: string;
  baseMaterialsRoot?: string;
  heroKey?: string;
  materialsPrefix?: string;
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
    materialsRoot,
    baseMaterialsRoot,
    heroKey,
    materialsPrefix,
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
  const poseAppliedRef = useRef(false);
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
    poseAppliedRef.current = false;
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
    let cancelled = false;
    const renderTier = getRenderTier();

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderTier.maxPixelRatio));
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
    const ssaoWidth = Math.max(1, Math.round(initialWidth * renderTier.ssaoScale));
    const ssaoHeight = Math.max(1, Math.round(initialHeight * renderTier.ssaoScale));
    const ssaoPass = new SSAOPass(scene, camera, ssaoWidth, ssaoHeight);
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, renderTier.maxPixelRatio));
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      composer.setSize(clientWidth, clientHeight);
      ssaoPass.setSize(
        Math.max(1, Math.round(clientWidth * renderTier.ssaoScale)),
        Math.max(1, Math.round(clientHeight * renderTier.ssaoScale)),
      );
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
    let lastRenderTime = 0;

    const renderLoop = (time = 0) => {
      rafId = requestAnimationFrame(renderLoop);
      const delta = clock.getDelta();
      const controlsUpdated = controls.update();
      const activeAction = currentActionRef.current;
      const hasAction = Boolean(activeAction && activeAction.enabled && !activeAction.paused);
      const poseState = poseStateRef.current;
      const poseAnimating = autoplayRef.current || poseState.blend < 1;
      const poseNeedsUpdate = poseAnimating || !poseAppliedRef.current;
      const shouldAnimate = hasAction || poseNeedsUpdate || controlsUpdated;
      const targetFps = shouldAnimate ? 60 : renderTier.idleFps;

      if (time - lastRenderTime < 1000 / targetFps) {
        return;
      }
      lastRenderTime = time;

      if (hasAction && mixerRef.current) {
        mixerRef.current.update(delta);
      }
      if (rigRef.current && poseNeedsUpdate) {
        if (poseAnimating) {
          updatePoseState(poseState, delta, speedRef.current, autoplayRef.current);
        }
        const toSignals = getPoseSignals(poseState.to, poseState.time);
        const blendedSignals =
          poseState.blend < 1
            ? blendSignals(
                getPoseSignals(poseState.from, poseState.time),
                toSignals,
                poseState.blend,
              )
            : toSignals;
        applyPoseToRig(rigRef.current, blendedSignals);
        poseAppliedRef.current = true;
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
      if (poseNeedsUpdate && !currentActionRef.current && modelRef.current) {
        updateHeroWeaponAttachment(modelRef.current, heroKey);
      }
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

      const urlResolver = createTextureUrlResolver(modelUrl, {
        materialsRoot,
        baseMaterialsRoot,
      });
      if (urlResolver) {
        manager.setURLModifier(urlResolver);
      }

      const loader = new FBXLoader(manager);
      loader.load(
        modelUrl,
        (model) => {
          if (cancelled) {
            model.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry.dispose();
                if (Array.isArray(child.material)) {
                  child.material.forEach((material) => material.dispose());
                } else {
                  child.material.dispose();
                }
              }
            });
            return;
          }
          configureMaterials(model);
          void applyHeroMaterialFallbacks(
            model,
            manager,
            heroKey,
            materialsRoot,
            baseMaterialsRoot,
            materialsPrefix,
            () => cancelled,
          );
          scene.add(model);
          modelRef.current = model;
          alignHeroWeapon(model, heroKey);
          rigRef.current = buildRig(model);
          if (rigRef.current) {
            poseStateRef.current.time = 0;
            poseStateRef.current.from = poseStateRef.current.to;
            poseStateRef.current.blend = 1;
            poseAppliedRef.current = false;
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
      cancelled = true;
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
  }, [
    applyEnvironmentMode,
    baseMaterialsRoot,
    heroKey,
    materialsPrefix,
    materialsRoot,
    modelUrl,
    onClipsLoaded,
    retryKey,
  ]);

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
