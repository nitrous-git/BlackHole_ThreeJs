export const displayFragmentShader = /* glsl */`
uniform sampler2D tDiffuse;
uniform float uExposure;
uniform float uVignette;
varying vec2 vUv;
vec3 filmic(vec3 x) {
    return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 x) {
    return mix(12.92*x, 1.055*pow(x, vec3(1.0/2.4))-0.055, step(vec3(0.0031308), x));
}
void main() {
    vec3 hdr = texture2D(tDiffuse, vUv).rgb * uExposure;
    vec2 p = vUv*2.0-1.0;
    hdr *= 1.0 - uVignette*smoothstep(0.3, 1.7, length(p));
    vec3 color = toSRGB(filmic(hdr));
    // Static one-LSB dither limits gradients banding without temporal flicker.
    float dither = fract(52.9829189*fract(dot(gl_FragCoord.xy, vec2(0.06711056,0.00583715))));
    gl_FragColor = vec4(clamp(color+(dither-0.5)/255.0, 0.0, 1.0), 1.0);
}
`;
