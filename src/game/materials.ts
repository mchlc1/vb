import * as THREE from 'three';

export interface ProceduralTextureSet {
  arenaFloorMap: THREE.CanvasTexture;
  arenaFloorBump: THREE.CanvasTexture;
  travertineMap: THREE.CanvasTexture;
  travertineBump: THREE.CanvasTexture;
  armorWeaveBump: THREE.CanvasTexture;
  scutumMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. 80 AD Colosseum Harena Sand Floor Albedo (Warm golden compacted sand + raked tracks & timber hypogeum hatches)
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 1024;
  floorCanvas.height = 1024;
  const fCtx = floorCanvas.getContext('2d')!;

  const sandGrad = fCtx.createRadialGradient(512, 512, 40, 512, 512, 512);
  sandGrad.addColorStop(0, '#d6b47e');
  sandGrad.addColorStop(0.55, '#c19a61');
  sandGrad.addColorStop(0.86, '#9c7848');
  sandGrad.addColorStop(1, '#7c5d36');
  fCtx.fillStyle = sandGrad;
  fCtx.fillRect(0, 0, 1024, 1024);

  // Subtle sand grain speckles & footprint raked arcs
  for (let i = 0; i < 5200; i++) {
    const x = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * 1024;
    const y = Math.abs((Math.sin(i * 78.233) * 43758.5453) % 1) * 1024;
    fCtx.fillStyle = i % 2 === 0 ? 'rgba(255, 240, 204, 0.1)' : 'rgba(66, 44, 20, 0.12)';
    fCtx.fillRect(x, y, 2.5, 2.5);
  }

  // Concentric raked sand rings around the duel circle
  const cx = 512;
  const cy = 512;
  const ringRadii = [148, 285, 420, 480];
  ringRadii.forEach((r, idx) => {
    fCtx.beginPath();
    fCtx.arc(cx, cy, r, 0, Math.PI * 2);
    fCtx.strokeStyle =
      idx === 2 ? 'rgba(232, 204, 158, 0.34)' : 'rgba(84, 58, 30, 0.25)';
    fCtx.lineWidth = idx === 2 ? 6 : 3;
    fCtx.stroke();
  });

  // Subtle wooden hypogeum trapdoor hatch outlines beneath the sand
  const drawHatch = (hx: number, hy: number, hw: number, hh: number) => {
    fCtx.fillStyle = 'rgba(72, 48, 26, 0.22)';
    fCtx.fillRect(hx - hw / 2, hy - hh / 2, hw, hh);
    fCtx.strokeStyle = 'rgba(54, 34, 16, 0.38)';
    fCtx.lineWidth = 2;
    fCtx.strokeRect(hx - hw / 2, hy - hh / 2, hw, hh);
    for (let p = 1; p < 4; p++) {
      const py = hy - hh / 2 + (hh / 4) * p;
      fCtx.beginPath();
      fCtx.moveTo(hx - hw / 2, py);
      fCtx.lineTo(hx + hw / 2, py);
      fCtx.stroke();
    }
  };
  drawHatch(cx - 190, cy - 175, 76, 52);
  drawHatch(cx + 190, cy - 175, 76, 52);
  drawHatch(cx, cy - 235, 84, 54);

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
  for (let i = 0; i < 3400; i++) {
    const px = Math.abs((Math.sin(i * 45.164) * 43758.5453) % 1) * 512;
    const py = Math.abs((Math.sin(i * 93.719) * 43758.5453) % 1) * 512;
    bCtx.fillStyle = i % 2 === 0 ? '#9e9e9e' : '#626262';
    bCtx.fillRect(px, py, 2, 2);
  }
  const arenaFloorBump = new THREE.CanvasTexture(bumpCanvas);
  arenaFloorBump.colorSpace = THREE.NoColorSpace;
  arenaFloorBump.wrapS = THREE.RepeatWrapping;
  arenaFloorBump.wrapT = THREE.RepeatWrapping;
  arenaFloorBump.repeat.set(3, 3);
  arenaFloorBump.anisotropy = maxAnisotropy;

  // 3. Roman Travertine Ashlar Stone Masonry Texture (Albedo + Bump)
  const travCanvas = document.createElement('canvas');
  travCanvas.width = 512;
  travCanvas.height = 512;
  const tCtx = travCanvas.getContext('2d')!;
  tCtx.fillStyle = '#bca788';
  tCtx.fillRect(0, 0, 512, 512);

  const travBumpCanvas = document.createElement('canvas');
  travBumpCanvas.width = 512;
  travBumpCanvas.height = 512;
  const tbCtx = travBumpCanvas.getContext('2d')!;
  tbCtx.fillStyle = '#8e8e8e';
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
      const shade = 186 + ((r * 7 + c * 13) % 26) - 13;
      tCtx.fillStyle = `rgb(${shade}, ${Math.round(shade * 0.89)}, ${Math.round(shade * 0.73)})`;
      tCtx.fillRect(bx + 2, by + 2, colW - 4, rowH - 4);

      tbCtx.fillStyle = '#a8a8a8';
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

  // 4. Hammered Bronze & Segmented Iron Armor Micro-relief Bump Map
  const weaveCanvas = document.createElement('canvas');
  weaveCanvas.width = 256;
  weaveCanvas.height = 256;
  const wCtx = weaveCanvas.getContext('2d')!;
  wCtx.fillStyle = '#7e7e7e';
  wCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    wCtx.fillStyle = '#626262';
    wCtx.fillRect(0, y, 256, 3);
    wCtx.fillStyle = '#9a9a9a';
    wCtx.fillRect(0, y + 3, 256, 2);
  }
  const armorWeaveBump = new THREE.CanvasTexture(weaveCanvas);
  armorWeaveBump.colorSpace = THREE.NoColorSpace;
  armorWeaveBump.wrapS = THREE.RepeatWrapping;
  armorWeaveBump.wrapT = THREE.RepeatWrapping;
  armorWeaveBump.repeat.set(2, 2);

  // 5. Historical Roman Scutum Shield Emblem Texture (Crimson base + golden-ochre wings & lightning)
  const scutumCanvas = document.createElement('canvas');
  scutumCanvas.width = 256;
  scutumCanvas.height = 384;
  const scCtx = scutumCanvas.getContext('2d')!;
  scCtx.fillStyle = '#8e1b18';
  scCtx.fillRect(0, 0, 256, 384);

  // Brass border rim
  scCtx.strokeStyle = '#d4a348';
  scCtx.lineWidth = 14;
  scCtx.strokeRect(7, 7, 242, 370);

  // Golden Roman eagle wings & thunderbolts
  scCtx.strokeStyle = '#e6b856';
  scCtx.fillStyle = '#e6b856';
  scCtx.lineWidth = 7;
  for (const dir of [-1, 1]) {
    scCtx.beginPath();
    scCtx.moveTo(128, 192);
    scCtx.quadraticCurveTo(128 + dir * 56, 118, 128 + dir * 88, 92);
    scCtx.quadraticCurveTo(128 + dir * 68, 152, 128 + dir * 32, 192);
    scCtx.fill();

    scCtx.beginPath();
    scCtx.moveTo(128, 192);
    scCtx.quadraticCurveTo(128 + dir * 56, 266, 128 + dir * 88, 292);
    scCtx.quadraticCurveTo(128 + dir * 68, 232, 128 + dir * 32, 192);
    scCtx.fill();
  }
  // Lightning arrows
  scCtx.beginPath();
  scCtx.moveTo(52, 192);
  scCtx.lineTo(204, 192);
  scCtx.stroke();

  const scutumMap = new THREE.CanvasTexture(scutumCanvas);
  scutumMap.colorSpace = THREE.SRGBColorSpace;
  scutumMap.anisotropy = maxAnisotropy;

  // 6. Radial Contact Shadow Disc Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(26, 16, 6, 0.72)');
  grad.addColorStop(0.55, 'rgba(26, 16, 6, 0.34)');
  grad.addColorStop(1, 'rgba(26, 16, 6, 0)');
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
    scutumMap,
    contactShadowMap,
    dispose: () => {
      arenaFloorMap.dispose();
      arenaFloorBump.dispose();
      travertineMap.dispose();
      travertineBump.dispose();
      armorWeaveBump.dispose();
      scutumMap.dispose();
      contactShadowMap.dispose();
    },
  };
}
