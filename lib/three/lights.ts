import * as THREE from "three";
import type { LightingPreset } from "../urlState";

export function createLightingPreset(preset: LightingPreset): THREE.Light[] {
  switch (preset) {
    case "neutral": {
      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      const key = new THREE.DirectionalLight(0xffffff, 0.8);
      key.position.set(4, 6, 4);
      const fill = new THREE.DirectionalLight(0xffffff, 0.4);
      fill.position.set(-3, 2, 3);
      return [ambient, key, fill];
    }
    case "rim": {
      const ambient = new THREE.AmbientLight(0xffffff, 0.4);
      const key = new THREE.DirectionalLight(0xffffff, 0.9);
      key.position.set(3, 5, 2);
      const rim = new THREE.DirectionalLight(0x87a6ff, 1.2);
      rim.position.set(-5, 2, -4);
      return [ambient, key, rim];
    }
    case "studio":
    default: {
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      const key = new THREE.DirectionalLight(0xffffff, 1.1);
      key.position.set(5, 6, 4);
      const back = new THREE.DirectionalLight(0xbcd1ff, 0.7);
      back.position.set(-4, 3, -2);
      return [ambient, key, back];
    }
  }
}
