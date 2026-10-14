// Independent implementation of the Schwarzschild null-geodesic orbit equation.
// See docs in README.md; this is not an inverse-square Newtonian ray deflection.
export const blackHoleFragmentShader = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform vec3 uCameraPosition;
uniform mat3 uCameraBasis;
uniform float uTanHalfFov;
uniform float uTime;
uniform float uStepSize;
uniform int uMaxSteps;
uniform sampler2D uNoise;
uniform sampler2D uStars;
uniform sampler2D uNebula;
uniform float uInnerRadius;
uniform float uOuterRadius;
uniform float uTemperature;
uniform float uDiskBrightness;
uniform float uDiskOpacity;
uniform float uTurbulence;
uniform float uStarsBrightness;
uniform float uNebulaBrightness;
uniform bool uLensing;
uniform bool uRedshift;
uniform bool uBeaming;
uniform int uDebugView;
const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

// y = (u, du/dphi), u = 1/r. Exact ODE; RK4 is its numerical approximation.
vec2 derivative(vec2 y) { return vec2(y.y, 1.5 * y.x * y.x - y.x); }
vec2 rk4(vec2 y, float h) {
    vec2 k1 = derivative(y);
    vec2 k2 = derivative(y + 0.5 * h * k1);
    vec2 k3 = derivative(y + 0.5 * h * k2);
    vec2 k4 = derivative(y + h * k3);
    return y + (h / 6.0) * (k1 + 2.0*k2 + 2.0*k3 + k4);
}

vec2 skyUV(vec3 d) {
    return vec2(atan(d.z, d.x) / TAU + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
}
vec3 sky(vec3 d) {
    vec2 uv = skyUV(d);
    // Point-source reconstruction in pixel space. A local least-squares inverse
    // of the ray-direction Jacobian prevents filtered star texels becoming long
    // smears. Evaluated AFTER the ray loop in converged fragment control flow.
    vec3 dx=dFdx(d), dy=dFdy(d);
    float xx=dot(dx,dx), yy=dot(dy,dy), xy=dot(dx,dy);
    float det=max(xx*yy-xy*xy,1e-20);
    float unlensedArea=pow(2.0*uTanHalfFov/uResolution.y,2.0);
    float magnification=clamp(unlensedArea/sqrt(det),0.0,4.0);
    // A local linear reconstruction is unreliable when a pixel sweeps a large
    // sky angle near the critical curve. Fade these unresolved point sources;
    // retaining a minimum PSF size there would create a false sparkling halo.
    float resolved=1.0-smoothstep(0.008,0.025,sqrt(max(xx,yy)));
    vec2 grid=vec2(256.0,128.0), cell=floor(uv*grid);
    vec3 stars=vec3(0.0);
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
        vec2 id=cell+vec2(float(x),float(y));
        if(id.y<0.0 || id.y>=grid.y) continue;
        vec4 source=textureLod(uStars,(id+0.5)/grid,0.0);
        if(source.b<0.001) continue;
        vec2 position=(id+source.rg)/grid;
        float lon=(position.x-0.5)*TAU,lat=(position.y-0.5)*PI;
        vec3 direction=vec3(cos(lat)*cos(lon),sin(lat),cos(lat)*sin(lon));
        vec3 delta=direction-d;
        float qx=dot(delta,dx),qy=dot(delta,dy);
        vec2 pixelOffset=vec2(yy*qx-xy*qy,xx*qy-xy*qx)/det;
        float radius=0.55+0.38*source.b;
        float point=exp(-0.5*dot(pixelOffset,pixelOffset)/(radius*radius));
        vec3 tint=mix(vec3(1.0,0.79,0.56),vec3(0.64,0.80,1.0),source.a);
        stars+=tint*point*source.b*1.7*magnification*resolved;
    }
    vec3 clouds = textureLod(uNebula, uv, 0.0).rgb;
    return stars * uStarsBrightness + clouds * uNebulaBrightness;
}

// Three visible spectral samples, white-balanced at 6500 K; an artistic RGB
// approximation to a blackbody, not a full spectral/CIE radiative-transfer model.
vec3 thermalColor(float kelvin) {
    vec3 lambda = vec3(610.0, 550.0, 460.0);
    vec3 ref = exp(vec3(1.4388e7) / (lambda * 6500.0)) - 1.0;
    vec3 spectrum = ref / (exp(vec3(1.4388e7) / (lambda * clamp(kelvin, 1000.0, 22000.0))) - 1.0);
    return spectrum / max(max(spectrum.r, spectrum.g), spectrum.b);
}

float pattern(float r, float angle, float age) {
    float omega = sqrt(0.5 / (r*r*r));
    float a = angle - age * omega;
    // Repeat-wrapped polar coordinates keep the azimuth seam continuous.
    vec2 uv = vec2(r * 0.016, a / TAU);
    float n0 = textureLod(uNoise, uv, 0.0).r;
    float n1 = textureLod(uNoise, uv * vec2(2.0, 2.0) + vec2(0.21, 0.37), 0.0).r;
    float n2 = textureLod(uNoise, uv * vec2(4.0, 4.0) + vec2(0.73, 0.16), 0.0).r;
    float n3 = textureLod(uNoise, uv * vec2(8.0, 8.0), 0.7).r;
    float bands = 0.5 + 0.5 * sin(r*48.0 + n0*5.0 + sin(a*7.0 + r*3.0)*0.9);
    return 0.40*n0 + 0.27*n1 + 0.18*n2 + 0.09*n3 + 0.06*bands;
}

// Composites an equatorial, geometrically thin emitting disk at a ray crossing.
// rd is the BACKWARD ray in the local static orthonormal frame.
void addDisk(vec3 p, vec3 rd, float observerR, inout vec3 light, inout float throughput) {
    float r = length(p.xz);
    if (r <= uInnerRadius || r >= uOuterRadius) return;
    float edge = smoothstep(uInnerRadius, uInnerRadius + 0.28, r)
               * (1.0 - smoothstep(uOuterRadius - 1.6, uOuterRadius, r));
    float angle = atan(p.z, p.x);
    // Two staggered, smoothly crossfaded advection phases avoid unlimited winding
    // of differential rotation, without a visible time reset.
    const float cycle = 150.0;
    float age0 = mod(uTime, cycle);
    float age1 = mod(uTime + cycle*0.5, cycle);
    float blend = 0.5 - 0.5*cos(TAU*age0/cycle);
    float n = mix(pattern(r, angle, age1), pattern(r, angle, age0), blend);
    float structure = mix(1.0, pow(max(n*1.85, 0.02), 2.8), uTurbulence);

    // Zero-torque thin-disk radial flux shape, normalized at r = (49/36) r_in.
    float x = r/uInnerRadius;
    float flux = pow(x, -3.0) * max(1.0 - inversesqrt(x), 0.0) / 0.0566528;
    float temperature = uTemperature * pow(max(flux, 0.0001), 0.25);
    vec3 tangent = normalize(vec3(-p.z, 0.0, p.x));
    float beta = sqrt(0.5 / max(r - 1.0, 0.001));
    float doppler = sqrt(1.0-beta*beta) / max(1.0 + beta*dot(tangent, rd), 0.08);
    float gravitational = sqrt(max(1.0 - 1.0/r, 0.0) / (1.0 - 1.0/observerR));
    float shift = uRedshift ? gravitational*doppler : 1.0;
    // I_nu / nu^3 is invariant; this visual model uses g^3 for RGB intensity.
    // This is not the bolometric g^4 law or an X-ray/GRMHD disk calculation.
    float boost = uBeaming ? pow(gravitational*doppler, 3.0) : 1.0;
    vec3 color = thermalColor(temperature * shift);
    float emission = uDiskBrightness * pow(flux, 0.72) * structure * boost;
    float opacity = clamp(uDiskOpacity * edge * (0.8 + 0.2*n), 0.0, 0.995);
    light += throughput * opacity * color * emission;
    throughput *= 1.0 - opacity;
}

vec3 traceStraight(vec3 origin, vec3 dir) {
    // Useful comparison: no bending, but the same disk and absorbing sphere.
    float b = dot(origin, dir);
    float disc = b*b - dot(origin, origin) + 1.0;
    float horizonT = 1e20;
    if (disc >= 0.0 && -b - sqrt(disc) > 0.0) horizonT = -b - sqrt(disc);
    vec3 light = vec3(0.0); float throughput = 1.0;
    if (abs(dir.y) > 1e-7) {
        float t = -origin.y/dir.y;
        if (t > 0.0 && t < horizonT) addDisk(origin + dir*t, dir, length(origin), light, throughput);
    }
    vec3 background=sky(dir);
    if (horizonT == 1e20) light += throughput * background;
    return light;
}

void main() {
    vec2 ndc = vUv*2.0 - 1.0;
    ndc.x *= uResolution.x/uResolution.y;
    vec3 ray = normalize(uCameraBasis * vec3(ndc*uTanHalfFov, -1.0));
    if (!uLensing) { gl_FragColor = vec4(traceStraight(uCameraPosition, ray), 1.0); return; }

    float observerR = length(uCameraPosition);
    vec3 er0 = uCameraPosition / observerR;
    float cosAlpha = clamp(dot(ray, er0), -1.0, 1.0);
    vec3 tangent = ray - cosAlpha*er0;
    float sinAlpha = length(tangent);
    if (sinAlpha < 1e-6) {
        gl_FragColor = vec4(cosAlpha < 0.0 ? vec3(0.0) : sky(ray), 1.0); return;
    }
    vec3 et0 = tangent/sinAlpha;
    float u0 = 1.0/observerR;
    // Static observer's local viewing angle -> Schwarzschild coordinate slope.
    vec2 state = vec2(u0, -u0*cosAlpha*sqrt(1.0-u0)/sinAlpha);
    float phi = 0.0;
    // Disk intersections are exactly at phi_cross + n*pi in this ray's plane.
    // Shorten the integration step to land on each crossing, never skip a disk.
    float nextCross = mod(atan(-er0.y, et0.y), PI);
    if (nextCross < 1e-5) nextCross += PI;
    vec3 light = vec3(0.0);
    float throughput = 1.0;
    int intersections = 0;
    int fate = 0; // 0: integration budget, 1: captured, 2: escaped, 3: opaque disk.
    vec3 escapeDirection=ray;
    float skyWeight=0.0;

    for (int i=0; i<400; ++i) {
        if (i >= uMaxSteps) break;
        float h = min(uStepSize, nextCross - phi);
        // Limit growth on almost radial inward rays. Far-sky rays remain cheap.
        h = min(h, 0.18 / max(abs(state.y), 0.001));
        vec2 previous = state;
        state = rk4(state, h);
        float previousPhi = phi;
        phi += h;

        if (state.x <= 0.0) {
            float fraction = previous.x / max(previous.x - state.x, 1e-8);
            float escapePhi = previousPhi + h*clamp(fraction, 0.0, 1.0);
            escapeDirection = er0*cos(escapePhi) + et0*sin(escapePhi);
            skyWeight=throughput;
            fate = 2; break;
        }
        if (state.x >= 1.0) { fate = 1; break; }

        if (phi >= nextCross - 1e-5) {
            if (state.x >= 1.0/uOuterRadius && state.x <= 1.0/uInnerRadius) {
                vec3 er = er0*cos(phi) + et0*sin(phi);
                vec3 et = -er0*sin(phi) + et0*cos(phi);
                vec3 localDir = normalize(-state.y*er + state.x*sqrt(1.0-state.x)*et);
                addDisk(er/state.x, localDir, observerR, light, throughput);
                intersections++;
            }
            nextCross += PI;
        }
        if (throughput < 0.002) { fate = 3; break; }
    }

    vec3 background=sky(escapeDirection);
    light+=skyWeight*background;
    if (uDebugView == 1) {
        light = fate == 1 ? vec3(0.012, 0.016, 0.022) :
                fate == 2 ? vec3(0.08, 0.25, 0.46) :
                fate == 3 ? vec3(0.4, 0.8, 0.3) : vec3(2.0, 0.0, 1.2);
    } else if (uDebugView == 2) {
        light = intersections == 0 ? vec3(0.008) : intersections == 1 ? vec3(0.65, 0.19, 0.04) : vec3(0.08, 0.4, 0.85);
    }
    gl_FragColor = vec4(max(light, vec3(0.0)), 1.0);
}
`;
