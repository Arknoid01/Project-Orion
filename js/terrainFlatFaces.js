/* ===================== TEXTURES PLANES (style Minecraft) ===================== */
// Sources Comfy 512×512 → tools/import_flat_textures.py → assets/textures/flat/game/*.png
// Bake iso au chargement via bakeTerrainBlockFromFlatFaces (terrainVoxelBake.js).

const TERRAIN_FLAT_IMAGES = {};

function usesFlatBlockFaces(){
  return typeof TERRAIN_USE_FLAT_FACES === 'boolean' && TERRAIN_USE_FLAT_FACES;
}

/** Blocs remplacés par bake Comfy (hybride) — sans activer le mode full flat. */
function hybridFlatBlockKeys(){
  if (usesFlatBlockFaces()) return [];
  if (!Array.isArray(TERRAIN_FLAT_BLOCK_KEYS)) return [];
  return TERRAIN_FLAT_BLOCK_KEYS.filter(k => k && typeof k === 'string');
}

function usesHybridFlatBlocks(){
  return hybridFlatBlockKeys().length > 0;
}

function usesFlatForBlock(blockKey){
  if (usesFlatBlockFaces()){
    return !!(TERRAIN_BLOCK_FACES && TERRAIN_BLOCK_FACES[blockKey]);
  }
  return hybridFlatBlockKeys().includes(blockKey);
}

function flatFaceNamesForBlockKeys(blockKeys){
  const names = new Set();
  blockKeys.forEach(blockKey => {
    const faces = TERRAIN_BLOCK_FACES && TERRAIN_BLOCK_FACES[blockKey];
    if (!faces) return;
    if (faces.top) names.add(faces.top);
    if (faces.left) names.add(faces.left);
    if (faces.right) names.add(faces.right);
  });
  return [...names];
}

function flatTexturePaths(){
  if (typeof TERRAIN_FLAT_TEXTURES === 'object' && TERRAIN_FLAT_TEXTURES){
    return TERRAIN_FLAT_TEXTURES;
  }
  const dir = typeof TERRAIN_FLAT_TEXTURE_DIR === 'string'
    ? TERRAIN_FLAT_TEXTURE_DIR
    : 'assets/textures/flat/game/';
  let blockKeys;
  if (usesFlatBlockFaces()){
    blockKeys = Object.keys(TERRAIN_BLOCK_FACES || {});
  } else if (usesHybridFlatBlocks()){
    blockKeys = hybridFlatBlockKeys();
  } else {
    return {};
  }
  const names = flatFaceNamesForBlockKeys(blockKeys);
  const paths = {};
  const ver = typeof TERRAIN_FLAT_TEXTURE_VERSION === 'string' && TERRAIN_FLAT_TEXTURE_VERSION
    ? TERRAIN_FLAT_TEXTURE_VERSION
    : null;
  names.forEach(n => {
    paths[n] = dir + n + '.png' + (ver ? `?v=${encodeURIComponent(ver)}` : '');
  });
  return paths;
}

function requiredFlatFaceNames(){
  return Object.keys(flatTexturePaths());
}

function isFlatFaceReady(name){
  const img = TERRAIN_FLAT_IMAGES[name];
  return img && img.complete && img.naturalWidth > 0;
}

function areFlatFacesReady(){
  if (!usesFlatBlockFaces()) return false;
  const names = requiredFlatFaceNames();
  return names.length > 0 && names.every(isFlatFaceReady);
}

function flatFaceImage(name){
  if (isFlatFaceReady(name)) return TERRAIN_FLAT_IMAGES[name];
  if (typeof createFlatFallbackFace === 'function') return createFlatFallbackFace(name);
  return null;
}

function applyBakedBlockMetadata(id, baked){
  if (!baked || !baked.canvas) return false;
  const ref = (typeof TERRAIN_BLOCK_NATURE_BAKED === 'object' && TERRAIN_BLOCK_NATURE_BAKED.dirt)
    || (typeof TERRAIN_BLOCK_NATURE_BAKED === 'object' && TERRAIN_BLOCK_NATURE_BAKED.grass);
  if (ref && ref._drawW){
    copyBlockCanvasMetadata(ref, baked.canvas);
  } else {
    const { w, h } = typeof terrainBlockIsoSize === 'function'
      ? terrainBlockIsoSize()
      : { w: TILE_W, h: TILE_H };
    const capH = baked.diamondH || h;
    const stackStep = typeof LEGO_BRICK_STEP === 'number' ? LEGO_BRICK_STEP : capH;
    baked.canvas._capH = capH;
    baked.canvas._sideH = baked.sideH;
    baked.canvas._totalH = capH + baked.sideH;
    baked.canvas._capBackOffsetPx = 0;
    baked.canvas._stackStepPx = stackStep;
    baked.canvas._drawW = w;
    baked.canvas._drawH = capH + baked.sideH;
  }
  if (baked.capCanvas){
    const capTpl = typeof natureAlignTemplateCap === 'function'
      ? natureAlignTemplateCap()
      : null;
    baked.capCanvas._capH = capTpl ? capTpl._capH : baked.canvas._capH;
    baked.capCanvas._stackStepPx = capTpl ? capTpl._stackStepPx : baked.canvas._stackStepPx;
  }
  TERRAIN_BLOCK_BAKED[id] = baked.canvas;
  if (baked.capCanvas) TERRAIN_BLOCK_CAP[id] = baked.capCanvas;
  return true;
}

function tintFlatBlockCanvas(sourceCanvas, tintColor){
  if (!sourceCanvas || !tintColor) return sourceCanvas;
  const out = document.createElement('canvas');
  out.width = sourceCanvas.width;
  out.height = sourceCanvas.height;
  const tctx = out.getContext('2d');
  tctx.drawImage(sourceCanvas, 0, 0);
  tctx.globalCompositeOperation = 'source-atop';
  tctx.fillStyle = tintColor;
  tctx.fillRect(0, 0, out.width, out.height);
  return out;
}

function rebakeBlockFromFlatFaces(blockKey){
  if (typeof bakeTerrainBlockFromFlatFaces !== 'function') return false;
  const { w, h } = typeof terrainBlockIsoSize === 'function'
    ? terrainBlockIsoSize()
    : { w: TILE_W, h: TILE_H };
  let baked = bakeTerrainBlockFromFlatFaces(blockKey, w, h);
  if (!baked) return false;
  baked = alignFlatBakeToNatureTemplate(blockKey, baked);

  const tintSpec = typeof TERRAIN_BLOCK_TINTS === 'object' && TERRAIN_BLOCK_TINTS
    ? TERRAIN_BLOCK_TINTS[blockKey]
    : null;
  if (tintSpec && tintSpec.color){
    const tinted = tintFlatBlockCanvas(baked.canvas, tintSpec.color);
    baked.canvas = tinted;
    if (baked.capCanvas){
      baked.capCanvas = tintFlatBlockCanvas(baked.capCanvas, tintSpec.color);
    }
  }

  applyBakedBlockMetadata(blockKey, baked);
  if (typeof debugInfo === 'function'){
    debugInfo(`Bloc flat bake : ${blockKey} (${baked.canvas.width}x${baked.canvas.height})`);
  }
  return true;
}


function cloneBlockCanvas(src){
  if (!src) return null;
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  copyBlockCanvasMetadata(src, c);
  return c;
}

function natureBlockTemplateKey(){
  if (typeof TERRAIN_BLOCK_NATURE_BAKED === 'object' && TERRAIN_BLOCK_NATURE_BAKED.dirt) return 'dirt';
  if (typeof TERRAIN_BLOCK_NATURE_BAKED === 'object' && TERRAIN_BLOCK_NATURE_BAKED.grass) return 'grass';
  return null;
}

/** Gabarit PNG nature pour alignement hybride (toujours dirt — empilement + falaises). */
function natureAlignTemplateCanvas(){
  if (typeof TERRAIN_BLOCK_NATURE_BAKED === 'object' && TERRAIN_BLOCK_NATURE_BAKED.dirt){
    return TERRAIN_BLOCK_NATURE_BAKED.dirt;
  }
  if (typeof TERRAIN_BLOCK_NATURE_BAKED === 'object' && TERRAIN_BLOCK_NATURE_BAKED.grass){
    return TERRAIN_BLOCK_NATURE_BAKED.grass;
  }
  if (typeof TERRAIN_BLOCK_BAKED === 'object' && TERRAIN_BLOCK_BAKED.dirt){
    return TERRAIN_BLOCK_BAKED.dirt;
  }
  return null;
}

function natureAlignTemplateCap(){
  if (typeof TERRAIN_BLOCK_NATURE_CAP === 'object' && TERRAIN_BLOCK_NATURE_CAP.dirt){
    return TERRAIN_BLOCK_NATURE_CAP.dirt;
  }
  if (typeof TERRAIN_BLOCK_NATURE_CAP === 'object' && TERRAIN_BLOCK_NATURE_CAP.grass){
    return TERRAIN_BLOCK_NATURE_CAP.grass;
  }
  return null;
}

/** Recadre le bake Comfy sur le gabarit PNG nature dirt (même empilement que grass/dirt). */
function alignFlatBakeToNatureTemplate(blockKey, baked){
  const ref = natureAlignTemplateCanvas();
  if (!ref || !baked || !baked.canvas) return baked;

  const aligned = document.createElement('canvas');
  aligned.width = ref.width;
  aligned.height = ref.height;
  const ctx = aligned.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(baked.canvas, 0, 0, aligned.width, aligned.height);
  copyBlockCanvasMetadata(ref, aligned);
  baked.canvas = aligned;

  const capTpl = natureAlignTemplateCap();
  if (baked.capCanvas){
    const cap = document.createElement('canvas');
    cap.width = capTpl ? capTpl.width : ref.width;
    cap.height = capTpl ? capTpl.height : (ref._capH || TILE_H);
    cap.getContext('2d').drawImage(
      baked.capCanvas,
      0, 0, cap.width, cap.height,
    );
    if (capTpl) copyBlockCanvasMetadata(capTpl, cap);
    else {
      cap._capH = ref._capH || TILE_H;
      cap._stackStepPx = ref._stackStepPx || ref._capH || TILE_H;
    }
    baked.capCanvas = cap;
  }

  baked.sideH = ref._sideH || baked.sideH;
  baked.diamondH = ref._capH || baked.diamondH;
  return baked;
}

function copyBlockCanvasMetadata(fromCanvas, toCanvas){
  if (!fromCanvas || !toCanvas) return;
  toCanvas._capH = fromCanvas._capH;
  toCanvas._sideH = fromCanvas._sideH;
  toCanvas._totalH = fromCanvas._totalH;
  toCanvas._capBackOffsetPx = fromCanvas._capBackOffsetPx;
  toCanvas._stackStepPx = fromCanvas._stackStepPx;
  toCanvas._drawW = fromCanvas._drawW;
  toCanvas._drawH = fromCanvas._drawH;
}

function rebakeTintBlockFromFlatFaces(blockKey){
  const spec = typeof TERRAIN_BLOCK_TINTS === 'object' && TERRAIN_BLOCK_TINTS
    ? TERRAIN_BLOCK_TINTS[blockKey]
    : null;
  if (!spec || !spec.base || !TERRAIN_BLOCK_BAKED[spec.base]) return false;
  const tinted = tintFlatBlockCanvas(TERRAIN_BLOCK_BAKED[spec.base], spec.color);
  applyBakedBlockMetadata(blockKey, {
    canvas: tinted,
    capCanvas: TERRAIN_BLOCK_CAP[spec.base]
      ? tintFlatBlockCanvas(TERRAIN_BLOCK_CAP[spec.base], spec.color)
      : null,
    sideH: TERRAIN_BLOCK_BAKED[spec.base]._sideH,
    diamondH: TERRAIN_BLOCK_BAKED[spec.base]._capH,
  });
  return true;
}

function rebakeAllBlocksFromFlatFaces(){
  const keys = new Set(typeof requiredBlockSpriteKeys === 'function'
    ? requiredBlockSpriteKeys()
    : Object.keys(TERRAIN_BLOCK_FACES || {}));
  if (typeof TERRAIN_BLOCK_TINTS === 'object'){
    Object.keys(TERRAIN_BLOCK_TINTS).forEach(k => keys.add(k));
  }

  const faceKeys = [...keys].filter(k => TERRAIN_BLOCK_FACES && TERRAIN_BLOCK_FACES[k]);
  const tintKeys = [...keys].filter(k => TERRAIN_BLOCK_TINTS && TERRAIN_BLOCK_TINTS[k] && !(TERRAIN_BLOCK_FACES && TERRAIN_BLOCK_FACES[k]));

  let ok = 0;
  faceKeys.forEach(k => { if (rebakeBlockFromFlatFaces(k)) ok++; });
  tintKeys.forEach(k => { if (rebakeTintBlockFromFlatFaces(k)) ok++; });

  if (typeof bumpTerrainVersion === 'function') bumpTerrainVersion();
  if (typeof render === 'function') render();
  return ok > 0;
}

function rebakeHybridFlatBlocks(){
  const keys = hybridFlatBlockKeys();
  if (!keys.length) return false;
  // dirt en premier : gabarit partagé par les autres blocs hybrides
  const order = ['dirt', 'stone', 'sand', 'grass', 'forest'];
  const sorted = [...keys].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  let ok = 0;
  sorted.forEach(k => {
    if (!(TERRAIN_BLOCK_FACES && TERRAIN_BLOCK_FACES[k])) return;
    if (rebakeBlockFromFlatFaces(k)) ok++;
  });
  if (typeof TERRAIN_BLOCK_TINTS === 'object'){
    Object.keys(TERRAIN_BLOCK_TINTS).forEach(k => {
      const base = TERRAIN_BLOCK_TINTS[k] && TERRAIN_BLOCK_TINTS[k].base;
      if (base && keys.includes(base) && rebakeTintBlockFromFlatFaces(k)) ok++;
    });
  }
  if (ok > 0){
    if (typeof bumpTerrainVersion === 'function') bumpTerrainVersion();
    if (typeof render === 'function') render();
  }
  return ok > 0;
}

/** Attend que le gabarit nature (dirt/grass) soit prêt avant d'appliquer Comfy. */
function initHybridFlatBlockTextures(){
  if (!usesHybridFlatBlocks()) return false;
  const paths = flatTexturePaths();
  let natureWait = 0;

  function tryApplyFlat(){
    const ref = TERRAIN_BLOCK_NATURE_BAKED.dirt || TERRAIN_BLOCK_NATURE_BAKED.grass
      || TERRAIN_BLOCK_BAKED.dirt || TERRAIN_BLOCK_BAKED.grass;
    if (!ref || !ref._drawW){
      natureWait++;
      if (natureWait < 120){
        setTimeout(tryApplyFlat, 50);
        return;
      }
      if (typeof debugWarn === 'function'){
        debugWarn('Gabarit nature absent — flat hybride sans alignement');
      }
    }
    loadFlatFaceImages(paths, ok => {
      if (!ok){
        if (typeof debugWarn === 'function'){
          debugWarn('Textures flat hybrides absentes — repli PNG nature pour ces blocs');
        }
        return;
      }
      rebakeHybridFlatBlocks();
    });
  }

  tryApplyFlat();
  return true;
}

function loadFlatFaceImages(paths, onDone){
  const names = Object.keys(paths);
  if (!names.length){
    if (typeof onDone === 'function') onDone(false);
    return false;
  }
  let loaded = 0;
  let anyOk = false;

  function checkAll(){
    if (loaded < names.length) return;
    if (typeof onDone === 'function') onDone(anyOk);
  }

  names.forEach(name => {
    if (TERRAIN_FLAT_IMAGES[name] && TERRAIN_FLAT_IMAGES[name].complete && TERRAIN_FLAT_IMAGES[name].naturalWidth){
      anyOk = true;
      loaded++;
      checkAll();
      return;
    }
    const img = new Image();
    img.onload = () => {
      TERRAIN_FLAT_IMAGES[name] = img;
      anyOk = true;
      if (typeof debugInfo === 'function') debugInfo(`Face plate : ${paths[name]}`);
      loaded++;
      checkAll();
    };
    img.onerror = () => {
      if (typeof debugWarn === 'function') debugWarn(`Face plate introuvable : ${paths[name]}`);
      loaded++;
      checkAll();
    };
    img.src = paths[name];
  });
  return true;
}

function initFlatFaceTextures(onReady){
  if (!usesFlatBlockFaces()) return false;
  const paths = flatTexturePaths();
  const names = Object.keys(paths);
  if (!names.length){
    if (typeof debugWarn === 'function') debugWarn('TERRAIN_BLOCK_FACES vide — textures plates désactivées');
    return false;
  }

  return loadFlatFaceImages(paths, ok => {
    if (!ok){
      if (typeof debugWarn === 'function') debugWarn('Aucune texture plate — repli PNG iso');
      if (typeof initTerrainIsoBlockSprites === 'function') initTerrainIsoBlockSprites();
      return;
    }
    rebakeAllBlocksFromFlatFaces();
    if (typeof onReady === 'function') onReady();
  });
}
