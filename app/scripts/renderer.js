import * as THREE from '../vendor/three.module.js';

const canvas = document.getElementById('sun-canvas');
const hudElement = document.getElementById('hud');
const planetCanvas = document.getElementById('planet-canvas');
const configPanel = document.getElementById('config-panel');
const configForm = document.getElementById('config-form');

const hudRows = {
  xray: hudElement.querySelector('[data-field="xray"]'),
  kp: hudElement.querySelector('[data-field="kp"]'),
  vsw: hudElement.querySelector('[data-field="vsw"]'),
  bz: hudElement.querySelector('[data-field="bz"]'),
  stamp: hudElement.querySelector('[data-field="stamp"]'),
  alerts: hudElement.querySelector('[data-field="alerts"]'),
  cme: hudElement.querySelector('[data-field="cme"]'),
  planets: hudElement.querySelector('[data-field="planets"]')
};

const state = {
  viewMode: 'norm',
  sourceMode: 'auto',
  band: 'auto',
  side: 'near',
  pulse: 0,
  textures: {
    nearNow: null,
    nearPrev: null,
    far: null
  },
  markers: [],
  alerts: [],
  cme: [],
  planets: [],
  baseUrl: null,
  config: null,
  ready: false
};

let renderer;
let scene;
let camera;
let sunMesh;
let markerGroup;
let frameHandle;
let lastUpdateTs = 0;

const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = 'anonymous';

const planetCtx = planetCanvas.getContext('2d');

const placeholderTexture = (() => {
  const data = new Uint8Array([255, 170, 60, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
})();

const shaderUniforms = {
  texturePrimary: { value: placeholderTexture },
  textureSecondary: { value: placeholderTexture },
  diffBlend: { value: 0 },
  hotBlend: { value: 0 },
  pulse: { value: 0 }
};

function createSunMaterial() {
  const vertexShader = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    varying vec2 vUv;
    uniform sampler2D texturePrimary;
    uniform sampler2D textureSecondary;
    uniform float diffBlend;
    uniform float hotBlend;
    uniform float pulse;

    vec3 applyHot(vec3 color) {
      vec3 hot = vec3(color.r * 1.4 + 0.1, color.g * 0.8 + 0.2, color.b * 0.5 + 0.15);
      return mix(color, hot, clamp(hotBlend, 0.0, 1.0));
    }

    void main() {
      vec4 primary = texture(texturePrimary, vUv);
      vec4 secondary = texture(textureSecondary, vUv);
      vec3 baseColor = primary.rgb;
      vec3 diff = abs(primary.rgb - secondary.rgb);
      float flare = clamp(diffBlend, 0.0, 1.0) * (diff.r + diff.g + diff.b) / 3.0;
      vec3 dynamicColor = mix(baseColor, baseColor + vec3(flare * (0.6 + pulse * 0.8), flare * 0.4, flare * 0.2), diffBlend);
      dynamicColor = applyHot(dynamicColor);
      float pulseGlow = 0.25 + pulse * 1.2;
      dynamicColor += vec3(pulseGlow * 0.05);
      gl_FragColor = vec4(dynamicColor, primary.a);
    }
  `;

  return new THREE.ShaderMaterial({
    uniforms: shaderUniforms,
    vertexShader,
    fragmentShader
  });
}

function initThree() {
  const width = canvas.clientWidth || canvas.parentElement.clientWidth;
  const height = canvas.clientHeight || canvas.parentElement.clientHeight;

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(width, height, false);

  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 10);
  camera.position.z = 2.4;

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  const point = new THREE.PointLight(0xfff2ce, 1.2);
  point.position.set(2, 2, 3);
  scene.add(ambient);
  scene.add(point);

  const geometry = new THREE.SphereGeometry(1, 96, 96);
  const material = createSunMaterial();
  sunMesh = new THREE.Mesh(geometry, material);
  scene.add(sunMesh);

  markerGroup = new THREE.Group();
  scene.add(markerGroup);

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  if (!renderer || !camera) {
    return;
  }
  const width = canvas.parentElement.clientWidth;
  const height = canvas.parentElement.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function updateUniforms() {
  shaderUniforms.diffBlend.value = state.viewMode === 'diff' ? 1 : 0;
  shaderUniforms.hotBlend.value = state.viewMode === 'hot' ? 1 : 0;
  shaderUniforms.pulse.value = state.pulse || 0;
}

function animate() {
  frameHandle = requestAnimationFrame(animate);
  if (sunMesh) {
    const rotationSpeed = 0.0009 + state.pulse * 0.0015;
    sunMesh.rotation.y += rotationSpeed;
  }
  renderer?.render(scene, camera);
}

function loadTexture(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    textureLoader.load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve(texture);
      },
      undefined,
      () => {
        resolve(null);
      }
    );
  });
}

async function applyTextures(images) {
  const [primary, secondary] = await Promise.all([
    loadTexture(images?.nearNow?.url),
    loadTexture(images?.nearPrev?.url || images?.nearNow?.url)
  ]);

  if (state.textures.nearNow && state.textures.nearNow !== primary) {
    state.textures.nearNow.dispose?.();
  }
  if (state.textures.nearPrev && state.textures.nearPrev !== secondary) {
    state.textures.nearPrev.dispose?.();
  }

  if (primary) {
    shaderUniforms.texturePrimary.value = primary;
  }
  if (!primary) {
    shaderUniforms.texturePrimary.value = placeholderTexture;
  }
  if (secondary) {
    shaderUniforms.textureSecondary.value = secondary;
  } else {
    shaderUniforms.textureSecondary.value = primary || placeholderTexture;
  }

  state.textures.nearNow = primary;
  state.textures.nearPrev = secondary || primary;
  updateUniforms();
}

function latLonToVector3(lat, lon, radius = 1.01) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  const x = radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

function updateMarkers(markers) {
  if (!markerGroup) {
    return;
  }
  markerGroup.clear();
  markers.forEach((marker) => {
    const strength = Number(marker.strength) || 1;
    const spriteMaterial = new THREE.SpriteMaterial({
      color: strength > 2 ? 0xff6633 : 0xffdd66,
      transparent: true,
      opacity: 0.85
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    const position = latLonToVector3(marker.lat, marker.lon, 1.01 + Math.min(strength * 0.01, 0.05));
    sprite.position.copy(position);
    const size = 0.04 + Math.min(strength * 0.01, 0.08);
    sprite.scale.set(size, size, size);
    markerGroup.add(sprite);
  });
}

function updateHudMetrics(snapshot) {
  const metrics = snapshot?.metrics || {};
  hudRows.xray.textContent = `X-ray: ${metrics.xrayClass || '--'}`;
  hudRows.kp.textContent = `Kp: ${typeof metrics.kp === 'number' ? metrics.kp.toFixed(1) : '--'}`;
  hudRows.vsw.textContent = `Vsw: ${typeof metrics.vsw === 'number' ? Math.round(metrics.vsw) : '--'} km/s`;
  hudRows.bz.textContent = `Bz: ${typeof metrics.bz === 'number' ? metrics.bz.toFixed(1) : '--'} nT`;
  hudRows.stamp.textContent = `Updated: ${formatTimestamp(metrics.stamp || snapshot?.generatedAt)}`;
}

function updateHudAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    hudRows.alerts.textContent = 'Alerts: none';
    return;
  }
  const top = alerts[alerts.length - 1];
  hudRows.alerts.textContent = `Alerts: ${top.level} – ${truncate(top.text, 28)}`;
}

function updateHudCme(cme) {
  if (!cme || cme.length === 0) {
    hudRows.cme.textContent = 'CME: none';
    return;
  }
  const top = cme[cme.length - 1];
  const eta = typeof top.etaHours === 'number' ? `${Math.max(0, top.etaHours)}h` : 'tbd';
  hudRows.cme.textContent = `CME: ${top.severity} ${eta}`;
}

function updateHudPlanets(planets) {
  if (!planetCtx) {
    return;
  }
  const width = planetCanvas.width;
  const height = planetCanvas.height;
  planetCtx.clearRect(0, 0, width, height);
  planetCtx.strokeStyle = 'rgba(255,255,255,0.25)';
  planetCtx.lineWidth = 1;
  const centerX = width / 2;
  const centerY = height / 2;
  planetCtx.beginPath();
  planetCtx.arc(centerX, centerY, 6, 0, Math.PI * 2);
  planetCtx.fillStyle = '#f5b553';
  planetCtx.fill();

  planets.forEach((planet, index) => {
    const normalized = Math.min(1, planet.a / 30);
    const radius = 8 + normalized * (Math.min(width, height) / 2 - 12);
    planetCtx.beginPath();
    planetCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    planetCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    planetCtx.stroke();

    const angle = planet.angleRad;
    const px = centerX + Math.cos(angle) * radius;
    const py = centerY + Math.sin(angle) * radius;
    planetCtx.beginPath();
    planetCtx.fillStyle = index < 4 ? '#7fd4ff' : '#b9a3ff';
    planetCtx.arc(px, py, 2.5, 0, Math.PI * 2);
    planetCtx.fill();

    planetCtx.fillStyle = 'rgba(255,255,255,0.72)';
    planetCtx.font = '9px "Segoe UI", sans-serif';
    planetCtx.fillText(planet.name[0], px + 3, py - 3);
  });

  hudRows.planets.textContent = `Planets: ${planets
    .map((p) => `${p.name[0]}${Math.round(((p.angleRad * 180) / Math.PI + 360) % 360)}°`)
    .join(' ')}`;
}

function truncate(text, max) {
  if (!text) {
    return '';
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatTimestamp(value) {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return `${date.getUTCHours().toString().padStart(2, '0')}:${date
    .getUTCMinutes()
    .toString()
    .padStart(2, '0')}Z`;
}

async function getBaseUrl() {
  if (state.baseUrl) {
    return state.baseUrl;
  }
  if (!window.sunAPI?.getBaseUrl) {
    return null;
  }
  const url = await window.sunAPI.getBaseUrl();
  state.baseUrl = url;
  return url;
}

async function requestJson(path, fallbackInvoker) {
  const base = await getBaseUrl();
  if (base) {
    try {
      const response = await fetch(`${base}${path}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn('Request fallback triggered', path, error);
    }
  }
  if (typeof fallbackInvoker === 'function') {
    try {
      return await fallbackInvoker();
    } catch (error) {
      console.warn('Fallback invocation failed', path, error);
    }
  }
  return null;
}

async function refreshSnapshot() {
  const snapshot = await requestJson('/snapshot', () => window.sunAPI?.getSnapshot?.());
  if (!snapshot) {
    return;
  }
  state.pulse = snapshot.pulse || snapshot.metrics?.pulse || 0;
  updateUniforms();
  await applyTextures(snapshot.images);
  updateMarkers(snapshot.markers || []);
  updateHudMetrics(snapshot);
  lastUpdateTs = Date.now();
}

async function refreshAlerts() {
  const alerts = await requestJson('/alerts', () => window.sunAPI?.getAlerts?.());
  state.alerts = Array.isArray(alerts) ? alerts : [];
  updateHudAlerts(state.alerts);
}

async function refreshCme() {
  const cme = await requestJson('/cme', () => window.sunAPI?.getCMEWarnings?.());
  state.cme = Array.isArray(cme) ? cme : [];
  updateHudCme(state.cme);
}

async function refreshPlanets() {
  const planets = await requestJson('/planets', () => window.sunAPI?.getPlanets?.());
  state.planets = Array.isArray(planets) ? planets : [];
  updateHudPlanets(state.planets);
}

async function refreshMarkers() {
  const markers = await requestJson('/markers', () => window.sunAPI?.getMarkers?.());
  if (Array.isArray(markers)) {
    state.markers = markers;
    updateMarkers(markers);
  }
}

function bindHudControls() {
  hudElement.addEventListener('click', async (event) => {
    const target = event.target.closest('button');
    if (!target) {
      return;
    }
    const { action, value } = target.dataset;
    if (!action || !value) {
      return;
    }
    event.preventDefault();
    if (action === 'view') {
      state.viewMode = value;
      updateUniforms();
      await window.sunAPI?.setViewMode?.(value);
    }
    if (action === 'source') {
      state.sourceMode = value;
      await window.sunAPI?.setSource?.(value);
    }
    if (action === 'band') {
      state.band = value;
      await window.sunAPI?.setBand?.(value);
    }
    if (action === 'side') {
      state.side = value;
      await window.sunAPI?.setSide?.(value);
    }
    updateActiveButtons();
  });
}

function updateActiveButtons() {
  hudElement.querySelectorAll('button[data-action]').forEach((button) => {
    const action = button.dataset.action;
    const value = button.dataset.value;
    const isActive =
      (action === 'view' && value === state.viewMode) ||
      (action === 'source' && value === state.sourceMode) ||
      (action === 'band' && value === state.band) ||
      (action === 'side' && value === state.side);
    button.classList.toggle('active', isActive);
  });
}

function bindConfigPanel() {
  hudElement.querySelector('[data-action="toggle-config"]').addEventListener('click', () => {
    configPanel.classList.toggle('hidden');
  });

  configForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(configForm);
    const payload = {
      window: {
        width: Number(formData.get('width')) || undefined,
        height: Number(formData.get('height')) || undefined,
        alwaysOnTop: formData.get('alwaysOnTop') === 'on'
      },
      rendering: {
        frameRate: Number(formData.get('fps')) || undefined,
        fov: Number(formData.get('fov')) || undefined
      },
      hologram: {
        preset: formData.get('preset') || 'off',
        streaming: formData.get('stream') === 'on',
        webrtc: formData.get('webrtc') === 'on'
      }
    };
    await window.sunAPI?.applyConfig?.(payload);
    configPanel.classList.add('hidden');
  });
}

async function hydrateConfigPanel() {
  if (!window.sunAPI?.getConfig) {
    return;
  }
  const config = await window.sunAPI.getConfig();
  if (!config) {
    return;
  }
  state.config = config;
  configForm.elements.width.value = config.window?.width || 280;
  configForm.elements.height.value = config.window?.height || 280;
  configForm.elements.fps.value = config.window?.frameRate || 30;
  configForm.elements.fov.value = config.window?.fov || 45;
  configForm.elements.alwaysOnTop.checked = Boolean(config.window?.alwaysOnTop);
  configForm.elements.preset.value = config.hologram?.preset || 'off';
  configForm.elements.stream.checked = Boolean(config.hologram?.streaming);
  configForm.elements.webrtc.checked = Boolean(config.hologram?.webrtc);
}

function startAutoRefresh() {
  setInterval(refreshSnapshot, 120000);
  setInterval(refreshAlerts, 180000);
  setInterval(refreshCme, 180000);
  setInterval(refreshPlanets, 3600000);
  setInterval(refreshMarkers, 600000);
}

async function bootstrap() {
  initThree();
  bindHudControls();
  bindConfigPanel();
  await hydrateConfigPanel();
  updateActiveButtons();
  await refreshSnapshot();
  await refreshAlerts();
  await refreshCme();
  await refreshPlanets();
  await refreshMarkers();
  startAutoRefresh();
  animate();
  state.ready = true;
}

bootstrap().catch((error) => {
  console.error('Renderer bootstrap failed', error);
});
