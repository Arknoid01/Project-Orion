/* ===================== ZOOM (fluide) ===================== */
// Le buffer canvas reste à résolution fixe (monde × RENDER_DPR_CAP) : le zoom
// n'agrandit que l'affichage CSS. Netteté légèrement moindre zoomé au-delà de 1×,
// mais plus de recréation de buffer ni de render() à chaque cran de molette.
let zoomLevel = ZOOM_DEFAULT;

function getRenderDpr(){
  return Math.min(window.devicePixelRatio || 1, RENDER_DPR_CAP);
}

function applyCanvasResolution(){
  const dpr = getRenderDpr();
  canvas.width = Math.round(WORLD_WIDTH * dpr);
  canvas.height = Math.round(WORLD_HEIGHT * dpr);
  canvas.style.width = `${WORLD_WIDTH * zoomLevel}px`;
  canvas.style.height = `${WORLD_HEIGHT * zoomLevel}px`;
}

// anchorScreenX/Y (optionnels) : coordonnées écran (clientX/clientY) du point qui doit
// rester immobile pendant le zoom -- le milieu du pincement, ou le curseur pour la
// molette. Sans eux, on ancre sur le centre du cadre visible (#canvasWrap).
function setZoom(value, anchorScreenX, anchorScreenY){
  const oldZoom = zoomLevel;
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  if (newZoom === oldZoom) return;

  const wrap = document.getElementById('canvasWrap');
  if (!wrap){
    zoomLevel = newZoom;
    applyCanvasResolution();
    return;
  }
  const wrapRect = wrap.getBoundingClientRect();
  if (anchorScreenX === undefined) anchorScreenX = wrapRect.left + wrapRect.width / 2;
  if (anchorScreenY === undefined) anchorScreenY = wrapRect.top + wrapRect.height / 2;

  const contentX = wrap.scrollLeft + (anchorScreenX - wrapRect.left);
  const contentY = wrap.scrollTop + (anchorScreenY - wrapRect.top);

  zoomLevel = newZoom;
  applyCanvasResolution();

  const ratio = newZoom / oldZoom;
  wrap.scrollLeft = contentX * ratio - (anchorScreenX - wrapRect.left);
  wrap.scrollTop = contentY * ratio - (anchorScreenY - wrapRect.top);
}

function zoomIn(){ setZoom(zoomLevel + ZOOM_STEP); }
function zoomOut(){ setZoom(zoomLevel - ZOOM_STEP); }

function getVisibleWorldBounds(){
  const wrap = document.getElementById('canvasWrap');
  if (!wrap) return null;
  const pad = TILE_W * 3;
  return {
    left: wrap.scrollLeft / zoomLevel - pad,
    top: wrap.scrollTop / zoomLevel - pad,
    right: (wrap.scrollLeft + wrap.clientWidth) / zoomLevel + pad,
    bottom: (wrap.scrollTop + wrap.clientHeight) / zoomLevel + pad,
  };
}

function isTileInView(col, row, bounds){
  if (!bounds) return true;
  const { x, y } = tileCenter(col, row);
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

// Convertit un clic écran (clientX/clientY) en coordonnées monde du canvas.
function clientToWorld(clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || WORLD_WIDTH * zoomLevel;
  const h = rect.height || WORLD_HEIGHT * zoomLevel;
  return {
    mx: (clientX - rect.left) * (WORLD_WIDTH / w),
    my: (clientY - rect.top) * (WORLD_HEIGHT / h),
  };
}

/* ---- Molette (desktop) ---- */
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setZoom(zoomLevel + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), e.clientX, e.clientY);
}, { passive: false });

/* ---- Pincement à deux doigts (mobile) ---- */
let pinchStartDistance = null;
let pinchStartZoom = 1;

function touchDistance(touches){
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 2){
    pinchStartDistance = touchDistance(e.touches);
    pinchStartZoom = zoomLevel;
  }
}, { passive: true });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 2 && pinchStartDistance){
    e.preventDefault();
    const ratio = touchDistance(e.touches) / pinchStartDistance;
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    setZoom(pinchStartZoom * ratio, midX, midY);
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) pinchStartDistance = null;
});
