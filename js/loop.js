/* ===================== BOUCLE D'AFFICHAGE ===================== */
// La simulation (tick) tourne à 1/seconde via setInterval (voir main.js).
// L'affichage tourne lui à ~60fps actif / ~15fps idle via requestAnimationFrame,
// pour permettre l'interpolation des walkers tout en économisant CPU/batterie.
const TICK_DURATION_MS = 1000;
let lastTickTimestamp = performance.now();

// Throttle adaptatif : 60fps quand la scène bouge, 15fps sinon.
const RENDER_FPS_ACTIVE = 60;
const RENDER_FPS_IDLE   = 15;
let _renderLastTime  = 0;
let _renderDirty     = true;   // true = forcer un rendu même en idle
let _renderIdleTicks = 0;      // frames consécutives sans mouvement

/** Marque le rendu comme "actif" — appelé depuis UI, walkers, tile hover, etc. */
function markRenderDirty(){
  _renderDirty = true;
  _renderIdleTicks = 0;
}

function startRenderLoop(){
  function frame(now){
    requestAnimationFrame(frame);

    // Pause totale si l'onglet est masqué (Android background).
    if (typeof document !== 'undefined' && document.hidden) return;

    // Nombre de walkers / créatures actifs (proxy de "mouvement en cours").
    const hasMoving = (typeof walkers !== 'undefined' && walkers.some(w => w.path && w.path.length > 1))
      || (typeof migrants !== 'undefined' && migrants.length > 0)
      || (typeof godAgents !== 'undefined' && godAgents.length > 0)
      || (typeof monster !== 'undefined' && monster)
      || (typeof hero !== 'undefined' && hero)
      || (typeof hoverTile !== 'undefined' && hoverTile);

    if (hasMoving) markRenderDirty();

    const targetFps  = _renderDirty ? RENDER_FPS_ACTIVE : RENDER_FPS_IDLE;
    const minInterval = 1000 / targetFps;
    const elapsed = now - _renderLastTime;
    if (elapsed < minInterval - 1) return;   // -1ms de marge pour éviter drift

    _renderLastTime = now;

    // Bascule Pixi ou Canvas2D
    if (typeof isPixiReady === 'function' && isPixiReady()){
      renderPixi(now);
    } else {
      render(now);
    }

    // Après N frames consécutives sans changement, passe en idle.
    if (!hasMoving){
      _renderIdleTicks++;
      if (_renderIdleTicks > 4) _renderDirty = false;
    }
  }
  requestAnimationFrame(frame);
}
