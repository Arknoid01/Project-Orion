/* ===================== CAMERA VIEWPORT ===================== */
// Remplace le scroll DOM (canvasWrap overflow:auto + canvas pleine-carte).
// Le canvas fait la taille de l'écran, la caméra est un offset (x,y) en pixels-monde.
// Gains : canvas ~5Mo au lieu de ~200Mo, bake ~150 tuiles au lieu de 14400.

const camera = { x: 0, y: 0 };

/** Taille du canvas = taille physique de l'écran (devicePixelRatio inclus). */
function applyCanvasResolution(){
  const dpr = getRenderDpr();
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h){
    canvas.width  = w;
    canvas.height = h;
  }
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
}

/** Déplace la caméra de (dx,dy) pixels-monde, avec clamp aux bords de la carte. */
function moveCamera(dx, dy){
  const dpr  = getRenderDpr();
  const vw   = canvas.width  / dpr;   // viewport en pixels-monde
  const vh   = canvas.height / dpr;
  camera.x = Math.max(0, Math.min(WORLD_WIDTH  - vw, camera.x + dx));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - vh, camera.y + dy));
  if (typeof invalidateVisibleTilesCache === 'function') invalidateVisibleTilesCache();
  if (typeof markRenderDirty === 'function') markRenderDirty();
}

/** Centre la caméra sur un point monde (wx, wy). */
function centerCameraOn(wx, wy){
  const dpr = getRenderDpr();
  const vw  = canvas.width  / dpr;
  const vh  = canvas.height / dpr;
  camera.x = Math.max(0, Math.min(WORLD_WIDTH  - vw, wx - vw / 2));
  camera.y = Math.max(0, Math.min(WORLD_HEIGHT - vh, wy - vh / 2));
  if (typeof invalidateVisibleTilesCache === 'function') invalidateVisibleTilesCache();
  if (typeof markRenderDirty === 'function') markRenderDirty();
}

/** Convertit un clic écran (clientX/Y) en coordonnées monde. */
function clientToWorld(clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  // pixels CSS → pixels monde : diviser par zoom, ajouter offset caméra
  return {
    mx: (clientX - rect.left) / zoomLevel + camera.x,
    my: (clientY - rect.top)  / zoomLevel + camera.y,
  };
}

/** Bounds monde visibles (avec marge pour éviter les pop-ins). */
function getVisibleWorldBounds(){
  const dpr = getRenderDpr();
  const vw  = canvas.width  / dpr;
  const vh  = canvas.height / dpr;
  const pad = TILE_W * 2;
  return {
    left:   camera.x / zoomLevel - pad,
    top:    camera.y / zoomLevel - pad,
    right:  camera.x / zoomLevel + vw / zoomLevel + pad,
    bottom: camera.y / zoomLevel + vh / zoomLevel + pad,
  };
}

function isTileInView(col, row, bounds){
  if (!bounds) return true;
  const { x, y } = tileCenter(col, row);
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

/* -------- Pan tactile (1 doigt) -------- */
let _panLastX = null, _panLastY = null;

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1){
    _panLastX = e.touches[0].clientX;
    _panLastY = e.touches[0].clientY;
  }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1 && _panLastX !== null){
    e.preventDefault();
    const dx = (_panLastX - e.touches[0].clientX) / zoomLevel;
    const dy = (_panLastY - e.touches[0].clientY) / zoomLevel;
    moveCamera(dx, dy);
    _panLastX = e.touches[0].clientX;
    _panLastY = e.touches[0].clientY;
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (e.touches.length < 1){ _panLastX = null; _panLastY = null; }
});

/* -------- Pan souris (desktop) -------- */
let _mouseDown = false, _mouseLast = null;

canvas.addEventListener('mousedown', (e) => {
  if (e.button === 1 || (e.button === 0 && e.altKey)){
    _mouseDown = true;
    _mouseLast = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }
});

window.addEventListener('mousemove', (e) => {
  if (!_mouseDown || !_mouseLast) return;
  moveCamera(
    (_mouseLast.x - e.clientX) / zoomLevel,
    (_mouseLast.y - e.clientY) / zoomLevel,
  );
  _mouseLast = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => { _mouseDown = false; _mouseLast = null; });

/* -------- Resize -------- */
window.addEventListener('resize', () => {
  applyCanvasResolution();
  if (typeof markRenderDirty === 'function') markRenderDirty();
});
