/* ===================== PIXI.JS RENDERER ===================== */

// Tout est attaché à window directement pour éviter les problèmes de scope mobile

window._pixiApp           = null;
window._terrainContainer  = null;
window._entityContainer   = null;
window._terrainDirty      = true;
window._terrainTextures   = {};
window._terrainPatterns   = {};

window.TERRAIN_TEXTURE_PATHS = {
  grass:  'assets/textures/flat/game/grass_top.png',
  wheat:  'assets/textures/flat/game/sand_top.png',
  forest: 'assets/textures/flat/game/forest_top.png',
  hill:   'assets/textures/flat/game/grass_top.png',
  sand:   'assets/textures/flat/game/sand.png',
  rock:   'assets/textures/flat/game/stone.png',
  marble: 'assets/textures/flat/game/stone.png',
  dirt:   'assets/textures/flat/game/dirt.png',
};

window.PIXI_TILE_COLORS = {
  grass: 0x7db648, wheat: 0xc9a83c, forest: 0x4a8a3a,
  hill: 0x9ab870, sand: 0xd4b870, water: 0x3a86c8,
  rock: 0x8a8070, marble: 0xddd8c8,
};

window.isPixiReady = function(){
  return !!window._pixiApp;
};

window.invalidatePixiTerrain = function(){
  window._terrainDirty = true;
};

window.initPixiRenderer = async function(){
  if (!window.PIXI){
    console.warn('[Pixi] PIXI.js non disponible');
    return false;
  }
  try {
    const oldCanvas = document.getElementById('gameCanvas');
    if (!oldCanvas){ console.warn('[Pixi] gameCanvas introuvable'); return false; }
    const parent = oldCanvas.parentElement;

    const app = new PIXI.Application();
    await app.init({
      width:           window.innerWidth,
      height:          window.innerHeight,
      backgroundColor: 0x0b2134,
      antialias:       false,
      resolution:      Math.min(window.devicePixelRatio || 1, 1.5),
      autoDensity:     true,
    });

    app.canvas.id = 'gameCanvas';
    app.canvas.style.position = 'fixed';
    app.canvas.style.inset = '0';
    app.canvas.style.touchAction = 'none';
    app.canvas.style.cursor = 'pointer';
    parent.replaceChild(app.canvas, oldCanvas);

    window._pixiApp          = app;
    window._terrainContainer = new PIXI.Container();
    window._entityContainer  = new PIXI.Container();

    app.stage.addChild(window._terrainContainer);
    app.stage.addChild(window._entityContainer);

    // Charger les textures
    await window._loadPixiTextures();

    // Rebuild terrain quand on resize
    window.addEventListener('resize', function(){
      app.renderer.resize(window.innerWidth, window.innerHeight);
      window._terrainDirty = true;
    });

    // Réenregistrer les listeners caméra sur le nouveau canvas
    if (typeof initCamera === 'function') initCamera();
    if (typeof initZoom   === 'function') initZoom();

    console.log('[Pixi] OK — renderer:', app.renderer.type === 1 ? 'WebGL' : 'Canvas');
    return true;
  } catch(e){
    console.error('[Pixi] Erreur init:', e);
    return false;
  }
};

window._loadPixiTextures = async function(){
  const paths = window.TERRAIN_TEXTURE_PATHS;
  const promises = Object.entries(paths).map(async function([terrain, path]){
    try {
      window._terrainTextures[terrain] = await PIXI.Assets.load(path);
    } catch(e){
      window._terrainTextures[terrain] = null;
    }
  });
  await Promise.all(promises);
  console.log('[Pixi] Textures chargées');
};

window.buildPixiTerrain = function(){
  if (!window._pixiApp || !Array.isArray(grid) || !grid.length) return;
  if (typeof isTerrainGenerationInProgress === 'function' && isTerrainGenerationInProgress()) return;

  window._terrainContainer.removeChildren();

  const drawOrder = typeof getMapDrawOrder === 'function' ? getMapDrawOrder() : [];
  const elevStep  = typeof TILE_H !== 'undefined' ? Math.round(TILE_H * 0.19) : 12;

  drawOrder.forEach(function(item){
    var col = item.col, row = item.row;
    var cell = grid[row][col];
    if (!cell) return;

    var cx   = OFFSET_X + (col - row) * (TILE_W / 2);
    var cy   = OFFSET_Y + (col + row) * (TILE_H / 2);
    var elev = (cell.terrain === 'water') ? 0 : Math.max(0, ((cell.level || 1) - 1)) * elevStep;
    var ty   = cy - elev;
    var hw   = TILE_W / 2 + 1;
    var hh   = TILE_H / 2 + 0.5;

    var g = new PIXI.Graphics();

    // Falaise
    if (elev > 0){
      g.poly([cx-hw, ty+hh, cx, ty+TILE_H+1, cx+hw, ty+hh, cx+hw, cy+hh, cx, cy+TILE_H+1, cx-hw, cy+hh]);
      g.fill({ color: 0x000000, alpha: 0.28 });
    }

    // Surface
    var tex = window._terrainTextures[cell.terrain];
    var pts = [cx, ty, cx+hw, ty+hh, cx, ty+TILE_H+1, cx-hw, ty+hh];

    if (tex){
      var m = new PIXI.Matrix();
      m.translate(cx - hw, ty);
      g.poly(pts);
      g.fill({ texture: tex, matrix: m });
    } else {
      g.poly(pts);
      g.fill({ color: window.PIXI_TILE_COLORS[cell.terrain] || 0x888888 });
    }

    window._terrainContainer.addChild(g);
  });

  window._terrainDirty = false;
  console.log('[Pixi] Terrain baked:', drawOrder.length, 'tuiles');
};

window.renderPixi = function(now){
  if (!window._pixiApp) return;

  if (window._terrainDirty){
    window.buildPixiTerrain();
  }

  // Appliquer caméra
  if (typeof camera !== 'undefined' && typeof zoomLevel !== 'undefined'){
    window._pixiApp.stage.scale.set(zoomLevel);
    window._pixiApp.stage.position.set(-camera.x * zoomLevel, -camera.y * zoomLevel);
  }

  // Entités dynamiques
  window._entityContainer.removeChildren();

  var zoom  = typeof zoomLevel !== 'undefined' ? zoomLevel : 1;
  var camX  = typeof camera !== 'undefined' ? camera.x : 0;
  var camY  = typeof camera !== 'undefined' ? camera.y : 0;
  var vwW   = window.innerWidth  / zoom;
  var vhW   = window.innerHeight / zoom;

  // Walkers
  if (typeof walkers !== 'undefined' && Array.isArray(walkers)){
    walkers.forEach(function(w){
      if (!w || !w.path || w.path.length <= 1) return;
      var pos = typeof getWalkerScreenPos === 'function' ? getWalkerScreenPos(w, now) : null;
      if (!pos) return;
      if (pos.x < camX - 60 || pos.x > camX + vwW + 60) return;
      if (pos.y < camY - 60 || pos.y > camY + vhW + 60) return;

      var g = new PIXI.Graphics();
      g.circle(pos.x, pos.y - 8, 10);
      var col = (typeof SERVICE_COLORS !== 'undefined' && SERVICE_COLORS[w.serviceType])
        ? parseInt(SERVICE_COLORS[w.serviceType].replace('#',''), 16)
        : 0xe8c468;
      g.fill({ color: col });
      g.stroke({ color: 0x000000, alpha: 0.5, width: 1.5 });
      window._entityContainer.addChild(g);
    });
  }
};

console.log('[pixiRenderer.js] chargé, isPixiReady:', typeof window.isPixiReady);
