/* ===================== CAMPAGNE ÉPISODIQUE ===================== */
// Choix d'une « tuile » (parcours) au menu → 5 épisodes avec objectifs croissants.
// Chaque épisode peut imposer une carte procédurale sans certaines ressources
// (ex. pas de marbre → commerce obligatoire).

let activeCampaignPathId = null;
let activeCampaignEpisode = 0;
let campaignRunSeed = 0;
let campaignProgress = {}; // pathId -> maxEpisodeUnlocked (0-based index)

const CAMPAIGN_PATHS = [
  {
    id: 'attica',
    nameKey: 'campaign.attica.name',
    descKey: 'campaign.attica.desc',
    icon: '🌾',
    episodes: [
      {
        nameKey: 'campaign.ep.population',
        descKey: 'campaign.ep.attica1.desc',
        startingTreasury: 2900,
        worldCityCount: 4,
        mapProfile: { landStyle: 'continent' },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 22 },
        ],
      },
      {
        nameKey: 'campaign.ep.harvest',
        descKey: 'campaign.ep.attica2.desc',
        startingTreasury: 2600,
        worldCityCount: 5,
        mapProfile: { landStyle: 'continent' },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 35 },
          { key: 'wheatProduced', nameKey: 'objective.wheatProduced', metric: 'wheatProduced', target: 90 },
        ],
      },
      {
        nameKey: 'campaign.ep.prosperity',
        descKey: 'campaign.ep.attica3.desc',
        startingTreasury: 2500,
        worldCityCount: 5,
        mapProfile: { landStyle: 'mixed' },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 45 },
          { key: 'villa', nameKey: 'objective.villa', metric: 'villa', target: 1 },
        ],
      },
      {
        nameKey: 'campaign.ep.trade',
        descKey: 'campaign.ep.attica4.desc',
        startingTreasury: 2400,
        worldCityCount: 6,
        mapProfile: { landStyle: 'continent' },
        objectives: [
          { key: 'tradePosts', nameKey: 'campaign.objective.tradePosts', metric: 'tradePosts', target: 1 },
          { key: 'templeDemeter', nameKey: 'campaign.objective.godTemple', metric: 'godTemple', godKey: 'demeter', target: 1 },
        ],
      },
      {
        nameKey: 'campaign.ep.glory',
        descKey: 'campaign.ep.attica5.desc',
        startingTreasury: 2300,
        worldCityCount: 6,
        mapProfile: { landStyle: 'continent' },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 70 },
          { key: 'zeusSat', nameKey: 'campaign.objective.godSatisfaction', metric: 'godSatisfaction', godKey: 'zeus', target: 72 },
        ],
      },
    ],
  },
  {
    id: 'archipelago',
    nameKey: 'campaign.archipelago.name',
    descKey: 'campaign.archipelago.desc',
    icon: '🏝️',
    episodes: [
      {
        nameKey: 'campaign.ep.landing',
        descKey: 'campaign.ep.arch1.desc',
        startingTreasury: 2700,
        worldCityCount: 5,
        mapProfile: {
          landStyle: 'island',
          forbidTerrains: ['marble'],
          requiredImports: ['marble'],
        },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 18 },
          { key: 'tradePosts', nameKey: 'campaign.objective.tradePosts', metric: 'tradePosts', target: 1 },
        ],
      },
      {
        nameKey: 'campaign.ep.importMarble',
        descKey: 'campaign.ep.arch2.desc',
        startingTreasury: 2500,
        worldCityCount: 5,
        mapProfile: {
          landStyle: 'island',
          forbidTerrains: ['marble'],
          requiredImports: ['marble'],
        },
        objectives: [
          { key: 'marbleStock', nameKey: 'campaign.objective.marbleStock', metric: 'marbleStock', target: 22 },
        ],
      },
      {
        nameKey: 'campaign.ep.sculptors',
        descKey: 'campaign.ep.arch3.desc',
        startingTreasury: 2350,
        worldCityCount: 6,
        mapProfile: {
          landStyle: 'island',
          forbidTerrains: ['marble'],
          requiredImports: ['marble'],
        },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 38 },
          { key: 'sculptureStock', nameKey: 'campaign.objective.sculptureStock', metric: 'sculptureStock', target: 6 },
        ],
      },
      {
        nameKey: 'campaign.ep.workshop',
        descKey: 'campaign.ep.arch4.desc',
        startingTreasury: 2250,
        worldCityCount: 6,
        mapProfile: {
          landStyle: 'island',
          forbidTerrains: ['marble'],
          requiredImports: ['marble'],
        },
        objectives: [
          { key: 'workshops', nameKey: 'campaign.objective.workshops', metric: 'workshops', target: 1 },
          { key: 'marbleStock', nameKey: 'campaign.objective.marbleStock', metric: 'marbleStock', target: 35 },
        ],
      },
      {
        nameKey: 'campaign.ep.maritime',
        descKey: 'campaign.ep.arch5.desc',
        startingTreasury: 2150,
        worldCityCount: 7,
        mapProfile: {
          landStyle: 'island',
          forbidTerrains: ['marble'],
          requiredImports: ['marble', 'wheat'],
        },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 58 },
          { key: 'tradePosts', nameKey: 'campaign.objective.tradePosts', metric: 'tradePosts', target: 2 },
          { key: 'templePoseidon', nameKey: 'campaign.objective.godTemple', metric: 'godTemple', godKey: 'poseidon', target: 1 },
        ],
      },
    ],
  },
  {
    id: 'pelion',
    nameKey: 'campaign.pelion.name',
    descKey: 'campaign.pelion.desc',
    icon: '🌲',
    episodes: [
      {
        nameKey: 'campaign.ep.forest',
        descKey: 'campaign.ep.pelion1.desc',
        startingTreasury: 2650,
        worldCityCount: 4,
        mapProfile: { landStyle: 'continent', boostTerrains: ['forest'] },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 20 },
        ],
      },
      {
        nameKey: 'campaign.ep.charcoal',
        descKey: 'campaign.ep.pelion2.desc',
        startingTreasury: 2450,
        worldCityCount: 5,
        mapProfile: { landStyle: 'continent', boostTerrains: ['forest'] },
        objectives: [
          { key: 'coalStock', nameKey: 'campaign.objective.coalStock', metric: 'coalStock', target: 15 },
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 32 },
        ],
      },
      {
        nameKey: 'campaign.ep.scarcity',
        descKey: 'campaign.ep.pelion3.desc',
        startingTreasury: 2300,
        worldCityCount: 6,
        mapProfile: {
          landStyle: 'mixed',
          forbidTerrains: ['wheat'],
          requiredImports: ['wheat'],
        },
        objectives: [
          { key: 'wheatStock', nameKey: 'campaign.objective.wheatStock', metric: 'wheatStock', target: 40 },
          { key: 'tradePosts', nameKey: 'campaign.objective.tradePosts', metric: 'tradePosts', target: 1 },
        ],
      },
      {
        nameKey: 'campaign.ep.foundry',
        descKey: 'campaign.ep.pelion4.desc',
        startingTreasury: 2200,
        worldCityCount: 6,
        mapProfile: {
          landStyle: 'continent',
          forbidTerrains: ['wheat'],
          requiredImports: ['wheat', 'marble'],
        },
        objectives: [
          { key: 'bronzeStock', nameKey: 'campaign.objective.bronzeStock', metric: 'bronzeStock', target: 12 },
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 42 },
        ],
      },
      {
        nameKey: 'campaign.ep.peak',
        descKey: 'campaign.ep.pelion5.desc',
        startingTreasury: 2100,
        worldCityCount: 7,
        mapProfile: {
          landStyle: 'continent',
          forbidTerrains: ['wheat'],
          requiredImports: ['wheat'],
        },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 55 },
          { key: 'villa', nameKey: 'objective.villa', metric: 'villa', target: 1 },
          { key: 'apolloSat', nameKey: 'campaign.objective.godSatisfaction', metric: 'godSatisfaction', godKey: 'apollo', target: 70 },
        ],
      },
    ],
  },
  {
    id: 'thrace',
    nameKey: 'campaign.thrace.name',
    descKey: 'campaign.thrace.desc',
    icon: '⚔️',
    episodes: [
      {
        nameKey: 'campaign.ep.recruit',
        descKey: 'campaign.ep.thrace1.desc',
        startingTreasury: 2800,
        worldCityCount: 5,
        mapProfile: { landStyle: 'continent' },
        objectives: [
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 20 },
          { key: 'barracks', nameKey: 'scenario.objective.barracks', metric: 'barracks', target: 1 },
        ],
      },
      {
        nameKey: 'campaign.ep.legion',
        descKey: 'campaign.ep.thrace2.desc',
        startingTreasury: 2600,
        worldCityCount: 6,
        mapProfile: { landStyle: 'mixed' },
        objectives: [
          { key: 'militaryPoints', nameKey: 'campaign.objective.militaryPoints', metric: 'militaryPoints', target: 28 },
          { key: 'population', nameKey: 'objective.population', metric: 'population', target: 32 },
        ],
      },
      {
        nameKey: 'campaign.ep.patron',
        descKey: 'campaign.ep.thrace3.desc',
        startingTreasury: 2450,
        worldCityCount: 6,
        mapProfile: { landStyle: 'continent' },
        objectives: [
          { key: 'templeAthena', nameKey: 'campaign.objective.godTemple', metric: 'godTemple', godKey: 'athena', target: 1 },
          { key: 'militaryPoints', nameKey: 'campaign.objective.militaryPoints', metric: 'militaryPoints', target: 38 },
        ],
      },
      {
        nameKey: 'campaign.ep.rival',
        descKey: 'campaign.ep.thrace4.desc',
        startingTreasury: 2350,
        worldCityCount: 7,
        mapProfile: { landStyle: 'continent' },
        objectives: [
          { key: 'citiesConquered', nameKey: 'scenario.objective.conquer', metric: 'citiesConquered', target: 1 },
          { key: 'militaryPoints', nameKey: 'campaign.objective.militaryPoints', metric: 'militaryPoints', target: 48 },
        ],
      },
      {
        nameKey: 'campaign.ep.hegemony',
        descKey: 'campaign.ep.thrace5.desc',
        startingTreasury: 2250,
        worldCityCount: 8,
        mapProfile: { landStyle: 'mixed' },
        objectives: [
          { key: 'citiesConquered', nameKey: 'scenario.objective.conquer', metric: 'citiesConquered', target: 2 },
          { key: 'athenaSat', nameKey: 'campaign.objective.godSatisfaction', metric: 'godSatisfaction', godKey: 'athena', target: 75 },
        ],
      },
    ],
  },
];

function getCampaignPath(id){
  return CAMPAIGN_PATHS.find(p => p.id === id) || null;
}

function isCampaignActive(){
  return !!activeCampaignPathId;
}

function getActiveCampaignPath(){
  return activeCampaignPathId ? getCampaignPath(activeCampaignPathId) : null;
}

function getActiveCampaignEpisodeDef(){
  const path = getActiveCampaignPath();
  if (!path || !path.episodes[activeCampaignEpisode]) return null;
  return path.episodes[activeCampaignEpisode];
}

function campaignEpisodeSeed(pathId, episodeIndex, runSeed){
  let h = (runSeed ^ 0xCAFE000) >>> 0;
  const s = `${pathId}:${episodeIndex}`;
  for (let i = 0; i < s.length; i++){
    h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995);
  }
  return (h ^ (h >>> 15)) >>> 0;
}

function loadCampaignProgress(){
  try {
    const raw = localStorage.getItem('olympos_campaign_v1');
    if (raw) campaignProgress = JSON.parse(raw) || {};
  } catch { campaignProgress = {}; }
}

function saveCampaignProgress(){
  try { localStorage.setItem('olympos_campaign_v1', JSON.stringify(campaignProgress)); } catch { /* ignore */ }
}

function getCampaignUnlockedEpisode(pathId){
  loadCampaignProgress();
  return typeof campaignProgress[pathId] === 'number' ? campaignProgress[pathId] : 0;
}

function unlockCampaignEpisode(pathId, episodeIndex){
  loadCampaignProgress();
  const prev = campaignProgress[pathId] || 0;
  campaignProgress[pathId] = Math.max(prev, episodeIndex + 1);
  saveCampaignProgress();
}

function buildScenarioFromCampaignEpisode(path, episodeIndex){
  const ep = path.episodes[episodeIndex];
  if (!ep) return null;
  return {
    id: `campaign:${path.id}:${episodeIndex}`,
    campaignPathId: path.id,
    campaignEpisode: episodeIndex,
    nameKey: ep.nameKey,
    descKey: ep.descKey,
    icon: path.icon,
    objectives: ep.objectives.map(o => Object.assign({}, o)),
    startingTreasury: ep.startingTreasury,
    worldCityCount: ep.worldCityCount,
    mapProfile: ep.mapProfile ? Object.assign({}, ep.mapProfile) : null,
    mapSeed: campaignEpisodeSeed(path.id, episodeIndex, campaignRunSeed),
  };
}

async function startCampaignEpisode(pathId, episodeIndex){
  const path = getCampaignPath(pathId);
  if (!path || !path.episodes[episodeIndex]) return;

  activeCampaignPathId = pathId;
  activeCampaignEpisode = episodeIndex;
  if (!campaignRunSeed) campaignRunSeed = (Math.floor(Math.random() * 1e9) ^ Date.now()) >>> 0;

  const scenario = buildScenarioFromCampaignEpisode(path, episodeIndex);
  currentScenarioId = scenario.id;
  applyScenarioObjectives(scenario);

  if (typeof showGenLoading === 'function') showGenLoading();
  try {
    await resetGameForScenario(scenario);
  } catch (err){
    if (typeof showGenError === 'function') showGenError(err);
    else console.error(err);
    return;
  }
  hideMainMenu();
  if (typeof centerMapView === 'function') centerMapView();
  if (typeof waitForTerrainReady === 'function') await waitForTerrainReady();
  if (typeof render === 'function') render();
  if (typeof hideGenLoading === 'function') hideGenLoading();
  if (typeof showNotification === 'function'){
    showNotification(t('campaign.episodeStarted', {
      n: episodeIndex + 1,
      total: path.episodes.length,
      name: t(ep.nameKey),
    }), 'info');
  }
}

function startCampaignPath(pathId){
  campaignRunSeed = (Math.floor(Math.random() * 1e9) ^ Date.now()) >>> 0;
  const unlocked = getCampaignUnlockedEpisode(pathId);
  startCampaignEpisode(pathId, Math.min(unlocked, getCampaignPath(pathId).episodes.length - 1));
}

function onCampaignEpisodeVictory(){
  const path = getActiveCampaignPath();
  if (!path) return;

  unlockCampaignEpisode(path.id, activeCampaignEpisode);
  victoryAnnounced = false;

  const isLast = activeCampaignEpisode >= path.episodes.length - 1;
  if (typeof showChoice === 'function'){
    showChoice({
      title: isLast ? t('campaign.pathCompleteTitle') : t('campaign.episodeCompleteTitle'),
      body: isLast
        ? t('campaign.pathCompleteBody', { name: t(path.nameKey) })
        : t('campaign.episodeCompleteBody', { n: activeCampaignEpisode + 1 }),
      dismissible: false,
      choices: isLast
        ? [
            { label: t('campaign.backToMenu'), type: 'primary', onPick: () => { activeCampaignPathId = null; returnToMainMenu(); } },
          ]
        : [
            { label: t('campaign.nextEpisode'), type: 'primary', onPick: () => startCampaignEpisode(path.id, activeCampaignEpisode + 1) },
            { label: t('campaign.backToMenu'), type: 'neutral', onPick: () => returnToMainMenu() },
          ],
    });
  } else if (!isLast){
    startCampaignEpisode(path.id, activeCampaignEpisode + 1);
  }
}

function renderCampaignPathList(){
  const el = document.getElementById('campaignPathList');
  const subtitle = document.getElementById('campaignMenuSubtitle');
  const title = document.getElementById('campaignMenuTitle');
  if (subtitle) subtitle.textContent = t('campaign.menuSubtitle');
  if (title) title.textContent = t('campaign.menuTitle');
  if (!el) return;

  loadCampaignProgress();
  el.innerHTML = CAMPAIGN_PATHS.map(path => {
    const unlocked = getCampaignUnlockedEpisode(path.id);
    const total = path.episodes.length;
    const progress = `${Math.min(unlocked + 1, total)}/${total}`;
    return `<button class="scenarioCard campaignPathCard" onclick="showCampaignEpisodeScreen('${path.id}')">
      <span class="scenarioIcon">${path.icon}</span>
      <span class="scenarioName">${t(path.nameKey)}</span>
      <span class="scenarioDesc">${t(path.descKey)}</span>
      <span class="campaignProgress">${t('campaign.progress', { progress })}</span>
    </button>`;
  }).join('');
}

function showCampaignEpisodeScreen(pathId){
  const path = getCampaignPath(pathId);
  if (!path) return;
  window._campaignPreviewPathId = pathId;
  showMenuScreen('campaignEpisodeScreen');
  renderCampaignEpisodeList(pathId);
}

function renderCampaignEpisodeList(pathId){
  const path = getCampaignPath(pathId);
  const el = document.getElementById('campaignEpisodeList');
  const title = document.getElementById('campaignEpisodeTitle');
  if (!path || !el) return;
  if (title) title.textContent = `${path.icon} ${t(path.nameKey)}`;
  loadCampaignProgress();
  const unlocked = getCampaignUnlockedEpisode(pathId);

  el.innerHTML = path.episodes.map((ep, i) => {
    const locked = i > unlocked;
    const done = i < unlocked;
    const status = done ? '✅' : (locked ? '🔒' : '▶');
    const mapHint = _campaignMapHint(ep.mapProfile);
    return `<button class="scenarioCard campaignEpisodeCard${locked ? ' campaign-locked' : ''}"
      ${locked ? 'disabled' : ''} onclick="startCampaignEpisode('${pathId}', ${i})">
      <span class="scenarioIcon">${status}</span>
      <span class="scenarioName">${t('campaign.episodeLabel', { n: i + 1 })} — ${t(ep.nameKey)}</span>
      <span class="scenarioDesc">${t(ep.descKey)}</span>
      ${mapHint ? `<span class="campaignMapHint">${mapHint}</span>` : ''}
    </button>`;
  }).join('');
}

function _campaignMapHint(profile){
  if (!profile) return '';
  const parts = [];
  if (profile.landStyle === 'island') parts.push(t('campaign.hint.island'));
  if (Array.isArray(profile.forbidTerrains) && profile.forbidTerrains.length){
    const labels = { marble: 'resource.marble', wheat: 'resource.wheat', forest: 'terrainName.forest' };
    parts.push(t('campaign.hint.noLocal', {
      resources: profile.forbidTerrains.map(r => t(labels[r] || ('terrainName.' + r))).join(', '),
    }));
  }
  if (Array.isArray(profile.requiredImports) && profile.requiredImports.length){
    parts.push(t('campaign.hint.tradeRequired'));
  }
  return parts.join(' · ');
}

function serializeCampaignForSave(){
  return {
    activeCampaignPathId,
    activeCampaignEpisode,
    campaignRunSeed,
    campaignProgress,
  };
}

function restoreCampaignFromSave(payload){
  activeCampaignPathId = payload.activeCampaignPathId || null;
  activeCampaignEpisode = typeof payload.activeCampaignEpisode === 'number' ? payload.activeCampaignEpisode : 0;
  campaignRunSeed = payload.campaignRunSeed || 0;
  if (payload.campaignProgress) campaignProgress = payload.campaignProgress;
}

function restoreCampaignObjectivesAfterLoad(){
  if (!activeCampaignPathId) return;
  const ep = getActiveCampaignEpisodeDef();
  if (ep && typeof applyScenarioObjectives === 'function'){
    applyScenarioObjectives({ objectives: ep.objectives });
  }
}
window.restoreCampaignObjectivesAfterLoad = restoreCampaignObjectivesAfterLoad;

function clearActiveCampaign(){
  activeCampaignPathId = null;
  activeCampaignEpisode = 0;
}
window.clearActiveCampaign = clearActiveCampaign;
window.startCampaignEpisode = startCampaignEpisode;
window.startCampaignPath = startCampaignPath;
window.showCampaignEpisodeScreen = showCampaignEpisodeScreen;
window.renderCampaignPathList = renderCampaignPathList;
window.onCampaignEpisodeVictory = onCampaignEpisodeVictory;

loadCampaignProgress();
