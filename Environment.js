import * as THREE from 'three';

// Seeded assets are generated once. No network images or per-frame CPU textures.
function randomGenerator(seed) {
    return () => {
        let x = seed += 0x6D2B79F5;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function lattice(x, y, z) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise3(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x-ix, fy = y-iy, fz = z-iz;
    fx *= fx*(3-2*fx); fy *= fy*(3-2*fy); fz *= fz*(3-2*fz);
    const mix = (a, b, t) => a+(b-a)*t;
    const a = mix(lattice(ix,iy,iz), lattice(ix+1,iy,iz), fx);
    const b = mix(lattice(ix,iy+1,iz), lattice(ix+1,iy+1,iz), fx);
    const c = mix(lattice(ix,iy,iz+1), lattice(ix+1,iy,iz+1), fx);
    const d = mix(lattice(ix,iy+1,iz+1), lattice(ix+1,iy+1,iz+1), fx);
    return mix(mix(a,b,fy), mix(c,d,fy), fz);
}
function fbm(x, y, z) {
    let value = 0, amplitude = 0.54;
    for (let i = 0; i < 5; i++) {
        value += amplitude * noise3(x, y, z);
        x = x*2.03+11.1; y = y*2.03-3.4; z = z*2.03+6.8;
        amplitude *= 0.48;
    }
    return value;
}

export class Environment {
    constructor() {
        this.noiseTexture = this.createNoise();
        this.starTexture = this.createStars();
        this.nebulaTexture = this.createNebula();
    }

    createNoise() {
        const random = randomGenerator(18407);
        const width = 256, height = 32, data = new Uint8Array(width*height);
        for (let i = 0; i < data.length; i++) data[i] = Math.floor(random()*256);
        const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        return texture;
    }

    createStars() {
        const random = randomGenerator(917503);
        const width=256, height=128, data=new Uint8Array(width*height*4);
        for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
            const k=(y*width+x)*4;
            const latitude=((y+0.5)/height-0.5)*Math.PI;
            data[k]=Math.floor(random()*256); // Position within this sky cell.
            data[k+1]=Math.floor(random()*256);
            const present=random()<0.52*Math.cos(latitude); // Uniform solid angle.
            data[k+2]=present?Math.round(255*(0.09+0.91*Math.pow(random(),4))):0;
            data[k+3]=Math.floor(random()*256); // Color variation, not alpha.
        }
        // Store point positions and brightness, not pre-rasterized star images.
        // The shader projects each source through the local ray-map Jacobian.
        const texture = new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.minFilter = texture.magFilter = THREE.NearestFilter;
        texture.generateMipmaps=false;
        texture.needsUpdate=true;
        return texture;
    }

    createNebula() {
        const width = 1024, height = 512;
        const data = new Uint8Array(width*height*4);
        for (let y=0; y<height; y++) {
            const lat = ((y+0.5)/height-0.5)*Math.PI;
            const cy = Math.cos(lat), sy = Math.sin(lat);
            for (let x=0; x<width; x++) {
                const lon = ((x+0.5)/width-0.5)*Math.PI*2;
                const dx = cy*Math.cos(lon), dy = sy, dz = cy*Math.sin(lon);
                const n = fbm(dx*4.1+17,dy*4.1+4,dz*4.1-11);
                const detail = noise3(dx*21+18,dy*21-6,dz*21+5);
                const plane = dx*0.34+dy*0.86+dz*0.38;
                const band = Math.exp(-Math.pow((plane+(n-0.5)*0.35)*4.5,2));
                const dust = Math.pow(Math.max(n-0.24,0),2.2)*band;
                const lane = 0.35+0.65*Math.min(1,Math.abs(plane+0.04)*14);
                const haze = (0.0007+0.001*n)+dust*lane*0.50;
                const warm = Math.max(0,n-0.48)*2;
                const k = (y*width+x)*4;
                // Linear radiance in a low-contrast, intentionally quiet sky.
                data[k] = Math.min(255,Math.round(255*haze*(0.74+warm*0.65)));
                data[k+1] = Math.min(255,Math.round(255*haze*(0.79+detail*0.12)));
                data[k+2] = Math.min(255,Math.round(255*haze*(1.02-warm*0.30)));
                data[k+3] = 255;
            }
        }
        const texture = new THREE.DataTexture(data,width,height,THREE.RGBAFormat);
        texture.wrapS = THREE.RepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.needsUpdate = true;
        return texture;
    }

    dispose() {
        this.noiseTexture.dispose();
        this.starTexture.dispose();
        this.nebulaTexture.dispose();
    }
}
