// All lengths are measured in Schwarzschild radii: r_s = 2GM/c² = 1.
// This changes the physical scale, not the dimensionless appearance.
export const QUALITY = Object.freeze({
    Performance: { steps: 144, stepSize: 0.075, scale: 0.65 },
    Balanced:    { steps: 192, stepSize: 0.055, scale: 0.80 },
    High:        { steps: 272, stepSize: 0.040, scale: 1.00 },
    Ultra:       { steps: 400, stepSize: 0.027, scale: 1.25 }
});

export const DEFAULTS = Object.freeze({
    quality: 'High', renderScale: 1.0, exposure: 1.05,
    bloomStrength: 0.20, bloomRadius: 0.35, bloomThreshold: 0.80,
    innerRadius: 3.0, outerRadius: 10.5, temperature: 5200,
    diskBrightness: 1.9, diskOpacity: 0.92, turbulence: 0.85,
    rotationSpeed: 1.0, stars: 0.48, nebula: 0.45,
    lensing: true, redshift: true, beaming: true,
    autoOrbit: false, orbitSpeed: 0.30, paused: false,
    fieldOfView: 43, vignette: 0.23, debugView: 'Beauty'
});

export const VIEWS = Object.freeze({
    cinematic: { position: [0, 2.5, 27], fov: 43 },
    overview:  { position: [0, 20, 22], fov: 48 },
    edge:      { position: [0, 0.65, 27], fov: 43 }
});

export const DEBUG_VIEWS = Object.freeze({ Beauty: 0, 'Ray fate': 1, 'Disk crossings': 2 });
