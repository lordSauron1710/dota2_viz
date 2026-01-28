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
    case "neutral": {
      const ambient = new THREE.AmbientLight(0xffffff, 0.32);
      const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.2);
      const key = createSpotLight(
        0xffffff,
        1.05,
        new THREE.Vector3(4.5, 6, 4.5),
        Math.PI / 5,
        0.35,
        true,
      );
      const fill = createDirectionalLight(
        0xffffff,
        0.35,
        new THREE.Vector3(-4, 3, 3),
      );
      return {
        objects: [ambient, hemi, key.light, key.target, fill.light, fill.target],
        ssao: { kernelRadius: 6, minDistance: 0.002, maxDistance: 0.1 },
        exposure: 1,
      };
    }
    case "dim": {
      const ambient = new THREE.AmbientLight(0xffffff, 0.18);
      const key = createSpotLight(
        0xfff2d6,
        0.75,
        new THREE.Vector3(3.5, 5.2, 5.5),
        Math.PI / 7,
        0.5,
        true,
      );
      const rim = createDirectionalLight(
        0x9fb4ff,
        0.35,
        new THREE.Vector3(-5, 3.5, -4),
      );
      return {
        objects: [ambient, key.light, key.target, rim.light, rim.target],
        ssao: { kernelRadius: 9, minDistance: 0.002, maxDistance: 0.14 },
        exposure: 0.85,
      };
    }
    case "rim": {
      const ambient = new THREE.AmbientLight(0xffffff, 0.2);
      const key = createSpotLight(
        0xffffff,
        0.9,
        new THREE.Vector3(3.5, 5.5, 3.5),
        Math.PI / 6,
        0.3,
        true,
      );
      const rim = createDirectionalLight(
        0x87a6ff,
        1.1,
        new THREE.Vector3(-5.5, 3.5, -4),
      );
      return {
        objects: [ambient, key.light, key.target, rim.light, rim.target],
        ssao: { kernelRadius: 7, minDistance: 0.002, maxDistance: 0.12 },
        exposure: 0.95,
      };
    }
    case "studio":
    default: {
      const ambient = new THREE.AmbientLight(0xffffff, 0.4);
      const key = createSpotLight(
        0xffffff,
        1.3,
        new THREE.Vector3(5, 7, 4.5),
        Math.PI / 5,
        0.3,
        true,
      );
      const fill = createDirectionalLight(
        0xffffff,
        0.45,
        new THREE.Vector3(-4.5, 4, 3.5),
      );
      const back = createDirectionalLight(
        0xbcd1ff,
        0.6,
        new THREE.Vector3(-5, 3.5, -2.5),
      );
      return {
        objects: [
          ambient,
          key.light,
          key.target,
          fill.light,
          fill.target,
          back.light,
          back.target,
        ],
        ssao: { kernelRadius: 8, minDistance: 0.002, maxDistance: 0.12 },
        exposure: 1.05,
      };
    }
  }
}
