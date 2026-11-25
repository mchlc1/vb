import * as THREE from 'three';

export interface ProceduralTextureSet {
  arenaFloorMap: THREE.CanvasTexture;
  arenaFloorBump: THREE.CanvasTexture;
  armorWeaveBump: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  // 1. Arena Floor Albedo (Obsidian octagonal slate + subtle etched tactical rings)
  const floorCanvas = document.createElement('canvas');
  floorCanvas.width = 1024;
  floorCanvas.height = 1024;
  const fCtx = floorCanvas.getContext('2d')!;

  fCtx.fillStyle = '#0c111d';
  fCtx.fillRect(0, 0, 1024, 1024);

  // Subtle tile plates
  fCtx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
  fCtx.lineWidth = 2;
  const step = 64;
  for (let i = 0; i <= 1024; i += step) {
    fCtx.beginPath();
    fCtx.moveTo(i, 0);
    fCtx.lineTo(i, 1024);
    fCtx.stroke();
    fCtx.beginPath();
    fCtx.moveTo(0, i);
    fCtx.lineTo(1024, i);
    fCtx.stroke();
  }

  // Concentric dueling rings
  const cx = 512;
  const cy = 512;
  const ringRadii = [140, 260, 390, 470];
  ringRadii.forEach((r, idx) => {
    fCtx.beginPath();
    fCtx.arc(cx, cy, r, 0, Math.PI * 2);
    fCtx.strokeStyle = idx === 2 ? 'rgba(6, 182, 212, 0.45)' : 'rgba(148, 163, 184, 0.18)';
    fCtx.lineWidth = idx === 2 ? 4 : 2;
    fCtx.stroke();
  });

  // Center engagement line
  fCtx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
  fCtx.lineWidth = 3;
  fCtx.beginPath();
  fCtx.moveTo(cx, cy - 390);
  fCtx.lineTo(cx, cy + 390);
  fCtx.stroke();

  const arenaFloorMap = new THREE.CanvasTexture(floorCanvas);
  arenaFloorMap.colorSpace = THREE.SRGBColorSpace;
  arenaFloorMap.anisotropy = maxAnisotropy;

  // 2. Arena Floor Bump Map (Linear space)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 512;
  bumpCanvas.height = 512;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 512, 512);
  bCtx.strokeStyle = '#383838';
  bCtx.lineWidth = 3;
  for (let i = 0; i <= 512; i += 32) {
    bCtx.beginPath();
    bCtx.moveTo(i, 0);
    bCtx.lineTo(i, 512);
    bCtx.stroke();
    bCtx.beginPath();
    bCtx.moveTo(0, i);
    bCtx.lineTo(512, i);
    bCtx.stroke();
  }
  const arenaFloorBump = new THREE.CanvasTexture(bumpCanvas);
  arenaFloorBump.colorSpace = THREE.NoColorSpace;
  arenaFloorBump.wrapS = THREE.RepeatWrapping;
  arenaFloorBump.wrapT = THREE.RepeatWrapping;
  arenaFloorBump.repeat.set(2, 2);
  arenaFloorBump.anisotropy = maxAnisotropy;

  // 3. Brushed Carbon-Titanium Armor Micro-relief Bump Map
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

  // 4. Radial Contact Shadow Disc Texture
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext('2d')!;
  const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.78)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.38)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;

  return {
    arenaFloorMap,
    arenaFloorBump,
    armorWeaveBump,
    contactShadowMap,
    dispose: () => {
      arenaFloorMap.dispose();
      arenaFloorBump.dispose();
      armorWeaveBump.dispose();
      contactShadowMap.dispose();
    },
  };
}
