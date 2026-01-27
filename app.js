import * as THREE from "https://unpkg.com/three@0.162.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.162.0/examples/jsm/controls/OrbitControls.js";
import { FBXLoader } from "https://unpkg.com/three@0.162.0/examples/jsm/loaders/FBXLoader.js";
import { TGALoader } from "https://unpkg.com/three@0.162.0/examples/jsm/loaders/TGALoader.js";
import { SkeletonHelper } from "https://unpkg.com/three@0.162.0/examples/jsm/helpers/SkeletonHelper.js";

const canvas = document.getElementById("canvas");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const clipSelect = document.getElementById("clipSelect");
const speedInput = document.getElementById("speed");
const timeInput = document.getElementById("time");
const loopInput = document.getElementById("loop");
const clampInput = document.getElementById("clamp");
const autoRotateInput = document.getElementById("autoRotate");
const showGridInput = document.getElementById("showGrid");
const showFloorInput = document.getElementById("showFloor");
const showSkeletonInput = document.getElementById("showSkeleton");
const togglePlay = document.getElementById("togglePlay");
const resetView = document.getElementById("resetView");
const fileInput = document.getElementById("fileInput");
const assetName = document.getElementById("assetName");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0f1218, 4, 20);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 2000);
const defaultCameraPosition = new THREE.Vector3(5, 4, 7);
camera.position.copy(defaultCameraPosition);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;
controls.minDistance = 1.5;
controls.maxDistance = 25;

const hemi = new THREE.HemisphereLight(0xffffff, 0x1e2a3b, 0.7);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
keyLight.position.set(6, 12, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x7db2ff, 0.35);
fillLight.position.set(-5, 4, -6);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xf9b462, 0.35);
rimLight.position.set(0, 6, -10);
scene.add(rimLight);

const grid = new THREE.GridHelper(12, 24, 0x2f3a4d, 0x1e2635);
scene.add(grid);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(6, 64),
  new THREE.MeshStandardMaterial({ color: 0x171d26, roughness: 0.85, metalness: 0.1 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.02;
floor.receiveShadow = true;
scene.add(floor);

const manager = new THREE.LoadingManager();
manager.onStart = () => {
  statusEl.textContent = "Loading...";
};
manager.onProgress = (url, loaded, total) => {
  statusEl.textContent = `Loading... ${loaded}/${total}`;
};
manager.onLoad = () => {
  statusEl.textContent = "Loaded.";
};
manager.onError = () => {
  statusEl.textContent = "Some textures failed to load.";
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

const clock = new THREE.Clock();
let mixer = null;
let activeAction = null;
let clips = [];
let model = null;
let skeletonHelper = null;
let isPlaying = true;
let proceduralMode = false;
let currentDuration = 0;

function clearModel() {
  if (!model) return;
  scene.remove(model);
  if (skeletonHelper) {
    scene.remove(skeletonHelper);
    skeletonHelper = null;
  }
  model.traverse((child) => {
    if (child.isMesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }
  });
  model = null;
}

function updateStats() {
  if (!model) {
    statsEl.textContent = "";
    return;
  }
  const info = renderer.info;
  statsEl.textContent = [
    `Draw calls: ${info.render.calls}`,
    `Triangles: ${info.render.triangles}`,
    `Geometries: ${info.memory.geometries}`,
    `Textures: ${info.memory.textures}`,
  ].join("\n");
}

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
  box.getCenter(center);
  object.position.sub(center);

  const distance = maxDim * scale * 3.3;
  camera.position.set(distance, distance * 0.65, distance * 0.9);
  controls.target.set(0, size.y * 0.35 * scale, 0);
  controls.update();
}

function setAnimationOptions() {
  clipSelect.innerHTML = "";

  if (!clips.length) {
    const option = document.createElement("option");
    option.value = "procedural";
    option.textContent = "Procedural Idle";
    clipSelect.appendChild(option);
    proceduralMode = true;
    currentDuration = 0;
    return;
  }

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

  clipSelect.value = "0";
  proceduralMode = false;
  playClip(0);
}

function playClip(index) {
  if (!mixer || !clips[index]) return;
  const clip = clips[index];
  const action = mixer.clipAction(clip);

  if (activeAction && activeAction !== action) {
    activeAction.fadeOut(0.2);
  }

  action.reset();
  action.setLoop(loopInput.checked ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
  action.clampWhenFinished = clampInput.checked;
  action.enabled = true;
  action.fadeIn(0.2).play();

  activeAction = action;
  currentDuration = clip.duration || 0;
  timeInput.max = currentDuration ? currentDuration.toFixed(3) : 1;
  timeInput.value = "0";
}

function updateAnimationTime() {
  if (!activeAction || !currentDuration) return;
  if (!isPlaying) return;
  const time = activeAction.time % currentDuration;
  timeInput.value = time.toFixed(3);
}

function applyTimeScrub(value) {
  if (!activeAction || !currentDuration) return;
  activeAction.time = Number(value);
  mixer.update(0);
}

function setSkeletonVisible(visible) {
  if (!model) return;
  if (visible) {
    if (!skeletonHelper) {
      skeletonHelper = new SkeletonHelper(model);
      skeletonHelper.visible = true;
      scene.add(skeletonHelper);
    }
  } else if (skeletonHelper) {
    scene.remove(skeletonHelper);
    skeletonHelper = null;
  }
}

function loadFbx(url, nameLabel) {
  const loader = new FBXLoader(manager);
  statusEl.textContent = "Loading model...";

  loader.load(
    url,
    (object) => {
      clearModel();
      model = object;
      scene.add(model);
      configureMaterials(model);
      fitCameraToObject(model);

      clips = object.animations || [];
      mixer = clips.length ? new THREE.AnimationMixer(model) : null;
      if (mixer) {
        mixer.timeScale = Number(speedInput.value);
      }
      activeAction = null;
      setAnimationOptions();
      setSkeletonVisible(showSkeletonInput.checked);
      assetName.textContent = nameLabel;

      statusEl.textContent = clips.length
        ? `Loaded. ${clips.length} animation(s).`
        : "Loaded. Procedural idle active.";
    },
    undefined,
    (error) => {
      console.error(error);
      statusEl.textContent = "Failed to load FBX model.";
    }
  );
}

clipSelect.addEventListener("change", (event) => {
  const value = event.target.value;
  if (value === "procedural") {
    proceduralMode = true;
    if (mixer) mixer.stopAllAction();
    activeAction = null;
    currentDuration = 0;
    return;
  }
  proceduralMode = false;
  playClip(Number(value));
});

speedInput.addEventListener("input", () => {
  const value = Number(speedInput.value);
  if (mixer) mixer.timeScale = value;
});

loopInput.addEventListener("change", () => {
  if (activeAction) playClip(clipSelect.value === "procedural" ? 0 : Number(clipSelect.value));
});

clampInput.addEventListener("change", () => {
  if (activeAction) activeAction.clampWhenFinished = clampInput.checked;
});

timeInput.addEventListener("input", (event) => {
  if (!activeAction) return;
  applyTimeScrub(event.target.value);
});

showGridInput.addEventListener("change", () => {
  grid.visible = showGridInput.checked;
});

showFloorInput.addEventListener("change", () => {
  floor.visible = showFloorInput.checked;
});

autoRotateInput.addEventListener("change", () => {
  controls.autoRotate = autoRotateInput.checked;
});

showSkeletonInput.addEventListener("change", () => {
  setSkeletonVisible(showSkeletonInput.checked);
});

togglePlay.addEventListener("click", () => {
  isPlaying = !isPlaying;
  togglePlay.textContent = isPlaying ? "Pause" : "Play";
});

resetView.addEventListener("click", () => {
  camera.position.copy(defaultCameraPosition);
  controls.target.set(0, 1, 0);
  controls.update();
});

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  loadFbx(url, file.name);
});

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (isPlaying) {
    if (mixer && activeAction && !proceduralMode) {
      mixer.update(delta);
      updateAnimationTime();
    } else if (model) {
      const t = clock.elapsedTime * 0.6;
      model.rotation.y = t * 0.35;
      model.position.y = Math.sin(t * 1.5) * 0.04;
    }
  }

  controls.update();
  renderer.render(scene, camera);
  updateStats();
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initial load
loadFbx("./assets/kez/kez_econ.fbx", "assets/kez/kez_econ.fbx");
animate();
