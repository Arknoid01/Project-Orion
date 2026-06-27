/* ===================== ORCHESTRATION ===================== */
function resetGame(){
  startScenario(currentScenarioId || 'sandbox');
}

function refreshUI(){
  refreshButtonStates();
  render();
  updateResourceBar();
  if (typeof renderHud === 'function') renderHud();
  renderMythologyPanel();
  renderObjectivesPanel();
  renderTaxPanel();
  renderCalendarPanel();
  renderFestivalPanel();
  renderDiplomacyPanel();
  renderTradePanel();
  renderCreaturePanel();
}

/* ===================== INIT ===================== */
applyStaticTranslations();
applyCanvasResolution();
buildPalette();

if (loadGame()){
  debugInfo('Sauvegarde restaurée au chargement de la page');
  document.getElementById('mainMenuOverlay').classList.remove('open');
  hideMainMenu();
  refreshUI();
  if (typeof centerMapView === 'function') centerMapView();
} else {
  showMainMenu();
  if (typeof applyHomeTranslations === 'function') applyHomeTranslations();
}

setInterval(tick, 1000);
setInterval(() => saveGame({ silent: true }), 10000);
startRenderLoop();
