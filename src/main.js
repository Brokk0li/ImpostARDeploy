// Import Three.js (ESM) from a CDN
import * as THREE from "three";
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// --- Basic Three.js setup ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
const reticle_path = '/ressources/reticle/reticle.gltf';
let pp = null;
// Add some gentle lighting (affects MeshStandardMaterial)
const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
//scene.add(light);
let i = 0;
//setup renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true; // Enable WebXR
document.body.appendChild(renderer.domElement);

// Handle resize
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
});

// load reticle
let reticle;
const loader = new GLTFLoader();
loader.load(
  reticle_path,
  function (gltf) {
    reticle = gltf.scene;
    reticle.position.set(0, 0, -0.5);
    reticle.visible = false;
    scene.add(reticle);
  },
  (xhr) => {
    console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
  },
  (error) => {
    console.error("An error occurred while loading the GLTF", error);
  }
);

function onXRFrame(timestamp, frame) {

  if (!(pp === null)) {
    //pp.rotation.x += 0.01;
  }

  let session = frame.session;
  let pose = frame.getViewerPose(xrRefSpace);
  reticle.visible = false;
  if (xrHitTestSource && pose) {
    let hitTestResults = frame.getHitTestResults(xrHitTestSource);
    if (hitTestResults.length > 0) {
      let pose = hitTestResults[0].getPose(xrRefSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
      reticle.matrixAutoUpdate = false;
      reticleHitTestResult = hitTestResults[0];
      reticle.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({ color: poseIsVertical(pose) ? 0xff0000 : 0x00ff00 });
        }
      });
    }
  }
  session.requestAnimationFrame(onXRFrame);
  renderer.render(scene, camera);

}

// --- UI & XR session management ---
const startBtn = document.getElementById('startAR');
const endBtn = document.getElementById('endAR');
const msg = document.getElementById('msg');

async function ensureSupport() {
  if (!('xr' in navigator)) return false;
  try {
    return await navigator.xr.isSessionSupported('immersive-ar');
  } catch (e) {
    return false;
  }
}

let xrSession = null;
let xrHitTestSource = null;
let xrRefSpace = null;
let xrViewerSpace = null;
let reticleHitTestResult = null; //retuned from hit test to use for anchor creation

async function startAR() {
  const supported = await ensureSupport();
  if (!supported) {
    msg.textContent = 'WebXR immersive AR not supported on this device/browser or not served over HTTPS.';
    startBtn.disabled = true;
    return;
  }

  try {
    xrSession = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ["local-floor", "hit-test", "anchors"],
      domOverlay: { root: document.body }
    });

    // Display tweaks
    document.getElementById('ui').style.display = 'none';
    endBtn.style.display = 'inline-block';

    // Tie the WebGL renderer to the XR session
    await renderer.xr.setSession(xrSession);

    // Cleanly tear down UI when the user exits via system controls
    xrSession.addEventListener('end', () => {
      xrSession = null;
      document.getElementById('ui').style.display = 'grid';
      endBtn.style.display = 'none';
      msg.textContent = 'AR session ended. Tap Start AR to begin again.';
    });

    xrSession.requestReferenceSpace("viewer").then((refSpace) => {
      xrViewerSpace = refSpace;
      xrSession
        .requestHitTestSource({ space: xrViewerSpace })
        .then((hitTestSource) => {
          xrHitTestSource = hitTestSource;
        });
    });

    xrSession.requestReferenceSpace("local-floor").then((refSpace) => {
      xrRefSpace = refSpace;

      xrSession.requestAnimationFrame(onXRFrame);
    });

    xrSession.addEventListener('select', async (event) => {
      console.log("AR screen tapped!");
      if (!renderer.xr.isPresenting) return;
      if (reticleHitTestResult === null) return;
      const loader = new THREE.TextureLoader();
      loader.load("/ressources/img/Logo_VISUS_DE.jpg", (texture) => {
        // Create a plane with correct aspect ratio
        const width = 1; // meters
        const height = (texture.image.height / texture.image.width) * width;

        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
        let poster = new THREE.Mesh(geometry, material);
        let pose = reticleHitTestResult.getPose(xrRefSpace);
        let matrix = new THREE.Matrix4();
        matrix.fromArray(pose.transform.matrix);
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(position, quaternion, scale);
        poster.position.copy(position);
        poster.quaternion.copy(quaternion);
        poster.visible = true;
        poster.rotation.x = 2* Math.PI;
        poster.rotation.z = (1/2) * Math.PI;
        i = i + 1;
        console.log(i),
          scene.add(poster);
        pp = poster;
      });
    });

  } catch (err) {
    console.error(err);
    msg.textContent = 'Failed to start AR: ' + (err?.message || err);
  }
}

function endAR() {
  if (xrSession) xrSession.end();
}

// Wire up buttons
startBtn.addEventListener('click', startAR);
endBtn.addEventListener('click', endAR);

function poseIsVertical(pose) {
  const matrix = new THREE.Matrix4();
  matrix.fromArray(pose.transform.matrix);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  const up = new THREE.Vector3(0, 1, 0); // y-up in Three.js
  up.applyQuaternion(quaternion);
  return Math.abs(up.y) < 0.5;
}

async function loadImage(path) {

  // Load the PNG
  const loader = new THREE.TextureLoader();
  const texture = loader.load(path, (texture) => {
    // Create a plane with correct aspect ratio
    const width = 1; // meters
    const height = (texture.image.height / texture.image.width) * width;

    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const poster = new THREE.Mesh(geometry, material);
  });

  return poster;
}