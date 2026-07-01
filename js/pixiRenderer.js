/* ===================== PIXI.JS RENDERER =====================
 * Remplace Canvas2D pour le rendu terrain + entités.
 * La logique de jeu (grid, walkers, buildings...) ne change pas.
 * ============================================================ */

let _pixiApp = null;
let _terrainContainer = null;
let _decorContainer   = null;
let _entityContainer  = null;  // bâtiments + walkers
let _uiContainer      = null;  // sélection, highlights

// Sprites Pixi réutilisables pour les walkers (pool)
const _walkerSprites  = new Map(); // walkerId → PIXI.Sprite
const _buildingSprites = new Map(); // "col,row" → PIXI.Sprite

// Textures terrain chargées
const _terrainTextures = {};
const _buildingTextures = {};

let _terrainTiles = []; // PIXI.Sprite[] pour le terrain (rebuilt au bake)
let _lastCamX = -1e9, _lastCamY = -1e9, _lastZoom = -1;
let _terrainDirty = true;

/* ------------------------------------------------------------------ */
/* INIT                                                                */
/* ------------------------------------------------------------------ */
async function initPixiRenderer(){
  if (!window.PIXI){
    console.error('[Pixi] PIXI.js non chargé');
    return false;
  }

  // Remplace le canvas HTML par une app Pixi
  const oldCanvas = document.getElementById('gameCanvas');
  const parent = oldCanvas.parentElement;

  _pixiApp = new PIXI.Application();
  await _pixiApp.init({
    width:           window.innerWidth,
    height:          window.innerHeight,
    backgroundColor: 0x0b2134,
    antialias:       false,  // désactivé pour perf mobile
    resolution:      Math.min(window.devicePixelRatio || 1, RENDER_DPR_CAP || 1),
    autoDensity:     true,
    hello:           false,
  });

  _pixiApp.canvas.id = 'gameCanvas';
  _pixiApp.canvas.style.cssText = oldCanvas.style.cssText + '; touch-action:none;';
  parent.replaceChild(_pixiApp.canvas, oldCanvas);

  // Conteneurs en ordre de profondeur
  _terrainContainer = new PIXI.Container();
  _decorContainer   = new PIXI.Container();
  _entityContainer  = new PIXI.Container();
  _uiContainer      = new PIXI.Container();

  _pixiApp.stage.addChild(_terrainContainer);
  _pixiApp.stage.addChild(_decorContainer);
  _pixiApp.stage.addChild(_entityContainer);
  _pixiApp.stage.addChild(_uiContainer);

  // Charger les textures terrain
  await _loadTerrainTextures();

  // Resize
  window.addEventListener('resize', _onResize);

  console.log('[Pixi] Initialisé', _pixiApp.renderer.type === 1 ? 'WebGL' : 'Canvas fallback');
  return true;
}

function _onResize(){
  if (!_pixiApp) return;
  _pixiApp.renderer.resize(window.innerWidth, window.innerHeight);
  _terrainDirty = true;
}

/* ------------------------------------------------------------------ */
/* TEXTURES TERRAIN                                                    */
/* ------------------------------------------------------------------ */
const TERRAIN_TEXTURE_PATHS = {
  grass:  'assets/textures/flat/game/grass_top.png',
  wheat:  'assets/textures/flat/game/sand_top.png',
  forest: 'assets/textures/flat/game/forest_top.png',
  hill:   'assets/textures/flat/game/grass_top.png',
  sand:   'assets/textures/flat/game/sand.png',
  rock:   'assets/textures/flat/game/stone.png',
  marble: 'assets/textures/flat/game/stone.png',
  dirt:   'assets/textures/flat/game/dirt.png',
};

const TERRAIN_COLORS = {
  grass: 0x7db648, wheat: 0xc9a83c, forest: 0x4a8a3a,
  hill: 0x9ab870, sand: 0xd4b870, water: 0x3a86c8,
  rock: 0x8a8070, marble: 0xddd8c8,
};

async function _loadTerrainTextures(){
  const promises = Object.entries(TERRAIN_TEXTURE_PATHS).map(async ([terrain, path]) => {
    try {
      _terrainTextures[terrain] = await PIXI.Assets.load(path);
    } catch {
      _terrainTextures[terrain] = null;
    }
  });
  await Promise.all(promises);
}

/* ------------------------------------------------------------------ */
/* TERRAIN : construction du tilemap Pixi                             */
/* ------------------------------------------------------------------ */
const FLAT_ELEV_STEP = typeof TILE_H !== 'undefined' ? Math.round(TILE_H * 0.19) : 12;

function _getElevOffset(cell){
  if (!cell || cell.terrain === 'water') return 0;
  return Math.max(0, ((cell.level || 1) - 1)) * FLAT_ELEV_STEP;
}

/**
 * Crée un Graphics Pixi en forme de losange avec la texture seamless.
 * Pixi Graphics.fill() avec une texture = clip natif GPU, zero overhead CPU.
 */
function _buildTerrainTile(col, row, cell){
  const cx = OFFSET_X + (col - row) * (TILE_W / 2);
  const cy = OFFSET_Y + (col + row) * (TILE_H / 2);
  const elev = _getElevOffset(cell);
  const ty = cy - elev;
  const hw = TILE_W / 2 + 1;
  const hh = TILE_H / 2 + 0.5;

  const g = new PIXI.Graphics();

  // Falaise
  if (elev > 0){
    const ty0 = cy;
    g.poly([
      cx - hw, ty  + hh,
      cx,      ty  + TILE_H + 1,
      cx + hw, ty  + hh,
      cx + hw, ty0 + hh,
      cx,      ty0 + TILE_H + 1,
      cx - hw, ty0 + hh,
    ]);
    g.fill({ color: 0x000000, alpha: 0.28 });
  }

  // Surface du losange
  const tex = _terrainTextures[cell.terrain];
  const points = [cx, ty, cx + hw, ty + hh, cx, ty + TILE_H + 1, cx - hw, ty + hh];

  if (tex){
    // Texture seamless : matrix pour ancrer la texture en coords monde
    const matrix = new PIXI.Matrix();
    matrix.translate(-(cx - hw) % tex.width, -(ty) % tex.height);
    g.poly(points);
    g.fill({ texture: tex, matrix });
  } else {
    g.poly(points);
    g.fill({ color: TERRAIN_COLORS[cell.terrain] || 0x888888 });
  }

  return g;
}

function buildPixiTerrain(){
  if (!_pixiApp || !Array.isArray(grid) || grid.length === 0) return;
  if (typeof isTerrainGenerationInProgress === 'function' && isTerrainGenerationInProgress()) return;

  _terrainContainer.removeChildren();
  _decorContainer.removeChildren();
  _terrainTiles = [];

  const drawOrder = typeof getMapDrawOrder === 'function' ? getMapDrawOrder() : [];

  drawOrder.forEach(({ col, row }) => {
    const cell = grid[row][col];
    if (!cell) return;
    const tile = _buildTerrainTile(col, row, cell);
    _terrainContainer.addChild(tile);
    _terrainTiles.push({ col, row, tile });
  });

  _terrainDirty = false;
  console.log(`[Pixi] Terrain baked : ${_terrainTiles.length} tuiles`);
}

/* ------------------------------------------------------------------ */
/* CAMERA : applique la caméra au stage Pixi                          */
/* ------------------------------------------------------------------ */
function _applyPixiCamera(){
  if (!_pixiApp || typeof camera === 'undefined') return;
  const dpr  = Math.min(window.devicePixelRatio || 1, RENDER_DPR_CAP || 1);
  const zoom = typeof zoomLevel === 'number' ? zoomLevel : 1;

  _pixiApp.stage.scale.set(zoom);
  _pixiApp.stage.position.set(-camera.x * zoom, -camera.y * zoom);

  _lastCamX = camera.x;
  _lastCamY = camera.y;
  _lastZoom = zoom;
}

/* ------------------------------------------------------------------ */
/* ENTITÉS : walkers et bâtiments                                     */
/* ------------------------------------------------------------------ */
function _updatePixiEntities(now){
  if (!_pixiApp || !Array.isArray(grid)) return;
  _entityContainer.removeChildren();

  const zoom  = typeof zoomLevel === 'number' ? zoomLevel : 1;
  const vwW   = window.innerWidth  / zoom;
  const vhW   = window.innerHeight / zoom;
  const camX  = typeof camera !== 'undefined' ? camera.x : 0;
  const camY  = typeof camera !== 'undefined' ? camera.y : 0;

  // Bâtiments
  if (typeof getMapDrawOrder === 'function'){
    getMapDrawOrder().forEach(({ col, row }) => {
      const cell = grid[row][col];
      if (!cell || !cell.building) return;
      const tc = typeof tileCenter === 'function' ? tileCenter(col, row) : { x: 0, y: 0 };
      if (tc.x < camX - TILE_W || tc.x > camX + vwW + TILE_W) return;
      if (tc.y < camY - TILE_H * 4 || tc.y > camY + vhW + TILE_H) return;

      // Fallback cercle coloré (remplacer par sprite plus tard)
      const g = new PIXI.Graphics();
      g.rect(tc.x - TILE_W / 4, tc.y - TILE_H, TILE_W / 2, TILE_H);
      g.fill({ color: 0x8b6914, alpha: 0.9 });
      _entityContainer.addChild(g);
    });
  }

  // Walkers
  if (typeof walkers !== 'undefined' && Array.isArray(walkers)){
    walkers.forEach(w => {
      if (!w || w.path.length <= 1) return;
      const pos = typeof getWalkerScreenPos === 'function'
        ? getWalkerScreenPos(w, now)
        : null;
      if (!pos) return;
      if (pos.x < camX - 50 || pos.x > camX + vwW + 50) return;
      if (pos.y < camY - 50 || pos.y > camY + vhW + 50) return;

      const g = new PIXI.Graphics();
      g.circle(pos.x, pos.y - 8, 10);
      const color = typeof SERVICE_COLORS !== 'undefined'
        ? parseInt((SERVICE_COLORS[w.serviceType] || '#e8c468').replace('#',''), 16)
        : 0xe8c468;
      g.fill({ color });
      g.stroke({ color: 0x000000, alpha: 0.5, width: 1.5 });
      _entityContainer.addChild(g);
    });
  }
}

/* ------------------------------------------------------------------ */
/* BOUCLE PRINCIPALE : appelée depuis startRenderLoop()               */
/* ------------------------------------------------------------------ */
function renderPixi(now){
  if (!_pixiApp) return;

  if (_terrainDirty){
    buildPixiTerrain();
  }

  _applyPixiCamera();
  _updatePixiEntities(now);
  // Pixi gère son propre ticker — pas besoin de requestAnimationFrame manuel
}

/* ------------------------------------------------------------------ */
/* EXPORTS pour le reste du jeu                                        */
/* ------------------------------------------------------------------ */
function invalidatePixiTerrain(){
  _terrainDirty = true;
}

function isPixiReady(){
  return !!_pixiApp;
}

/* --- Exposition globale (nécessaire sur certains navigateurs mobiles) --- */
window.initPixiRenderer  = initPixiRenderer;
window.isPixiReady       = isPixiReady;
window.renderPixi        = renderPixi;
window.buildPixiTerrain  = buildPixiTerrain;
window.invalidatePixiTerrain = invalidatePixiTerrain;
