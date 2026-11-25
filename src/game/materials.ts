import * as THREE from 'three';

export interface ProceduralTextureSet {
  arenaFloorMap: THREE.CanvasTexture;
  arenaFloorBump: THREE.CanvasTexture;
  travertineMap: THREE.CanvasTexture;
  travertineBump: THREE.CanvasTexture;
  armorWeaveBump: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Colosseum Gladiator Sand Floor Albedo (Warm compacted arena sand + stone seal & duel line)
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 1024;
  floorCanvas.height = 1024;
  const fCtx = floorCanvas.getContext('2d')!;

  const sandGrad = fCtx.createRadialGradient(512, 512, 40, 512, 512, 512);
  sandGrad.addColorStop(0, '#c8ab7c');
  sandGrad.addColorStop(0.58, '#b08f60');
  sandGrad.addColorStop(0.88, '#8a6d45');
  sandGrad.addColorStop(1, '#6f5637');
  fCtx.fillStyle = sandGrad;
  fCtx.fillRect(0, 0, 1024, 1024);

  // Subtle compacted sand grain speckles & raked arcs
  for (let i = 0; i < 4200; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const y = (Math.sin(i * 78.233) * 43758.5453) % 1;
    const px = Math.abs(x) * 1024;
    const py = Math.abs(y) * 1024;
    fCtx.fillStyle = i % 2 === 0 ? 'rgba(255, 240, 210, 0.08)' : 'rgba(62, 44, 24, 0.1)';
    fCtx.fillRect(px, py, 2.5, 2.5);
  }

  // Carved Travertine Concentric Arena Rings
  const cx = 512;
  const cy = 512;
  const ringRadii = [145, 275, 410, 478];
  ringRadii.forEach((r, idx) => {
    fCtx.beginPath();
    fCtx.arc(cx, cy, r, 0, Math.PI * 2);
    fCtx.strokeStyle =
      idx === 2 ? 'rgba(235, 215, 178, 0.42)' : 'rgba(90, 68, 42, 0.34)';
    fCtx.lineWidth = idx === 2 ? 7 : 4;
    fCtx.stroke();
  });

  // Subtle Roman geometric center rosette
  fCtx.strokeStyle = 'rgba(92, 69, 41, 0.28)';
  fCtx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    fCtx.beginPath();
    fCtx.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
    fCtx.lineTo(cx + Math.cos(a) * 410, cy + Math.sin(a) * 410);
    fCtx.stroke();
  }

  // Center Duelist Lane Marker
  fCtx.strokeStyle = 'rgba(245, 196, 110, 0.35)';
  fCtx.lineWidth = 4;
  fCtx.beginPath();
  fCtx.moveTo(cx - 410, cy);
  fCtx.lineTo(cx + 410, cy);
  fCtx.stroke();

  const arenaFloorMap = new THREE.CanvasTexture(floorCanvas);
  arenaFloorMap.colorSpace = THREE.SRGBColorSpace;
  arenaFloorMap.anisotropy = maxAnisotropy;

  // 2. Arena Sand Bump Map (Linear space)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    const px = Math.abs((Math.sin(i * 45.164) * 43758.5453) % 1) * 512;
    const py = Math.abs((Math.sin(i * 93.719) * 43758.5453) % 1) * 512;
    bCtx.fillStyle = i % 2 === 0 ? '#9c9c9c' : '#646464';
    bCtx.fillRect(px, py, 2, 2);
  }
  const arenaFloorBump = new THREE.CanvasTexture(bumpCanvas);
  arenaFloorBump.colorSpace = THREE.NoColorSpace;
  arenaFloorBump.wrapS = THREE.RepeatWrapping;
  arenaFloorBump.wrapT = THREE.RepeatWrapping;
  arenaFloorBump.repeat.set(3, 3);
  arenaFloorBump.anisotropy = maxAnisotropy;

  // 3. Travertine Ashlar Stone Masonry Texture (Albedo + Bump)
  const travCanvas = document.createElement('canvas');
  travCanvas.width = 512;
  travCanvas.height = 512;
  const tCtx = travCanvas.getContext('2d')!;
  tCtx.fillStyle = '#b9a68a';
  tCtx.fillRect(0, 0, 512, 512);

  const travBumpCanvas = document.createElement('canvas');
  travBumpCanvas.width = 512;
  travBumpCanvas.height = 512;
  const tbCtx = travBumpCanvas.getContext('2d')!;
  tbCtx.fillStyle = '#909090';
  tbCtx.fillRect(0, 0, 512, 512);

  const rows = 8;
  const cols = 4;
  const rowH = 512 / rows;
  const colW = 512 / cols;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + offset;
      const by = r * rowH;
      const shade = 172 + ((r * 7 + c * 13) % 24) - 12;
      tCtx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.9)}, ${Math.round(shade * 0.76)})`;
      tCtx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);

      tbCtx.fillStyle = '#a4a4a4';
      tbCtx.fillRect(bx + 3, by + 3, colW - 6, rowH - 6);
    }
  }

  const travertineMap = new THREE.CanvasTexture(travCanvas);
  travertineMap.colorSpace = THREE.SRGBColorSpace;
  travertineMap.wrapS = THREE.RepeatWrapping;
  travertineMap.wrapT = THREE.RepeatWrapping;
  travertineMap.repeat.set(2, 2);
  travertineMap.anisotropy = maxAnisotropy;

  const travertineBump = new THREE.CanvasTexture(travBumpCanvas);
  travertineBump.colorSpace = THREE.NoColorSpace;
  travertineBump.wrapS = THREE.RepeatWrapping;
  travertineBump.wrapT = THREE.RepeatWrapping;
  travertineBump.repeat.set(2, 2);
  travertineBump.anisotropy = maxAnisotropy;

  // 4. Brushed Carbon-Titanium Armor Micro-relief Bump Map
  const weaveCanvas = document.createElement('canvas');
  weaveCanvas.width = 256;
  weaveCanvas.height = 256;
  const wCtx = weaveCanvas.getContext('2d')!;
  wCtx.fillStyle = '#7c7c7c';
  wCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 8) {
    for (let x = 0; x < 256; x += 8) {
      wCtx.fillStyle = (x + y) % 16 === 0 ? '#969696' : '#646464';
      wCtx.fillRect(x, y, 6, 3);
    }
  }
  const armorWeaveBump = new THREE.CanvasTexture(weaveCanvas);
  armorWeaveBump.colorSpace = THREE.NoColorSpace;
  armorWeaveBump.wrapS = THREE.RepeatWrapping;
  armorWeaveBump.wrapT = THREE.RepeatWrapping;
  armorWeaveBump.repeat.set(3, 3);

  // 5. Radial Contact Shadow Disc Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(20, 14, 8, 0.78)');
  grad.addColorStop(0.55, 'rgba(20, 14, 8, 0.36)');
  grad.addColorStop(1, 'rgba(20, 14, 8, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;

  return {
    arenaFloorMap,
    arenaFloorBump,
    travertineMap,
    travertineBump,
    armorWeaveBump,
    contactShadowMap,
    dispose: () => {
      arenaFloorMap.dispose();
      arenaFloorBump.dispose();
      travertineMap.dispose();
      travertineBump.dispose();
      armorWeaveBump.dispose();
      contactShadowMap.dispose();
    },
  };
}
