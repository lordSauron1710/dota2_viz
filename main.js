import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "https://unpkg.com/three@0.162.0/examples/jsm/loaders/FBXLoader.js";
import { TGALoader } from "https://unpkg.com/three@0.162.0/examples/jsm/loaders/TGALoader.js";

const canvas = document.getElementById("stage");
const toggleButton = document.getElementById("toggle");
const speedInput = document.getElementById("speed");
const clipSelect = document.getElementById("clip");
const status = document.getElementById("status");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0f151d, 4, 18);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(4, 3, 6);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2;
controls.maxDistance = 18;

const ambient = new THREE.HemisphereLight(0xffffff, 0x223344, 0.7);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(6, 10, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x88c7ff, 0.45);
rimLight.position.set(-6, 5, -3);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(6, 64),
  new THREE.MeshStandardMaterial({ color: 0x1b2430, roughness: 0.75, metalness: 0.1 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.02;
floor.receiveShadow = true;
scene.add(floor);

const manager = new THREE.LoadingManager();
manager.onProgress = (url, loaded, total) => {
  status.textContent = `Loading… ${loaded}/${total}`;
};
manager.onError = () => {
  status.textContent = "Some textures failed to load. Still trying…";
};
manager.addHandler(/\.tga$/i, new TGALoader(manager));

const MATERIALS_BASE = "./assets/kez/materials/";
manager.setURLModifier((url) => {
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  const clean = url.replace(/^.*[\\/]/, "");
  if (clean.startsWith("__kez_base_")) {
    return `${MATERIALS_BASE}base/${clean}`;
  }
  return `${MATERIALS_BASE}${clean}`;
});

const fbxLoader = new FBXLoader(manager);
const clock = new THREE.Clock();
let mixer = null;
let model = null;
let activeAction = null;
let loadedClips = [];
let isPlaying = true;
let speed = 1;
let proceduralMode = true;

function configureMaterials(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material) return;
      material.side = THREE.DoubleSide;
      if (material.map) {
        material.map.colorSpace = THREE.SRGBColorSpace;
      }
      material.needsUpdate = true;
    });
  });
}

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const targetSize = 2.8;
  const scale = targetSize / maxDim;
  object.scale.setScalar(scale);

  box.setFromObject(object);
  box.getSize(size);
  box.getCenter(center);
  object.position.sub(center);

  const distance = maxDim * scale * 3.2;
  camera.position.set(distance, distance * 0.6, distance * 0.9);
  controls.target.set(0, size.y * 0.35 * scale, 0);
  controls.update();
}

function setAnimationOptions(clips) {
  clipSelect.innerHTML = "";

  const proceduralOption = document.createElement("option");
  proceduralOption.value = "procedural";
  proceduralOption.textContent = "Procedural Idle";
  clipSelect.appendChild(proceduralOption);

  clips.forEach((clip, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = clip.name || `Clip ${index + 1}`;
    clipSelect.appendChild(option);
  });

  proceduralMode = true;
  clipSelect.value = "procedural";
}

function playClip(index) {
  if (!mixer) return;
  const clip = loadedClips[index];
  if (!clip) return;

  const action = mixer.clipAction(clip);
  if (activeAction && activeAction !== action) {
    activeAction.fadeOut(0.2);
  }
  action.reset().fadeIn(0.2).play();
  activeAction = action;
}

fbxLoader.load(
  "./assets/kez/kez_econ.fbx",
  (object) => {
    model = object;
    configureMaterials(model);
    scene.add(model);
    fitCameraToObject(model);

    loadedClips = object.animations || [];
    if (loadedClips.length) {
      mixer = new THREE.AnimationMixer(model);
    }

    setAnimationOptions(loadedClips);
    status.textContent = loadedClips.length
      ? `Loaded. ${loadedClips.length} animation(s) found.`
      : "Loaded. Using procedural idle.";
  },
  undefined,
  (error) => {
    console.error(error);
    status.textContent = "Failed to load the FBX model.";
  }
);

clipSelect.addEventListener("change", (event) => {
  const value = event.target.value;
  if (value === "procedural") {
    proceduralMode = true;
    if (mixer) mixer.stopAllAction();
    activeAction = null;
    return;
  }
  proceduralMode = false;
  playClip(Number(value));
});

speedInput.addEventListener("input", (event) => {
  speed = Number(event.target.value);
});

toggleButton.addEventListener("click", () => {
  isPlaying = !isPlaying;
  toggleButton.textContent = isPlaying ? "Pause" : "Play";
});

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (isPlaying) {
    if (mixer && activeAction && !proceduralMode) {
      mixer.update(delta * speed);
    } else if (model) {
      const time = clock.elapsedTime * speed;
      model.rotation.y = time * 0.35;
      model.position.y = Math.sin(time * 1.2) * 0.04;
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
