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

    // Migrants : pas basés sur le tick simulation (1 Hz) — avancent en temps réel.
    if (typeof tickMigrants === 'function') tickMigrants(now);

    // Animation réelle (walkers, créatures…) — pas le simple survol / mode construction.
    const hasAnimating = (typeof walkers !== 'undefined' && walkers.some(w =>
        typeof isWalkerMoving === 'function' && isWalkerMoving(w, now)))
      || (typeof migrants !== 'undefined' && migrants.some(m =>
        (m.path && m.pathIndex < m.path.length)
        || (typeof isMigrantMoving === 'function' && isMigrantMoving(m, now))))
      || (typeof godAgents !== 'undefined' && godAgents.length > 0)
      || (typeof monster !== 'undefined' && monster)
      || (typeof hero !== 'undefined' && hero)
      || (typeof getMilitarySoldiers === 'function' && getMilitarySoldiers().length > 0)
      || (typeof fleet !== 'undefined' && fleet.ships > 0 && typeof countHarbors === 'function' && countHarbors() > 0);

    const hasHoverUi = (typeof hoverTile !== 'undefined' && hoverTile)
      && ((typeof selectedBuilding !== 'undefined' && selectedBuilding)
        || (typeof roadMode !== 'undefined' && roadMode)
        || (typeof demolishMode !== 'undefined' && demolishMode)
        || (typeof blockMode !== 'undefined' && blockMode)
        || (typeof stairsMode !== 'undefined' && stairsMode)
        || (typeof zonePlacementStart !== 'undefined' && zonePlacementStart));

    if (hasAnimating) markRenderDirty();

    let targetFps  = _renderDirty ? RENDER_FPS_ACTIVE : RENDER_FPS_IDLE;
    const fpsCap = (typeof getOverlayFpsCap === 'function') ? getOverlayFpsCap()
      : ((typeof PERF !== 'undefined' && PERF.overlayFpsCap) ? PERF.overlayFpsCap : 60);
    if (fpsCap) targetFps = Math.min(targetFps, fpsCap);
    // Survol / placement sans animation : 30 fps suffisent pour la surbrillance.
    if (!hasAnimating && hasHoverUi) targetFps = Math.min(targetFps, 30);
    const minInterval = 1000 / targetFps;
    const elapsed = now - _renderLastTime;
    if (elapsed < minInterval - 1) return;   // -1ms de marge pour éviter drift

    _renderLastTime = now;

    // Bascule Three.js ou Pixi ou Canvas2D
    if (typeof isThreeReady === 'function' && isThreeReady()){
      renderThree(now);
    } else if (typeof isPixiReady === 'function' && isPixiReady()){
      renderPixi(now);
    } else {
      render(now);
    }

    // Après N frames consécutives sans changement, passe en idle.
    if (!hasAnimating){
      _renderIdleTicks++;
      if (_renderIdleTicks > 4) _renderDirty = false;
    }
  }
  requestAnimationFrame(frame);
}
