/* ===================== PIXI.JS RENDERER — MOTEUR UNIQUE =====================
 * Terrain + décors + bâtiments + walkers : tout en Pixi WebGL.
 * Zéro Canvas2D pendant le jeu. La logique de jeu (grid, walkers...) inchangée.
 * =========================================================================== */

/* --- State global --- */
window._pixiApp          = null;
window._terrainContainer = null;   // tuiles de sol (rebake au scroll)
window._decorContainer   = null;   // décors statiques (arbres, blé...) baked
window._buildingContainer= null;   // bâtiments (mis à jour si pose/démolition)
window._walkerContainer  = null;   // walkers (mis à jour chaque frame)
window._uiContainer      = null;   // sélection, hover

window._terrainTextures  = {};
window._buildingTextures = {};
window._walkerTextures   = {};     // id → PIXI.Texture[][]  [direction][frame]
window._characterTextures = {};    // id → { frames, dirRow } (monstres, héros, migrants, dieux)
window._pixiImageTextures = new Map(); // HTMLImageElement → PIXI.Texture (décors nature)
window._decorSprites     = [];     // { gfx, col, row, targetW, imgW, footNx, footNy, lift }
window._beautySprites    = [];     // { gfx, col, row, alpha }

window._terrainDirty     = true;
window._buildingDirty    = true;
window._roadsDirty       = true;
window._houseIconsDirty  = true;
window._overlayBuildingEntries = [];
window._overlayRoadEntries     = [];
window._walkerSpritePool       = [];
window._walkerGfxPool          = [];
window._walkerPoolFrameSkip    = 0;
window._agentCharPool          = [];
window._agentGfxPool           = [];
window._agentTextPool          = [];
window._houseIconPool          = [];
window._houseIconEntries       = [];
window._decorBeautyTick        = 0;
window._overlayCamKey = '';
window._uiOverlayLastKey = '';
window._overlayNeedsRender = true;
window._uiQuadPool = [];

window.markOverlayCameraDirty = function(){
  window._overlayCamKey = '';
};
window.markOverlayDirty = function(){
  window._overlayNeedsRender = true;
};

function _pixiOverlayDpr(){
  return (typeof getRenderDpr === 'function')
    ? getRenderDpr()
    : Math.min(window.devicePixelRatio || 1, 1.5);
}

function _overlayCameraKey(){
  const t = window._threeTarget;
  const z = window._threeZoom || 0;
  if (!t) return '0|0|' + z + '|' + window.innerWidth + '|' + window.innerHeight;
  return t.x.toFixed(2) + '|' + t.z.toFixed(2) + '|' + z.toFixed(3)
    + '|' + window.innerWidth + '|' + window.innerHeight;
}

function _overlayCameraMoved(){
  const key = _overlayCameraKey();
  if (key === window._overlayCamKey) return false;
  window._overlayCamKey = key;
  return true;
}

function _uiOverlayStateKey(){
  if (typeof hoverTile === 'undefined' || !hoverTile) return '';
  const parts = [hoverTile.col, hoverTile.row];
  if (typeof selectedBuilding !== 'undefined') parts.push(selectedBuilding || '');
  if (typeof roadMode !== 'undefined') parts.push(roadMode ? 'r' : '');
  if (typeof demolishMode !== 'undefined') parts.push(demolishMode ? 'd' : '');
  if (typeof blockMode !== 'undefined') parts.push(blockMode ? 'b' : '');
  if (typeof stairsMode !== 'undefined') parts.push(stairsMode ? 's' : '');
  if (typeof zonePlacementStart !== 'undefined' && zonePlacementStart){
    parts.push('z', zonePlacementStart.col, zonePlacementStart.row);
  }
  return parts.join('|');
}

window._pixiBakeR =  1e9; window._pixiBakeB =  1e9;
window._pixiBakeZoom = -1; window._pixiBakeVer = -1;

/* =========================================================
   INIT
   ========================================================= */
window.initPixiRenderer = async function(){
  if (!window.PIXI){ console.warn('[Pixi] non disponible'); return false; }
  try {
    const old = document.getElementById('gameCanvas');
    if (!old) return false;
    const parent = old.parentElement;

    const app = new PIXI.Application();
    await app.init({
      width: window.innerWidth, height: window.innerHeight,
      backgroundColor: 0x0b2134,
      antialias: false,
      resolution: _pixiOverlayDpr(),
      autoDensity: true,
    });
    app.canvas.id = 'gameCanvas';
    app.canvas.style.cssText = 'position:absolute;inset:0;touch-action:none;cursor:pointer;';
    parent.replaceChild(app.canvas, old);

    window._pixiApp           = app;
    window._terrainContainer  = new PIXI.Container();
    window._decorContainer    = new PIXI.Container();
    window._buildingContainer = new PIXI.Container();
    window._walkerContainer   = new PIXI.Container();
    window._uiContainer       = new PIXI.Container();

    app.stage.addChild(window._terrainContainer);
    app.stage.addChild(window._decorContainer);
    app.stage.addChild(window._buildingContainer);
    app.stage.addChild(window._walkerContainer);
    app.stage.addChild(window._uiContainer);

    await window._pixiLoadTextures();

    window.addEventListener('resize', function(){
      app.renderer.resize(window.innerWidth, window.innerHeight);
      window._terrainDirty = true;
    });

    if (typeof initCamera === 'function') initCamera();
    if (typeof initZoom   === 'function') initZoom();
    // Réattacher les listeners clic/hover sur le nouveau canvas Pixi
    if (typeof initCanvasListeners === 'function') initCanvasListeners();

    console.log('[Pixi] OK —', app.renderer.type === 1 ? 'WebGL' : 'Canvas fallback');
    return true;
  } catch(e){ console.error('[Pixi] init:', e); return false; }
};

window.isPixiReady       = function(){ return !!window._pixiApp; };
window.isPixiOverlayReady = function(){ return !!window._pixiOverlayApp; };
window.invalidatePixiTerrain  = function(){ window._terrainDirty = true; };
window.invalidatePixiBuildings = function(){
  window._buildingDirty = true;
  window._roadsDirty = true;
  window._houseIconsDirty = true;
  if (typeof markOverlayDirty === 'function') markOverlayDirty();
  if (typeof invalidateCityMap === 'function') invalidateCityMap();
};
window.invalidatePixiRoads = function(){ window._roadsDirty = true; if (typeof markOverlayDirty === 'function') markOverlayDirty(); };
window.markHouseIconsDirty = function(){ window._houseIconsDirty = true; };

/** Canvas Pixi transparent par-dessus Three.js (bâtiments, walkers, UI). */
window.initPixiOverlay = async function(){
  if (!window.PIXI){ console.warn('[Pixi overlay] PIXI absent'); return false; }
  if (window._pixiOverlayApp) return true;
  try {
    const view = (typeof getThreeView === 'function')
      ? getThreeView()
      : { width: window.innerWidth, height: window.innerHeight };

    const cv = document.createElement('canvas');
    cv.id = 'pixiOverlayCanvas';
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;touch-action:none;';
    document.getElementById('canvasWrap').appendChild(cv);

    const app = new PIXI.Application();
    await app.init({
      canvas: cv,
      width: view.width,
      height: view.height,
      backgroundAlpha: 0,
      antialias: false,
      resolution: _pixiOverlayDpr(),
      autoDensity: true,
    });

    window._pixiOverlayApp      = app;
    window._pixiDecorApp        = app; // compat threeRenderer.buildThreeDecors
    window._overlayDecorContainer    = new PIXI.Container();
    window._overlayBeautyContainer   = new PIXI.Container();
    window._overlayRoadContainer     = new PIXI.Container();
    window._overlayBuildingContainer = new PIXI.Container();
    window._overlayWalkerContainer   = new PIXI.Container();
    window._overlayHouseIconContainer = new PIXI.Container();
    window._overlayAgentContainer    = new PIXI.Container();
    window._overlayUiContainer       = new PIXI.Container();
    window._overlayGradeContainer    = new PIXI.Container();

    app.stage.addChild(window._overlayDecorContainer);
    app.stage.addChild(window._overlayBeautyContainer);
    app.stage.addChild(window._overlayRoadContainer);
    app.stage.addChild(window._overlayBuildingContainer);
    app.stage.addChild(window._overlayWalkerContainer);
    app.stage.addChild(window._overlayHouseIconContainer);
    app.stage.addChild(window._overlayAgentContainer);
    app.stage.addChild(window._overlayUiContainer);
    app.stage.addChild(window._overlayGradeContainer);

    await window._pixiLoadTextures();
    app.ticker.stop();

    window.addEventListener('resize', () => {
      app.renderer.resize(window.innerWidth, window.innerHeight);
      window._buildingDirty = true;
      if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
      if (typeof markRenderDirty === 'function') markRenderDirty();
    });

    console.log('[Pixi overlay] OK');
    return true;
  } catch(e){
    console.error('[Pixi overlay] init:', e);
    return false;
  }
};

/** Échelle sprite écran selon le zoom Three.js. */
function _pixiThreeScale(basePx){
  const z = window._threeZoom || 16;
  const base = typeof THREE_ZOOM_BASE !== 'undefined' ? THREE_ZOOM_BASE : 16;
  return basePx * (base / z);
}

/** Place un display object à partir d'une case grille via projection Three. */
function _pixiAtGrid(col, row, display, footOffsetPx){
  if (typeof gridToWorld3Anchor !== 'function' || typeof worldToScreen !== 'function') return false;
  const w = gridToWorld3Anchor(col, row);
  const s = worldToScreen(w.x, w.y, w.z);
  display.x = s.x;
  display.y = s.y + (footOffsetPx || 0);
  return true;
}

function _pixiAtWorld3(w, display, footOffsetPx){
  if (typeof worldToScreen !== 'function') return false;
  const s = worldToScreen(w.x, w.y, w.z);
  display.x = s.x;
  display.y = s.y + (footOffsetPx || 0);
  return true;
}

function _pixiDrawTileQuad(container, col, row, fill, stroke, fillAlpha, strokeAlpha){
  if (typeof getTileScreenQuad !== 'function') return;
  const q = getTileScreenQuad(col, row);
  const g = new PIXI.Graphics();
  g.poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y]);
  if (fill != null) g.fill({ color: fill, alpha: fillAlpha != null ? fillAlpha : 0.4 });
  if (stroke != null) g.stroke({ color: stroke, alpha: strokeAlpha != null ? strokeAlpha : 0.55, width: 1.5 });
  container.addChild(g);
}

function _pixiDrawTileQuadPooled(container, col, row, fill, stroke, fillAlpha, strokeAlpha, pool){
  if (typeof getTileScreenQuad !== 'function') return;
  const q = getTileScreenQuad(col, row);
  const gPool = pool || window._uiQuadPool;
  const g = _pixiPoolAcquire(gPool, container, function(){ return new PIXI.Graphics(); });
  g.clear();
  g.poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y]);
  if (fill != null) g.fill({ color: fill, alpha: fillAlpha != null ? fillAlpha : 0.4 });
  if (stroke != null) g.stroke({ color: stroke, alpha: strokeAlpha != null ? strokeAlpha : 0.55, width: 1.5 });
}

/** Texture mappée sur le quad écran de la face supérieure (aligné sur le losange Three). */
function _pixiCreateTileQuadTextureMesh(col, row, texture, alpha){
  if (!texture || typeof getTileScreenQuad !== 'function' || !PIXI.MeshGeometry) return null;
  const q = getTileScreenQuad(col, row);
  const geometry = new PIXI.MeshGeometry({
    positions: new Float32Array([
      q[0].x, q[0].y,
      q[1].x, q[1].y,
      q[2].x, q[2].y,
      q[3].x, q[3].y,
    ]),
    uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  });
  const mesh = new PIXI.Mesh({ geometry, texture });
  mesh.alpha = alpha != null ? alpha : 1;
  return mesh;
}

function _pixiUpdateTileQuadMesh(mesh, col, row){
  if (!mesh || typeof getTileScreenQuad !== 'function') return;
  const q = getTileScreenQuad(col, row);
  const geo = mesh.geometry;
  const buf = geo.getBuffer ? geo.getBuffer('aPosition') : geo.getAttribute?.('aPosition');
  if (!buf || !buf.data) return;
  const p = buf.data;
  p[0]=q[0].x; p[1]=q[0].y;
  p[2]=q[1].x; p[3]=q[1].y;
  p[4]=q[2].x; p[5]=q[2].y;
  p[6]=q[3].x; p[7]=q[3].y;
  buf.update();
}

function _pixiDrawTileQuadTexture(container, col, row, texture, alpha){
  const mesh = _pixiCreateTileQuadTextureMesh(col, row, texture, alpha);
  if (mesh) container.addChild(mesh);
}

function _pixiPoolAcquire(pool, container, factory){
  const idx = pool._active || 0;
  if (idx < pool.length){
    const obj = pool[idx];
    obj.visible = true;
    if (obj.parent !== container) container.addChild(obj);
    pool._active = idx + 1;
    return obj;
  }
  const obj = factory();
  pool.push(obj);
  container.addChild(obj);
  pool._active = idx + 1;
  return obj;
}

function _pixiPoolRelease(pool){
  const n = pool._active || 0;
  for (let i = n; i < pool.length; i++) pool[i].visible = false;
  pool._active = 0;
}

function _pixiHouseTexKey(houseLevel){
  if (typeof houseSpriteKeyForLevel === 'function') return houseSpriteKeyForLevel(houseLevel || 0);
  const lvl = (typeof HOUSE_LEVELS !== 'undefined' && HOUSE_LEVELS[houseLevel || 0])
    ? HOUSE_LEVELS[houseLevel || 0] : null;
  return lvl ? lvl.key : 'hut';
}

function _pixiResolveBuildingImage(texKey, type, houseLevel){
  if (typeof window.HOUSE_SPRITE_IMAGES !== 'undefined' && texKey.startsWith('house_')){
    const key = (typeof houseLevel === 'number' && typeof houseSpriteKeyForLevel === 'function')
      ? houseSpriteKeyForLevel(houseLevel)
      : texKey.slice(6);
    return window.HOUSE_SPRITE_IMAGES[key] || null;
  }
  if (typeof window.BUILDING_SPRITE_IMAGES !== 'undefined'){
    return window.BUILDING_SPRITE_IMAGES[type] || null;
  }
  return null;
}

function _pixiApplyTileScreenPlacement(display, placement){
  if (!placement) return;
  display.anchor.set(placement.footNx, placement.footNy);
  display.scale.set(placement.scale);
  display.x = placement.x;
  display.y = placement.y;
}

function _pixiMonumentScreenPlacement(anchorCol, anchorRow, size, img, def){
  let sx = 0, sy = 0, tileScreenW = 0, n = 0;
  for (let r = anchorRow; r < anchorRow + size; r++){
    for (let c = anchorCol; c < anchorCol + size; c++){
      if (typeof inBounds === 'function' && !inBounds(c, r)) continue;
      const d = typeof getTileScreenDiamond === 'function'
        ? getTileScreenDiamond(c, r)
        : null;
      if (!d) continue;
      sx += d.south.x;
      sy += d.south.y;
      tileScreenW += Math.hypot(d.east.x - d.west.x, d.east.y - d.west.y);
      n++;
    }
  }
  if (!n) return null;
  const pxScale = (tileScreenW / n) / (typeof TILE_W !== 'undefined' ? TILE_W : 128);
  const logicalW = typeof buildingDrawWidthForDef === 'function'
    ? buildingDrawWidthForDef(def || { isMonument: true, footprint: size }, img)
    : (typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : 124) * size * 0.95;
  const srcW = (img && (img.naturalWidth || img.width)) || 62;
  const m = (img && typeof measureSpriteFoot === 'function') ? measureSpriteFoot(img) : null;
  let x = sx / n;
  let y = sy / n;
  const northPx = typeof BUILDING_GRID_NORTH_PX === 'number' ? BUILDING_GRID_NORTH_PX : 0;
  if (northPx && typeof getTileScreenDiamond === 'function'){
    const d = getTileScreenDiamond(anchorCol, anchorRow);
    const cx = (d.east.x + d.west.x) * 0.5;
    const ax = d.north.x - cx;
    const ay = d.north.y - d.south.y;
    const len = Math.hypot(ax, ay);
    if (len > 1e-6){
      x += ax * northPx / len;
      y += ay * northPx / len;
    }
  }
  return {
    x,
    y,
    scale: (logicalW * pxScale) / srcW,
    footNx: m ? m.footNx : 0.5,
    footNy: m ? m.footNy : 1,
  };
}

function _pixiMonumentScreenCenter(anchorCol, anchorRow, size){
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (let r = anchorRow; r < anchorRow + size; r++){
    for (let c = anchorCol; c < anchorCol + size; c++){
      if (typeof inBounds === 'function' && !inBounds(c, r)) continue;
      const w = gridToWorld3Anchor(c, r);
      sx += w.x; sy += w.y; sz += w.z; n++;
    }
  }
  if (!n) return gridToWorld3Anchor(anchorCol, anchorRow);
  return { x: sx / n, y: sy / n, z: sz / n };
}

/* =========================================================
   CHARGEMENT TEXTURES
   ========================================================= */
window._pixiLoadTextures = async function(){
  // Terrain
  const TERRAIN_PATHS = {
    grass:'assets/textures/flat/game/grass_top.png',
    wheat:'assets/textures/flat/game/sand_top.png',
    forest:'assets/textures/flat/game/forest_top.png',
    hill:'assets/tiles/generated_mediterranean/hill.png',
    sand:'assets/textures/flat/game/sand.png',
    rock:'assets/textures/flat/game/stone.png',
    marble:'assets/textures/flat/game/stone.png',
    dirt:'assets/textures/flat/game/dirt.png',
  };
  await Promise.all(Object.entries(TERRAIN_PATHS).map(async ([t,p]) => {
    try { window._terrainTextures[t] = await PIXI.Assets.load(p); } catch{}
  }));

  // Bâtiments
  if (typeof BUILDING_DEFS !== 'undefined'){
    await Promise.all(Object.keys(BUILDING_DEFS).map(async (type) => {
      const def = BUILDING_DEFS[type];
      const path = (def && def.sprite)
        || (typeof resolveBuildingSpritePath === 'function' ? resolveBuildingSpritePath(type) : null);
      if (!path) return;
      try { window._buildingTextures[type] = await PIXI.Assets.load(path); } catch{}
    }));
  }

  // Maisons
  if (typeof HOUSE_LEVELS !== 'undefined'){
    await Promise.all(HOUSE_LEVELS.map(async (lvl) => {
      const path = lvl.sprite || `assets/houses/${lvl.key}.png`;
      if (!lvl.sprite && !lvl.key) return;
      try { window._buildingTextures['house_' + lvl.key] = await PIXI.Assets.load(path); } catch{}
    }));
  }

  // Walkers (spritesheets 288×384, 3 frames × 4 directions, 96×96/frame)
  // Ordre RÉEL des lignes de la planche : 0=dos(up) · 1=gauche · 2=droite · 3=face(down)
  const FRAME_W = 96, FRAME_H = 96, FRAMES = 3, DIRS = 4;
  const DIR_ROW = { up:0, left:1, right:2, down:3 };

  const walkerPaths = typeof SERVICE_WALKER_SPRITES !== 'undefined' ? SERVICE_WALKER_SPRITES : {};
  await Promise.all(Object.entries(walkerPaths).map(async ([service, path]) => {
    try {
      const base = await PIXI.Assets.load(path);
      const frames = [];
      for (let d = 0; d < DIRS; d++){
        const row = [];
        for (let f = 0; f < FRAMES; f++){
          row.push(new PIXI.Texture({
            source: base.source,
            frame: new PIXI.Rectangle(f * FRAME_W, d * FRAME_H, FRAME_W, FRAME_H),
          }));
        }
        frames.push(row);
      }
      window._walkerTextures['walker_' + service] = { frames, dirRow: DIR_ROW };
    } catch{}
  }));

  if (typeof ROAD_SPRITE_PATH === 'string'){
    try { window._roadTexture = await PIXI.Assets.load(ROAD_SPRITE_PATH); } catch{}
  }

  // Sprites personnages (monstres, héros, migrants, dieux)
  await _pixiLoadCharacterSheets();

  console.log('[Pixi] Textures chargées');
};

const _PIXI_CHAR_FRAME = typeof CHARACTER_FRAME_SIZE !== 'undefined' ? CHARACTER_FRAME_SIZE : 96;
const _PIXI_CHAR_FRAMES = typeof CHARACTER_FRAMES !== 'undefined' ? CHARACTER_FRAMES : 3;

async function _pixiLoadCharacterSheet(id, path){
  if (!path || window._characterTextures[id]) return;
  try {
    const base = await PIXI.Assets.load(path);
    const dirRow = typeof CHARACTER_DIRECTION_ROWS !== 'undefined'
      ? CHARACTER_DIRECTION_ROWS
      : { up: 0, left: 1, down: 2, right: 3 };
    const frames = [];
    const maxRow = Math.max(...Object.values(dirRow), 3);
    for (let d = 0; d <= maxRow; d++){
      const row = [];
      for (let f = 0; f < _PIXI_CHAR_FRAMES; f++){
        row.push(new PIXI.Texture({
          source: base.source,
          frame: new PIXI.Rectangle(f * _PIXI_CHAR_FRAME, d * _PIXI_CHAR_FRAME, _PIXI_CHAR_FRAME, _PIXI_CHAR_FRAME),
        }));
      }
      frames.push(row);
    }
    window._characterTextures[id] = { frames, dirRow };
  } catch{}
}

async function _pixiLoadCharacterSheets(){
  if (typeof MONSTER_TYPES !== 'undefined'){
    await Promise.all(MONSTER_TYPES.map((t)=> _pixiLoadCharacterSheet('monster_' + t.key, t.sprite)));
  }
  if (typeof HERO_TYPES !== 'undefined'){
    await Promise.all(HERO_TYPES.map((t)=> _pixiLoadCharacterSheet('hero_' + t.key, t.sprite)));
  }
  if (typeof MIGRANT_SPRITE_PATH !== 'undefined'){
    await _pixiLoadCharacterSheet('migrant', MIGRANT_SPRITE_PATH);
  }
  if (typeof GOD_SPRITES !== 'undefined'){
    await Promise.all(Object.entries(GOD_SPRITES).map(([key, path])=> _pixiLoadCharacterSheet('god_' + key, path)));
  }
  if (typeof MILITARY_SOLDIER_SPRITES !== 'undefined'){
    await Promise.all(Object.entries(MILITARY_SOLDIER_SPRITES).map(([side, path])=> _pixiLoadCharacterSheet('soldier_' + side, path)));
  }
}

function _pixiTextureFromImage(img){
  if (!img || !img.complete || !img.naturalWidth) return null;
  let tex = window._pixiImageTextures.get(img);
  if (!tex){
    tex = PIXI.Texture.from(img);
    window._pixiImageTextures.set(img, tex);
  }
  return tex;
}

/* =========================================================
   TERRAIN (WebGL Graphics, culling viewport)
   ========================================================= */
const _PIXI_TERRAIN_COLORS = {
  grass:0x7db648, wheat:0xc9a83c, forest:0x4a8a3a,
  hill:0x9ab870, sand:0xd4b870, water:0x3a86c8,
  rock:0x8a8070, marble:0xddd8c8,
};

window._buildTerrain = function(bakeL, bakeT, bakeR, bakeB){
  window._terrainContainer.removeChildren();
  window._decorContainer.removeChildren();

  const drawOrder = typeof getMapDrawOrder === 'function' ? getMapDrawOrder() : [];
  const elevStep  = typeof TILE_H !== 'undefined' ? Math.round(TILE_H * 0.19) : 12;
  let count = 0;

  drawOrder.forEach(function(item){
    const col = item.col, row = item.row;
    const cell = grid[row] && grid[row][col];
    if (!cell) return;

    const cx = OFFSET_X + (col - row) * (TILE_W / 2);
    const cy = OFFSET_Y + (col + row) * (TILE_H / 2);
    if (cx + TILE_W < bakeL || cx - TILE_W > bakeR) return;
    if (cy + TILE_H < bakeT - TILE_H*3 || cy > bakeB + TILE_H) return;

    const elev = cell.terrain === 'water' ? 0 : Math.max(0, ((cell.level||1)-1)) * elevStep;
    const ty   = cy - elev;
    const hw   = TILE_W/2 + 1, hh = TILE_H/2 + 0.5;

    const g = new PIXI.Graphics();

    // Falaise
    if (elev > 0){
      g.poly([cx-hw,ty+hh, cx,ty+TILE_H+1, cx+hw,ty+hh, cx+hw,cy+hh, cx,cy+TILE_H+1, cx-hw,cy+hh]);
      g.fill({color:0x000000, alpha:0.28});
    }

    // Surface
    const tex = window._terrainTextures[cell.terrain];
    const pts = [cx,ty, cx+hw,ty+hh, cx,ty+TILE_H+1, cx-hw,ty+hh];
    if (tex){
      // Pixi v8 : on utilise le pattern sans matrix pour éviter les incompatibilités
      g.poly(pts);
      g.fill({ texture: tex });
    } else {
      g.poly(pts); g.fill({color: _PIXI_TERRAIN_COLORS[cell.terrain]||0x888888});
    }

    window._terrainContainer.addChild(g);

    // Décors statiques baked ici (arbres, blé, buissons) → PIXI.Sprite
    window._addDecorSprite(col, row, cell, cx, cy);

    count++;
  });

  console.log('[Pixi] Terrain+décors:', count, 'tuiles');
};

/* =========================================================
   DÉCORS STATIQUES (sprites Pixi dans decorContainer)
   ========================================================= */
window._addDecorSprite = function(col, row, cell, cx, cy){
  // Blé sur les cases blé
  if (cell.terrain === 'wheat' && typeof cellShowsWheatCrop === 'function' && cellShowsWheatCrop(cell, col, row)){
    const tex = window._terrainTextures['_wheat_decor'] || null;
    // Fallback : petit rectangle jaune
    const g = new PIXI.Graphics();
    g.rect(cx - 16, cy - 20, 32, 24);
    g.fill({color: 0xd4a017, alpha: 0.9});
    window._decorContainer.addChild(g);
  }
  // Arbres sur les cases forêt
  if (cell.terrain === 'forest' && typeof cellShowsForestTree === 'function' && cellShowsForestTree(cell, col, row)){
    const g = new PIXI.Graphics();
    g.circle(cx, cy - TILE_H * 0.8, TILE_H * 0.55);
    g.fill({color: 0x2d6a2d});
    g.circle(cx, cy - TILE_H * 0.8, TILE_H * 0.45);
    g.fill({color: 0x3a8a3a});
    window._decorContainer.addChild(g);
  }
};

/* =========================================================
   BÂTIMENTS
   ========================================================= */
window._buildBuildings = function(visible, overlay){
  const container = overlay ? window._overlayBuildingContainer : window._buildingContainer;
  if (!container) return;
  container.removeChildren();
  if (overlay) window._overlayBuildingEntries = [];

  visible.forEach(function(item){
    const col = item.col, row = item.row;
    const cell = grid[row] && grid[row][col];
    if (!cell || !cell.building) return;

    const type = cell.building;
    const def  = (typeof BUILDING_DEFS !== 'undefined') ? BUILDING_DEFS[type] : null;

    if (cell.monumentPart){
      if (typeof monumentAnchorAt !== 'function') return;
      const anchor = monumentAnchorAt(col, row);
      if (!anchor || anchor.col !== col || anchor.row !== row) return;
    }

    const isHouse = type === 'maison' || (def && def.isHouse);
    const houseKey = isHouse ? _pixiHouseTexKey(cell.houseLevel) : null;
    const texKey = isHouse ? ('house_' + houseKey) : type;
    const tex = window._buildingTextures[texKey]
      || (isHouse ? window._buildingTextures['house_' + _pixiHouseTexKey(cell.houseLevel)] : null)
      || window._buildingTextures[type];

    if (overlay && typeof isThreeReady === 'function' && isThreeReady()){
      const img = _pixiResolveBuildingImage(texKey, type, isHouse ? cell.houseLevel : undefined);
      if (tex){
        const spr = new PIXI.Sprite(tex);
        container.addChild(spr);
        window._overlayBuildingEntries.push({
          spr, col, row, texKey, type, def, img, houseLevel: isHouse ? cell.houseLevel : undefined,
          isMonument: !!(def && def.isMonument),
        });
      } else if (def){
        const g = new PIXI.Graphics();
        container.addChild(g);
        window._overlayBuildingEntries.push({
          spr: g, col, row, texKey, type, def, img: null, isMonument: !!(def && def.isMonument), fallback: true,
        });
      }
      return;
    }

    const north = typeof tileCenter === 'function' ? tileCenter(col, row) : null;
    const foot = typeof tileEntityFoot === 'function' ? tileEntityFoot(col, row) : north;
    if (!foot) return;

    if (tex){
      const spr = new PIXI.Sprite(tex);
      const img = _pixiResolveBuildingImage(texKey, type, isHouse ? cell.houseLevel : undefined);
      const drawW = typeof buildingDrawWidthForDef === 'function'
        ? buildingDrawWidthForDef(def || {}, img)
        : (typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : TILE_W - 4);
      const m = (img && typeof measureSpriteFoot === 'function') ? measureSpriteFoot(img) : null;
      spr.anchor.set(m ? m.footNx : 0.5, m ? m.footNy : 1);
      spr.scale.set(drawW / (tex.width || img?.naturalWidth || 62));
      spr.x = north ? north.x : foot.x;
      spr.y = foot.y;
      container.addChild(spr);
    } else {
      const g = new PIXI.Graphics();
      g.rect(foot.x - TILE_W*0.3, foot.y - TILE_H*1.2, TILE_W*0.6, TILE_H*1.2);
      g.fill({color:0x8b6914});
      container.addChild(g);
    }
  });

  window._buildingDirty = false;
};

/** Repositionne les bâtiments overlay (caméra / zoom) sans recréer les sprites. */
window._repositionOverlayBuildings = function(){
  if (!window._overlayBuildingEntries || !window._overlayBuildingEntries.length) return;
  window._overlayBuildingEntries.forEach(function(e){
    if (e.fallback && e.def){
      const span = typeof getTileScreenSpan === 'function' ? getTileScreenSpan(e.col, e.row) : null;
      const g = e.spr;
      g.clear();
      const sz = span
        ? span.buildingWidth * (e.def.isMonument ? (e.def.footprint || 2) * 0.55 : 0.35)
        : _pixiThreeScale((typeof TILE_W !== 'undefined' ? TILE_W : 128) * 0.35);
      g.roundRect(-sz, -sz * 1.2, sz * 2, sz * 1.2, 4);
      g.fill({ color: parseInt(String(e.def.color || '#8b6914').replace('#', ''), 16) || 0x8b6914 });
      if (span){ g.x = span.foot.x; g.y = span.foot.y; }
      else { _pixiAtGrid(e.col, e.row, g, 0); }
      return;
    }
    let placement = null;
    if (e.isMonument && typeof monumentAnchorAt === 'function'){
      const anchor = monumentAnchorAt(e.col, e.row);
      placement = _pixiMonumentScreenPlacement(anchor.col, anchor.row, e.def.footprint || 2, e.img, e.def);
    } else if (typeof spritePlacementOnTileScreen === 'function'){
      const isHouse = e.type === 'maison' || (e.def && e.def.isHouse);
      const houseLevel = isHouse
        ? (grid[e.row] && grid[e.row][e.col] ? grid[e.row][e.col].houseLevel : e.houseLevel)
        : undefined;
      const img = isHouse
        ? _pixiResolveBuildingImage(e.texKey, e.type, houseLevel)
        : e.img;
      const drawW = typeof buildingDrawWidthForDef === 'function'
        ? buildingDrawWidthForDef(e.def || {}, img)
        : null;
      placement = spritePlacementOnTileScreen(e.col, e.row, img, drawW, { building: true });
    }
    _pixiApplyTileScreenPlacement(e.spr, placement);
  });
};

/* =========================================================
   WALKERS — pool de sprites (pas de removeChildren / new Sprite par frame)
   ========================================================= */
window._buildWalkers = function(now, camX, camY, vwW, vhW, overlay){
  const container = overlay ? window._overlayWalkerContainer : window._walkerContainer;
  if (!container || !Array.isArray(walkers)) return;

  const skip = (typeof getWalkerFrameSkip === 'function')
    ? getWalkerFrameSkip()
    : ((typeof PERF !== 'undefined' && PERF.walkerFrameSkip) ? PERF.walkerFrameSkip : 0);
  if (skip > 0){
    window._walkerPoolFrameSkip = (window._walkerPoolFrameSkip + 1) % (skip + 1);
    if (window._walkerPoolFrameSkip !== 0) return;
  }

  const spritePool = window._walkerSpritePool;
  const gfxPool    = window._walkerGfxPool;
  spritePool._active = 0;
  gfxPool._active = 0;

  const maxRender = (typeof getWalkerRenderMax === 'function')
    ? getWalkerRenderMax()
    : ((typeof PERF !== 'undefined' && PERF.walkerRenderMax) ? PERF.walkerRenderMax : 999);
  const frameMs = typeof WALKER_ANIM_FRAME_MS !== 'undefined' ? WALKER_ANIM_FRAME_MS : 200;
  const frameIdxBase = Math.floor(now / frameMs);
  const size = typeof WALKER_DISPLAY_SIZE !== 'undefined' ? WALKER_DISPLAY_SIZE : 30;
  const baseScale = overlay ? _pixiThreeScale(size) / 96 : size / 96;
  const pad = overlay ? 80 : 80;
  let drawn = 0;

  let sortCol = camX, sortRow = camY;
  if (overlay && window._threeTarget && window._threeGridOffset){
    sortCol = window._threeTarget.x + window._threeGridOffset.offC;
    sortRow = window._threeTarget.z + window._threeGridOffset.offR;
  } else if (!overlay && typeof tileCenter === 'function'){
    const c = tileCenter(Math.floor(camX / (typeof TILE_W !== 'undefined' ? TILE_W : 64)), Math.floor(camY / (typeof TILE_H !== 'undefined' ? TILE_H : 32)));
    if (c){ sortCol = c.x; sortRow = c.y; }
  }
  const order = walkers.length <= maxRender ? walkers : walkers.slice().sort(function(a, b){
    const pa = a.path && a.path[a.pathIndex | 0];
    const pb = b.path && b.path[b.pathIndex | 0];
    if (!pa) return 1;
    if (!pb) return -1;
    const da = Math.abs(pa.col - sortCol) + Math.abs(pa.row - sortRow);
    const db = Math.abs(pb.col - sortCol) + Math.abs(pb.row - sortRow);
    return da - db;
  });

  for (let wi = 0; wi < order.length; wi++){
    if (drawn >= maxRender) break;
    const w = order[wi];
    if (!w || !w.path || w.path.length <= 1) continue;

    let px, py;
    if (overlay && typeof getWalkerWorld3ScreenPos === 'function'){
      const s = getWalkerWorld3ScreenPos(w, now);
      px = s.x; py = s.y;
    } else {
      const pos = typeof getWalkerScreenPos === 'function' ? getWalkerScreenPos(w, now) : null;
      if (!pos) continue;
      px = pos.x; py = pos.y;
      if (px < camX - pad || px > camX + vwW + pad) continue;
      if (py < camY - pad || py > camY + vhW + pad) continue;
    }

    if (overlay && (px < -pad || px > vwW + pad || py < -pad || py > vhW + pad)) continue;

    const id   = 'walker_' + w.serviceType;
    const anim = window._walkerTextures[id];

    if (anim){
      const iso     = typeof getAgentIsoFacing === 'function' ? getAgentIsoFacing(w) : null;
      const dirKey  = iso ? iso.facing : (w.facing || 'left');
      const mirror  = iso ? iso.mirrorX : w.mirrorX;
      const dirIdx  = anim.dirRow[dirKey] ?? anim.dirRow.down ?? 2;
      const frames  = anim.frames[dirIdx];
      const frameIdx= frameIdxBase % (frames.length || 1);
      const tex     = frames[frameIdx];

      const spr = _pixiPoolAcquire(spritePool, container, function(){ return new PIXI.Sprite(tex); });
      spr.texture = tex;
      spr.scale.set(mirror ? -baseScale : baseScale, baseScale);
      spr.anchor.set(0.5, 1);
      spr.x = px;
      spr.y = py;
    } else {
      const color = (typeof SERVICE_COLORS !== 'undefined' && SERVICE_COLORS[w.serviceType])
        ? parseInt((SERVICE_COLORS[w.serviceType] || '#e8c468').replace('#', ''), 16)
        : 0xe8c468;
      const r = overlay ? _pixiThreeScale(10) : 10;
      const g = _pixiPoolAcquire(gfxPool, container, function(){ return new PIXI.Graphics(); });
      g.clear();
      g.circle(px, py - r, r);
      g.fill({ color });
      g.stroke({ color: 0x000000, alpha: 0.5, width: 1.5 });
    }
    drawn++;
  }

  _pixiPoolRelease(spritePool);
  _pixiPoolRelease(gfxPool);
};

/* =========================================================
   DÉCORS NATURE + CACHET (overlay Three)
   ========================================================= */
function _pixiDecorSpecsForCell(col, row, cell){
  const out = [];
  if (!cell) return out;

  if (typeof cellShowsWheatCrop === 'function' && cellShowsWheatCrop(cell, col, row)){
    if (typeof WHEAT_CROP_IMG !== 'undefined' && WHEAT_CROP_IMG.complete && WHEAT_CROP_IMG.naturalWidth){
      const crop = typeof wheatCropAtCell === 'function' ? wheatCropAtCell(col, row) : null;
      if (crop){
        const sizeMul = typeof WHEAT_CROP_SIZE === 'number' ? WHEAT_CROP_SIZE : 0.4;
        const targetW = typeof natureDecorDrawWidth === 'function'
          ? natureDecorDrawWidth(crop.scale, sizeMul)
          : Math.round((typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : 62) * crop.scale * sizeMul);
        const opts = typeof wheatCropDrawOpts === 'function' ? wheatCropDrawOpts() : { lift: 0, anchorCenter: true };
        out.push({ img: WHEAT_CROP_IMG, targetW, opts });
      }
    }
  }

  if (typeof cellShowsMediterraneanDecor === 'function' && cellShowsMediterraneanDecor(cell, col, row)){
    let decor = typeof mediterraneanTreeAtCell === 'function' ? mediterraneanTreeAtCell(col, row) : null;
    let sprite = decor && typeof mediterraneanTreeImageForCell === 'function'
      ? mediterraneanTreeImageForCell(col, row) : null;
    let sizeMul = typeof MEDITERRANEAN_TREE_SIZE === 'number' ? MEDITERRANEAN_TREE_SIZE : 0.79;
    if (!decor){
      decor = typeof mediterraneanPropAtCell === 'function' ? mediterraneanPropAtCell(col, row) : null;
      if (decor){
        sprite = typeof mediterraneanPropImageForCell === 'function'
          ? mediterraneanPropImageForCell(col, row) : null;
        sizeMul = typeof MEDITERRANEAN_PROP_SIZE === 'number' ? MEDITERRANEAN_PROP_SIZE : 0.47;
      }
    }
    if (sprite && decor){
      let targetW = (typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : 62) * decor.scale * sizeMul;
      if (typeof spriteDrawWidthForTile === 'function'){
        targetW = spriteDrawWidthForTile(sprite, 1) * decor.scale * sizeMul;
      }
      const opts = typeof mediterraneanDecorDrawOpts === 'function'
        ? mediterraneanDecorDrawOpts()
        : { lift: -5, anchorCenter: true };
      out.push({ img: sprite, targetW, opts });
    }
  }

  if (typeof cellShowsGrassDecor === 'function' && cellShowsGrassDecor(cell, col, row)){
    const decor = typeof grassDecorAtCell === 'function' ? grassDecorAtCell(col, row) : null;
    const sprite = typeof grassDecorImageForCell === 'function' ? grassDecorImageForCell(col, row) : null;
    if (decor && sprite){
      const sizeMul = typeof grassDecorSizeForVariant === 'function'
        ? grassDecorSizeForVariant(decor.variant)
        : 0.6;
      const targetW = typeof natureDecorDrawWidth === 'function'
        ? natureDecorDrawWidth(decor.scale, sizeMul)
        : Math.round((typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : 62) * decor.scale * sizeMul);
      const opts = typeof grassDecorDrawOpts === 'function' ? grassDecorDrawOpts() : { lift: -5, anchorCenter: true };
      out.push({ img: sprite, targetW, opts });
    }
  }

  if (typeof cellShowsRockDecor === 'function' && cellShowsRockDecor(cell, col, row)){
    const decor = typeof rockDecorAtCell === 'function' ? rockDecorAtCell(col, row) : null;
    const sprite = typeof rockDecorImageForCell === 'function' ? rockDecorImageForCell(col, row) : null;
    if (decor && sprite){
      const sizeMul = typeof rockDecorSizeForCell === 'function' ? rockDecorSizeForCell(cell) : 0.72;
      const targetW = typeof natureDecorDrawWidth === 'function'
        ? natureDecorDrawWidth(decor.scale, sizeMul)
        : Math.round((typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : 62) * decor.scale * sizeMul);
      const opts = typeof rockDecorDrawOpts === 'function' ? rockDecorDrawOpts() : { lift: -5, anchorCenter: true };
      out.push({ img: sprite, targetW, opts });
    }
  }

  if (typeof cellShowsForestTree === 'function' && cellShowsForestTree(cell, col, row)){
    const tree = typeof forestTreeAtCell === 'function' ? forestTreeAtCell(col, row) : null;
    const sprite = tree && typeof forestTreeImageForCell === 'function'
      ? forestTreeImageForCell(col, row) : null;
    if (tree && sprite){
      const sizeMul = typeof FOREST_TREE_SIZE === 'number' ? FOREST_TREE_SIZE : 1;
      const targetW = typeof natureDecorDrawWidth === 'function'
        ? natureDecorDrawWidth(tree.scale, sizeMul)
        : Math.round((typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : 62) * tree.scale * sizeMul);
      const opts = typeof forestTreeDrawOpts === 'function' ? forestTreeDrawOpts() : { lift: 0, anchorCenter: true };
      out.push({ img: sprite, targetW, opts });
    }
  }

  if (typeof cellShowsScatterTree === 'function' && cellShowsScatterTree(cell, col, row)){
    const tree = typeof scatterTreeAtCell === 'function' ? scatterTreeAtCell(col, row) : null;
    if (tree && typeof FOREST_TREE_IMAGES !== 'undefined'){
      const sprite = FOREST_TREE_IMAGES[tree.variant];
      if (sprite && sprite.complete && sprite.naturalWidth){
        const sizeMul = typeof SCATTER_TREE_SIZE === 'number' ? SCATTER_TREE_SIZE : 0.5;
        const targetW = typeof natureDecorDrawWidth === 'function'
          ? natureDecorDrawWidth(tree.scale, sizeMul)
          : Math.round((typeof BUILDING_SPRITE_W !== 'undefined' ? BUILDING_SPRITE_W : 62) * tree.scale * sizeMul);
        const opts = typeof forestTreeDrawOpts === 'function' ? forestTreeDrawOpts() : { lift: 0, anchorCenter: true };
        out.push({ img: sprite, targetW, opts });
      }
    }
  }

  return out;
}

function _pixiAddDecorSprite(parent, col, row, img, targetW, opts){
  const tex = _pixiTextureFromImage(img);
  if (!tex) return null;
  const m = typeof measureSpriteFoot === 'function' ? measureSpriteFoot(img) : null;
  const footNx = m ? m.footNx : 0.5;
  const footNy = m ? m.footNy : 1;
  const lift = opts && typeof opts.lift === 'number' ? opts.lift : 0;
  const spr = new PIXI.Sprite(tex);
  spr.anchor.set(footNx, footNy);
  parent.addChild(spr);
  const entry = { gfx: spr, col, row, targetW, imgW: img.naturalWidth, footNx, footNy, lift };
  window._decorSprites.push(entry);
  return entry;
}

window.buildThreeDecors = function(){
  if (!window._pixiOverlayApp || !Array.isArray(grid) || !grid.length) return;

  window._decorSprites.forEach((d)=> d.gfx.destroy());
  window._decorSprites = [];
  window._beautySprites.forEach((d)=> d.gfx.destroy());
  window._beautySprites = [];

  const decorParent = window._overlayDecorContainer;
  const beautyParent = window._overlayBeautyContainer;
  if (decorParent) decorParent.removeChildren();
  if (beautyParent) beautyParent.removeChildren();

  const drawOrder = typeof getMapDrawOrder === 'function' ? getMapDrawOrder() : [];
  const threshold = typeof BEAUTY_THRESHOLD !== 'undefined' ? BEAUTY_THRESHOLD : 10;

  drawOrder.forEach(function(item){
    const col = item.col, row = item.row;
    const cell = grid[row] && grid[row][col];
    if (!cell) return;

    _pixiDecorSpecsForCell(col, row, cell).forEach(function(spec){
      _pixiAddDecorSprite(decorParent, col, row, spec.img, spec.targetW, spec.opts);
    });

    if (cell.beauty > 0 && beautyParent && typeof getTileScreenQuad === 'function'){
      const alpha = Math.min(0.4, (cell.beauty / threshold) * 0.4);
      const q = getTileScreenQuad(col, row);
      const g = new PIXI.Graphics();
      g.poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y]);
      g.fill({ color: 0xd6af46, alpha });
      beautyParent.addChild(g);
      window._beautySprites.push({ gfx: g, col, row, alpha });
    }
  });

  window._repositionOverlayDecors();
  console.log('[Pixi overlay] Décors:', window._decorSprites.length);
  if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
};

function _removeDecorsAt(col, row){
  window._decorSprites = window._decorSprites.filter(function(d){
    if (d.col === col && d.row === row){
      d.gfx.destroy();
      return false;
    }
    return true;
  });
  window._beautySprites = window._beautySprites.filter(function(d){
    if (d.col === col && d.row === row){
      d.gfx.destroy();
      return false;
    }
    return true;
  });
}

/** Met à jour les décors sur quelques cases (sans rescan 120×120). */
window.patchThreeDecors = function(cells){
  if (!window._pixiOverlayApp || !Array.isArray(grid) || !grid.length) return;
  if (!cells || !cells.length){
    window.buildThreeDecors();
    return;
  }

  const decorParent = window._overlayDecorContainer;
  const beautyParent = window._overlayBeautyContainer;
  const threshold = typeof BEAUTY_THRESHOLD !== 'undefined' ? BEAUTY_THRESHOLD : 10;

  cells.forEach(function(t){
    const col = t.col;
    const row = t.row;
    if (!inBounds(col, row)) return;
    _removeDecorsAt(col, row);
    const cell = grid[row][col];
    if (!cell) return;

    _pixiDecorSpecsForCell(col, row, cell).forEach(function(spec){
      _pixiAddDecorSprite(decorParent, col, row, spec.img, spec.targetW, spec.opts);
    });

    if (cell.beauty > 0 && beautyParent && typeof getTileScreenQuad === 'function'){
      const alpha = Math.min(0.4, (cell.beauty / threshold) * 0.4);
      const q = getTileScreenQuad(col, row);
      const g = new PIXI.Graphics();
      g.poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y]);
      g.fill({ color: 0xd6af46, alpha });
      beautyParent.addChild(g);
      window._beautySprites.push({ gfx: g, col, row, alpha });
    }
  });

  if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();
};

window._repositionOverlayDecors = function(){
  if (!window._threeCam || typeof worldToScreen !== 'function' || typeof gridToWorld3Anchor !== 'function') return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const gridRect = (typeof getThreeVisibleGridRect === 'function')
    ? getThreeVisibleGridRect(3) : null;

  window._decorSprites.forEach(function(d){
    if (gridRect && (d.col < gridRect.minCol || d.col > gridRect.maxCol
        || d.row < gridRect.minRow || d.row > gridRect.maxRow)){
      d.gfx.visible = false;
      return;
    }
    if (typeof spritePlacementOnTileScreen !== 'function') return;
    const pl = spritePlacementOnTileScreen(d.col, d.row, { naturalWidth: d.imgW, width: d.imgW }, d.targetW, {
      lift: d.lift || 0,
      anchorCenter: d.anchorCenter,
      cyIsFoot: d.cyIsFoot,
    });
    if (!pl) return;
    d.gfx.anchor.set(pl.footNx, pl.footNy);
    d.gfx.scale.set(pl.scale);
    d.gfx.x = pl.x;
    d.gfx.y = pl.y;
    d.gfx.visible = pl.x > -120 && pl.x < vw + 120 && pl.y > -160 && pl.y < vh + 120;
  });

  window._beautySprites.forEach(function(d){
    if (gridRect && (d.col < gridRect.minCol || d.col > gridRect.maxCol
        || d.row < gridRect.minRow || d.row > gridRect.maxRow)){
      d.gfx.visible = false;
      return;
    }
    if (typeof getTileScreenQuad !== 'function') return;
    const q = getTileScreenQuad(d.col, d.row);
    const cx = (q[0].x + q[2].x) * 0.5;
    const cy = (q[0].y + q[2].y) * 0.5;
    const visible = cx > -80 && cx < vw + 80 && cy > -80 && cy < vh + 80;
    d.gfx.visible = visible;
    if (!visible) return;
    const skipBeauty = (typeof PERF !== 'undefined' && PERF.decorBeautySkip > 0)
      && (window._decorBeautyTick % (PERF.decorBeautySkip + 1)) !== 0;
    if (skipBeauty) return;
    d.gfx.clear();
    d.gfx.poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y]);
    d.gfx.fill({ color: 0xd6af46, alpha: d.alpha });
  });
  window._decorBeautyTick++;
};

function _pixiDrawCharacterSprite(container, id, s, agent, now, animate, charPool){
  const anim = window._characterTextures[id];
  if (!anim) return false;
  const iso = typeof getAgentIsoFacing === 'function' ? getAgentIsoFacing(agent) : null;
  const dirKey = iso ? iso.facing : (agent.facing || 'down');
  const mirror = iso ? iso.mirrorX : !!agent.mirrorX;
  const dirIdx = anim.dirRow[dirKey] ?? anim.dirRow.down ?? 2;
  const frameMs = typeof getCharacterAnimFrameMs === 'function'
    ? getCharacterAnimFrameMs(id)
    : (typeof CHARACTER_ANIM_FRAME_MS !== 'undefined' ? CHARACTER_ANIM_FRAME_MS : 200);
  const moving = animate !== false;
  const frameIdx = moving
    ? Math.floor(now / frameMs) % (anim.frames[dirIdx]?.length || _PIXI_CHAR_FRAMES)
    : 0;
  const tex = anim.frames[dirIdx]?.[frameIdx];
  if (!tex) return false;

  const size = typeof getCharacterDisplaySize === 'function'
    ? getCharacterDisplaySize(id)
    : (typeof CHARACTER_DISPLAY_SIZE !== 'undefined' ? CHARACTER_DISPLAY_SIZE : 40);
  const footPad = typeof CHARACTER_ISO_FOOT_PAD === 'number' ? CHARACTER_ISO_FOOT_PAD : 8;
  const scale = _pixiThreeScale(size) / _PIXI_CHAR_FRAME;
  const pool = charPool || window._agentCharPool;
  const spr = _pixiPoolAcquire(pool, container, function(){ return new PIXI.Sprite(tex); });
  spr.texture = tex;
  spr.scale.set(mirror ? -scale : scale, scale);
  spr.anchor.set(0.5, 1);
  spr.x = s.x;
  spr.y = s.y + _pixiThreeScale(footPad);
  return true;
}

function _observerCoverageActive(){
  const cov = window._observerCoverage;
  if (!cov) return false;
  if (cov.until && performance.now() > cov.until) return false;
  return true;
}

window.tickObserverCoverageExpiry = function(){
  const cov = window._observerCoverage;
  if (!cov || !cov.until || performance.now() <= cov.until) return;
  window._observerCoverage = null;
  window._overlayNeedsRender = true;
  const container = window._overlayGradeContainer;
  if (container) container.removeChildren();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();
  if (typeof markRenderDirty === 'function') markRenderDirty();
};

function _pixiApplyOverlayGrade(){
  const container = window._overlayGradeContainer;
  if (!container) return;
  container.removeChildren();

  const cov = window._observerCoverage;
  if (cov){
    if (cov.until && performance.now() > cov.until){
      window._observerCoverage = null;
    } else {
      (cov.roads || []).forEach(function(t){
        if (typeof _pixiDrawTileQuad === 'function'){
          _pixiDrawTileQuad(container, t.col, t.row, 0x4da6ff, 0x2266aa, 0.32, 0.45);
        }
      });
      (cov.houses || []).forEach(function(t){
        if (typeof _pixiDrawTileQuad === 'function'){
          _pixiDrawTileQuad(container, t.col, t.row, 0x78ff78, 0x338833, 0.42, 0.55);
        }
      });
      if (cov.origin && typeof _pixiDrawTileQuad === 'function'){
        _pixiDrawTileQuad(container, cov.origin.col, cov.origin.row, 0xffd700, 0xaa8800, 0.48, 0.75);
      }
    }
  }

  if (typeof window.observerPinnedTile !== 'undefined' && window.observerPinnedTile
      && typeof _pixiDrawTileQuad === 'function'){
    _pixiDrawTileQuad(
      container,
      window.observerPinnedTile.col,
      window.observerPinnedTile.row,
      0xffe066, 0xffaa00, 0.28, 0.85,
    );
  }
}

window.setObserverCoverage = function(payload){
  window._observerCoverage = payload;
  window._overlayNeedsRender = true;
  if (typeof markRenderDirty === 'function') markRenderDirty();
};

window.clearObserverCoverage = function(){
  window._observerCoverage = null;
  window._overlayNeedsRender = true;
  const container = window._overlayGradeContainer;
  if (container) container.removeChildren();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();
  if (typeof markRenderDirty === 'function') markRenderDirty();
};

/* =========================================================
   ROUTES / ESCALIERS / BORNES (overlay Three)
   ========================================================= */
function _pixiFillTileQuadGfx(gfx, col, row, fill, stroke, fillAlpha, strokeAlpha){
  if (!gfx || typeof getTileScreenQuad !== 'function') return;
  const q = getTileScreenQuad(col, row);
  gfx.clear();
  gfx.poly([q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y]);
  if (fill != null) gfx.fill({ color: fill, alpha: fillAlpha != null ? fillAlpha : 0.4 });
  if (stroke != null) gfx.stroke({ color: stroke, alpha: strokeAlpha != null ? strokeAlpha : 0.55, width: 1.5 });
}

window._buildRoadsOverlay = function(){
  const container = window._overlayRoadContainer;
  if (!container || !Array.isArray(grid)) return;
  container.removeChildren();
  window._overlayRoadEntries = [];

  const drawOrder = typeof getMapDrawOrder === 'function' ? getMapDrawOrder() : [];
  drawOrder.forEach(function(item){
    const col = item.col, row = item.row;
    const cell = grid[row] && grid[row][col];
    if (!cell) return;

    if (cell.hasRoad){
      if (window._roadTexture){
        const mesh = _pixiCreateTileQuadTextureMesh(col, row, window._roadTexture, 1);
        if (mesh){
          container.addChild(mesh);
          window._overlayRoadEntries.push({ kind: 'tex', mesh, col, row });
        }
      } else {
        const g = new PIXI.Graphics();
        container.addChild(g);
        _pixiFillTileQuadGfx(g, col, row, 0x6a5030, 0x3a2810, 0.55, 0.35);
        window._overlayRoadEntries.push({ kind: 'road_gfx', gfx: g, col, row });
      }
    }

    if (cell.roadStairs){
      const g = new PIXI.Graphics();
      container.addChild(g);
      _pixiFillTileQuadGfx(g, col, row, 0xc9a83c, 0x6a5020, 0.45, 0.7);
      window._overlayRoadEntries.push({ kind: 'stairs', gfx: g, col, row });
    }
    if (cell.hasRoad && cell.patrolBlock){
      const g = new PIXI.Graphics();
      container.addChild(g);
      window._overlayRoadEntries.push({ kind: 'block', gfx: g, col, row });
    }
  });
  window._repositionOverlayRoads();
};

window._repositionOverlayRoads = function(){
  if (!window._overlayRoadEntries) return;
  window._overlayRoadEntries.forEach(function(e){
    if (e.kind === 'tex' && e.mesh){
      _pixiUpdateTileQuadMesh(e.mesh, e.col, e.row);
    } else if (e.kind === 'road_gfx' && e.gfx){
      _pixiFillTileQuadGfx(e.gfx, e.col, e.row, 0x6a5030, 0x3a2810, 0.55, 0.35);
    } else if (e.kind === 'stairs' && e.gfx){
      _pixiFillTileQuadGfx(e.gfx, e.col, e.row, 0xc9a83c, 0x6a5020, 0.45, 0.7);
    } else if (e.kind === 'block' && e.gfx && typeof gridToWorld3Anchor === 'function'){
      const w = gridToWorld3Anchor(e.col, e.row);
      const s = worldToScreen(w.x, w.y, w.z);
      const r = _pixiThreeScale(8);
      e.gfx.clear();
      e.gfx.circle(s.x, s.y - r, r);
      e.gfx.fill({ color: 0xff4444, alpha: 0.75 });
    }
  });
};

/* =========================================================
   AGENTS (monstres, héros, migrants, militaire, dieux)
   ========================================================= */
function _pixiAgentToken(container, s, icon, color, gfxPool, textPool){
  const r = _pixiThreeScale(12);
  const gPool = gfxPool || window._agentGfxPool;
  const tPool = textPool || window._agentTextPool;
  const g = _pixiPoolAcquire(gPool, container, function(){ return new PIXI.Graphics(); });
  g.clear();
  g.circle(s.x, s.y - r * 0.6, r);
  g.fill({ color, alpha: 0.92 });
  g.stroke({ color: 0x000000, alpha: 0.55, width: 1.5 });
  if (icon){
    const t = _pixiPoolAcquire(tPool, container, function(){
      return new PIXI.Text({ text: '', style: { fontFamily: 'serif', fontSize: 14 } });
    });
    t.text = icon;
    t.style.fontSize = _pixiThreeScale(14);
    t.anchor.set(0.5, 0.5);
    t.x = s.x;
    t.y = s.y - r * 0.65;
  }
}

window._buildAgentsOverlay = function(now){
  const container = window._overlayAgentContainer;
  if (!container || typeof getGridAgentScreenPos !== 'function') return;

  const charPool = window._agentCharPool;
  const gfxPool  = window._agentGfxPool;
  const textPool = window._agentTextPool;
  charPool._active = 0;
  gfxPool._active = 0;
  textPool._active = 0;

  if (typeof monster !== 'undefined' && monster){
    const s = getGridAgentScreenPos(monster.prevCol, monster.prevRow, monster.col, monster.row, now);
    const moving = typeof isCreatureMoving === 'function' && isCreatureMoving(monster, now);
    if (!_pixiDrawCharacterSprite(container, 'monster_' + monster.typeKey, s, monster, now, moving, charPool)){
      _pixiAgentToken(container, s, monster.icon, 0x961e1e, gfxPool, textPool);
    }
  }
  if (typeof hero !== 'undefined' && hero){
    const s = getGridAgentScreenPos(hero.prevCol, hero.prevRow, hero.col, hero.row, now);
    if (!hero.typeKey || !_pixiDrawCharacterSprite(container, 'hero_' + hero.typeKey, s, hero, now, true, charPool)){
      _pixiAgentToken(container, s, hero.icon || '🦸', 0x3c6ec8, gfxPool, textPool);
    }
  }
  if (Array.isArray(godAgents)){
    godAgents.forEach(function(agent){
      const s = getGridAgentScreenPos(agent.prevCol, agent.prevRow, agent.col, agent.row, now);
      if (!_pixiDrawCharacterSprite(container, 'god_' + agent.godKey, s, agent, now, true, charPool)){
        _pixiAgentToken(container, s, agent.icon, 0xd6af46, gfxPool, textPool);
      }
    });
  }
  if (Array.isArray(migrants)){
    migrants.forEach(function(m){
      const s = getGridAgentScreenPos(m.prevCol, m.prevRow, m.col, m.row, now);
      const moving = typeof isCreatureMoving === 'function' && isCreatureMoving(m, now);
      if (!_pixiDrawCharacterSprite(container, 'migrant', s, m, now, moving, charPool)){
        _pixiAgentToken(container, s, m.type === 'in' ? '🧳' : '🚶', m.type === 'in' ? 0x50a05a : 0xb4783c, gfxPool, textPool);
      }
    });
  }
  if (typeof getMilitarySoldiers === 'function'){
    getMilitarySoldiers().forEach(function(soldier){
      const s = getGridAgentScreenPos(soldier.prevCol, soldier.prevRow, soldier.col, soldier.row, now);
      const moving = typeof isCreatureMoving === 'function' && isCreatureMoving(soldier, now);
      const side = soldier.side === 'friendly' ? 'friendly' : 'enemy';
      if (!_pixiDrawCharacterSprite(container, 'soldier_' + side, s, soldier, now, moving, charPool)){
        const friendly = soldier.side === 'friendly';
        _pixiAgentToken(container, s, friendly ? '🛡️' : '⚔️', friendly ? 0x3c6ec8 : 0x961e1e, gfxPool, textPool);
      }
    });
  }

  _pixiPoolRelease(charPool);
  _pixiPoolRelease(gfxPool);
  _pixiPoolRelease(textPool);
};

/* =========================================================
   ICÔNES STATUT MAISONS
   ========================================================= */
window._rebuildHouseIconEntries = function(){
  window._houseIconEntries = [];
  if (!Array.isArray(grid) || typeof forEachBuilding !== 'function' || typeof getHouseStatusIcons !== 'function') return;
  forEachBuilding(function(type, col, row){
    if (type !== 'maison') return;
    const cell = grid[row][col];
    const icons = getHouseStatusIcons(col, row, cell);
    if (icons.length) window._houseIconEntries.push({ col, row, icons });
  });
};

window._buildHouseIconsOverlay = function(){
  const container = window._overlayHouseIconContainer;
  if (!container || typeof getHouseStatusIcons !== 'function') return;

  if (window._houseIconsDirty){
    window._houseIconsDirty = false;
    window._rebuildHouseIconEntries();
  }

  const pool = window._houseIconPool;
  pool._active = 0;
  const vw = window.innerWidth, vh = window.innerHeight;
  const pad = 120;
  const entries = window._houseIconEntries;

  for (let ei = 0; ei < entries.length; ei++){
    const entry = entries[ei];
    const w = gridToWorld3Anchor(entry.col, entry.row);
    const s = worldToScreen(w.x, w.y, w.z);
    if (s.x < -pad || s.x > vw + pad || s.y < -pad || s.y > vh + pad) continue;
    const spacing = _pixiThreeScale(12);
    const startX = s.x - ((entry.icons.length - 1) * spacing) / 2;
    for (let i = 0; i < entry.icons.length; i++){
      const t = _pixiPoolAcquire(pool, container, function(){
        return new PIXI.Text({ text: '', style: { fontFamily: 'serif', fontSize: 12 } });
      });
      t.text = entry.icons[i];
      t.style.fontSize = _pixiThreeScale(11);
      t.anchor.set(0.5, 0.5);
      t.x = startX + i * spacing;
      t.y = s.y - _pixiThreeScale(36);
    }
  }
  _pixiPoolRelease(pool);
};

/* =========================================================
   HOVER / SÉLECTION / PLACEMENT
   ========================================================= */
window._buildUI = function(overlay){
  const container = overlay ? window._overlayUiContainer : window._uiContainer;
  if (!container) return;

  if (overlay){
    const uiKey = _uiOverlayStateKey();
    if (!uiKey){
      window._uiQuadPool._active = 0;
      _pixiPoolRelease(window._uiQuadPool);
      window._uiOverlayLastKey = '';
      return;
    }
    if (uiKey === window._uiOverlayLastKey) return;
    window._uiOverlayLastKey = uiKey;
    window._uiQuadPool._active = 0;
  } else {
    container.removeChildren();
  }

  if (typeof hoverTile === 'undefined' || !hoverTile || !inBounds(hoverTile.col, hoverTile.row)){
    if (overlay) _pixiPoolRelease(window._uiQuadPool);
    return;
  }

  const drawQuad = overlay
    ? function(c, r, fill, stroke, fa, sa){ _pixiDrawTileQuadPooled(container, c, r, fill, stroke, fa, sa); }
    : function(c, r, fill, stroke, fa, sa){ _pixiDrawTileQuad(container, c, r, fill, stroke, fa, sa); };

  if (overlay && typeof isThreeReady === 'function' && isThreeReady()
      && typeof getTileScreenQuad === 'function'){

    if (typeof supportsZonePlacement === 'function' && supportsZonePlacement() && typeof zonePlacementStart !== 'undefined' && zonePlacementStart){
      const rectTiles = typeof tilesInRect === 'function'
        ? tilesInRect(zonePlacementStart.col, zonePlacementStart.row, hoverTile.col, hoverTile.row)
        : [];
      rectTiles.forEach(function(tile){
        if (!inBounds(tile.col, tile.row)) return;
        const ok = (typeof roadMode !== 'undefined' && roadMode)
          ? (typeof canPlaceRoadTerrain === 'function' && canPlaceRoadTerrain(tile.col, tile.row))
          : (typeof canPlaceTerrain === 'function' && canPlaceTerrain(tile.col, tile.row));
        drawQuad(tile.col, tile.row, ok ? 0x78ff78 : 0xff3c3c, 0x000000, ok ? 0.45 : 0.25, 0.35);
      });
      drawQuad(zonePlacementStart.col, zonePlacementStart.row, 0xd2a24a, 0xd2a24a, 0.55, 0.9);
      if (overlay) _pixiPoolRelease(window._uiQuadPool);
      return;
    }

    if (typeof supportsZonePlacement === 'function' && supportsZonePlacement() && !zonePlacementStart){
      const ok = (typeof roadMode !== 'undefined' && roadMode)
        ? (typeof canPlaceRoad === 'function' && canPlaceRoad(hoverTile.col, hoverTile.row))
        : (typeof canPlace === 'function' && canPlace(hoverTile.col, hoverTile.row));
      drawQuad(hoverTile.col, hoverTile.row, ok ? 0xd2a24a : 0xff3c3c, 0x000000, ok ? 0.35 : 0.35, 0.4);
      if (overlay) _pixiPoolRelease(window._uiQuadPool);
      return;
    }

    const def = (typeof selectedBuilding !== 'undefined' && selectedBuilding && typeof BUILDING_DEFS !== 'undefined')
      ? BUILDING_DEFS[selectedBuilding] : null;
    const fp = (def && def.footprint) || 1;
    const tiles = (fp > 1 && typeof monumentFootprintTiles === 'function')
      ? monumentFootprintTiles(hoverTile.col, hoverTile.row, fp)
      : [{ col: hoverTile.col, row: hoverTile.row }];

    let fill = 0xffffff;
    if (typeof selectedBuilding !== 'undefined' && selectedBuilding){
      fill = (typeof canPlace === 'function' && canPlace(hoverTile.col, hoverTile.row)) ? 0x78ff78 : 0xff3c3c;
    } else if (typeof roadMode !== 'undefined' && roadMode){
      fill = (typeof canPlaceRoad === 'function' && canPlaceRoad(hoverTile.col, hoverTile.row)) ? 0x78ff78 : 0xff3c3c;
    } else if (typeof stairsMode !== 'undefined' && stairsMode){
      fill = (typeof canPlaceStairs === 'function' && canPlaceStairs(hoverTile.col, hoverTile.row)) ? 0x78ff78 : 0xff3c3c;
    } else if (typeof blockMode !== 'undefined' && blockMode){
      fill = (typeof canToggleBlock === 'function' && canToggleBlock(hoverTile.col, hoverTile.row)) ? 0x78ff78 : 0xff3c3c;
    } else if (typeof demolishMode !== 'undefined' && demolishMode){
      const c = grid[hoverTile.row][hoverTile.col];
      const anchor = (typeof monumentAnchorAt === 'function') ? monumentAnchorAt(hoverTile.col, hoverTile.row) : null;
      fill = (c.building || c.hasRoad || anchor) ? 0xff3c3c : 0xffffff;
    }

    tiles.forEach(function(t){
      if (!inBounds(t.col, t.row)) return;
      drawQuad(t.col, t.row, fill, 0x000000, 0.35, 0.4);
    });
    if (overlay) _pixiPoolRelease(window._uiQuadPool);
    return;
  }

  const pos = typeof tileCenter === 'function' ? tileCenter(hoverTile.col, hoverTile.row) : null;
  if (!pos) return;
  const g = new PIXI.Graphics();
  const hw = TILE_W/2, hh = TILE_H/2;
  g.poly([pos.x,pos.y, pos.x+hw,pos.y+hh, pos.x,pos.y+TILE_H, pos.x-hw,pos.y+hh]);
  g.fill({color:0xffffff, alpha:0.15});
  g.stroke({color:0xffffff, alpha:0.6, width:1.5});
  container.addChild(g);
};

/* =========================================================
   BOUCLE PRINCIPALE
   ========================================================= */
window.renderPixi = function(now){
  if (!window._pixiApp) return;

  const zoom = typeof zoomLevel !== 'undefined' ? zoomLevel : 1;
  const camX = typeof camera !== 'undefined' ? camera.x : 0;
  const camY = typeof camera !== 'undefined' ? camera.y : 0;
  const vwW  = window.innerWidth  / zoom;
  const vhW  = window.innerHeight / zoom;
  const dataVer = typeof terrainDataVersion !== 'undefined' ? terrainDataVersion : 0;

  // --- Caméra ---
  window._pixiApp.stage.scale.set(zoom);
  window._pixiApp.stage.position.set(-camX * zoom, -camY * zoom);

  // --- Terrain (rebake si nécessaire) ---
  const PAD = typeof TILE_W !== 'undefined' ? TILE_W * 4 : 512;
  const inZone = !window._terrainDirty
    && window._pixiBakeVer  === dataVer
    && window._pixiBakeZoom === zoom
    && camX >= window._pixiBakeL
    && camY >= window._pixiBakeT
    && camX + vwW <= window._pixiBakeR
    && camY + vhW <= window._pixiBakeB;

  if (!inZone){
    const bL = Math.max(0, camX - PAD);
    const bT = Math.max(0, camY - PAD);
    const bR = Math.min(typeof WORLD_WIDTH!=='undefined'?WORLD_WIDTH:1e9,  camX+vwW+PAD);
    const bB = Math.min(typeof WORLD_HEIGHT!=='undefined'?WORLD_HEIGHT:1e9, camY+vhW+PAD);
    if (typeof isTerrainGenerationInProgress==='function' && !isTerrainGenerationInProgress()){
      window._buildTerrain(bL, bT, bR, bB);
      window._pixiBakeL=bL; window._pixiBakeT=bT;
      window._pixiBakeR=bR; window._pixiBakeB=bB;
      window._pixiBakeZoom=zoom; window._pixiBakeVer=dataVer;
      window._terrainDirty=false;
      window._buildingDirty=true; // bâtiments à reconstruire après terrain
    }
  }

  // --- Bâtiments (reconstruire si terrain rebaked ou changement) ---
  if (window._buildingDirty && Array.isArray(grid)){
    const drawOrder = typeof getMapDrawOrder === 'function' ? getMapDrawOrder() : [];
    const bounds = {left:camX-PAD, top:camY-PAD, right:camX+vwW+PAD, bottom:camY+vhW+PAD};
    const visible = typeof getVisibleDrawOrder === 'function'
      ? getVisibleDrawOrder(drawOrder, bounds) : drawOrder;
    window._buildBuildings(visible);
  }

  // --- Walkers (chaque frame car ils bougent) ---
  window._buildWalkers(now, camX, camY, vwW, vhW);

  // --- UI (hover) ---
  window._buildUI();
};

/* =========================================================
   OVERLAY THREE.JS (bâtiments + walkers + UI, sans terrain)
   ========================================================= */
window.renderPixiOverlay = function(now){
  if (!window._pixiOverlayApp) return;
  if (typeof window.tickObserverCoverageExpiry === 'function') window.tickObserverCoverageExpiry();

  const camMoved = _overlayCameraMoved();
  const hasAnimating = (typeof migrants !== 'undefined' && migrants.length > 0)
    || (typeof godAgents !== 'undefined' && godAgents.length > 0)
    || (typeof monster !== 'undefined' && monster)
    || (typeof hero !== 'undefined' && hero)
    || (typeof getMilitarySoldiers === 'function' && getMilitarySoldiers().length > 0)
    || (typeof walkers !== 'undefined' && walkers.some(function(w){ return w.path && w.path.length > 1; }));
  const hasUi = (typeof hoverTile !== 'undefined' && hoverTile)
    && ((typeof selectedBuilding !== 'undefined' && selectedBuilding)
      || (typeof roadMode !== 'undefined' && roadMode)
      || (typeof demolishMode !== 'undefined' && demolishMode)
      || (typeof blockMode !== 'undefined' && blockMode)
      || (typeof stairsMode !== 'undefined' && stairsMode)
      || (typeof zonePlacementStart !== 'undefined' && zonePlacementStart));

  const hasCoverage = _observerCoverageActive() || !!window.observerPinnedTile;
  const needsRender = camMoved || window._overlayNeedsRender || window._buildingDirty
    || window._roadsDirty || window._houseIconsDirty || hasAnimating || hasUi || hasCoverage;
  if (!needsRender) return;

  window._overlayNeedsRender = false;

  if (Array.isArray(grid)){
    const drawOrder = typeof getMapDrawOrder === 'function' ? getMapDrawOrder() : [];
    if (window._roadsDirty){
      window._buildRoadsOverlay();
      window._roadsDirty = false;
    } else if (camMoved){
      window._repositionOverlayRoads();
    }
    if (window._buildingDirty){
      window._buildBuildings(drawOrder, true);
      window._repositionOverlayBuildings();
    } else if (camMoved){
      window._repositionOverlayBuildings();
    }
  }

  if (camMoved) window._repositionOverlayDecors();

  window._buildWalkers(now, 0, 0, window.innerWidth, window.innerHeight, true);
  window._buildAgentsOverlay(now);
  if (camMoved || window._houseIconsDirty) window._buildHouseIconsOverlay();
  window._buildUI(true);
  _pixiApplyOverlayGrade();
  window._pixiOverlayApp.render();
};

console.log('[pixiRenderer.js] chargé ✓');
