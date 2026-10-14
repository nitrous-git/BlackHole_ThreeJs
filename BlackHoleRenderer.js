import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { QUALITY, DEBUG_VIEWS } from './config.js';
import { fullscreenVertexShader } from './shaders/fullscreen.vert.js';
import { blackHoleFragmentShader } from './shaders/blackhole.frag.js';
import { displayFragmentShader } from './shaders/display.frag.js';

export class BlackHoleRenderer {
    constructor(renderer, camera, environment, settings) {
        this.renderer = renderer;
        this.camera = camera;
        this.settings = settings;
        this.width = this.height = 1;
        this.hdr = renderer.extensions.has('EXT_color_buffer_float');
        const uniforms = {
            uResolution: { value: new THREE.Vector2(1,1) },
            uCameraPosition: { value: new THREE.Vector3() },
            uCameraBasis: { value: new THREE.Matrix3() },
            uTanHalfFov: { value: 1 }, uTime: { value: 0 },
            uMaxSteps: { value: 272 }, uStepSize: { value: 0.04 },
            uNoise: { value: environment.noiseTexture },
            uStars: { value: environment.starTexture },
            uNebula: { value: environment.nebulaTexture },
            uInnerRadius: { value: 3 }, uOuterRadius: { value: 10.5 },
            uTemperature: { value: 6800 }, uDiskBrightness: { value: 5.4 },
            uDiskOpacity: { value: 0.92 }, uTurbulence: { value: 0.7 },
            uStarsBrightness: { value: 0.85 }, uNebulaBrightness: { value: 0.3 },
            uLensing: { value: true }, uRedshift: { value: true },
            uBeaming: { value: true }, uDebugView: { value: 0 }
        };
        this.material = new THREE.ShaderMaterial({
            uniforms, vertexShader: fullscreenVertexShader,
            fragmentShader: blackHoleFragmentShader,
            depthTest: false, depthWrite: false, toneMapped: false
        });
        this.scene = new THREE.Scene();
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), this.material);
        this.quad.frustumCulled = false;
        this.scene.add(this.quad);
        this.screenCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
        const target = new THREE.WebGLRenderTarget(1,1,{
            type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
            format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false
        });
        this.composer = new EffectComposer(renderer,target);
        this.composer.setPixelRatio(1);
        this.renderPass = new RenderPass(this.scene,this.screenCamera);
        this.bloom = new UnrealBloomPass(new THREE.Vector2(1,1),0.68,0.65,0.72);
        // Favor local glow; suppress the broadest mips so the capture shadow stays
        // legible. r182 bloom has a substantial built-in gain on its mip sum.
        [1.0,0.65,0.30,0.12,0.035].forEach((weight,i)=>this.bloom.bloomTintColors[i].setScalar(weight));
        this.display = new ShaderPass({
            uniforms: { tDiffuse: { value: null }, uExposure: { value: 1.18 }, uVignette: { value: 0.23 } },
            vertexShader: fullscreenVertexShader, fragmentShader: displayFragmentShader
        });
        this.display.material.toneMapped = false;
        this.composer.addPass(this.renderPass);
        // UnrealBloomPass requires renderable half-float textures.
        if (this.hdr) this.composer.addPass(this.bloom);
        this.composer.addPass(this.display);
    }

    setSize(cssWidth, cssHeight) {
        const pixelRatio = this.renderer.getPixelRatio();
        const scale = this.settings.renderScale;
        this.width = Math.max(1,Math.round(cssWidth*pixelRatio*scale));
        this.height = Math.max(1,Math.round(cssHeight*pixelRatio*scale));
        this.composer.setSize(this.width,this.height);
        this.material.uniforms.uResolution.value.set(this.width,this.height);
    }

    render(time) {
        const s=this.settings, u=this.material.uniforms, q=QUALITY[s.quality];
        this.camera.updateMatrixWorld();
        u.uCameraPosition.value.copy(this.camera.position);
        u.uCameraBasis.value.setFromMatrix4(this.camera.matrixWorld);
        u.uTanHalfFov.value = Math.tan(THREE.MathUtils.degToRad(this.camera.fov)*0.5);
        u.uTime.value = time;
        u.uMaxSteps.value=q.steps; u.uStepSize.value=q.stepSize;
        u.uInnerRadius.value=s.innerRadius; u.uOuterRadius.value=s.outerRadius;
        u.uTemperature.value=s.temperature; u.uDiskBrightness.value=s.diskBrightness;
        u.uDiskOpacity.value=s.diskOpacity; u.uTurbulence.value=s.turbulence;
        u.uStarsBrightness.value=s.stars; u.uNebulaBrightness.value=s.nebula;
        u.uLensing.value=s.lensing; u.uRedshift.value=s.redshift; u.uBeaming.value=s.beaming;
        u.uDebugView.value=DEBUG_VIEWS[s.debugView];
        this.bloom.enabled = s.debugView === 'Beauty' && s.bloomStrength>0;
        this.bloom.strength=s.bloomStrength; this.bloom.radius=s.bloomRadius;
        this.bloom.threshold=s.bloomThreshold;
        this.display.uniforms.uExposure.value=s.debugView === 'Beauty' ? s.exposure : 1;
        this.display.uniforms.uVignette.value=s.debugView === 'Beauty' ? s.vignette : 0;
        this.composer.render();
    }

    dispose() {
        this.material.dispose(); this.quad.geometry.dispose();
        this.renderPass.dispose(); this.bloom.dispose(); this.display.dispose();
        this.composer.dispose();
    }
}
