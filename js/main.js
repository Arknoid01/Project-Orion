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

if (typeof tryAutoLoadOnStartup === 'function' ? tryAutoLoadOnStartup() : loadGame()){
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
  const runSave = () => saveGame({ silent: true });
  if (typeof requestIdleCallback === 'function'){
    requestIdleCallback(runSave, { timeout: 3000 });
  } else {
    runSave();
  }
}, 10000);

// Three.js (terrain) + Pixi overlay (sprites) puis boucle de rendu
async function initRenderers(){
  if (typeof initThreeRenderer === 'function'){
    const ok = await initThreeRenderer();
    if (ok){
      console.log('[Main] Three.js actif');

      if (typeof initPixiOverlay === 'function'){
        await initPixiOverlay();
        console.log('[Main] Pixi overlay actif');
        if (typeof buildThreeDecors === 'function') buildThreeDecors();
      }

      if (typeof initCanvasListeners === 'function') initCanvasListeners();
      if (typeof centerMapView === 'function') centerMapView();
      if (typeof applyMediterraneanViewportGrade === 'function') applyMediterraneanViewportGrade();
    } else {
      console.warn('[Main] Three.js indispo, fallback Canvas2D');
      if (typeof loadGameScript === 'function'){
        try {
          await loadGameScript('js/flatRenderer.js');
        } catch (e){
          console.warn('[Main] flatRenderer.js non chargé', e);
        }
      }
      if (typeof initPixiRenderer === 'function') await initPixiRenderer();
    }
  }
  startRenderLoop();
}

initRenderers();
