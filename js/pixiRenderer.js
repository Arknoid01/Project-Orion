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

window._terrainDirty     = true;
window._buildingDirty    = true;
window._pixiBakeL = -1e9; window._pixiBakeT = -1e9;
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
      resolution: Math.min(window.devicePixelRatio || 1, 1.5),
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
window.invalidatePixiTerrain  = function(){ window._terrainDirty = true; };
window.invalidatePixiBuildings = function(){ window._buildingDirty = true; };

/* =========================================================
   CHARGEMENT TEXTURES
   ========================================================= */
window._pixiLoadTextures = async function(){
  // Terrain
  const TERRAIN_PATHS = {
    grass:'assets/textures/flat/game/grass_top.png',
    wheat:'assets/textures/flat/game/sand_top.png',
    forest:'assets/textures/flat/game/forest_top.png',
    hill:'assets/textures/flat/game/grass_top.png',
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
      const path = `assets/buildings/${type}.png`;
      try { window._buildingTextures[type] = await PIXI.Assets.load(path); } catch{}
    }));
  }

  // Maisons
  if (typeof HOUSE_LEVELS !== 'undefined'){
    await Promise.all(HOUSE_LEVELS.map(async (lvl) => {
      const path = `assets/houses/${lvl.key}.png`;
      try { window._buildingTextures['house_' + lvl.key] = await PIXI.Assets.load(path); } catch{}
    }));
  }

  // Walkers (spritesheets 288×384, 3 frames × 4 directions, 96×96/frame)
  const FRAME_W = 96, FRAME_H = 96, FRAMES = 3, DIRS = 4;
  const DIR_ROW = { left:0, down:1, right:2, up:3 };

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

  console.log('[Pixi] Textures chargées');
};

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
window._buildBuildings = function(visible){
  window._buildingContainer.removeChildren();

  visible.forEach(function(item){
    const col = item.col, row = item.row;
    const cell = grid[row] && grid[row][col];
    if (!cell || !cell.building || cell.monumentPart) return;

    const pos = typeof tileCenter === 'function' ? tileCenter(col, row) : null;
    if (!pos) return;

    const type = cell.building;
    const texKey = cell.isHouse ? 'house_' + (typeof HOUSE_LEVELS !== 'undefined' && HOUSE_LEVELS[cell.houseLevel||0] ? HOUSE_LEVELS[cell.houseLevel||0].key : 'hut') : type;
    const tex = window._buildingTextures[texKey] || window._buildingTextures[type];

    if (tex){
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5, 1);     // ancre bas-centre
      const scale = TILE_W / 62;  // 62 = ancienne valeur de référence
      spr.scale.set(scale);
      spr.x = pos.x;
      spr.y = pos.y + TILE_H * 0.5;
      window._buildingContainer.addChild(spr);
    } else {
      // Fallback couleur
      const g = new PIXI.Graphics();
      g.rect(pos.x - TILE_W*0.3, pos.y - TILE_H*1.2, TILE_W*0.6, TILE_H*1.2);
      g.fill({color:0x8b6914});
      window._buildingContainer.addChild(g);
    }
  });

  window._buildingDirty = false;
};

/* =========================================================
   WALKERS
   ========================================================= */
window._buildWalkers = function(now, camX, camY, vwW, vhW){
  window._walkerContainer.removeChildren();
  if (!Array.isArray(walkers)) return;

  walkers.forEach(function(w){
    if (!w || !w.path || w.path.length <= 1) return;
    const pos = typeof getWalkerScreenPos === 'function' ? getWalkerScreenPos(w, now) : null;
    if (!pos) return;
    if (pos.x < camX-80 || pos.x > camX+vwW+80) return;
    if (pos.y < camY-80 || pos.y > camY+vhW+80) return;

    const id   = 'walker_' + w.serviceType;
    const anim = window._walkerTextures[id];

    if (anim){
      const iso     = typeof getAgentIsoFacing === 'function' ? getAgentIsoFacing(w) : null;
      const dirKey  = iso ? iso.facing : (w.facing || 'left');
      const mirror  = iso ? iso.mirrorX : w.mirrorX;
      const dirIdx  = anim.dirRow[dirKey] || 0;
      const frameMs = typeof WALKER_ANIM_FRAME_MS !== 'undefined' ? WALKER_ANIM_FRAME_MS : 200;
      const frameIdx= Math.floor(now / frameMs) % anim.frames[dirIdx].length;
      const tex     = anim.frames[dirIdx][frameIdx];

      const spr = new PIXI.Sprite(tex);
      const size = typeof WALKER_DISPLAY_SIZE !== 'undefined' ? WALKER_DISPLAY_SIZE : 30;
      const scale = size / 96;
      spr.scale.set(mirror ? -scale : scale, scale);
      spr.anchor.set(0.5, 1);
      spr.x = pos.x;
      spr.y = pos.y;
      window._walkerContainer.addChild(spr);
    } else {
      // Fallback cercle coloré
      const g = new PIXI.Graphics();
      g.circle(pos.x, pos.y - 8, 10);
      const color = (typeof SERVICE_COLORS !== 'undefined' && SERVICE_COLORS[w.serviceType])
        ? parseInt((SERVICE_COLORS[w.serviceType]||'#e8c468').replace('#',''), 16)
        : 0xe8c468;
      g.fill({color});
      g.stroke({color:0x000000, alpha:0.5, width:1.5});
      window._walkerContainer.addChild(g);
    }
  });
};

/* =========================================================
   HOVER / SÉLECTION
   ========================================================= */
window._buildUI = function(){
  window._uiContainer.removeChildren();
  if (typeof hoverTile === 'undefined' || !hoverTile) return;
  const pos = typeof tileCenter === 'function' ? tileCenter(hoverTile.col, hoverTile.row) : null;
  if (!pos) return;
  const g = new PIXI.Graphics();
  const hw = TILE_W/2, hh = TILE_H/2;
  g.poly([pos.x,pos.y, pos.x+hw,pos.y+hh, pos.x,pos.y+TILE_H, pos.x-hw,pos.y+hh]);
  g.fill({color:0xffffff, alpha:0.15});
  g.stroke({color:0xffffff, alpha:0.6, width:1.5});
  window._uiContainer.addChild(g);
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

console.log('[pixiRenderer.js] chargé ✓');
