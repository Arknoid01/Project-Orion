/* ===================== ORCHESTRATION ===================== */
function resetGame(){
  initGrid();
  resources = { wheat:0, marble:0, sculpture:0 };
  selectedBuilding = null;
  demolishMode = false;
  roadMode = false;
  blockMode = false;
  DEBUG.tickCount = 0;
  favor = 50;
  productionMultiplier = 1;
  productionEffectTicksLeft = 0;
  recomputeAllWalkers();
  debugInfo('Partie réinitialisée');
  refreshButtonStates();
  render();
  updateResourceBar();
  renderMythologyPanel();
}

/* ===================== INIT ===================== */
applyStaticTranslations();
buildPalette();
resetGame();
setInterval(tick, 1000);
startRenderLoop();
