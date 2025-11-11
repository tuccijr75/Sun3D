const { tryJson, tryText, fetchWithTimeout } = require('../utils/net');

const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
      '<defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffd27d"/><stop offset="60%" stop-color="#f3913d"/><stop offset="100%" stop-color="#40230f"/></radialGradient></defs>' +
      '<rect width="200" height="200" fill="#02030a"/>' +
      '<circle cx="100" cy="100" r="90" fill="url(#g)"/>' +
      '<circle cx="140" cy="80" r="18" fill="rgba(255,255,255,0.28)"/>' +
      '<circle cx="70" cy="130" r="12" fill="rgba(255,255,255,0.18)"/>' +
      '</svg>'
  );

const IMAGE_SOURCES = {
  nearNow: [
    'https://services.swpc.noaa.gov/images/animations/suvi/primary/195/latest.png',
    'https://services.swpc.noaa.gov/images/animations/suvi/primary/193/latest.png',
    'https://services.swpc.noaa.gov/images/animations/suvi/primary/171/latest.png',
    'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg',
    'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0171.jpg'
  ],
  nearPrev: [
    'https://services.swpc.noaa.gov/images/animations/suvi/primary/195/024hour/latest.png',
    'https://services.swpc.noaa.gov/images/animations/suvi/primary/195/latest.png?cacheBust=' + (Date.now() - 60 * 60 * 1000),
    'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0171.jpg'
  ],
  far: [
    'https://services.swpc.noaa.gov/images/synoptic_maps/sdo/hmi_mag/1024/latest.jpg',
    'https://services.swpc.noaa.gov/images/synoptic_maps/sdo/hmi_mag/512/latest.jpg'
  ]
};

const KP_SOURCE = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';
const XRAY_SOURCE = 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-latest.json';
const SOLAR_WIND_SOURCE = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json';
const MAG_SOURCE = 'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json';
const ALERTS_SOURCE = 'https://services.swpc.noaa.gov/json/alerts.json';
const CME_SOURCE = 'https://services.swpc.noaa.gov/json/cme_analysis.json';
const REGIONS_SOURCE = 'https://services.swpc.noaa.gov/json/solar_regions.json';
const REGION_TEXT_SOURCE = 'https://services.swpc.noaa.gov/text/solar_regions.txt';

const PLANET_ELEMENTS = [
  {
    name: 'Mercury',
    a: [0.38709927, 0.00000037],
    e: [0.20563593, 0.00001906],
    i: [7.00497902, -0.00594749],
    L: [252.2503235, 149472.67411175],
    longPeri: [77.45779628, 0.16047689],
    longNode: [48.33076593, -0.12534081]
  },
  {
    name: 'Venus',
    a: [0.72333566, -0.00000390],
    e: [0.00677672, -0.00004107],
    i: [3.39467605, -0.0007889],
    L: [181.9790995, 58517.81538729],
    longPeri: [131.60246718, 0.00268329],
    longNode: [76.67984255, -0.27769418]
  },
  {
    name: 'Earth',
    a: [1.00000261, 0.00000562],
    e: [0.01671123, -0.00004392],
    i: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981],
    longPeri: [102.93768193, 0.32327364],
    longNode: [0, 0]
  },
  {
    name: 'Mars',
    a: [1.52371034, 0.00001847],
    e: [0.0933941, 0.00007882],
    i: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499],
    longPeri: [-23.94362959, 0.44441088],
    longNode: [49.55953891, -0.29257343]
  },
  {
    name: 'Jupiter',
    a: [5.202887, -0.00011607],
    e: [0.04838624, -0.00013253],
    i: [1.30439695, -0.00183714],
    L: [34.39644051, 3034.74612775],
    longPeri: [14.72847983, 0.21252668],
    longNode: [100.47390909, 0.20469106]
  },
  {
    name: 'Saturn',
    a: [9.53667594, -0.0012506],
    e: [0.05386179, -0.00050991],
    i: [2.48599187, 0.00193609],
    L: [49.95424423, 1222.49362201],
    longPeri: [92.59887831, -0.41897216],
    longNode: [113.66242448, -0.28867794]
  },
  {
    name: 'Uranus',
    a: [19.18916464, -0.00196176],
    e: [0.04725744, -0.00004397],
    i: [0.77263783, -0.00242939],
    L: [313.23810451, 428.48202785],
    longPeri: [170.9542763, 0.40805281],
    longNode: [74.01692503, 0.04240589]
  },
  {
    name: 'Neptune',
    a: [30.06992276, 0.00026291],
    e: [0.00859048, 0.00005105],
    i: [1.77004347, 0.00035372],
    L: [-55.12002969, 218.45945325],
    longPeri: [44.96476227, -0.32241464],
    longNode: [131.78422574, -0.00508664]
  }
];

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function normalizeAngleRad(angle) {
  const twoPi = Math.PI * 2;
  return ((angle % twoPi) + twoPi) % twoPi;
}

function normalizeAngleDeg(angle) {
  return ((angle % 360) + 360) % 360;
}

function solveKepler(M, e) {
  const tolerance = 1e-6;
  let E = M;
  for (let i = 0; i < 15; i += 1) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < tolerance) {
      break;
    }
  }
  return E;
}

function computePlanetPositions(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  return PLANET_ELEMENTS.map((planet) => {
    const a = planet.a[0] + planet.a[1] * T;
    const e = planet.e[0] + planet.e[1] * T;
    const i = degToRad(planet.i[0] + planet.i[1] * T);
    const L = normalizeAngleDeg(planet.L[0] + planet.L[1] * T);
    const longPeri = normalizeAngleDeg(planet.longPeri[0] + planet.longPeri[1] * T);
    const longNode = normalizeAngleDeg(planet.longNode[0] + planet.longNode[1] * T);

    const M = normalizeAngleRad(degToRad(L - longPeri));
    const E = solveKepler(M, e);
    const trueAnomaly = 2 * Math.atan2(
      Math.sqrt(1 + e) * Math.sin(E / 2),
      Math.sqrt(1 - e) * Math.cos(E / 2)
    );
    const distance = a * (1 - e * Math.cos(E));
    const u = trueAnomaly + degToRad(longPeri - longNode);

    const xPrime = distance * Math.cos(u);
    const yPrime = distance * Math.sin(u);
    const cosNode = Math.cos(degToRad(longNode));
    const sinNode = Math.sin(degToRad(longNode));
    const cosI = Math.cos(i);
    const sinI = Math.sin(i);

    const x = xPrime * cosNode - yPrime * cosI * sinNode;
    const y = xPrime * sinNode + yPrime * cosI * cosNode;

    const angle = normalizeAngleRad(Math.atan2(y, x));
    return {
      name: planet.name,
      a,
      angleRad: angle
    };
  });
}

async function selectFirstReachable(urls, { logger }) {
  for (const url of urls) {
    try {
      let res = await fetchWithTimeout(url, { method: 'HEAD', timeoutMs: 5000, logger });
      if (!res || !res.ok) {
        res = await fetchWithTimeout(url, { method: 'GET', timeoutMs: 8000, logger });
        if (res && res.body?.cancel) {
          res.body.cancel();
        }
      }
      if (res && res.ok) {
        return url;
      }
    } catch (error) {
      logger?.warn?.(`Image candidate failed ${url}: ${error.message}`);
      continue;
    }
  }
  return PLACEHOLDER_IMAGE;
}

function computePulse(metrics) {
  const classValue = metrics?.xrayClass || 'B1.0';
  const match = /([A-Z])([0-9]+\.?[0-9]*)/i.exec(classValue);
  if (!match) {
    return 0.15;
  }
  const scale = {
    A: 1e-8,
    B: 1e-7,
    C: 1e-6,
    M: 1e-5,
    X: 1e-4
  };
  const letter = match[1].toUpperCase();
  const numeric = parseFloat(match[2]);
  const flux = (scale[letter] || 1e-8) * numeric;
  const normalized = Math.min(1, Math.max(0, (Math.log10(flux) + 8) / 4));
  const kp = metrics?.kp ?? 2;
  const kpContribution = Math.min(1, kp / 9);
  return Number(((normalized * 0.7) + (kpContribution * 0.3)).toFixed(3));
}

async function fetchMetrics(logger) {
  const [xray, kpRows, plasmaRows, magRows] = await Promise.all([
    tryJson(XRAY_SOURCE, { logger }),
    tryJson(KP_SOURCE, { logger }),
    tryJson(SOLAR_WIND_SOURCE, { logger }),
    tryJson(MAG_SOURCE, { logger })
  ]);

  const metrics = {
    xrayClass: 'B1.0',
    kp: 2,
    vsw: 380,
    bz: -1,
    stamp: new Date().toISOString()
  };

  if (Array.isArray(xray) && xray.length > 0) {
    const latest = xray[xray.length - 1];
    metrics.xrayClass = latest?.xray_class || latest?.max_class || metrics.xrayClass;
    metrics.stamp = latest?.time_tag || metrics.stamp;
  }

  if (Array.isArray(kpRows) && kpRows.length > 1) {
    const last = kpRows[kpRows.length - 1];
    const kpValue = parseFloat(last[1]);
    if (!Number.isNaN(kpValue)) {
      metrics.kp = kpValue;
    }
    metrics.stamp = last[0] || metrics.stamp;
  }

  if (Array.isArray(plasmaRows) && plasmaRows.length > 1) {
    const last = plasmaRows[plasmaRows.length - 1];
    const speed = parseFloat(last[2]);
    if (!Number.isNaN(speed)) {
      metrics.vsw = speed;
    }
  }

  if (Array.isArray(magRows) && magRows.length > 1) {
    const last = magRows[magRows.length - 1];
    const bz = parseFloat(last[3] ?? last[2]);
    if (!Number.isNaN(bz)) {
      metrics.bz = bz;
    }
  }

  metrics.pulse = computePulse(metrics);
  return metrics;
}

async function fetchImages(logger) {
  const nearNow = await selectFirstReachable(IMAGE_SOURCES.nearNow, { logger });
  const nearPrev = await selectFirstReachable(IMAGE_SOURCES.nearPrev, { logger });
  const far = await selectFirstReachable(IMAGE_SOURCES.far, { logger });

  return {
    nearNow: { url: nearNow || PLACEHOLDER_IMAGE },
    nearPrev: { url: nearPrev || nearNow || PLACEHOLDER_IMAGE },
    far: { url: far || PLACEHOLDER_IMAGE }
  };
}

async function fetchAlerts(logger) {
  const alerts = await tryJson(ALERTS_SOURCE, { logger });
  if (!Array.isArray(alerts)) {
    return [];
  }
  return alerts.slice(-10).map((entry) => ({
    text: entry?.message || entry?.product_id || 'Solar alert',
    level: entry?.severity || entry?.event_type || 'info',
    source: entry?.source || 'NOAA SWPC'
  }));
}

async function fetchCme(logger) {
  const cme = await tryJson(CME_SOURCE, { logger });
  if (!Array.isArray(cme)) {
    return [];
  }
  return cme.slice(-5).map((entry) => ({
    severity: (entry?.half_angle || entry?.halfAngle || 0) > 30 ? 'moderate' : 'minor',
    etaHours: entry?.eta
      ? Number(((new Date(entry.eta).getTime() - Date.now()) / 3600000).toFixed(1))
      : null,
    earthDirected: Boolean(entry?.isEarthDirected || entry?.earth_impact || entry?.earthDirected),
    target: entry?.target_location || 'Earth',
    impactSummary: entry?.speed
      ? `Speed ${Math.round(entry.speed)} km/s`
      : entry?.avgSpeed
      ? `Speed ${Math.round(entry.avgSpeed)} km/s`
      : 'Speed unavailable'
  }));
}

async function fetchMarkers(logger) {
  const json = await tryJson(REGIONS_SOURCE, { logger });
  if (Array.isArray(json) && json.length > 0) {
    return json
      .filter((region) => typeof region.latitude === 'number' && typeof region.longitude === 'number')
      .map((region) => ({
        lat: region.latitude,
        lon: region.longitude,
        strength: Number(region.area) || Number(region.zurich_class) || 1
      }));
  }

  const text = await tryText(REGION_TEXT_SOURCE, { logger });
  if (!text) {
    return fallbackMarkers();
  }
  const matches = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/(\d{4})\s+([NS]\d{2})\s+([EW]\d{3})/);
    if (match) {
      const latStr = match[2];
      const lonStr = match[3];
      const lat = parseInt(latStr.slice(1), 10) * (latStr[0] === 'S' ? -1 : 1);
      const lon = parseInt(lonStr.slice(1), 10) * (lonStr[0] === 'E' ? 1 : -1);
      matches.push({ lat, lon, strength: 1 });
    }
  }
  return matches.length ? matches : fallbackMarkers();
}

function fallbackMarkers() {
  return [
    { lat: 12, lon: -45, strength: 1.2 },
    { lat: -18, lon: 72, strength: 0.8 }
  ];
}

function fallbackSnapshot() {
  const metrics = {
    xrayClass: 'B1.1',
    kp: 2,
    vsw: 380,
    bz: -1.5,
    stamp: new Date().toISOString()
  };
  return {
    generatedAt: Date.now(),
    images: {
      nearNow: { url: PLACEHOLDER_IMAGE },
      nearPrev: { url: PLACEHOLDER_IMAGE },
      far: { url: PLACEHOLDER_IMAGE }
    },
    metrics: { ...metrics, pulse: computePulse(metrics) },
    pulse: computePulse(metrics),
    markers: fallbackMarkers()
  };
}

function createSolarSources({ logger }) {
  return {
    fetchSnapshot: async () => {
      try {
        const [images, metrics, markers] = await Promise.all([
          fetchImages(logger),
          fetchMetrics(logger),
          fetchMarkers(logger)
        ]);

        const snapshot = {
          generatedAt: Date.now(),
          images,
          metrics,
          pulse: metrics.pulse,
          markers
        };
        return snapshot;
      } catch (error) {
        logger?.error?.('Snapshot fetch failed, using fallback', error);
        return fallbackSnapshot();
      }
    },
    fetchAlerts: async () => {
      try {
        return await fetchAlerts(logger);
      } catch (error) {
        logger?.error?.('Alerts fetch failed', error);
        return [];
      }
    },
    fetchCme: async () => {
      try {
        return await fetchCme(logger);
      } catch (error) {
        logger?.error?.('CME fetch failed', error);
        return [];
      }
    },
    fetchPlanets: async () => {
      try {
        return computePlanetPositions(new Date());
      } catch (error) {
        logger?.error?.('Planet positions failed', error);
        return computePlanetPositions(new Date(Date.now() - 86400000));
      }
    },
    fetchMarkers: async () => {
      try {
        return await fetchMarkers(logger);
      } catch (error) {
        logger?.error?.('Markers fetch failed', error);
        return fallbackMarkers();
      }
    }
  };
}

module.exports = { createSolarSources };
