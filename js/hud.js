/* ===================== HUD (nouvelle interface) ===================== */
// Met à jour les pastilles du HUD (trésor, population, blé, calendrier) avec les
// vraies valeurs du jeu. Défensif comme le reste du projet pendant la migration UI :
// si une pastille n'existe pas (encore), on l'ignore sans planter -- voir setText()
// dans production.js.
function renderHud(){
  setText('hudTreasury', Math.floor(treasury));
  setText('hudPopulation', computeTotalPopulation());
  setText('hudWheat', Math.floor(resources.wheat));

  const cal = document.getElementById('hudCalendar');
  if (cal && typeof getCalendarState === 'function'){
    const state = getCalendarState();
    cal.textContent = `📅 ${t('calendar.month.' + state.month)} · ${t('calendar.day')} ${state.dayOfMonth}`;
  }
  if (typeof renderColonyHud === 'function') renderColonyHud();
  if (typeof renderAdventureHud === 'function') renderAdventureHud();
  renderCampaignHud();
  renderNavyHud();
}

function renderNavyHud(){
  const el = document.getElementById('hudNavyBadge');
  if (!el) return;
  const enabled = typeof navalEnabled === 'function' && navalEnabled();
  const harbors = (enabled && typeof countHarbors === 'function') ? countHarbors() : 0;
  const ships = (typeof fleet !== 'undefined' && fleet) ? (fleet.ships || 0) : 0;
  if (!enabled || (harbors <= 0 && ships <= 0)){
    el.style.display = 'none';
    return;
  }
  const nameEl = document.getElementById('hudNavyShips');
  if (nameEl) nameEl.textContent = String(ships);
  el.title = t('hud.navyTitle');
  el.style.display = '';
}

function renderCampaignHud(){
  const el = document.getElementById('hudCampaignBadge');
  if (!el) return;
  const active = typeof isCampaignActive === 'function' && isCampaignActive();
  const path = (active && typeof getActiveCampaignPath === 'function') ? getActiveCampaignPath() : null;
  if (!path){
    el.style.display = 'none';
    return;
  }
  const ep = (typeof activeCampaignEpisode === 'number') ? activeCampaignEpisode : 0;
  const nameEl = document.getElementById('hudCampaignName');
  if (nameEl){
    nameEl.textContent = t('campaign.hudLabel', {
      path: t(path.nameKey),
      n: ep + 1,
      total: path.episodes.length,
    });
  }
  el.title = t('campaign.hudHint');
  el.style.display = '';
}

/* ===================== PANNEAU GESTION ===================== */
// Liste de toutes les ressources (stock/capacité) affichée dans le panneau "Gestion",
// qui regroupe aussi les raccourcis Gestion de la ville / Carte du monde.
const MANAGE_RESOURCE_ORDER = [
  'wheat', 'carrots', 'meat', 'fish', 'marble', 'sculpture', 'olives', 'oil', 'grapes', 'wine',
  'wool', 'clothing', 'coal', 'bronze', 'arms',
];
const MANAGE_RESOURCE_ICONS = {
  wheat:'🌾', carrots:'🥕', meat:'🍖', fish:'🐟', marble:'🪨', sculpture:'🗿', olives:'🫒', oil:'🛢️', grapes:'🍇', wine:'🍷',
  wool:'🧶', clothing:'👕', coal:'🪵', bronze:'🥉', arms:'🗡️',
};

function renderManageResourceList(){
  const el = document.getElementById('manageResourceList');
  if (!el) return;
  const caps = (typeof computeCaps === 'function') ? computeCaps() : {};
  el.innerHTML = MANAGE_RESOURCE_ORDER.map(k => {
    const cap = (caps[k] != null) ? ` / ${caps[k]}` : '';
    const icon = MANAGE_RESOURCE_ICONS[k] || '📦';
    return `<div class="row"><span>${icon} ${t('resource.' + k)}</span><b>${Math.floor(resources[k] || 0)}${cap}</b></div>`;
  }).join('');
}

function openManagePanel(){
  renderManageResourceList();
  if (typeof renderEconomyBalance === 'function') renderEconomyBalance();
  if (typeof renderGodSatisfactionPanel === 'function') renderGodSatisfactionPanel();
  if (typeof renderObjectivesPanel === 'function') renderObjectivesPanel();
  if (typeof renderCityBriefPanel === 'function') renderCityBriefPanel();
  if (typeof renderDiplomacyPanel === 'function') renderDiplomacyPanel();
  if (typeof togglePanel === 'function') togglePanel('managePanel');
}

function renderCityBriefPanel(){
  const el = document.getElementById('cityBriefList');
  if (!el) return;
  const pop = typeof computeTotalPopulation === 'function' ? computeTotalPopulation() : 0;
  const labor = typeof recomputeLabor === 'function' ? recomputeLabor() : employment;
  const pct = labor.demand > 0 ? Math.round(labor.ratio * 100) : 100;
  let fireRisk = 0;
  if (typeof forEachBuilding === 'function'){
    forEachBuilding(function(type, col, row){
      const def = BUILDING_DEFS[type];
      if (!def || def.isDecoration) return;
      if (type === 'maison'){
        if (typeof isHouseServedBy === 'function' && !isHouseServedBy('fire', col, row)) fireRisk++;
      } else if (typeof isTileFireServed === 'function' && !isTileFireServed(col, row)){
        fireRisk++;
      }
    });
  }
  const patrols = (typeof walkers !== 'undefined' && Array.isArray(walkers)) ? walkers.length : 0;
  const day = (typeof getCalendarState === 'function') ? getCalendarState().day : 0;
  el.innerHTML = [
    `<div class="row"><span>${t('manage.cityPop')}</span><b>${pop}</b></div>`,
    `<div class="row"><span>${t('manage.cityWorkers')}</span><b>${pct}%</b></div>`,
    `<div class="row"><span>${t('manage.cityFireRisk')}</span><b>${fireRisk}</b></div>`,
    `<div class="row"><span>${t('manage.cityWalkers')}</span><b>${patrols}</b></div>`,
    `<div class="row"><span>${t('manage.cityDay')}</span><b>${day}</b></div>`,
  ].join('');
}
window.renderCityBriefPanel = renderCityBriefPanel;
