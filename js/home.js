/* ===================== PAGE D'ACCUEIL ===================== */
// Écrans : accueil → nouvelle partie (scénarios) / charger / crédits

function showMenuScreen(screenId){
  ['homeScreen', 'newGameScreen', 'creditsScreen'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('menu-screen-hidden', id !== screenId);
  });
}

function showHomeScreen(){
  showMenuScreen('homeScreen');
  applyHomeTranslations();
}

function showNewGameScreen(){
  showMenuScreen('newGameScreen');
  renderScenarioList();
}

function showCreditsScreen(){
  showMenuScreen('creditsScreen');
  applyHomeTranslations();
}

function showMainMenu(){
  const el = document.getElementById('mainMenuOverlay');
  if (el) el.classList.add('open');
  showHomeScreen();
}

function hideMainMenu(){
  const el = document.getElementById('mainMenuOverlay');
  if (el) el.classList.remove('open');
}

function returnToMainMenu(){
  showMainMenu();
  if (typeof closePanels === 'function') closePanels();
}

function loadGameFromMenu(){
  if (typeof loadGame === 'function' && loadGame()){
    hideMainMenu();
    if (typeof closePanels === 'function') closePanels();
    refreshUI();
    if (typeof centerMapView === 'function') centerMapView();
    showNotification(t('home.saveLoaded'), 'good');
  } else {
    showNotification(t('home.noSave'), 'bad');
  }
}

function applyHomeTranslations(){
  const map = {
    homeTagline: 'home.tagline',
    homeNewGame: 'home.newGame',
    homeLoad: 'home.load',
    homeCredits: 'home.credits',
    newGameTitle: 'home.newGameTitle',
    creditsTitle: 'home.creditsTitle',
    scenarioMenuSubtitle: 'scenario.menuSubtitle',
  };
  for (const [id, key] of Object.entries(map)){
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  }
  const creditsBody = document.getElementById('creditsBody');
  if (creditsBody){
    creditsBody.innerHTML = [
      'home.credits.game',
      'home.credits.engine',
      'home.credits.art',
      'home.credits.license',
    ].map(k => `<p>${t(k)}</p>`).join('');
  }
}
