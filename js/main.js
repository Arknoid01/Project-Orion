/* ===================== ORCHESTRATION ===================== */
function resetGame(){
  initGrid();
  resources = { wheat:0, marble:0, sculpture:0 };
  selectedBuilding = null;
  demolishMode = false;
  DEBUG.tickCount = 0;
  debugInfo('Partie réinitialisée');
  refreshButtonStates();
  render();
  updateResourceBar();
}

/* ===================== INIT ===================== */
applyStaticTranslations();
buildPalette();
resetGame();
setInterval(tick, 1000);
