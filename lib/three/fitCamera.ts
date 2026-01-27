import * as THREE from "three";

export type FitCameraOptions = {
  camera: THREE.PerspectiveCamera;
  controls?: { target: THREE.Vector3; update: () => void } | null;
  object: THREE.Object3D;
  offset?: number;
};

export function fitCameraToObject({
  camera,
  controls,
  object,
  offset = 1.25,
}: FitCameraOptions) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  let distance = maxDim / (2 * Math.tan(fov / 2));
  distance *= offset;

  camera.position.set(center.x, center.y + maxDim * 0.2, center.z + distance);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}
