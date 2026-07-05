/* ===================== MARINE (Phase 6) ===================== */
// Port (adjacent à l'eau) + chantier naval (adjacent au port) → flotte de trirèmes.
// Les navires boostent le commerce, mènent des raids sur la carte du monde et repoussent
// (ou subissent) les incursions des cités rivales agressives.

let fleet = { ships: 0 };
let shipyardAutoBuild = true;

function initFleet(){
  fleet = { ships: 0 };
  shipyardAutoBuild = true;
}

function ensureFleetState(){
  if (!fleet || typeof fleet !== 'object') fleet = { ships: 0 };
  if (typeof fleet.ships !== 'number') fleet.ships = 0;
  fleet.ships = Math.max(0, Math.floor(fleet.ships));
}

function navalEnabled(){
  return typeof NAVAL_ENABLED === 'boolean' ? NAVAL_ENABLED : true;
}

function cellTerrainAt(col, row){
  if (typeof inBounds !== 'function' || !inBounds(col, row) || !isGridReady()) return null;
  return grid[row][col].terrain;
}

function isAdjacentToWater(col, row){
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  return dirs.some(([dc, dr]) => cellTerrainAt(col + dc, row + dr) === 'water');
}
window.isAdjacentToWater = isAdjacentToWater;

function isAdjacentToHarbor(col, row){
  if (!isGridReady()) return false;
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  return dirs.some(([dc, dr]) => {
    if (!inBounds(col + dc, row + dr)) return false;
    const b = grid[row + dr][col + dc].building;
    return b && BUILDING_DEFS[b] && BUILDING_DEFS[b].isHarbor;
  });
}
window.isAdjacentToHarbor = isAdjacentToHarbor;

function countHarbors(){
  let n = 0;
  forEachBuilding((type) => { if (BUILDING_DEFS[type] && BUILDING_DEFS[type].isHarbor) n++; });
  return n;
}

function countShipyards(){
  let n = 0;
  forEachBuilding((type) => { if (BUILDING_DEFS[type] && BUILDING_DEFS[type].isShipyard) n++; });
  return n;
}

function getFleetCapacity(){
  const perHarbor = typeof SHIPS_PER_HARBOR === 'number' ? SHIPS_PER_HARBOR : 4;
  const perYard = typeof SHIPS_PER_SHIPYARD === 'number' ? SHIPS_PER_SHIPYARD : 3;
  return countHarbors() * perHarbor + countShipyards() * perYard;
}

function getNavalPower(){
  ensureFleetState();
  if (!navalEnabled() || !countHarbors()) return 0;
  const each = typeof SHIP_POWER_EACH === 'number' ? SHIP_POWER_EACH : 8;
  return fleet.ships * each;
}

function cityNavalPower(city){
  if (!city) return 0;
  if (typeof city.navalPower === 'number') return Math.round(city.navalPower);
  const base = (typeof cityPower === 'function') ? cityPower(city) : (city.power || 0);
  return Math.round(base * 0.35);
}

function navalExportBonus(){
  if (!navalEnabled() || !countHarbors()) return 0;
  const harborBonus = typeof HARBOR_EXPORT_BONUS === 'number' ? HARBOR_EXPORT_BONUS : 2;
  const shipBonus = typeof NAVAL_EXPORT_BONUS_PER_SHIP === 'number' ? NAVAL_EXPORT_BONUS_PER_SHIP : 1;
  ensureFleetState();
  return countHarbors() * harborBonus + fleet.ships * shipBonus;
}

function navalTradeIncomeMultiplier(){
  if (!navalEnabled() || !countHarbors()) return 1;
  ensureFleetState();
  const perShip = typeof NAVAL_TRADE_INCOME_BONUS === 'number' ? NAVAL_TRADE_INCOME_BONUS : 0.04;
  return 1 + fleet.ships * perShip;
}

function canAffordShipBuild(){
  const gold = typeof SHIP_BUILD_COST_GOLD === 'number' ? SHIP_BUILD_COST_GOLD : 180;
  const bronze = typeof SHIP_BUILD_COST_BRONZE === 'number' ? SHIP_BUILD_COST_BRONZE : 4;
  return treasury >= gold && (resources.bronze || 0) >= bronze;
}

function tryCompleteShipBuild(opts){
  opts = opts || {};
  ensureFleetState();
  if (!navalEnabled()) return false;
  if (!countHarbors() || !countShipyards()) return false;
  if (fleet.ships >= getFleetCapacity()) return false;
  if (!canAffordShipBuild()) return false;

  const gold = typeof SHIP_BUILD_COST_GOLD === 'number' ? SHIP_BUILD_COST_GOLD : 180;
  const bronze = typeof SHIP_BUILD_COST_BRONZE === 'number' ? SHIP_BUILD_COST_BRONZE : 4;
  treasury -= gold;
  resources.bronze = (resources.bronze || 0) - bronze;
  fleet.ships += 1;
  debugInfo('Trirème construite', { ships: fleet.ships, capacity: getFleetCapacity() });
  if (!opts.silent && typeof showNotification === 'function'){
    showNotification(t('navy.shipBuiltOne'), 'good');
  }
  updateResourceBar();
  saveGame({ silent: true });
  return true;
}

function buildShipManual(){
  if (!countHarbors()){ showNotification(t('navy.needHarbor'), 'bad'); return; }
  if (!countShipyards()){ showNotification(t('navy.needShipyard'), 'bad'); return; }
  if (fleet.ships >= getFleetCapacity()){ showNotification(t('navy.fleetFull'), 'info'); return; }
  if (!canAffordShipBuild()){ showNotification(t('navy.cannotAfford'), 'bad'); return; }
  tryCompleteShipBuild();
  if (typeof renderNavyPanel === 'function') renderNavyPanel();
}

function processShipyardMonthly(){
  if (!navalEnabled()) return;
  if (!shipyardAutoBuild) return;
  ensureFleetState();
  if (!countHarbors() || !countShipyards()) return;
  const yards = countShipyards();
  let built = 0;
  for (let i = 0; i < yards && fleet.ships < getFleetCapacity(); i++){
    if (tryCompleteShipBuild({ silent: true })) built++;
    else break;
  }
  if (built > 0){
    showNotification(t('navy.shipBuiltMonthly', { count: built }), 'good');
    if (typeof chronicleLog === 'function'){
      chronicleLog(t('navy.shipBuiltChronicle', { count: built }), 'good');
    }
  }
}

function processFleetUpkeep(){
  ensureFleetState();
  if (!navalEnabled() || fleet.ships <= 0) return;
  const perShip = typeof FLEET_UPKEEP_GOLD === 'number' ? FLEET_UPKEEP_GOLD : 12;
  const cost = fleet.ships * perShip;
  if (treasury >= cost){
    treasury -= cost;
    debugInfo('Entretien flotte', { ships: fleet.ships, cost });
  } else {
    const paid = Math.floor(treasury);
    treasury = 0;
    const lost = Math.min(fleet.ships, 1 + Math.floor((cost - paid) / Math.max(1, perShip)));
    fleet.ships = Math.max(0, fleet.ships - lost);
    showNotification(t('navy.upkeepFailed', { lost }), 'bad');
    if (typeof chronicleLog === 'function'){
      chronicleLog(t('navy.upkeepFailedChronicle', { lost }), 'bad');
    }
  }
}

function canLaunchNavalRaid(){
  ensureFleetState();
  const min = typeof NAVAL_RAID_MIN_SHIPS === 'number' ? NAVAL_RAID_MIN_SHIPS : 2;
  return navalEnabled() && countHarbors() > 0 && fleet.ships >= min;
}

function resolveNavalRaid(city){
  ensureFleetState();
  const mine = getNavalPower();
  const enemy = cityNavalPower(city);
  if (mine > enemy){
    const gold = (typeof NAVAL_RAID_GOLD_WIN === 'number' ? NAVAL_RAID_GOLD_WIN : 120)
      + Math.round(enemy * 0.8);
    treasury += gold;
    city.relation = clampRelation(city.relation - (10 + Math.floor(Math.random() * 8)));
    showNotification(t('navy.raidSuccess', { city: city.name, gold }), 'good');
    if (typeof chronicleLog === 'function'){
      chronicleLog(t('navy.raidSuccessChronicle', { city: city.name, gold }), 'good');
    }
    showChoice({
      title: `⚓ ${t('navy.raidSuccessTitle')}`,
      body: t('navy.raidSuccessBody', { city: city.name, gold, mine, enemy }),
      choices: [{ label: 'OK', type: 'good' }],
    });
  } else {
    const lost = Math.min(fleet.ships, 1 + (mine < enemy * 0.6 ? 1 : 0));
    fleet.ships -= lost;
    const tribute = Math.min(Math.floor(treasury), 60 + Math.round(enemy * 0.4));
    treasury -= tribute;
    city.relation = clampRelation(city.relation - 4);
    showNotification(t('navy.raidFailed', { city: city.name }), 'bad');
    if (typeof chronicleLog === 'function'){
      chronicleLog(t('navy.raidFailedChronicle', { city: city.name, lost }), 'bad');
    }
    showChoice({
      title: `💀 ${t('navy.raidFailedTitle')}`,
      body: t('navy.raidFailedBody', { city: city.name, lost, tribute, mine, enemy }),
      choices: [{ label: 'OK', type: 'danger' }],
    });
  }
  updateResourceBar();
  if (typeof renderWorldMap === 'function') renderWorldMap();
  saveGame({ silent: true });
}

function launchNavalRaidOnCity(cityId){
  const c = (typeof cityById === 'function') ? cityById(cityId) : null;
  if (!c || c.conquered) return;
  if (!canLaunchNavalRaid()){
    showNotification(t('navy.needFleet'), 'bad');
    return;
  }
  const mine = getNavalPower();
  const enemy = cityNavalPower(c);
  showConfirm(
    `⚓ ${t('navy.raidTitle')}`,
    t('navy.confirmRaid', { city: c.name, mine, enemy, ships: fleet.ships }),
    () => resolveNavalRaid(c)
  );
}

function tickNavalThreats(){
  if (!navalEnabled()) return;
  if (typeof isDialogOpen === 'function' && isDialogOpen()) return;
  if (typeof isColonyPhase === 'function' && isColonyPhase()) return;
  if (!countHarbors()) return;
  if (!worldCities || !worldCities.length || typeof getCalendarState !== 'function') return;

  const day = getCalendarState().day;
  const minDay = typeof NAVAL_RIVAL_RAID_MIN_DAY === 'number' ? NAVAL_RIVAL_RAID_MIN_DAY : 12;
  if (day < minDay) return;
  if (Math.random() >= (typeof NAVAL_RIVAL_RAID_CHANCE === 'number' ? NAVAL_RIVAL_RAID_CHANCE : 0.22)) return;

  const hostile = worldCities.filter(c => !c.conquered && c.personality === 'aggressive' && c.relation <= DIPLO_HOSTILE_THRESHOLD);
  if (!hostile.length) return;

  const city = hostile[Math.floor(Math.random() * hostile.length)];
  resolveRivalNavalRaid(city);
}

function resolveRivalNavalRaid(city){
  ensureFleetState();
  const mine = getNavalPower();
  const enemy = cityNavalPower(city);
  if (mine >= enemy * 1.05){
    showNotification(t('navy.rivalRepelled', { city: city.name }), 'good');
    if (typeof chronicleLog === 'function'){
      chronicleLog(t('navy.rivalRepelledChronicle', { city: city.name }), 'good');
    }
    return;
  }
  const lost = Math.min(fleet.ships, 1 + Math.floor(Math.random() * 2));
  fleet.ships = Math.max(0, fleet.ships - lost);
  const loot = Math.min(Math.floor(treasury), 50 + Math.round(enemy * 0.35));
  treasury -= loot;
  resources.fish = Math.max(0, (resources.fish || 0) - 10);
  city.relation = clampRelation(city.relation - 2);
  showNotification(t('navy.rivalRaid', { city: city.name }), 'bad');
  if (typeof chronicleLog === 'function'){
    chronicleLog(t('navy.rivalRaidChronicle', { city: city.name, lost, loot }), 'bad');
  }
  updateResourceBar();
  saveGame({ silent: true });
}

function toggleShipyardAutoBuild(){
  shipyardAutoBuild = !shipyardAutoBuild;
  if (typeof showNotification === 'function' && typeof t === 'function'){
    showNotification(t(shipyardAutoBuild ? 'navy.autoBuildOn' : 'navy.autoBuildOff'), 'info');
  }
  if (typeof saveGame === 'function') saveGame({ silent: true });
  if (typeof renderNavyPanel === 'function') renderNavyPanel();
}

function buildNavyObserverData(){
  ensureFleetState();
  const harbors = countHarbors();
  const yards = countShipyards();
  if (!harbors){
    return {
      title: t('panel.navy'),
      tiles: [{ icon: '⚓', title: t('panel.navy'), status: '', rows: [[t('navy.noHarbor'), '']] }],
      actions: false,
    };
  }
  const power = getNavalPower();
  const cap = getFleetCapacity();
  const tradePct = Math.round((navalTradeIncomeMultiplier() - 1) * 100);
  const canBuild = yards > 0 && fleet.ships < cap && canAffordShipBuild();
  return {
    title: t('panel.navy'),
    tiles: [
      { icon: '🚢', title: t('navy.fleet'), status: `${fleet.ships}/${cap}`,
        rows: [
          [t('navy.ships'), String(fleet.ships)],
          [t('navy.navalPower'), String(power)],
          [t('building.harbor'), `${harbors} ⚓`],
          [t('building.shipyard'), `${yards} 🚢`],
          [t('navy.autoBuildToggle'), shipyardAutoBuild ? t('dialog.yes') : t('dialog.no')],
          [t('navy.tradeBonus'), `+${tradePct}%`],
        ] },
      { icon: '💰', title: t('navy.buildCost'), status: '',
        rows: [
          [`🪙 ${t('army.gold')}`, String(typeof SHIP_BUILD_COST_GOLD === 'number' ? SHIP_BUILD_COST_GOLD : 180)],
          [resLabel('bronze'), String(typeof SHIP_BUILD_COST_BRONZE === 'number' ? SHIP_BUILD_COST_BRONZE : 4)],
          [t('navy.upkeepPerShip'), `${typeof FLEET_UPKEEP_GOLD === 'number' ? FLEET_UPKEEP_GOLD : 12}/${t('inspector.perMonth').replace('/', '')}`],
        ] },
    ],
    actions: yards > 0,
    actionsTitle: t('navy.actions'),
    actionsHtml: `<div class="actionGrid">
      <button class="actionBtn" ${canBuild ? '' : 'disabled'} onclick="buildShipManual()">🚢 ${t('navy.buildShip')}</button>
      <button class="actionBtn" onclick="toggleShipyardAutoBuild()">${shipyardAutoBuild ? '⏸' : '▶'} ${t('navy.autoBuildToggle')}</button>
    </div>`,
  };
}

function openNavyPanel(){
  const panel = document.getElementById('observerPanel');
  if (!panel) return;
  const data = buildNavyObserverData();
  if (typeof closePanels === 'function') closePanels();
  const titleEl = document.getElementById('observerTitle');
  if (titleEl) titleEl.textContent = t('observer.prefix') + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.add('show');
}

function renderNavyPanel(){
  const panel = document.getElementById('observerPanel');
  if (!panel || !panel.classList.contains('open')) return;
  const titleEl = document.getElementById('observerTitle');
  const data = buildNavyObserverData();
  if (titleEl) titleEl.textContent = t('observer.prefix') + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
}

window.buildShipManual = buildShipManual;
window.toggleShipyardAutoBuild = toggleShipyardAutoBuild;
window.openNavyPanel = openNavyPanel;
window.launchNavalRaidOnCity = launchNavalRaidOnCity;
window.tickNavalThreats = tickNavalThreats;
