import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Environment } from './Environment.js';
import { BlackHoleRenderer } from './BlackHoleRenderer.js';
import { SimulationUI } from './SimulationUI.js';
import { DEFAULTS, VIEWS, QUALITY } from './config.js';

const canvas=document.getElementById('webgl-canvas');
const settings={...DEFAULTS};
let renderer, controls, blackHole, environment, ui;
let camera, elapsed=25, lastTime=0, statsTime=0, statsFrames=0, animationId;
let initialized=false, contextLost=false;

function showError(message) {
    document.body.classList.remove('ready');
    document.getElementById('startup-message').textContent=message;
    document.querySelector('.startup-content h1').textContent='Unable to start the renderer';
    document.querySelector('.loader-orbit').style.animation='none';
}

function resize() {
    if (!renderer || !blackHole) return;
    camera.aspect=innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight);
    blackHole.setSize(innerWidth,innerHeight);
    ui?.updateStats(statsFrames/Math.max(statsTime,0.001),blackHole.width,blackHole.height,settings.quality);
}

function setView(name) {
    const view=VIEWS[name];
    if (!view) return;
    // Clear residual OrbitControls damping before setting the new viewpoint.
    const damping=controls.enableDamping;
    controls.enableDamping=false; controls.update();
    controls.target.set(0,0,0);
    camera.position.fromArray(view.position);
    camera.lookAt(0,0,0);
    settings.fieldOfView=view.fov;
    camera.fov=view.fov; camera.updateProjectionMatrix();
    controls.update(); controls.enableDamping=damping;
    ui?.setView(name); ui?.refresh();
}

async function capture() {
    if (contextLost) return;
    // Render immediately before reading, so preserveDrawingBuffer can stay off.
    blackHole.render(elapsed);
    canvas.toBlob(blob=>{
        if (!blob) { ui.toast('Image capture was unavailable.'); return; }
        const url=URL.createObjectURL(blob), link=document.createElement('a');
        link.href=url; link.download=`schwarzschild-${new Date().toISOString().replace(/[:.]/g,'-')}.png`;
        link.click(); setTimeout(()=>URL.revokeObjectURL(url),5000);
        ui.toast('Image saved without the interface.');
    },'image/png');
}

async function fullscreen() {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
    } catch { ui.toast('Fullscreen is unavailable in this browser.'); }
}

function frame(timestamp) {
    if (contextLost || document.hidden) return;
    const realDt=lastTime ? (timestamp-lastTime)/1000 : 1/60;
    const dt=Math.min(realDt,0.05); lastTime=timestamp;
    if (!settings.paused) elapsed+=dt*settings.rotationSpeed;
    controls.autoRotate=settings.autoOrbit && !settings.paused;
    controls.autoRotateSpeed=settings.orbitSpeed;
    controls.update(dt);
    blackHole.render(elapsed);
    statsFrames++; statsTime+=realDt;
    if (statsTime>=0.75) {
        ui.updateStats(statsFrames/statsTime,blackHole.width,blackHole.height,settings.quality);
        statsFrames=0; statsTime=0;
    }
    animationId=requestAnimationFrame(frame);
}

async function initialize() {
    if (location.protocol==='file:') {
        showError('Open index.html with WebStorm’s browser preview / local HTTP server, not as a file:// URL.'); return;
    }
    const context=canvas.getContext('webgl2',{alpha:false,antialias:false,powerPreference:'high-performance'});
    if (!context) { showError('WebGL 2 is unavailable. Enable browser hardware acceleration and reload.'); return; }
    renderer=new THREE.WebGLRenderer({canvas,context,alpha:false,antialias:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.NoToneMapping; // Linear HDR -> display.frag.js exactly once.
    let shaderError=false;
    renderer.debug.onShaderError=(gl,program,vertexShader,fragmentShader)=>{
        shaderError=true;
        console.error('Black-hole shader error:',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertexShader),gl.getShaderInfoLog(fragmentShader));
    };
    camera=new THREE.PerspectiveCamera(settings.fieldOfView,innerWidth/innerHeight,0.1,200);
    controls=new OrbitControls(camera,canvas);
    controls.enableDamping=true; controls.dampingFactor=0.065;
    controls.enablePan=false; // The normalized geodesic camera orbits the origin.
    controls.minDistance=18; controls.maxDistance=65;
    controls.minPolarAngle=0.035; controls.maxPolarAngle=Math.PI-0.035;
    controls.rotateSpeed=0.45; controls.zoomSpeed=0.65;
    if (innerWidth<700) { settings.quality='Balanced'; settings.renderScale=QUALITY.Balanced.scale; }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) settings.paused=true;
    // Let the loading overlay paint before the one-time procedural asset work.
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    environment=new Environment();
    blackHole=new BlackHoleRenderer(renderer,camera,environment,settings);
    ui=new SimulationUI(settings,{
        resize, capture, fullscreen, setView,
        updateCamera:()=>{camera.fov=settings.fieldOfView;camera.updateProjectionMatrix();},
        resetCamera:()=>setView('cinematic'),
        togglePause:()=>{settings.paused=!settings.paused;ui.setPaused(settings.paused);},
        resetAll:()=>{
            Object.assign(settings,DEFAULTS); elapsed=25; setView('cinematic');
            resize(); ui.refresh(); ui.setPaused(settings.paused); ui.toast('Default settings restored.');
        }
    });
    setView('cinematic'); resize(); ui.setPaused(settings.paused);
    blackHole.render(elapsed);
    if (shaderError) throw new Error('A shader failed to compile. See the browser console for details.');
    initialized=true;
    document.body.classList.add('ready');
    if (!blackHole.hdr) ui.toast('HDR textures unavailable: using the LDR fallback without bloom.');
    lastTime=0; animationId=requestAnimationFrame(frame);
    // Useful during shader work. Deliberately small, read/edit-friendly debug surface.
    window.blackHoleApp={settings,camera,controls,renderer,blackHole,setView,resize,
        renderOnce:()=>blackHole.render(elapsed), get time(){return elapsed;}};
}

window.addEventListener('resize',resize);
document.addEventListener('visibilitychange',()=>{
    cancelAnimationFrame(animationId); lastTime=0; statsFrames=0; statsTime=0;
    if (!document.hidden && initialized && !contextLost) animationId=requestAnimationFrame(frame);
});
canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault(); contextLost=true; cancelAnimationFrame(animationId);
    ui?.toast('Graphics context lost. Reload this page to resume.');
});
canvas.addEventListener('webglcontextrestored',()=>location.reload());
window.addEventListener('pagehide',event=>{
    if (event.persisted) return;
    cancelAnimationFrame(animationId); ui?.dispose(); controls?.dispose();
    blackHole?.dispose(); environment?.dispose(); renderer?.dispose();
});
initialize().catch(error=>{console.error(error);showError(error.message);});
