/* ===================== ORCHESTRATION ===================== */
function resetGame(){
  initGrid();
  resources = { wheat:0, marble:0, sculpture:0, olives:0, oil:0, grapes:0, wine:0, wool:0 };
  treasury = STARTING_TREASURY;
  selectedBuilding = null;
  demolishMode = false;
  roadMode = false;
  blockMode = false;
  DEBUG.tickCount = 0;
  favor = 50;
  taxRate = TAX_RATE_DEFAULT;
  productionMultiplier = 1;
  productionEffectTicksLeft = 0;
  totalWheatProduced = 0;
  victoryAnnounced = false;
  recomputeAllWalkers();
  recomputeLabor();
  debugInfo('Partie réinitialisée');
  refreshUI();
  saveGame({ silent: true }); // persiste immédiatement l'état remis à zéro
}

function refreshUI(){
  refreshButtonStates();
  render();
  updateResourceBar();
  renderMythologyPanel();
  renderObjectivesPanel();
  renderTaxPanel();
}

/* ===================== INIT ===================== */
applyStaticTranslations();
applyCanvasResolution();
buildPalette();

if (loadGame()){
  debugInfo('Sauvegarde restaurée au chargement de la page');
  refreshUI();
} else {
  resetGame(); // s'occupe déjà de son propre refreshUI()
}

setInterval(tick, 1000);
setInterval(() => saveGame({ silent: true }), 10000); // sauvegarde auto toutes les 10s
startRenderLoop();
