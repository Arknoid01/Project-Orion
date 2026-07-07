/* ===================== PAGE D'ACCUEIL ===================== */
// Écrans : accueil → mode (bac à sable / scénarios) → liste scénarios / charger / crédits

const MENU_SCREEN_IDS = [
  'homeScreen',
  'newGameModeScreen',
  'newGameScreen',
  'loadGameScreen',
  'saveGameScreen',
  'campaignMenuScreen',
  'campaignEpisodeScreen',
  'creditsScreen',
];

function showMenuScreen(screenId){
  MENU_SCREEN_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('menu-screen-hidden', id !== screenId);
  });
}

function showHomeScreen(){
  showMenuScreen('homeScreen');
  applyHomeTranslations();
}

function renderNewGameModeList(){
  const el = document.getElementById('newGameModeList');
  if (!el || typeof t !== 'function') return;
  el.innerHTML = `
    <button class="scenarioCard modeCard" type="button" onclick="promptThenStartScenario('sandbox')">
      <span class="scenarioIcon">🏛️</span>
      <span class="scenarioName">${t('home.modeSandbox')}</span>
      <span class="scenarioDesc">${t('home.modeSandboxDesc')}</span>
    </button>
    <button class="scenarioCard modeCard" type="button" onclick="showScenarioListScreen()">
      <span class="scenarioIcon">📜</span>
      <span class="scenarioName">${t('home.modeScenario')}</span>
      <span class="scenarioDesc">${t('home.modeScenarioDesc')}</span>
    </button>
    <button class="scenarioCard modeCard" type="button" onclick="showCampaignMenuScreen()">
      <span class="scenarioIcon">🗺️</span>
      <span class="scenarioName">${t('home.modeCampaign')}</span>
      <span class="scenarioDesc">${t('home.modeCampaignDesc')}</span>
    </button>`;
}

function showNewGameModeScreen(){
  showMenuScreen('newGameModeScreen');
  applyHomeTranslations();
  renderNewGameModeList();
}

function showScenarioListScreen(){
  showMenuScreen('newGameScreen');
  applyHomeTranslations();
  if (typeof renderScenarioList === 'function') renderScenarioList();
}

/** @deprecated alias — préférer showScenarioListScreen ou showNewGameModeScreen */
function showNewGameScreen(){
  showScenarioListScreen();
}
window.showNewGameModeScreen = showNewGameModeScreen;
window.showScenarioListScreen = showScenarioListScreen;
window.showNewGameScreen = showNewGameScreen;

function showCampaignMenuScreen(){
  const overlay = document.getElementById('mainMenuOverlay');
  if (overlay) overlay.classList.add('open');
  if (typeof setGamePaused === 'function') setGamePaused(true);
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

function showLoadGameScreen(fromHome){
  window._loadScreenFromHome = fromHome !== false;
  window._saveSlotListMode = 'load';
  const overlay = document.getElementById('mainMenuOverlay');
  if (overlay) overlay.classList.add('open');
  if (typeof setGamePaused === 'function') setGamePaused(true);
  showMenuScreen('loadGameScreen');
  applyHomeTranslations();
  renderSaveSlotList('load');
}

function showSaveGameScreen(){
  window._saveSlotListMode = 'save';
  const overlay = document.getElementById('mainMenuOverlay');
  if (overlay) overlay.classList.add('open');
  if (typeof setGamePaused === 'function') setGamePaused(true);
  showMenuScreen('saveGameScreen');
  applyHomeTranslations();
  renderSaveSlotList('save');
}

function closeSaveGameScreen(){
  hideMainMenu();
}

function closeLoadGameScreen(){
  if (window._loadScreenFromHome) showHomeScreen();
  else hideMainMenu();
}
window.closeSaveGameScreen = closeSaveGameScreen;
window.closeLoadGameScreen = closeLoadGameScreen;
window.showLoadGameScreen = showLoadGameScreen;
window.showSaveGameScreen = showSaveGameScreen;

function renderSaveSlotList(mode){
  mode = mode || window._saveSlotListMode || 'load';
  window._saveSlotListMode = mode;
  const screenId = mode === 'load' ? 'loadGameScreen' : 'saveGameScreen';
  const screen = document.getElementById(screenId);
  const el = screen ? screen.querySelector('.saveSlotList') : null;
  if (!el || typeof listSaveSlots !== 'function') return;

  const slots = listSaveSlots();
  const active = typeof getActiveSaveSlot === 'function' ? getActiveSaveSlot() : 0;

  el.innerHTML = slots.map(({ slot, summary }) => {
    const isEmpty = !summary;
    const isActive = slot === active;
    const activeCls = isActive ? ' save-slot-active' : '';
    const emptyCls = isEmpty ? ' save-slot-empty' : '';

    let body = '';
    if (isEmpty){
      body = `<span class="saveSlotEmpty">${t('save.slotEmptyLabel')}</span>`;
    } else {
      const pop = summary.population != null ? Math.floor(summary.population) : '—';
      const gold = summary.treasury != null ? Math.floor(summary.treasury) : '—';
      const scenario = typeof formatSaveScenarioLabel === 'function'
        ? formatSaveScenarioLabel(summary.scenarioId)
        : summary.scenarioId;
      const cityLine = summary.playerCityName
        ? `<span class="saveSlotCity">🏛️ ${summary.playerCityName}</span>` : '';
      const when = typeof formatSaveSlotDate === 'function' ? formatSaveSlotDate(summary.savedAt) : '';
      body = `
        ${cityLine}
        <span class="saveSlotScenario">${scenario}</span>
        <span class="saveSlotMeta">👥 ${pop} · 🪙 ${gold} · ${t('calendar.year')} ${summary.calendarYear}</span>
        ${when ? `<span class="saveSlotDate">${when}</span>` : ''}`;
    }

    const click = mode === 'load'
      ? (isEmpty ? '' : `onclick="loadGameFromSlot(${slot})"`)
      : `onclick="saveGameToSlot(${slot})"`;

    const deleteBtn = (!isEmpty && mode === 'load')
      ? `<button type="button" class="saveSlotDelete" title="${t('save.deleteTitle')}" onclick="event.stopPropagation(); deleteSaveSlotWithConfirm(${slot})">🗑</button>`
      : '';

    return `<div class="saveSlotCard${emptyCls}${activeCls}" ${click} role="button" tabindex="0">
      <div class="saveSlotHead">
        <span class="saveSlotNum">${t('save.slotLabel', { n: slot + 1 })}</span>
        ${deleteBtn}
      </div>
      ${body}
    </div>`;
  }).join('');
}
window.renderSaveSlotList = renderSaveSlotList;

function loadGameFromMenu(){
  showLoadGameScreen(true);
}

function applyHomeTranslations(){
  const map = {
    homeTagline: 'home.tagline',
    homeNewGame: 'home.newGame',
    homeLoad: 'home.load',
    homeCredits: 'home.credits',
    newGameModeTitle: 'home.newGameTitle',
    newGameModeSubtitle: 'home.modeSubtitle',
    newGameTitle: 'scenario.listTitle',
    creditsTitle: 'home.creditsTitle',
    scenarioMenuSubtitle: 'scenario.listSubtitle',
    loadGameTitle: 'save.loadTitle',
    loadGameSubtitle: 'save.loadSubtitle',
    saveGameTitle: 'save.saveTitle',
    saveGameSubtitle: 'save.saveSubtitle',
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
  if (document.getElementById('newGameModeList') && !document.getElementById('newGameModeScreen')?.classList.contains('menu-screen-hidden')){
    renderNewGameModeList();
  }
  if (typeof renderSaveSlotList === 'function'){
    if (document.getElementById('loadGameScreen') && !document.getElementById('loadGameScreen').classList.contains('menu-screen-hidden')){
      renderSaveSlotList('load');
    }
    if (document.getElementById('saveGameScreen') && !document.getElementById('saveGameScreen').classList.contains('menu-screen-hidden')){
      renderSaveSlotList('save');
    }
  }
}
