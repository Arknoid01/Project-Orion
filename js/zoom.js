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

function setZoom(value){
  zoomLevel = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
  applyCanvasResolution();
  render();
}

function zoomIn(){ setZoom(zoomLevel + ZOOM_STEP); }
function zoomOut(){ setZoom(zoomLevel - ZOOM_STEP); }

/* ---- Molette (desktop) ---- */
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  setZoom(zoomLevel + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
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
    setZoom(pinchStartZoom * ratio);
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  if (e.touches.length < 2) pinchStartDistance = null;
});
