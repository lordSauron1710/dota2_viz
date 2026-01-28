"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DDSLoader } from "three/examples/jsm/loaders/DDSLoader.js";
import { TGALoader } from "three/examples/jsm/loaders/TGALoader.js";
import { fitCameraToObject } from "../lib/three/fitCamera";
import { createLightingPreset } from "../lib/three/lights";
import type { LightingPreset } from "../lib/urlState";

type AssetRoots = {
  assetRoot: string;
  materialsRoot: string;
  baseMaterialsRoot: string;
};

const TEXTURE_EXTENSIONS = [".tga", ".png", ".jpg", ".jpeg", ".bmp", ".dds"];

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
  captureScreenshot: () => void;
};

type Viewer3DProps = {
  modelUrl: string;
  activeAnimation: string | null;
  autoplay: boolean;
  speed: number;
  preset: LightingPreset;
  backgroundMode: "gradient" | "solid";
  screenshotLabel?: string;
  onClipsLoaded: (clips: string[]) => void;
  onActiveClipChange: (clip: string | null) => void;
};

function Viewer3D(
  {
    modelUrl,
    activeAnimation,
    autoplay,
    speed,
    preset,
    backgroundMode,
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

  const captureScreenshot = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !scene || !camera || !canvas) {
      return;
    }

    renderer.render(scene, camera);

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
    captureScreenshot,
  }));

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
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    scene.add(floor);

    const grid = new THREE.GridHelper(12, 24, 0xf06a1d, 0x1a1a1a);
    grid.position.y = -1.39;
    if (!Array.isArray(grid.material)) {
      grid.material.opacity = 0.35;
      grid.material.transparent = true;
    }
    scene.add(grid);

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) {
        return;
      }
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };

    const applyLights = (nextPreset: LightingPreset) => {
      lightsGroup.clear();
      createLightingPreset(nextPreset).forEach((light) => lightsGroup.add(light));
    };
    applyLights(preset);

    const clock = new THREE.Clock();
    let rafId = 0;

    const renderLoop = () => {
      rafId = requestAnimationFrame(renderLoop);
      const delta = clock.getDelta();
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }
      controls.update();
      renderer.render(scene, camera);
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
      renderer.dispose();
      lightsGroup.clear();
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
      mixerRef.current = null;
      actionsRef.current = {};
      currentActionRef.current = null;
      modelRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      lightsGroupRef.current = null;
    };
  }, [modelUrl, onClipsLoaded, retryKey]);

  useEffect(() => {
    const lightsGroup = lightsGroupRef.current;
    if (!lightsGroup) {
      return;
    }
    lightsGroup.clear();
    createLightingPreset(preset).forEach((light) => lightsGroup.add(light));
  }, [preset]);

  useEffect(() => {
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
  }, [activeAnimation, autoplay, speed, onActiveClipChange]);

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
      className={`viewer ${backgroundMode === "gradient" ? "viewer--gradient" : "viewer--solid"}`}
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
