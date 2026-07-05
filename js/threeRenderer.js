/* ===================== THREE.JS RENDERER — OLYMPOS =====================
 * Lit grid[row][col] pour construire le terrain 3D (InstancedMesh).
 * Vue isométrique fixe (45°/35°). Pan via camera.js.
 * Pixi.js gère les décors et entités par-dessus (canvas transparent).
 * ===================================================================== */

// Import Three.js via ES module — chargé dynamiquement pour ne pas bloquer
// le reste des scripts non-module du jeu.
let _THREE = null;

window._threeReady   = false;
window._threeScene   = null;
window._threeRenderer= null;
window._threeCam     = null;
window._threeGroup   = null;
window._decorSprites = [];
window._terrainPickMeshes = [];
window._threeGridOffset   = { offC: 0, offR: 0 };
window._threePadGroup       = null;
window._threePadMeshes      = new Map();

// Matériaux Three.js par terrain (initialisés après chargement de THREE)
window._terrainMats  = {};
window._threeWalkerAtlases = {};   // service → THREE.Texture (spritesheet)
window._threeWalkerFrames  = {};   // service → frames[dirIdx][frameIdx] → THREE.Texture
window._threeWalkerPool    = [];   // { sprite, material, serviceType, dirKey, frameIdx, mirror }
window._threeWalkerGroup   = null;

let _threeRaycaster = null;
let _threeNdc       = null;
let _threeProjVec   = null;

const THREE_ZOOM_BASE = 7.8; // frustum ortho à ZOOM_DEFAULT — vue serrée Zeus (~3 tuiles large)
window.THREE_ZOOM_BASE = THREE_ZOOM_BASE;

/* ---------------------------------------------------------------
   CORRESPONDANCE terrain → hauteur 3D
   --------------------------------------------------------------- */
const TERRAIN_HEIGHT = {
  water:  0,
  sand:   1,
  grass:  1,
  wheat:  1,
  hill:   2,
  forest: 2,
  rock:   2,
  marble: 2,
  building_pad: 1,
};

function _terrainLayerCountForCell(cell){
  if (!cell) return 1;
  if (typeof cell.level === 'number' && cell.level > 0) return cell.level;
  const t = cell.terrain || 'grass';
  return Math.max(1, TERRAIN_HEIGHT[t] || 1);
}

const TERRAIN_TOP_COLOR = {
  water:  0x3a86c8,
  sand:   0xd4b870,
  grass:  0x5aaa38,
  wheat:  0xd4a830,
  hill:   0x6ab048,
  forest: 0x2a7a1a,
  rock:   0x8a8070,
  marble: 0xddd8c8,
  building_pad: 0xe8e4dc,
};

const TERRAIN_SIDE_COLOR = {
  water:  0x2a66a8,
  sand:   0xc4a860,
  grass:  0x7a5230,
  wheat:  0xb89820,
  hill:   0x5a4020,
  forest: 0x1a5a0a,
  rock:   0x6a6050,
  marble: 0xccc8b8,
  building_pad: 0xccc8b8,
};

/* ---------------------------------------------------------------
   TEXTURE PIXEL ART PROCÉDURALE
   --------------------------------------------------------------- */
function makePixelTex(THREE, colorHex, seed){
  const S = 16;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const r=(colorHex>>16&255), g=(colorHex>>8&255), b=(colorHex&255);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0,0,S,S);
  // PRNG déterministe (même motif partout → joints de grille alignés)
  let s = (seed ^ 0x9e3779b9) >>> 0;
  const rng = ()=>{
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for(let i=0;i<40;i++){
    const px=Math.floor(rng()*S/2)*2;
    const py=Math.floor(rng()*S/2)*2;
    const f=rng()>.5?.82:1.18;
    ctx.fillStyle=`rgb(${Math.min(255,r*f|0)},${Math.min(255,g*f|0)},${Math.min(255,b*f|0)})`;
    ctx.fillRect(px,py,2,2);
  }
  const t=new THREE.CanvasTexture(cv);
  t.magFilter=THREE.NearestFilter;
  t.minFilter=THREE.NearestFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function makeCubeMats(THREE, topColor, sideColor){
  const top  = makePixelTex(THREE, topColor, topColor);
  const side = makePixelTex(THREE, sideColor, sideColor + 1);
  const bot  = makePixelTex(THREE, sideColor * 0.6 | 0, sideColor + 2);
  return [side,side,top,bot,side,side].map(t=>new THREE.MeshLambertMaterial({map:t, toneMapped:false, depthWrite:true, depthTest:true}));
}

/** Matériaux cube style Minecraft : face du dessus + côtés (textures carrées tileables). */
function makeCubeMatsFromTextures(THREE, topTex, sideTex, opts){
  const side = sideTex || topTex;
  const bot  = sideTex || topTex;
  const polygonOffset = opts && opts.polygonOffset;
  const mk = (tex)=> tex
    ? new THREE.MeshLambertMaterial({
      map: tex,
      transparent: false,
      opacity: 1,
      alphaTest: 0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
      toneMapped: false,
      polygonOffset: !!polygonOffset,
      polygonOffsetFactor: polygonOffset ? 1 : 0,
      polygonOffsetUnits: polygonOffset ? 1 : 0,
    })
    : new THREE.MeshLambertMaterial({ color: 0x888888, toneMapped: false });
  return [mk(side), mk(side), mk(topTex || side), mk(bot), mk(side), mk(side)];
}

function _terrainMatPair(key, foundation){
  const mats = window._terrainMats[key] || window._terrainMats['grass'];
  if (!Array.isArray(mats)) return [mats, mats];
  if (!foundation) return [mats[0], mats[2]];
  const side = mats[0].clone ? mats[0].clone() : mats[0];
  const top  = mats[2].clone ? mats[2].clone() : mats[2];
  side.polygonOffset = true;
  side.polygonOffsetFactor = 2;
  side.polygonOffsetUnits = 2;
  side.depthWrite = true;
  side.depthTest  = true;
  return [side, top];
}

const THREE_TERRAIN_TEX_BASE = 'assets/tiles/generated_mediterranean/';
const THREE_TERRAIN_TEX_DEFS = {
  grass:  { top: 'grass.png',  side: 'dirt.png' },
  hill:   { top: 'hill.png',   side: 'dirt.png' },
  wheat:  { top: 'wheat.png',  side: 'dirt.png' },
  forest: { top: 'forest.png', side: 'dirt.png' },
  sand:   { top: 'sand.png',   side: 'sand.png' },
  rock:   { top: 'rock.png',   side: 'rock.png' },
  marble: { top: 'marble.png', side: 'marble.png' },
  water:  { top: 'water.png',  side: 'water.png' },
  building_pad: { top: 'building_pad.png', side: 'dirt.png' },
};

/** Aplati une image PNG en texture RGB opaque (fix alpha mobile WebGL). */
function _bakeOpaqueCanvasTexture(THREE, img, fillHex){
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const fill = fillHex != null ? fillHex : 0x5aaa38;
  const r=(fill>>16)&255, g=(fill>>8)&255, b=fill&255;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, w, h);
  try {
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    let needsOpaque = false;
    for (let i = 3; i < data.length; i += 4){
      if (data[i] < 255){
        data[i] = 255;
        needsOpaque = true;
      }
    }
    if (needsOpaque) ctx.putImageData(imageData, 0, 0);
  } catch(e){
    // Canvas tainted → on garde juste la couleur de fond
    console.warn('[Three] Texture tainted, fallback couleur');
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.premultiplyAlpha = false;
  tex.generateMipmaps = false;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function _loadThreeTexture(THREE, path, fillHex){
  return new Promise((resolve)=>{
    const tryLoad = (withCORS) => {
      const img = new Image();
      if (withCORS) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(_bakeOpaqueCanvasTexture(THREE, img, fillHex));
      img.onerror = () => {
        if (withCORS){
          // Retry sans CORS
          tryLoad(false);
        } else {
          console.warn('[Three] Image manquante:', path);
          resolve(null);
        }
      };
      img.src = path;
    };
    tryLoad(true);
  });
}

async function _loadThreeTerrainTextures(THREE){
  for (const [key, paths] of Object.entries(THREE_TERRAIN_TEX_DEFS)){
    const topFill  = TERRAIN_TOP_COLOR[key] || 0x888888;
    const sideFill = TERRAIN_SIDE_COLOR[key] || 0x666666;
    const top  = await _loadThreeTexture(THREE, THREE_TERRAIN_TEX_BASE + paths.top, topFill);
    const side = await _loadThreeTexture(THREE, THREE_TERRAIN_TEX_BASE + paths.side, sideFill);
    if (top){
      window._terrainMats[key] = makeCubeMatsFromTextures(THREE, top, side);
    } else {
      window._terrainMats[key] = makeCubeMats(
        THREE,
        topFill,
        sideFill,
      );
    }
  }
  console.log('[Three] Textures terrain carrées chargées (opaque mobile-safe)');
}

/* ---------------------------------------------------------------
   GRILLE ↔ MONDE 3D (source de vérité pour Pixi + picking)
   --------------------------------------------------------------- */
function _syncThreeGridOffset(){
  const ROWS = Array.isArray(grid) ? grid.length : (typeof GRID_ROWS !== 'undefined' ? GRID_ROWS : 60);
  const COLS = Array.isArray(grid) && grid[0] ? grid[0].length : (typeof GRID_COLS !== 'undefined' ? GRID_COLS : 60);
  window._threeGridOffset.offC = COLS / 2;
  window._threeGridOffset.offR = ROWS / 2;
}

function _terrainLayerCount(terrain){
  return Math.max(1, TERRAIN_HEIGHT[terrain] || 1);
}

/** Y monde de la face supérieure (dernier cube : sommet à y = layerCount - 1). */
window.getTerrainSurfaceY = function(col, row){
  if (typeof inBounds === 'function' && !inBounds(col, row)) return 0;
  const cell = grid[row][col];
  return _terrainLayerCountForCell(cell) - 1;
};

window.gridToWorld3 = function(col, row, yOverride){
  const { offC, offR } = window._threeGridOffset;
  const y = yOverride !== undefined ? yOverride : window.getTerrainSurfaceY(col, row);
  return { x: col - offC + 0.5, y, z: row - offR + 0.5 };
};

// Ancrage = centre géométrique de la face supérieure (aligné sur le picking écran).
window.gridToWorld3Anchor = function(col, row, yOverride){
  return window.gridToWorld3(col, row, yOverride);
};

window.world3ToGrid = function(x, z){
  const { offC, offR } = window._threeGridOffset;
  // Snap au centre de cube (x3 = col - offC + 0.5)
  return {
    col: Math.round(x + offC - 0.5),
    row: Math.round(z + offR - 0.5),
  };
};

/** Projection monde 3D → pixels écran CSS (même caméra que le rendu). */
window.worldToScreen = function(x, y, z){
  if (!_THREE || !window._threeCam) return { x: 0, y: 0 };
  if (!_threeProjVec) _threeProjVec = new _THREE.Vector3();
  _threeProjVec.set(x, y, z);
  _threeProjVec.project(window._threeCam);
  const view = _getThreeView();
  return {
    x: (_threeProjVec.x * 0.5 + 0.5) * view.width,
    y: (-_threeProjVec.y * 0.5 + 0.5) * view.height,
  };
};

window.syncZoomLevelToThree = function(level){
  if (typeof level !== 'number' || !window._threeReady) return;
  const def = typeof ZOOM_DEFAULT !== 'undefined' ? ZOOM_DEFAULT : 0.55;
  window._threeZoom = Math.max(4, Math.min(50, THREE_ZOOM_BASE * def / level));
  _updateThreeCam();
};

window.syncThreeZoomToLevel = function(){
  if (!window._threeReady) return;
  const def = typeof ZOOM_DEFAULT !== 'undefined' ? ZOOM_DEFAULT : 0.55;
  if (typeof zoomLevel !== 'undefined'){
    zoomLevel = Math.max(
      typeof ZOOM_MIN !== 'undefined' ? ZOOM_MIN : 0.2,
      Math.min(typeof ZOOM_MAX !== 'undefined' ? ZOOM_MAX : 1.2, THREE_ZOOM_BASE * def / window._threeZoom),
    );
  }
};

/** Quad écran de la face supérieure d'une case (4 coins projetés). ySink = enfoncement Y monde. */
window.getTileScreenQuad = function(col, row, ySink){
  const y = window.getTerrainSurfaceY(col, row) - (ySink || 0);
  const w = window.gridToWorld3(col, row, y);
  const h = 0.5;
  return [
    worldToScreen(w.x - h, y, w.z - h),
    worldToScreen(w.x + h, y, w.z - h),
    worldToScreen(w.x + h, y, w.z + h),
    worldToScreen(w.x - h, y, w.z + h),
  ];
};

/** px écran → delta Y monde (profondeur dans le sol, pour calage bâtiments). */
window.screenPxToWorldY = function(px, col, row){
  if (!px || !_THREE || !window._threeCam) return 0;
  const y0 = window.getTerrainSurfaceY(col, row);
  const w = window.gridToWorld3(col, row, y0);
  const s0 = window.worldToScreen(w.x, y0, w.z);
  const s1 = window.worldToScreen(w.x, y0 - 0.05, w.z);
  const dy = Math.abs(s1.y - s0.y);
  if (dy < 1e-6) return px * 0.001;
  return px * 0.05 / dy;
};

function _cellHasBuildingPad(cell){
  return !!(cell && (cell.building || cell.monumentPart));
}

/** Milieu d'une arête entre deux sommets projetés. */
function _screenEdgeMid(a, b){
  return { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 };
}

/** Losange écran : milieux des 4 arêtes (pas les coins — évite le décalage bas/latéral). */
function _diamondFromScreenQuad(q){
  const byY = q.slice().sort(function(a, b){ return a.y - b.y; });
  const byX = q.slice().sort(function(a, b){ return a.x - b.x; });
  return {
    north: _screenEdgeMid(byY[0], byY[1]),
    south: _screenEdgeMid(byY[2], byY[3]),
    west:  _screenEdgeMid(byX[0], byX[1]),
    east:  _screenEdgeMid(byX[2], byX[3]),
  };
}

/** Sommets iso projetés (milieux d'arêtes — alignés sur tileEntityFoot 2D). */
window.getTileScreenDiamond = function(col, row, ySink){
  return _diamondFromScreenQuad(window.getTileScreenQuad(col, row, ySink));
};

/** Pied sud du losange projeté (= tileEntityFoot en espace écran). */
window.getTileScreenFoot = function(col, row){
  return window.getTileScreenDiamond(col, row).south;
};

/** Largeur écran du losange + pied sud (pour caler sprites sur la tuile). */
window.getTileScreenSpan = function(col, row){
  const d = window.getTileScreenDiamond(col, row);
  const width = Math.hypot(d.east.x - d.west.x, d.east.y - d.west.y);
  const inset = (typeof BUILDING_SPRITE_W !== 'undefined' && typeof TILE_W !== 'undefined')
    ? BUILDING_SPRITE_W / TILE_W
    : 0.96875;
  return {
    foot: d.south,
    north: d.north,
    width,
    height: d.south.y - d.north.y,
    buildingWidth: width * inset,
  };
};

function _pointInConvexQuad(px, py, quad){
  let sign = 0;
  for (let i = 0; i < 4; i++){
    const a = quad[i];
    const b = quad[(i + 1) % 4];
    const cross = (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
    if (Math.abs(cross) < 1e-4) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

function _raycastRoughCell(clientX, clientY){
  if (!_threeRaycaster) _threeRaycaster = new _THREE.Raycaster();
  if (!_threeNdc) _threeNdc = new _THREE.Vector2();
  const el = window._threeRenderer.domElement;
  const rect = el.getBoundingClientRect();
  _threeNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  _threeNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  window._threeCam.updateMatrixWorld();
  _threeRaycaster.setFromCamera(_threeNdc, window._threeCam);
  const hits = _threeRaycaster.intersectObjects(window._terrainPickMeshes, false);
  for (let i = 0; i < hits.length; i++){
    const h = hits[i];
    const cells = h.object?.userData?.pickCells;
    if (cells && h.instanceId != null && cells[h.instanceId]) return cells[h.instanceId];
  }
  if (!hits.length) return null;
  return world3ToGrid(hits[0].point.x, hits[0].point.z);
}

/** Clic écran → case grille via quad projeté (pixel-perfect avec le rendu Three). */
window.threeRayPick = function(clientX, clientY){
  if (!_THREE || !window._threeCam || !window._threeRenderer || !Array.isArray(grid) || !grid.length){
    return { hit: false, col: -1, row: -1 };
  }

  const view = _getThreeView();
  const lx = clientX - view.left;
  const ly = clientY - view.top;
  if (lx < 0 || ly < 0 || lx > view.width || ly > view.height){
    return { hit: false, col: -1, row: -1 };
  }

  const ROWS = grid.length;
  const COLS = grid[0].length;
  const rough = _raycastRoughCell(clientX, clientY);
  const minC = rough ? Math.max(0, rough.col - 5) : 0;
  const maxC = rough ? Math.min(COLS - 1, rough.col + 5) : COLS - 1;
  const minR = rough ? Math.max(0, rough.row - 5) : 0;
  const maxR = rough ? Math.min(ROWS - 1, rough.row + 5) : ROWS - 1;

  let best = null;
  let bestDepth = -Infinity;
  let bestDist2 = Infinity;

  for (let r = minR; r <= maxR; r++){
    for (let c = minC; c <= maxC; c++){
      if (typeof inBounds === 'function' && !inBounds(c, r)) continue;
      const quad = getTileScreenQuad(c, r);
      if (!_pointInConvexQuad(lx, ly, quad)) continue;
      const depth = c + r + window.getTerrainSurfaceY(c, r) * 0.01;
      const center = worldToScreen(
        gridToWorld3(c, r).x,
        window.getTerrainSurfaceY(c, r),
        gridToWorld3(c, r).z,
      );
      const d2 = (center.x - lx) ** 2 + (center.y - ly) ** 2;
      if (depth > bestDepth || (depth === bestDepth && d2 < bestDist2)){
        bestDepth = depth;
        bestDist2 = d2;
        const w3 = gridToWorld3(c, r);
        best = { col: c, row: r, x: w3.x, y: w3.y, z: w3.z };
      }
    }
  }

  if (!best) return { hit: false, col: -1, row: -1 };
  return { hit: true, ...best, clientX, clientY };
};

/** Interpolation grille → écran (créatures, migrants, militaire…). */
window.getGridAgentScreenPos = function(prevCol, prevRow, col, row, now){
  const tickMs = typeof TICK_DURATION_MS !== 'undefined' ? TICK_DURATION_MS : 1000;
  const elapsed = now - (typeof lastTickTimestamp !== 'undefined' ? lastTickTimestamp : 0);
  const k = Math.min(1, Math.max(0, elapsed / tickMs));
  const c = prevCol + (col - prevCol) * k;
  const r = prevRow + (row - prevRow) * k;
  const yFrom = window.getTerrainSurfaceY(Math.round(prevCol), Math.round(prevRow));
  const yTo   = window.getTerrainSurfaceY(col, row);
  const { offC, offR } = window._threeGridOffset;
  return worldToScreen(
    c - offC + 0.5,
    yFrom + (yTo - yFrom) * k,
    r - offR + 0.5,
  );
};

window.centerThreeOnTile = function(col, row){
  if (!window._threeTarget) return;
  const { offC, offR } = window._threeGridOffset;
  window._threeTarget.set(col - offC, 0.5, row - offR);
  _updateThreeCam();
  if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
};

/** Position monde 3D interpolée d'un walker (sans projection écran). */
window.getWalkerWorld3Pos = function(walker, now){
  const footLift = 0.04;
  if (!walker || !Array.isArray(walker.path) || !walker.path.length){
    const c = walker?.col ?? 0, r = walker?.row ?? 0;
    const w = gridToWorld3Anchor(c, r);
    return { x: w.x, y: w.y + footLift, z: w.z };
  }
  const interp = typeof getWalkerInterp === 'function'
    ? getWalkerInterp(walker, now)
    : null;
  if (!interp || !interp.fromTile || !interp.toTile){
    const w = gridToWorld3Anchor(walker.col ?? interp?.col ?? 0, walker.row ?? interp?.row ?? 0);
    return { x: w.x, y: w.y + footLift, z: w.z };
  }
  const { offC, offR } = window._threeGridOffset;
  const yFrom = window.getTerrainSurfaceY(interp.fromTile.col, interp.fromTile.row);
  const yTo   = window.getTerrainSurfaceY(interp.toTile.col, interp.toTile.row);
  const t = interp.t;
  return {
    x: interp.col - offC + 0.5,
    y: yFrom + (yTo - yFrom) * t + footLift,
    z: interp.row - offR + 0.5,
  };
};

/** Position écran d'un walker (interpolation grille → centre face supérieure). */
window.getWalkerWorld3ScreenPos = function(walker, now){
  const p = window.getWalkerWorld3Pos(walker, now);
  return worldToScreen(p.x, p.y, p.z);
};

const _THREE_WALKER_FRAME_W = 96;
const _THREE_WALKER_FRAME_H = 96;
const _THREE_WALKER_FRAMES  = 3;
const _THREE_WALKER_DIRS    = 4;
// Ordre RÉEL des lignes de la planche : 0=dos(up) · 1=gauche · 2=droite · 3=face(down)
const _THREE_WALKER_DIR_ROW = (typeof WALKER_DIRECTION_ROWS !== 'undefined')
  ? WALKER_DIRECTION_ROWS
  : { up: 0, left: 1, right: 2, down: 3 };

function _threeWalkerFrameTexture(THREE, atlas, frameCol, frameRow){
  const tex = atlas.clone();
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1 / _THREE_WALKER_FRAMES, 1 / _THREE_WALKER_DIRS);
  tex.offset.set(frameCol / _THREE_WALKER_FRAMES, 1 - (frameRow + 1) / _THREE_WALKER_DIRS);
  tex.needsUpdate = true;
  return tex;
}

async function _loadThreeWalkerTextures(THREE){
  const paths = typeof SERVICE_WALKER_SPRITES !== 'undefined' ? SERVICE_WALKER_SPRITES : {};
  const loader = new THREE.TextureLoader();
  await Promise.all(Object.entries(paths).map(([service, path]) => new Promise((resolve) => {
    loader.load(path, (atlas) => {
      atlas.magFilter = THREE.NearestFilter;
      atlas.minFilter = THREE.NearestFilter;
      atlas.colorSpace = THREE.SRGBColorSpace;
      window._threeWalkerAtlases[service] = atlas;
      const frames = [];
      for (let d = 0; d < _THREE_WALKER_DIRS; d++){
        const row = [];
        for (let f = 0; f < _THREE_WALKER_FRAMES; f++){
          row.push(_threeWalkerFrameTexture(THREE, atlas, f, d));
        }
        frames.push(row);
      }
      window._threeWalkerFrames[service] = frames;
      resolve();
    }, undefined, () => resolve());
  })));
}

function _threeWalkerWorldScale(){
  const size = typeof WALKER_DISPLAY_SIZE !== 'undefined' ? WALKER_DISPLAY_SIZE : 30;
  const base = typeof THREE_ZOOM_BASE !== 'undefined' ? THREE_ZOOM_BASE : 16;
  const zoom = window._threeZoom || base;
  return (size / 96) * (base / zoom) * 0.95;
}

/** Walkers en sprites Three.js (1 seul contexte WebGL, pas de couche Pixi). */
window.syncThreeWalkers = function(now){
  if (!_THREE || !window._threeReady || !window._threeScene) return;
  if (!window._threeWalkerGroup){
    window._threeWalkerGroup = new _THREE.Group();
    window._threeWalkerGroup.name = 'walkers';
    window._threeScene.add(window._threeWalkerGroup);
  }
  const list = (typeof walkers !== 'undefined' && Array.isArray(walkers)) ? walkers : [];
  const pool = window._threeWalkerPool;
  const frameMs = typeof WALKER_ANIM_FRAME_MS !== 'undefined' ? WALKER_ANIM_FRAME_MS : 200;
  const frameIdxBase = Math.floor(now / frameMs);
  const worldH = _threeWalkerWorldScale();

  while (pool.length < list.length){
    const material = new _THREE.SpriteMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new _THREE.Sprite(material);
    sprite.center.set(0.5, 0.08);
    sprite.renderOrder = 10;
    window._threeWalkerGroup.add(sprite);
    pool.push({ sprite, material, serviceType: null, dirKey: '', frameIdx: -1, mirror: false });
  }

  let active = 0;
  for (let i = 0; i < list.length; i++){
    const w = list[i];
    if (!w || !w.path || w.path.length <= 1) continue;

    const entry = pool[active++];
    const pos = window.getWalkerWorld3Pos(w, now);
    entry.sprite.position.set(pos.x, pos.y, pos.z);
    entry.sprite.visible = true;

    const iso = typeof getAgentIsoFacing === 'function' ? getAgentIsoFacing(w) : null;
    const dirKey = iso ? iso.facing : (w.facing || 'left');
    const mirror = iso ? iso.mirrorX : !!w.mirrorX;
    const service = w.serviceType;
    const anim = window._threeWalkerFrames[service];
    const dirIdx = anim ? (_THREE_WALKER_DIR_ROW[dirKey] ?? _THREE_WALKER_DIR_ROW.down ?? 2) : 0;
    const frameIdx = anim ? (frameIdxBase % (anim[dirIdx]?.length || 1)) : 0;
    const frameTex = anim?.[dirIdx]?.[frameIdx] || null;

    if (frameTex && (entry.serviceType !== service || entry.dirKey !== dirKey
        || entry.frameIdx !== frameIdx || entry.mirror !== mirror)){
      entry.material.map = frameTex;
      entry.material.needsUpdate = true;
      entry.serviceType = service;
      entry.dirKey = dirKey;
      entry.frameIdx = frameIdx;
      entry.mirror = mirror;
    } else if (frameTex && entry.material.map !== frameTex){
      entry.material.map = frameTex;
      entry.material.needsUpdate = true;
      entry.frameIdx = frameIdx;
    }

    const sx = mirror ? -worldH : worldH;
    entry.sprite.scale.set(sx, worldH, 1);
  }

  for (let i = active; i < pool.length; i++){
    pool[i].sprite.visible = false;
  }
};

/* ---------------------------------------------------------------
   INIT THREE.JS
   --------------------------------------------------------------- */
window.initThreeRenderer = async function(){
  try {
    const mod = await import('./three.module.min.js');
    _THREE = mod;

    // Renderer WebGL
    const rnd = new _THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
      logarithmicDepthBuffer: true,
      stencil: false,
      depth: true,
    });
    rnd.sortObjects = true;
    rnd.setClearColor(0x9ed4f0, 1);
    rnd.domElement.id = 'gameCanvas';
    rnd.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;touch-action:none;cursor:pointer;';

    // Remplace le canvas 2D placeholder
    const old = document.getElementById('gameCanvas');
    if(old && old !== rnd.domElement) old.parentElement.replaceChild(rnd.domElement, old);
    else document.getElementById('canvasWrap').appendChild(rnd.domElement);

    window._threeRenderer = rnd;

    _resizeThreeView();

    // Scene — ciel clair, brume légère
    const scene = new _THREE.Scene();
    const sky = 0x9ed4f0;
    scene.background = new _THREE.Color(sky);
    scene.fog = new _THREE.Fog(sky, 85, 135);
    window._threeScene = scene;

    // Lumière du jour — chaleur légère (complète le preset mediterraneanDay)
    scene.add(new _THREE.AmbientLight(0xf0f8ff, 0.80));
    const sun = new _THREE.DirectionalLight(0xfff4e0, 0.94);
    sun.position.set(8, 16, 6);
    scene.add(sun);

    // Caméra orthographique ISO fixe
    const cam = new _THREE.OrthographicCamera(-1,1,1,-1,-200,200);
    window._threeCam = cam;
    window._threeTarget = new _THREE.Vector3(0,0,0);
    window._threeZoom = THREE_ZOOM_BASE;
    if (typeof zoomLevel !== 'undefined') syncZoomLevelToThree(zoomLevel);
    _updateThreeCam();

    // Matériaux par terrain (fallback procédural → remplacés par PNG carrés si dispo)
    for(const [key] of Object.entries(TERRAIN_HEIGHT)){
      window._terrainMats[key] = makeCubeMats(_THREE, TERRAIN_TOP_COLOR[key]||0x888888, TERRAIN_SIDE_COLOR[key]||0x666666);
    }
    await _loadThreeTerrainTextures(_THREE);
    await _loadThreeWalkerTextures(_THREE);

    // Listeners resize (+ visualViewport mobile)
    const onViewResize = ()=>{
      _resizeThreeView();
      _updateThreeCam();
      if (typeof markRenderDirty === 'function') markRenderDirty();
    };
    window.addEventListener('resize', onViewResize);
    if (window.visualViewport){
      window.visualViewport.addEventListener('resize', onViewResize);
      window.visualViewport.addEventListener('scroll', onViewResize);
    }
    requestAnimationFrame(onViewResize);

    // Listeners caméra (pan tactile + souris)
    _initThreeControls();

    window._threeReady = true;
    _syncThreeGridOffset();
    if (Array.isArray(grid) && grid.length) window.buildThreeTerrain();
    console.log('[Three] OK — WebGL', rnd.capabilities.isWebGL2 ? '2' : '1');
    return true;
  } catch(e){
    console.error('[Three] init:', e);
    return false;
  }
};

/* ---------------------------------------------------------------
   CAMÉRA ISO FIXE
   --------------------------------------------------------------- */
const ISO_H = Math.PI / 4;
const ISO_V = Math.atan(1 / Math.sqrt(2));

/** Taille CSS réelle du canvas Three (source unique pour caméra, raycast, Pixi). */
function _getThreeView(){
  const el = window._threeRenderer?.domElement || document.getElementById('gameCanvas');
  if (el){
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0){
      return { width: r.width, height: r.height, left: r.left, top: r.top };
    }
  }
  return { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
}

function _resizeThreeView(){
  if (!window._threeRenderer) return;
  const view = _getThreeView();
  const dpr  = (typeof getRenderDpr === 'function')
    ? getRenderDpr()
    : Math.min(window.devicePixelRatio || 1, 1.5);
  window._threeRenderer.setPixelRatio(dpr);
  // updateStyle:false — le CSS (inset:0) fixe la taille à l'écran ; setSize = buffer logique
  window._threeRenderer.setSize(view.width, view.height, false);
  if (window._pixiOverlayApp?.renderer){
    window._pixiOverlayApp.renderer.resolution = dpr;
    window._pixiOverlayApp.renderer.resize(view.width, view.height);
  }
  if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
}

function _updateThreeCam(){
  if(!window._threeCam) return;
  const z = window._threeZoom;
  const view = _getThreeView();
  const a = view.width / view.height;
  const cam = window._threeCam;
  cam.left=-z*a/2; cam.right=z*a/2; cam.top=z/2; cam.bottom=-z/2;
  cam.updateProjectionMatrix();
  const d=60, t=window._threeTarget||new _THREE.Vector3();
  cam.position.set(
    t.x + d*Math.cos(ISO_V)*Math.sin(ISO_H),
    t.y + d*Math.sin(ISO_V),
    t.z + d*Math.cos(ISO_V)*Math.cos(ISO_H)
  );
  cam.lookAt(t);
  cam.updateMatrixWorld();
}

/** Rectangle grille approximatif visible (culling décors avant projection coûteuse). */
window.getThreeVisibleGridRect = function(padTiles){
  const t = window._threeTarget;
  const z = window._threeZoom || 16;
  if (!t || !window._threeGridOffset) return null;
  const view = _getThreeView();
  const a = view.width / Math.max(view.height, 1);
  const pad = padTiles || 2;
  const halfX = (z * a / 2) * 1.2 + pad;
  const halfZ = (z / 2) * 1.2 + pad;
  const { offC, offR } = window._threeGridOffset;
  return {
    minCol: Math.floor(t.x - halfX + offC),
    maxCol: Math.ceil(t.x + halfX + offC),
    minRow: Math.floor(t.z - halfZ + offR),
    maxRow: Math.ceil(t.z + halfZ + offR),
  };
};

/* ---------------------------------------------------------------
   CONSTRUCTION DU TERRAIN — Niveau 1+2 optimisé
   • Face culling géométrique : seules les faces exposées sont créées
   • BufferGeometry fusionné par terrain : 1 draw call par type
   • Pas d'ombres, frustumCulled=false
   --------------------------------------------------------------- */

/**
 * Couches solides du voisin pour le culling latéral.
 * L'eau compte comme solide seulement face à d'autres cases d'eau (sinon berges visibles).
 */
function _neighborSolidLayers(grid, ROWS, COLS, nc, nr, viewerTerrain){
  if(nc<0||nc>=COLS||nr<0||nr>=ROWS) return 0;
  const cell = grid[nr] && grid[nr][nc];
  if(!cell) return 0;
  if(cell.terrain === 'water') return viewerTerrain === 'water' ? 1 : 0;
  return _terrainLayerCountForCell(cell);
}

/**
 * Détermine si une face de cube à (c, r, y) est entièrement occluse.
 * face : 'top','bottom','north','south','east','west'
 */
function _isFaceHidden(grid, ROWS, COLS, c, r, y, face, viewerTerrain){
  if(face==='bottom') return true;

  const cell = grid[r] && grid[r][c];
  const h = _terrainLayerCountForCell(cell);

  if(face==='top') return y + 1 < h; // autre couche dans la même colonne

  let nc=c, nr=r;
  if(face==='north')      nr=r-1; // -Z
  else if(face==='south') nr=r+1; // +Z
  else if(face==='east')  nc=c+1; // +X
  else if(face==='west')  nc=c-1; // -X

  const nH = _neighborSolidLayers(grid, ROWS, COLS, nc, nr, viewerTerrain);
  return y < nH; // voisin a un bloc à cette hauteur
}

/**
 * Construit un BufferGeometry avec uniquement les faces visibles.
 * Chaque face = 2 triangles = 6 vertices.
 * UV mappés pour utiliser la texture complète sur chaque face.
 */
function _buildMergedGeometry(THREE, facesData){
  const positions = [];
  const normals   = [];
  const uvs       = [];
  const idxTop    = []; // indices pour la face du dessus (mat index 2)
  const idxSide   = []; // indices pour les faces latérales (mat index 0)

  const faceVerts = {
    top:   [[-.5,+.5,-.5],[+.5,+.5,-.5],[+.5,+.5,+.5],[-.5,+.5,+.5]],
    north: [[+.5,+.5,-.5],[-.5,+.5,-.5],[-.5,-.5,-.5],[+.5,-.5,-.5]],
    south: [[-.5,+.5,+.5],[+.5,+.5,+.5],[+.5,-.5,+.5],[-.5,-.5,+.5]],
    east:  [[+.5,+.5,+.5],[+.5,+.5,-.5],[+.5,-.5,-.5],[+.5,-.5,+.5]],
    west:  [[-.5,+.5,-.5],[-.5,+.5,+.5],[-.5,-.5,+.5],[-.5,-.5,-.5]],
  };
  const faceNormals = {
    top:[0,1,0], north:[0,0,-1], south:[0,0,1], east:[1,0,0], west:[-1,0,0]
  };
  const faceUVs = [[0,1],[1,1],[1,0],[0,0]];

  let vi = 0;
  for(const {x,y,z,face,layer} of facesData){
    const verts = faceVerts[face];
    const n = faceNormals[face];
    // Légère poussée vers l'extérieur — évite z-fighting sur la couche de fond (y=0)
    const layerBias = (layer != null && layer > 0) ? layer * 0.00015 : 0;
    const faceBias  = face === 'top' ? 0.0004 : 0.0008;
    const bias = layerBias + faceBias;
    for(let i=0;i<4;i++){
      positions.push(
        x + verts[i][0] + n[0] * bias,
        y + verts[i][1] + n[1] * bias,
        z + verts[i][2] + n[2] * bias,
      );
      normals.push(n[0],n[1],n[2]);
      uvs.push(faceUVs[i][0], faceUVs[i][1]);
    }
    const arr = face==='top' ? idxTop : idxSide;
    // CCW vus de l'extérieur (FrontSide) — ordre inverse vs BoxGeometry par défaut
    arr.push(vi,vi+2,vi+1, vi,vi+3,vi+2);
    vi+=4;
  }

  if(vi===0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs,2));

  // Groupe 0 = faces latérales (mat[0]=side), Groupe 1 = face du dessus (mat[2]=top)
  const allIdx = [...idxSide, ...idxTop];
  geo.setIndex(allIdx);
  geo.addGroup(0, idxSide.length, 0); // side material
  geo.addGroup(idxSide.length, idxTop.length, 1); // top material
  return geo;
}

window.buildThreeTerrain = function(opts){
  if(!_THREE || !Array.isArray(grid) || !grid.length) return;
  if(typeof isTerrainGenerationInProgress==='function' && isTerrainGenerationInProgress()) return;

  const scene = window._threeScene;
  if(window._threeGroup) scene.remove(window._threeGroup);
  window._threeGroup = new _THREE.Group();
  window._terrainPickMeshes = [];
  _syncThreeGridOffset();

  const ROWS  = grid.length;
  const COLS  = grid[0].length;
  const offR  = ROWS / 2;
  const offC  = COLS / 2;
  const DIRT  = 'grass';

  // --- Collecter les faces visibles par terrain (surface vs couche de fond) ---
  const facesPerTerrain = {};      // sommet de pile
  const facesFoundation = {};      // y < h-1 — couche dirt (souvent y=0)
  const FACES = ['top','north','south','east','west']; // bas toujours caché

  let totalFaces = 0, totalHidden = 0;

  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell = grid[r][c];
      if(!cell) continue;
      const terrain = cell.terrain || 'grass';
      const h = _terrainLayerCountForCell(cell);
      const x3 = c - offC + 0.5;
      const z3 = r - offR + 0.5;

      for(let y=0;y<h;y++){
        const topKey = terrain;
        const t = y === h - 1 ? topKey : DIRT;
        const yPos = y - 0.5;

        for(const face of FACES){
          totalFaces++;
          if(_isFaceHidden(grid, ROWS, COLS, c, r, y, face, t)){
            totalHidden++;
            continue;
          }
          if(!facesPerTerrain[t]) facesPerTerrain[t] = [];
          if(!facesFoundation[t]) facesFoundation[t] = [];
          const bucket = y === h - 1 ? facesPerTerrain : facesFoundation;
          bucket[t].push({x:x3, y:yPos, z:z3, face, layer:y});
        }
      }
    }
  }

  function _addTerrainMesh(faces, key, foundation){
    if(!faces || !faces.length) return;
    const geo = _buildMergedGeometry(_THREE, faces);
    if(!geo) return;
    const matArr = _terrainMatPair(key, foundation);
    const mesh = new _THREE.Mesh(geo, matArr);
    mesh.frustumCulled = false;
    mesh.castShadow    = false;
    mesh.receiveShadow = false;
    mesh.renderOrder   = foundation ? 0 : 1;
    mesh.userData.terrainKey = key;
    mesh.userData.foundation = foundation;
    window._threeGroup.add(mesh);
    window._terrainPickMeshes.push(mesh);
  }

  // --- Fondations (couche 1 / dirt) puis surface ---
  for(const [key, faces] of Object.entries(facesFoundation)){
    _addTerrainMesh(faces, key, true);
  }
  for(const [key, faces] of Object.entries(facesPerTerrain)){
    _addTerrainMesh(faces, key, false);
  }

  scene.add(window._threeGroup);

  const pct = totalFaces > 0 ? Math.round((1-totalHidden/totalFaces)*100) : 100;
  console.log(`[Three] Terrain ${COLS}×${ROWS} — ${totalFaces-totalHidden}/${totalFaces} faces (${pct}% visibles, ${100-pct}% culled)`);

  if (typeof computeLandCentroid === 'function'){
    const land = computeLandCentroid();
    if (land){
      window._threeTarget.set(
        Math.round(land.col) - offC, 0.5, Math.round(land.row) - offR
      );
      _updateThreeCam();
    }
  }

  if (!opts?.skipDecors && typeof buildThreeDecors === 'function') buildThreeDecors();
  if (typeof syncThreeBuildingPads === 'function') syncThreeBuildingPads();
};

/** Dalle marbre incrémentale (1 mesh par case bâtiment — pas de rebuild terrain complet). */
function _makeBuildingPadMesh(col, row){
  const cell = grid[row] && grid[row][col];
  if (!cell || !_cellHasBuildingPad(cell)) return null;
  const ROWS = grid.length;
  const COLS = grid[0].length;
  const offR = ROWS / 2;
  const offC = COLS / 2;
  const terrain = cell.terrain || 'grass';
  const h = _terrainLayerCountForCell(cell);
  const x3 = col - offC + 0.5;
  const z3 = row - offR + 0.5;
  const yPos = (h - 1) - 0.5 + 0.002;
  const geo = _buildMergedGeometry(_THREE, [{ x: x3, y: yPos, z: z3, face: 'top', layer: h - 1 }]);
  if (!geo) return null;
  const matArr = _terrainMatPair('building_pad', false);
  matArr.forEach(function(m){
    if (!m) return;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  });
  const mesh = new _THREE.Mesh(geo, matArr);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.userData.padCol = col;
  mesh.userData.padRow = row;
  return mesh;
}

function _removeBuildingPadMesh(col, row){
  const k = col + ',' + row;
  const mesh = window._threePadMeshes.get(k);
  if (!mesh) return;
  if (window._threePadGroup) window._threePadGroup.remove(mesh);
  if (mesh.geometry) mesh.geometry.dispose();
  window._threePadMeshes.delete(k);
}

/** Met à jour les dalles sous bâtiments. cells = [{col,row},…] ou omit = resync complet. */
window.syncThreeBuildingPads = function(cells){
  if (!_THREE || !window._threeReady) return;
  if (!window._threePadGroup){
    window._threePadGroup = new _THREE.Group();
    window._threePadGroup.name = 'buildingPads';
    window._threeScene.add(window._threePadGroup);
  }

  const updateCell = function(col, row){
    _removeBuildingPadMesh(col, row);
    const mesh = _makeBuildingPadMesh(col, row);
    if (mesh){
      window._threePadGroup.add(mesh);
      window._threePadMeshes.set(col + ',' + row, mesh);
    }
  };

  if (cells && cells.length){
    cells.forEach(function(t){ updateCell(t.col, t.row); });
  } else {
    window._threePadMeshes.forEach(function(m){
      window._threePadGroup.remove(m);
      if (m.geometry) m.geometry.dispose();
    });
    window._threePadMeshes.clear();
    for (let r = 0; r < grid.length; r++){
      for (let c = 0; c < grid[0].length; c++){
        if (_cellHasBuildingPad(grid[r][c])) updateCell(c, r);
      }
    }
  }
  if (typeof markRenderDirty === 'function') markRenderDirty();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();
};

/** Alias — accepte cells optionnel pour patch incrémental. */
window.refreshThreeBuildingPads = function(cells){
  syncThreeBuildingPads(cells);
};

/* ---------------------------------------------------------------
   DÉCORS — implémentés dans pixiRenderer.js (buildThreeDecors)
   --------------------------------------------------------------- */

/* ---------------------------------------------------------------
   CONTRÔLES PAN (caméra iso fixe, déplacement dans le monde)
   --------------------------------------------------------------- */
function _initThreeControls(){
  const el = window._threeRenderer.domElement;
  let lastT=null;
  const zoomLocked = typeof ZOOM_LOCKED !== 'undefined' && ZOOM_LOCKED;

  function pan(dx,dy){
    const t=window._threeTarget;
    const panRef = typeof THREE_ZOOM_BASE !== 'undefined' ? THREE_ZOOM_BASE : 16;
    const spd=window._threeZoom*0.012*(16/panRef);
    t.x -= (dx*Math.cos(ISO_H) + dy*Math.sin(ISO_H)*0.5) * spd * 0.1;
    t.z -= (-dx*Math.sin(ISO_H)*0.5 + dy*Math.cos(ISO_H)) * spd * 0.1;
    const half=Math.max(grid.length,grid[0]?.length||60)/2;
    t.x=Math.max(-half,Math.min(half,t.x));
    t.z=Math.max(-half,Math.min(half,t.z));
    _updateThreeCam();
    if (typeof markRenderDirty === 'function') markRenderDirty();
    if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
  }

  el.addEventListener('touchstart',e=>{
    if(e.touches.length===1) lastT={x:e.touches[0].clientX,y:e.touches[0].clientY};
  },{passive:true});

  el.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length===1&&lastT){
      pan(e.touches[0].clientX-lastT.x, e.touches[0].clientY-lastT.y);
      lastT={x:e.touches[0].clientX,y:e.touches[0].clientY};
    }
  },{passive:false});

  el.addEventListener('touchend',e=>{
    if(e.touches.length<1)lastT=null;
  });

  let mDown=false,mLast=null;
  el.addEventListener('mousedown',e=>{mDown=true;mLast={x:e.clientX,y:e.clientY};});
  window.addEventListener('mouseup',()=>mDown=false);
  window.addEventListener('mousemove',e=>{
    if(!mDown||!mLast)return;
    pan(e.clientX-mLast.x,e.clientY-mLast.y);
    mLast={x:e.clientX,y:e.clientY};
  });
  if (!zoomLocked){
    let pinch=null;
    function zoomAt(delta, clientX, clientY){
      const prev = window._threeZoom;
      window._threeZoom = Math.max(4, Math.min(50, prev + delta));
      if (window._threeZoom === prev) return;
      if (clientX != null && typeof threeRayPick === 'function'){
        const before = threeRayPick(clientX, clientY);
        _updateThreeCam();
        syncThreeZoomToLevel();
        if (before.hit){
          const after = worldToScreen(before.x, before.y, before.z);
          const t = window._threeTarget;
          const spd = (window._threeZoom - prev) * 0.004;
          t.x += (clientX - after.x) * spd * 0.08;
          t.z += (clientY - after.y) * spd * 0.08;
          _updateThreeCam();
        }
      } else {
        _updateThreeCam();
        syncThreeZoomToLevel();
      }
      if (typeof markRenderDirty === 'function') markRenderDirty();
      if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
    }
    el.addEventListener('touchstart',e=>{
      if(e.touches.length===2) pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    },{passive:true});
    el.addEventListener('touchmove',e=>{
      if(e.touches.length===2&&pinch){
        const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
        const midX=(e.touches[0].clientX+e.touches[1].clientX)/2;
        const midY=(e.touches[0].clientY+e.touches[1].clientY)/2;
        zoomAt((pinch-d)*0.04, midX, midY);
        pinch=d;
      }
    },{passive:false});
    el.addEventListener('touchend',e=>{
      if(e.touches.length<2) pinch=null;
    });
    el.addEventListener('wheel',e=>{
      e.preventDefault();
      zoomAt(e.deltaY * 0.02, e.clientX, e.clientY);
    },{passive:false});
  }
}

/* ---------------------------------------------------------------
   BOUCLE DE RENDU (appelée depuis loop.js)
   --------------------------------------------------------------- */
window.renderThree = function(now){
  if(!window._threeReady) return;
  // Walkers en overlay Pixi (au-dessus des routes) — pas en sprites Three.js.
  if (!window._pixiOverlayApp && typeof syncThreeWalkers === 'function'){
    const list = (typeof walkers !== 'undefined' && Array.isArray(walkers)) ? walkers : [];
    if (list.some(w => w.path && w.path.length > 1)) syncThreeWalkers(now);
  } else if (window._threeWalkerGroup){
    window._threeWalkerGroup.visible = false;
  }
  window._threeRenderer.render(window._threeScene, window._threeCam);
  if (typeof renderPixiOverlay === 'function') renderPixiOverlay(now);
};

window.isThreeReady = function(){ return !!window._threeReady; };
window.getThreeView = _getThreeView;

/** Alias pour mapView.js — retourne coords compatibles fallback 2D + pick grille. */
window.clientToMapWorldThree = function(clientX, clientY){
  const pick = threeRayPick(clientX, clientY);
  if (!pick.hit) return { mx: 0, my: 0, hit: false };
  return { mx: pick.x, my: pick.z, col: pick.col, row: pick.row, hit: true, ...pick };
};

/* ---------------------------------------------------------------
   INVALIDATION (appelée quand le terrain change)
   --------------------------------------------------------------- */
window.invalidateThreeTerrain = function(){
  if(window._threeReady) window.buildThreeTerrain();
};

window.invalidateThreeTerrainCells = function(cells){
  if (!window._threeReady || !cells || !cells.length) return;
  if (typeof syncThreeBuildingPads === 'function') syncThreeBuildingPads(cells);
};

console.log('[threeRenderer.js] chargé');
