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
if (typeof applyZoomLock === 'function') applyZoomLock();
if (typeof BUILD_CONFIG_REV !== 'undefined') console.info('[Olympos] config', BUILD_CONFIG_REV, 'zoom=', typeof ZOOM_DEFAULT !== 'undefined' ? ZOOM_DEFAULT : '?');
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

// Init Pixi puis démarrage de la boucle
if (typeof initPixiRenderer === 'function'){
  initPixiRenderer().then(ok => {
    if (ok) console.log('[Main] Pixi actif');
    else    console.warn('[Main] Pixi indisponible, fallback Canvas2D');
    startRenderLoop();
  });
} else {
  startRenderLoop();
}
