let zoomLevel = ZOOM_DEFAULT;

function getRenderDpr(){
  return Math.min(window.devicePixelRatio || 1, RENDER_DPR_CAP);
}

function setZoom(value, anchorClientX, anchorClientY){
  const oldZoom = zoomLevel;
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  if (newZoom === oldZoom) return;

  const rect = canvas.getBoundingClientRect();
  const ax = (anchorClientX !== undefined) ? anchorClientX : rect.left + rect.width  / 2;
  const ay = (anchorClientY !== undefined) ? anchorClientY : rect.top  + rect.height / 2;

  const worldX = camera.x + (ax - rect.left) / oldZoom;
  const worldY = camera.y + (ay - rect.top)  / oldZoom;

  zoomLevel = newZoom;

  const dpr = getRenderDpr();
  const vwWorld = canvas.width  / dpr / newZoom;
  const vhWorld = canvas.height / dpr / newZoom;
  camera.x = Math.max(0, Math.min(Math.max(0, WORLD_WIDTH  - vwWorld), worldX - (ax - rect.left) / newZoom));
  camera.y = Math.max(0, Math.min(Math.max(0, WORLD_HEIGHT - vhWorld), worldY - (ay - rect.top)  / newZoom));

  if (typeof invalidateVisibleTilesCache === 'function') invalidateVisibleTilesCache();
  if (typeof markRenderDirty === 'function') markRenderDirty();
  if (typeof invalidateFlatMapCanvas === 'function') invalidateFlatMapCanvas();
  if (typeof invalidatePixiTerrain === 'function') invalidatePixiTerrain();
}

function zoomIn(){  setZoom(zoomLevel + ZOOM_STEP); }
function zoomOut(){ setZoom(zoomLevel - ZOOM_STEP); }

let _pinchDist = null, _pinchZoom = 1, _pinchMidX = 0, _pinchMidY = 0;
function _touchDist(t){ return Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY); }

function initZoom(){
  const zt = document.getElementById('canvasWrap') || document;

  zt.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(zoomLevel + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), e.clientX, e.clientY);
  }, { passive: false });

  zt.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2){
      _pinchDist = _touchDist(e.touches);
      _pinchZoom = zoomLevel;
      _pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      _pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }, { passive: true });

  zt.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && _pinchDist){
      e.preventDefault();
      const ratio = _touchDist(e.touches) / _pinchDist;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setZoom(_pinchZoom * ratio, midX, midY);
    }
  }, { passive: false });

  zt.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) _pinchDist = null;
  });
}
