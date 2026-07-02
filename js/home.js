/* ===================== PAGE D'ACCUEIL ===================== */
// Écrans : accueil → nouvelle partie (scénarios) / charger / crédits

function showMenuScreen(screenId){
  ['homeScreen', 'newGameScreen', 'campaignMenuScreen', 'campaignEpisodeScreen', 'creditsScreen'].forEach(id => {
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

function showCampaignMenuScreen(){
  if (typeof showCampaignMenu === 'function') showCampaignMenu();
}
window.showCampaignMenuScreen = showCampaignMenuScreen;

function showCreditsScreen(){
  showMenuScreen('creditsScreen');
  applyHomeTranslations();
}

function showMainMenu(){
  const el = document.getElementById('mainMenuOverlay');
  if (el) el.classList.add('open');
  showHomeScreen();
  if (typeof setGamePaused === 'function') setGamePaused(true);
}

function hideMainMenu(){
  const el = document.getElementById('mainMenuOverlay');
  if (el) el.classList.remove('open');
  if (typeof setGamePaused === 'function') setGamePaused(false);
}

function returnToMainMenu(){
  if (typeof grid !== 'undefined' && grid.length && typeof saveGame === 'function'){
    saveGame({ silent: true });
    if (typeof showNotification === 'function' && typeof t === 'function'){
      showNotification(t('save.saved'), 'good');
    }
  }
  showMainMenu();
  if (typeof closePanels === 'function') closePanels();
}

function loadGameFromMenu(){
  if (typeof loadGame === 'function' && loadGame()){
    hideMainMenu();
    if (typeof closePanels === 'function') closePanels();
    applyGameUITranslations();
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
  if (typeof syncLanguageSelectors === 'function') syncLanguageSelectors();
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
