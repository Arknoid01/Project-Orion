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

// Matériaux Three.js par terrain (initialisés après chargement de THREE)
window._terrainMats  = {};

let _threeRaycaster = null;
let _threeNdc       = null;
let _threeProjVec   = null;

const THREE_ZOOM_BASE = 16; // _threeZoom à zoomLevel === ZOOM_DEFAULT
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
  rock:   3,
  marble: 2,
};

const TERRAIN_TOP_COLOR = {
  water:  0x3a86c8,
  sand:   0xd4b870,
  grass:  0x5aaa38,
  wheat:  0xd4a830,
  hill:   0x6ab048,
  forest: 0x2a7a1a,
  rock:   0x8a8070,
  marble: 0xddd8c8,
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
  return [side,side,top,bot,side,side].map(t=>new THREE.MeshLambertMaterial({map:t}));
}

/** Matériaux cube style Minecraft : face du dessus + côtés (textures carrées tileables). */
function makeCubeMatsFromTextures(THREE, topTex, sideTex){
  const side = sideTex || topTex;
  const bot  = sideTex || topTex;
  const mk = (tex)=> tex
    ? new THREE.MeshLambertMaterial({
      map: tex,
      transparent: false,
      opacity: 1,
      alphaTest: 0,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
    })
    : new THREE.MeshLambertMaterial({ color: 0x888888 });
  return [mk(side), mk(side), mk(topTex || side), mk(bot), mk(side), mk(side)];
}

const THREE_TERRAIN_TEX_BASE = 'assets/tiles/generated_mediterranean/';
const THREE_TERRAIN_TEX_DEFS = {
  grass:  { top: 'grass.png',  side: 'dirt.png' },
  hill:   { top: 'grass.png',  side: 'dirt.png' },
  wheat:  { top: 'wheat.png',  side: 'dirt.png' },
  forest: { top: 'forest.png', side: 'dirt.png' },
  sand:   { top: 'sand.png',   side: 'sand.png' },
  rock:   { top: 'rock.png',   side: 'rock.png' },
  marble: { top: 'marble.png', side: 'marble.png' },
  water:  { top: 'water.png',  side: 'water.png' },
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
    // Vérifie que l'image n'est pas transparente (canvas tainted = pixels à 0)
    const sample = ctx.getImageData(w>>1, h>>1, 1, 1).data;
    if (sample[3] < 10){
      // Canal alpha nul = image transparente ou tainted → refill couleur
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, 0, w, h);
    }
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
  const terrain = grid[row][col].terrain || 'grass';
  return _terrainLayerCount(terrain) - 1;
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

/** Quad écran de la face supérieure d'une case (4 coins projetés). */
window.getTileScreenQuad = function(col, row){
  const y = window.getTerrainSurfaceY(col, row);
  const w = window.gridToWorld3(col, row, y);
  const h = 0.5;
  return [
    worldToScreen(w.x - h, y, w.z - h),
    worldToScreen(w.x + h, y, w.z - h),
    worldToScreen(w.x + h, y, w.z + h),
    worldToScreen(w.x - h, y, w.z + h),
  ];
};

/** Sommets iso projetés (détection min/max — indépendante de l'ordre du quad). */
window.getTileScreenDiamond = function(col, row){
  const q = window.getTileScreenQuad(col, row);
  return {
    north: q.reduce(function(a, b){ return a.y < b.y ? a : b; }),
    south: q.reduce(function(a, b){ return a.y > b.y ? a : b; }),
    east:  q.reduce(function(a, b){ return a.x > b.x ? a : b; }),
    west:  q.reduce(function(a, b){ return a.x < b.x ? a : b; }),
  };
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
};

/** Position écran d'un walker (interpolation grille → centre face supérieure). */
window.getWalkerWorld3ScreenPos = function(walker, now){
  if (!walker || !Array.isArray(walker.path) || !walker.path.length){
    const c = walker?.col ?? 0, r = walker?.row ?? 0;
    const w = gridToWorld3Anchor(c, r);
    return worldToScreen(w.x, w.y, w.z);
  }
  const i = Number.isFinite(walker.pathIndex)
    ? Math.min(Math.max(0, walker.pathIndex), walker.path.length - 1) : 0;
  const tile = walker.path[i];
  if (!tile || walker.path.length <= 1){
    const w = gridToWorld3Anchor(tile?.col ?? walker.col ?? 0, tile?.row ?? walker.row ?? 0);
    return worldToScreen(w.x, w.y, w.z);
  }
  const j = i + (walker.direction || 1);
  const fromTile = (j >= 0 && j < walker.path.length) ? walker.path[i] : walker.path[Math.max(0, i - 1)];
  const toTile   = (j >= 0 && j < walker.path.length) ? walker.path[j] : walker.path[i];
  if (!fromTile || !toTile){
    const w = gridToWorld3Anchor(tile.col, tile.row);
    return worldToScreen(w.x, w.y, w.z);
  }
  const elapsed = now - (typeof lastTickTimestamp !== 'undefined' ? lastTickTimestamp : 0);
  const tickMs  = typeof TICK_DURATION_MS !== 'undefined' ? TICK_DURATION_MS : 1000;
  const t = Math.min(1, Math.max(0, elapsed / tickMs));
  const col = fromTile.col + (toTile.col - fromTile.col) * t;
  const row = fromTile.row + (toTile.row - fromTile.row) * t;
  const yFrom = window.getTerrainSurfaceY(fromTile.col, fromTile.row);
  const yTo   = window.getTerrainSurfaceY(toTile.col, toTile.row);
  const { offC, offR } = window._threeGridOffset;
  return worldToScreen(
    col - offC + 0.5,
    yFrom + (yTo - yFrom) * t,
    row - offR + 0.5,
  );
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
    });
    rnd.setClearColor(0x8ec8e8, 1);
    rnd.domElement.id = 'gameCanvas';
    rnd.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:0;touch-action:none;cursor:pointer;';

    // Remplace le canvas 2D placeholder
    const old = document.getElementById('gameCanvas');
    if(old && old !== rnd.domElement) old.parentElement.replaceChild(rnd.domElement, old);
    else document.getElementById('canvasWrap').appendChild(rnd.domElement);

    window._threeRenderer = rnd;
    _resizeThreeView();

    // Scene — ciel / brume légèrement méditerranéens (soleil égéen)
    const scene = new _THREE.Scene();
    const sky = 0x8ec8e8;
    scene.background = new _THREE.Color(sky);
    scene.fog = new _THREE.Fog(sky, 80, 130);
    window._threeScene = scene;

    // Lumières chaudes
    scene.add(new _THREE.AmbientLight(0xfff4e6, 0.74));
    const sun = new _THREE.DirectionalLight(0xffe8c8, 0.88);
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
  const dpr  = Math.min(window.devicePixelRatio || 1, 1.5);
  window._threeRenderer.setPixelRatio(dpr);
  // updateStyle:false — le CSS (inset:0) fixe la taille à l'écran ; setSize = buffer logique
  window._threeRenderer.setSize(view.width, view.height, false);
  if (window._pixiOverlayApp?.renderer){
    window._pixiOverlayApp.renderer.resize(view.width, view.height);
  }
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

/* ---------------------------------------------------------------
   CONSTRUCTION DU TERRAIN DEPUIS grid[][]
   --------------------------------------------------------------- */
window.buildThreeTerrain = function(){
  if(!_THREE || !Array.isArray(grid) || !grid.length) return;
  if(typeof isTerrainGenerationInProgress==='function' && isTerrainGenerationInProgress()) return;

  const scene = window._threeScene;
  if(window._threeGroup) scene.remove(window._threeGroup);
  window._threeGroup = new _THREE.Group();
  window._terrainPickMeshes = [];
  _syncThreeGridOffset();

  const geo   = new _THREE.BoxGeometry(1,1,1);
  const ROWS  = grid.length;
  const COLS  = grid[0].length;
  const offR  = ROWS / 2;
  const offC  = COLS / 2;

  // Compter les instances par terrain
  const counts = {};
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell = grid[r][c];
      if(!cell) continue;
      const terrain = cell.terrain || 'grass';
      const h = _terrainLayerCount(terrain);
      counts[terrain] = (counts[terrain]||0) + h;
    }
  }

  // InstancedMesh par terrain
  const meshes={}, idx={};
  for(const [key,count] of Object.entries(counts)){
    if(!count) continue;
    const mats = window._terrainMats[key] || window._terrainMats['grass'];
    meshes[key] = new _THREE.InstancedMesh(geo, mats, count);
    meshes[key].instanceMatrix.setUsage(_THREE.StaticDrawUsage);
    meshes[key].userData.pickCells = new Array(count);
    window._threeGroup.add(meshes[key]);
    idx[key] = 0;
  }

  const mat4 = new _THREE.Matrix4();
  const DIRT  = 'grass'; // couches inférieures

  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell = grid[r][c];
      if(!cell) continue;
      const terrain = cell.terrain || 'grass';
      const h = _terrainLayerCount(terrain);
      const x3 = c - offC + 0.5;
      const z3 = r - offR + 0.5;

      for(let y=0;y<h;y++){
        const t = y===h-1 ? terrain : DIRT;
        if(!meshes[t]) continue;
        const inst = idx[t]++;
        mat4.makeTranslation(x3, y-0.5, z3);
        meshes[t].setMatrixAt(inst, mat4);
        if (y === h - 1) meshes[t].userData.pickCells[inst] = { col: c, row: r };
      }
    }
  }

  for(const mesh of Object.values(meshes)){
    mesh.instanceMatrix.needsUpdate = true;
    window._terrainPickMeshes.push(mesh);
  }

  scene.add(window._threeGroup);

  // Centrer la caméra sur le centre des terres
  if(typeof computeLandCentroid==='function'){
    const land = computeLandCentroid();
    if(land){
      window._threeTarget.set(
        Math.round(land.col) - offC,
        0.5,
        Math.round(land.row) - offR
      );
      _updateThreeCam();
    }
  }

  if(typeof buildThreeDecors==='function') buildThreeDecors();
  console.log('[Three] Terrain', COLS+'x'+ROWS, 'généré');
};

/* ---------------------------------------------------------------
   DÉCORS — implémentés dans pixiRenderer.js (buildThreeDecors)
   --------------------------------------------------------------- */
let _lastDecorUpdate=0;
window.repositionDecorsThrottled = function(){
  const now=performance.now();
  if(now-_lastDecorUpdate < 80) return;
  _lastDecorUpdate=now;
  if (typeof window._repositionOverlayDecors === 'function') window._repositionOverlayDecors();
};

/* ---------------------------------------------------------------
   CONTRÔLES PAN (caméra iso fixe, déplacement dans le monde)
   --------------------------------------------------------------- */
function _initThreeControls(){
  const el = window._threeRenderer.domElement;
  let lastT=null, pinch=null;

  function pan(dx,dy){
    const t=window._threeTarget;
    const spd=window._threeZoom*0.012;
    t.x -= (dx*Math.cos(ISO_H) + dy*Math.sin(ISO_H)*0.5) * spd * 0.1;
    t.z -= (-dx*Math.sin(ISO_H)*0.5 + dy*Math.cos(ISO_H)) * spd * 0.1;
    const half=Math.max(grid.length,grid[0]?.length||60)/2;
    t.x=Math.max(-half,Math.min(half,t.x));
    t.z=Math.max(-half,Math.min(half,t.z));
    _updateThreeCam();
    if (typeof markRenderDirty === 'function') markRenderDirty();
  }

  function zoomAt(delta, clientX, clientY){
    const prev = window._threeZoom;
    window._threeZoom = Math.max(4, Math.min(50, prev + delta));
    if (window._threeZoom === prev) return;
    // Ancrer le zoom sur le point sous le curseur
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
  }

  el.addEventListener('touchstart',e=>{
    if(e.touches.length===1) lastT={x:e.touches[0].clientX,y:e.touches[0].clientY};
    if(e.touches.length===2) pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  },{passive:true});

  el.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length===1&&lastT){
      pan(e.touches[0].clientX-lastT.x, e.touches[0].clientY-lastT.y);
      lastT={x:e.touches[0].clientX,y:e.touches[0].clientY};
    }
    if(e.touches.length===2&&pinch){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      const midX=(e.touches[0].clientX+e.touches[1].clientX)/2;
      const midY=(e.touches[0].clientY+e.touches[1].clientY)/2;
      zoomAt((pinch-d)*0.04, midX, midY);
      pinch=d;
    }
  },{passive:false});

  el.addEventListener('touchend',e=>{
    if(e.touches.length<1)lastT=null;
    if(e.touches.length<2)pinch=null;
  });

  let mDown=false,mLast=null;
  el.addEventListener('mousedown',e=>{mDown=true;mLast={x:e.clientX,y:e.clientY};});
  window.addEventListener('mouseup',()=>mDown=false);
  window.addEventListener('mousemove',e=>{
    if(!mDown||!mLast)return;
    pan(e.clientX-mLast.x,e.clientY-mLast.y);
    mLast={x:e.clientX,y:e.clientY};
  });
  el.addEventListener('wheel',e=>{
    e.preventDefault();
    zoomAt(e.deltaY * 0.02, e.clientX, e.clientY);
  },{passive:false});
}

/* ---------------------------------------------------------------
   BOUCLE DE RENDU (appelée depuis loop.js)
   --------------------------------------------------------------- */
window.renderThree = function(now){
  if(!window._threeReady) return;
  window._threeRenderer.render(window._threeScene, window._threeCam);
  window.repositionDecorsThrottled();
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

console.log('[threeRenderer.js] chargé');
