import GUI from 'lil-gui';
import { QUALITY, DEBUG_VIEWS } from './config.js';

export class SimulationUI {
    constructor(settings, actions) {
        this.settings = settings; this.actions = actions;
        this.container = document.getElementById('gui-container');
        this.gui = new GUI({container: this.container, title:'Schwarzschild · Controls', width:286});
        const render = this.gui.addFolder('Rendering');
        render.add(settings,'quality',Object.keys(QUALITY)).name('Quality').onChange(value=>{
            settings.renderScale=QUALITY[value].scale; this.gui.controllersRecursive().forEach(c=>c.updateDisplay()); actions.resize();
        });
        render.add(settings,'renderScale',0.4,1.5,0.05).name('Resolution scale').onChange(actions.resize);
        render.add(settings,'exposure',0.3,2.5,0.01).name('Exposure');
        render.add(settings,'bloomStrength',0,1.8,0.01).name('Bloom strength');
        render.add(settings,'bloomRadius',0,1,0.01).name('Bloom spread');
        render.add(settings,'bloomThreshold',0,2,0.01).name('Bloom threshold');
        render.add(settings,'vignette',0,0.6,0.01).name('Vignette');

        const disk = this.gui.addFolder('Accretion disk');
        disk.add(settings,'innerRadius',3,7,0.05).name('Inner radius / rₛ').onChange(()=>{
            settings.outerRadius=Math.max(settings.outerRadius,settings.innerRadius+2); this.refresh();
        });
        disk.add(settings,'outerRadius',5,16,0.1).name('Outer radius / rₛ').onChange(()=>{
            settings.outerRadius=Math.max(settings.outerRadius,settings.innerRadius+2); this.refresh();
        });
        disk.add(settings,'temperature',3500,14000,100).name('Peak color temp. / K');
        disk.add(settings,'diskBrightness',0,12,0.05).name('Emission');
        disk.add(settings,'diskOpacity',0.05,1,0.01).name('Opacity');
        disk.add(settings,'turbulence',0,1,0.01).name('Texture contrast');
        disk.add(settings,'rotationSpeed',0,5,0.05).name('Animation speed');
        disk.close();

        const relativity = this.gui.addFolder('Relativity');
        relativity.add(settings,'lensing').name('Schwarzschild lensing');
        relativity.add(settings,'redshift').name('Frequency shift');
        relativity.add(settings,'beaming').name('Intensity shift');
        relativity.close();
        const env = this.gui.addFolder('Environment');
        env.add(settings,'stars',0,3,0.05).name('Star brightness');
        env.add(settings,'nebula',0,2,0.05).name('Galactic dust');
        env.close();
        const camera = this.gui.addFolder('Camera');
        camera.add(settings,'fieldOfView',25,70,1).name('Field of view').onChange(actions.updateCamera);
        camera.add(settings,'autoOrbit').name('Auto orbit');
        camera.add(settings,'orbitSpeed',0.05,1,0.01).name('Orbit speed');
        camera.add(actions,'resetCamera').name('Reset camera'); camera.close();
        const diagnostics = this.gui.addFolder('Diagnostics');
        diagnostics.add(settings,'debugView',Object.keys(DEBUG_VIEWS)).name('View');
        diagnostics.close();
        this.gui.add(actions,'resetAll').name('Restore defaults');

        document.getElementById('settings-button').addEventListener('click',()=>{
            this.container.hidden=!this.container.hidden;
            document.getElementById('settings-button').setAttribute('aria-expanded',String(!this.container.hidden));
        });
        document.getElementById('pause-button').addEventListener('click',actions.togglePause);
        document.getElementById('capture-button').addEventListener('click',actions.capture);
        document.getElementById('fullscreen-button').addEventListener('click',actions.fullscreen);
        document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>actions.setView(button.dataset.view)));
        this.onKey = event=>{
            if (['INPUT','SELECT','TEXTAREA','BUTTON'].includes(document.activeElement.tagName) || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
            switch (event.code) {
                case 'Space': event.preventDefault(); actions.togglePause(); break;
                case 'KeyH': document.body.classList.toggle('ui-hidden'); break;
                case 'KeyR': actions.resetCamera(); break;
                case 'KeyP': actions.capture(); break;
                case 'KeyF': actions.fullscreen(); break;
            }
        };
        window.addEventListener('keydown',this.onKey);
    }

    refresh() { this.gui.controllersRecursive().forEach(c=>c.updateDisplay()); }
    setView(name) {
        document.querySelectorAll('[data-view]').forEach(button=>{
            const active=button.dataset.view===name;
            button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active));
        });
    }
    setPaused(paused) {
        const button=document.getElementById('pause-button');
        button.textContent=paused?'Resume':'Pause'; button.setAttribute('aria-pressed',String(paused));
    }
    updateStats(fps, width, height, quality) {
        document.getElementById('fps-value').textContent=Math.round(fps);
        document.getElementById('quality-value').textContent=quality.toUpperCase();
        document.getElementById('resolution-value').textContent=`${width} × ${height} · WEBGL 2`;
    }
    toast(message) {
        clearTimeout(this.toastTimer);
        const toast=document.getElementById('toast');
        toast.textContent=message; toast.classList.add('visible');
        this.toastTimer=setTimeout(()=>toast.classList.remove('visible'),2800);
    }
    dispose() { this.gui.destroy(); window.removeEventListener('keydown',this.onKey); clearTimeout(this.toastTimer); }
}
