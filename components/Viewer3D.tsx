"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { fitCameraToObject } from "../lib/three/fitCamera";
import { createLightingPreset } from "../lib/three/lights";
import type { LightingPreset } from "../lib/urlState";

const MODEL_BASE_PATH = "/assets/kez/";
const MODEL_FILE = "kez_econ.fbx";

export type Viewer3DHandle = {
  resetCamera: () => void;
};

type Viewer3DProps = {
  activeAnimation: string | null;
  autoplay: boolean;
  speed: number;
  preset: LightingPreset;
  backgroundMode: "gradient" | "solid";
  onClipsLoaded: (clips: string[]) => void;
  onActiveClipChange: (clip: string | null) => void;
};

function Viewer3D(
  {
    activeAnimation,
    autoplay,
    speed,
    preset,
    backgroundMode,
    onClipsLoaded,
    onActiveClipChange,
  }: Viewer3DProps,
  ref: React.Ref<Viewer3DHandle>,
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

  useImperativeHandle(ref, () => ({
    resetCamera: () => resetRef.current(),
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
      color: 0x0f162b,
      roughness: 0.7,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.4;
    scene.add(floor);

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
      const loader = new FBXLoader(manager);
      loader.setPath(MODEL_BASE_PATH);

      loader.load(
        MODEL_FILE,
        (model) => {
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
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
  }, [onClipsLoaded, retryKey]);

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
            <p>Loading hero model...</p>
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
