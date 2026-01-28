import * as THREE from "three";
import type { LightingPreset } from "../urlState";

export type SSAOSettings = {
  kernelRadius: number;
  minDistance: number;
  maxDistance: number;
};

export type LightingRig = {
  objects: THREE.Object3D[];
  ssao: SSAOSettings;
  exposure: number;
};

const DEFAULT_TARGET = new THREE.Vector3(0, 1, 0);

type ShadowConfig = {
  mapSize?: number;
  bias?: number;
  normalBias?: number;
  near?: number;
  far?: number;
  frustum?: number;
};

function createTarget(position: THREE.Vector3 = DEFAULT_TARGET) {
  const target = new THREE.Object3D();
  target.position.copy(position);
  return target;
}

function configureShadow(
  light: THREE.DirectionalLight | THREE.SpotLight,
  {
    mapSize = 1024,
    bias = -0.00015,
    normalBias = 0.02,
    near = 0.5,
    far = 40,
    frustum = 10,
  }: ShadowConfig = {},
) {
  light.castShadow = true;
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.bias = bias;
  light.shadow.normalBias = normalBias;
  light.shadow.camera.near = near;
  light.shadow.camera.far = far;

  if (light instanceof THREE.DirectionalLight) {
    light.shadow.camera.left = -frustum;
    light.shadow.camera.right = frustum;
    light.shadow.camera.top = frustum;
    light.shadow.camera.bottom = -frustum;
  }
}

function createDirectionalLight(
  color: number,
  intensity: number,
  position: THREE.Vector3,
  castShadow = false,
): { light: THREE.DirectionalLight; target: THREE.Object3D } {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.copy(position);
  const target = createTarget();
  light.target = target;
  if (castShadow) {
    configureShadow(light, { mapSize: 1536, frustum: 12 });
  }
  return { light, target };
}

function createSpotLight(
  color: number,
  intensity: number,
  position: THREE.Vector3,
  angle: number,
  penumbra: number,
  castShadow = false,
): { light: THREE.SpotLight; target: THREE.Object3D } {
  const light = new THREE.SpotLight(color, intensity);
  light.position.copy(position);
  light.angle = angle;
  light.penumbra = penumbra;
  light.decay = 1.5;
  light.distance = 0;
  const target = createTarget();
  light.target = target;
  if (castShadow) {
    configureShadow(light, { mapSize: 2048, near: 0.5, far: 50 });
  }
  return { light, target };
}

export function createLightingPreset(preset: LightingPreset): LightingRig {
  switch (preset) {
    case "spotlight": {
      const ambient = new THREE.AmbientLight(0xffffff, 0.55);
      const hemi = new THREE.HemisphereLight(0xffffff, 0x1f1f1f, 0.65);

      const key = createDirectionalLight(
        0xfaf7ff,
        2.4,
        new THREE.Vector3(6.5, 8.5, 5.5),
        true,
      );
      key.light.shadow.radius = 2;
      key.target.userData.focusOffset = new THREE.Vector3(0, 1.2, 0.15);

      const fill = createDirectionalLight(
        0xffe6c4,
        1.35,
        new THREE.Vector3(-3.5, 4.8, 5.2),
      );
      fill.target.userData.focusOffset = new THREE.Vector3(0, 1, -0.1);

      const rim = createDirectionalLight(
        0xcfe2ff,
        1.1,
        new THREE.Vector3(-6.5, 6.5, -5.5),
      );
      rim.target.userData.focusOffset = new THREE.Vector3(0, 1.05, -0.35);

      return {
        objects: [
          ambient,
          hemi,
          key.light,
          key.target,
          fill.light,
          fill.target,
          rim.light,
          rim.target,
        ],
        ssao: { kernelRadius: 2, minDistance: 0.001, maxDistance: 0.05 },
        exposure: 2,
      };
    }
    case "neutral": {
      const ambient = new THREE.AmbientLight(0xffffff, 0.22);
      const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.2);
      const key = createSpotLight(
        0xffffff,
        0.85,
        new THREE.Vector3(4.5, 6, 4.5),
        Math.PI / 5,
        0.35,
        true,
      );
      key.light.decay = 1.4;
      key.light.distance = 25;
      key.light.shadow.radius = 1.5;
      key.target.userData.focusOffset = new THREE.Vector3(0, 1, 0.1);
      const fill = createDirectionalLight(
        0xffffff,
        0.25,
        new THREE.Vector3(-4, 3, 3),
      );
      fill.target.userData.focusOffset = new THREE.Vector3(0, 1, -0.1);
      return {
        objects: [ambient, hemi, key.light, key.target, fill.light, fill.target],
        ssao: { kernelRadius: 7, minDistance: 0.002, maxDistance: 0.12 },
        exposure: 0.95,
      };
    }
    case "dim": {
      const ambient = new THREE.AmbientLight(0xffffff, 0.1);
      const key = createSpotLight(
        0xfff2d6,
        0.5,
        new THREE.Vector3(3.5, 5.2, 5.5),
        Math.PI / 7,
        0.5,
        true,
      );
      key.light.decay = 1.3;
      key.light.distance = 22;
      key.light.shadow.radius = 1.5;
      key.target.userData.focusOffset = new THREE.Vector3(0, 1, 0.2);
      const rim = createDirectionalLight(
        0x9fb4ff,
        0.22,
        new THREE.Vector3(-5, 3.5, -4),
      );
      return {
        objects: [ambient, key.light, key.target, rim.light, rim.target],
        ssao: { kernelRadius: 12, minDistance: 0.003, maxDistance: 0.16 },
        exposure: 0.7,
      };
    }
    default: {
      const ambient = new THREE.AmbientLight(0xffffff, 0.22);
      const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.2);
      const key = createSpotLight(
        0xffffff,
        0.85,
        new THREE.Vector3(4.5, 6, 4.5),
        Math.PI / 5,
        0.35,
        true,
      );
      key.light.decay = 1.4;
      key.light.distance = 25;
      key.light.shadow.radius = 1.5;
      key.target.userData.focusOffset = new THREE.Vector3(0, 1, 0.1);
      const fill = createDirectionalLight(
        0xffffff,
        0.25,
        new THREE.Vector3(-4, 3, 3),
      );
      fill.target.userData.focusOffset = new THREE.Vector3(0, 1, -0.1);
      return {
        objects: [ambient, hemi, key.light, key.target, fill.light, fill.target],
        ssao: { kernelRadius: 7, minDistance: 0.002, maxDistance: 0.12 },
        exposure: 0.95,
      };
    }
  }
}
