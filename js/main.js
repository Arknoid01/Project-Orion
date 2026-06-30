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
startRenderLoop();
