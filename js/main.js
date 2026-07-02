/* ===================== ORCHESTRATION ===================== */
function resetGame(){
  startScenario(currentScenarioId || 'sandbox');
}

function refreshUI(){
  refreshButtonStates();
  render();
  updateResourceBar();
  if (typeof renderHud === 'function') renderHud();
  if (typeof renderColonyHud === 'function') renderColonyHud();
  renderMythologyPanel();
  if (typeof refreshAdventureUI === 'function') refreshAdventureUI();
  renderObjectivesPanel();
  renderTaxPanel();
  renderCalendarPanel();
  renderFestivalPanel();
  renderDiplomacyPanel();
  renderTradePanel();
  renderCreaturePanel();
}

/* ===================== INIT ===================== */
initLanguageFromStorage();
document.documentElement.lang = currentLang;
applyStaticTranslations();
applyCanvasResolution();
buildPalette();
if (typeof renderQuickBuildCatalog === 'function') renderQuickBuildCatalog();
applyGameUITranslations();
if (typeof renderColonyHud === 'function') renderColonyHud();

if (loadGame()){
  debugInfo('Sauvegarde restaurée au chargement de la page');
  document.getElementById('mainMenuOverlay').classList.remove('open');
  hideMainMenu();
  applyGameUITranslations();
  refreshUI();
  if (typeof centerMapView === 'function') centerMapView();
} else {
  showMainMenu();
  if (typeof applyHomeTranslations === 'function') applyHomeTranslations();
}

setInterval(tick, 1000);
setInterval(() => {
  if (typeof isGamePaused === 'function' && isGamePaused()) return;
  saveGame({ silent: true });
}, 10000);

// Init Three.js (terrain) + Pixi (décors) puis démarrage de la boucle
async function initRenderers(){
  // 1) Three.js pour le terrain
  if (typeof initThreeRenderer === 'function'){
    const ok = await initThreeRenderer();
    if (ok){
      console.log('[Main] Three.js actif');

      // 2) Canvas Pixi transparent pour les décors par-dessus Three.js
      if (window.PIXI){
        const cv = document.createElement('canvas');
        cv.style.cssText = 'position:fixed;inset:0;z-index:2;pointer-events:none;';
        cv.width  = window.innerWidth  * Math.min(window.devicePixelRatio, 1.5);
        cv.height = window.innerHeight * Math.min(window.devicePixelRatio, 1.5);
        cv.style.width  = window.innerWidth  + 'px';
        cv.style.height = window.innerHeight + 'px';
        document.getElementById('canvasWrap').appendChild(cv);

        const pixiApp = new PIXI.Application();
        await pixiApp.init({
          canvas: cv,
          width: cv.width, height: cv.height,
          backgroundAlpha: 0,
          antialias: false,
          resolution: 1,
        });
        window._pixiDecorApp = pixiApp;
        console.log('[Main] Pixi décors actif');
      }

      // Réenregistrer les listeners canvas sur le canvas Three.js
      if (typeof initCanvasListeners === 'function') initCanvasListeners();
    } else {
      console.warn('[Main] Three.js indispo, fallback Canvas2D');
    }
  }
  startRenderLoop();
}

initRenderers();
