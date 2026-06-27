/* ===================== ZOOM (sans perte de netteté) ===================== */
// Le flou du zoom navigateur vient du fait qu'il étire une image déjà rasterisée.
// Ici, on fait l'inverse : à chaque changement de zoom, on RECALCULE la résolution
// réelle du buffer canvas (canvas.width/height, en tenant compte du devicePixelRatio
// de l'écran) puis on redessine tout depuis les coordonnées d'origine -- jamais
// d'agrandissement d'une image déjà figée.
let zoomLevel = ZOOM_DEFAULT;

// Recalcule la résolution du buffer canvas pour le zoom et l'écran actuels.
// La taille CSS affichée (canvas.style.width/height) suit le zoom ; le conteneur
// #canvasWrap (overflow:auto) permet de se déplacer dans la zone si elle dépasse
// la fenêtre visible -- pas besoin d'un système de "caméra" séparé.
function applyCanvasResolution(){
  const dpr = window.devicePixelRatio || 1;
  const cssW = WORLD_WIDTH * zoomLevel;
  const cssH = WORLD_HEIGHT * zoomLevel;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
}

// anchorScreenX/Y (optionnels) : coordonnées écran (clientX/clientY) du point qui doit
// rester immobile pendant le zoom -- le milieu du pincement, ou le curseur pour la
// molette. Sans eux, on ancre sur le centre du cadre visible (#canvasWrap), pour éviter
// que la vue ne dérive vers le coin haut-gauche comme avant.
function setZoom(value, anchorScreenX, anchorScreenY){
  const oldZoom = zoomLevel;
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  if (newZoom === oldZoom) return;

  const wrap = document.getElementById('canvasWrap');
  const wrapRect = wrap.getBoundingClientRect();
  if (anchorScreenX === undefined) anchorScreenX = wrapRect.left + wrapRect.width / 2;
  if (anchorScreenY === undefined) anchorScreenY = wrapRect.top + wrapRect.height / 2;

  // Position du point d'ancrage dans le contenu défilable, AVANT le changement de zoom.
  const contentX = wrap.scrollLeft + (anchorScreenX - wrapRect.left);
  const contentY = wrap.scrollTop + (anchorScreenY - wrapRect.top);

  zoomLevel = newZoom;
  applyCanvasResolution();

  // Le contenu a été redimensionné par ce ratio -- on replace le défilement pour que
  // le même point reste exactement sous l'ancrage (doigts / curseur).
  const ratio = newZoom / oldZoom;
  wrap.scrollLeft = contentX * ratio - (anchorScreenX - wrapRect.left);
  wrap.scrollTop = contentY * ratio - (anchorScreenY - wrapRect.top);

  render();
}

function zoomIn(){ setZoom(zoomLevel + ZOOM_STEP); }
function zoomOut(){ setZoom(zoomLevel - ZOOM_STEP); }

/* ---- Molette (desktop) ---- */
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setZoom(zoomLevel + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), e.clientX, e.clientY);
}, { passive: false });

/* ---- Pincement à deux doigts (mobile) ---- */
// On désactive le pincement natif du navigateur sur le canvas (touch-action:none en
// CSS) pour que ce soit NOTRE zoom qui s'applique, jamais celui du navigateur.
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
