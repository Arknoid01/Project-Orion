/* ===================== IA RIVALE (Phase 5) ===================== */
// Les cités voisines non conquises agissent selon leur personnalité :
// aggressive → renforce l'armée, baisse les relations, peut envahir
// merchant   → améliore les relations (surtout si route commerciale active)
// diplomat   → cadeaux, alliances informelles, hausse de relation

function rivalAiEnabled(){
  return typeof RIVAL_AI_ENABLED === 'boolean' ? RIVAL_AI_ENABLED : true;
}

function getPlayerDefensePower(){
  return (typeof getMilitaryPoints === 'function') ? getMilitaryPoints() : 0;
}

function cityHasTradeRoute(cityId){
  if (typeof tradeRoutes === 'undefined' || !tradeRoutes) return false;
  const route = tradeRoutes[cityId];
  if (!route) return false;
  const hasExport = route.export && Object.values(route.export).some(Boolean);
  const hasImport = route.import && Object.values(route.import).some(Boolean);
  return hasExport || hasImport;
}

function growRivalPower(city, amount){
  const cap = typeof RIVAL_POWER_GROWTH_CAP === 'number' ? RIVAL_POWER_GROWTH_CAP : 130;
  city.power = Math.min(cap, Math.round((city.power || 0) + amount));
}

function pickRivalCityForDay(day){
  if (!worldCities || !worldCities.length) return null;
  const interval = typeof RIVAL_ACTION_INTERVAL_DAYS === 'number' ? RIVAL_ACTION_INTERVAL_DAYS : 6;
  const candidates = worldCities.filter(c => {
    if (c.conquered) return false;
    const last = typeof c.lastRivalActionDay === 'number' ? c.lastRivalActionDay : 0;
    return day - last >= interval;
  });
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function executeAggressiveRivalAction(city, day){
  const defense = getPlayerDefensePower();
  const enemy = (typeof cityPower === 'function') ? cityPower(city) : (city.power || 0);
  const playerWeak = defense < enemy * 1.15;

  if (playerWeak && city.relation <= DIPLO_HOSTILE_THRESHOLD
      && Math.random() < (typeof RIVAL_INVASION_CHANCE === 'number' ? RIVAL_INVASION_CHANCE : 0.2)
      && typeof spawnInvasion === 'function' && typeof isMilitaryBusy === 'function' && !isMilitaryBusy()){
    city.lastRivalActionDay = day;
    if (typeof chronicleLog === 'function'){
      chronicleLog(t('rival.action.invasion', { city: city.name }), 'bad');
    }
    spawnInvasion(city);
    return;
  }

  if (playerWeak && Math.random() < 0.55){
    city.relation = clampRelation(city.relation - (6 + Math.floor(Math.random() * 6)));
    if (typeof chronicleLog === 'function'){
      chronicleLog(t('rival.action.threaten', { city: city.name, homeCity: getPlayerCityName() }), 'bad');
    }
  } else {
    growRivalPower(city, 1 + Math.floor(Math.random() * 2));
    if (typeof chronicleLog === 'function'){
      chronicleLog(t('rival.action.army', { city: city.name }), 'info');
    }
  }
  city.lastRivalActionDay = day;
}

function executeMerchantRivalAction(city, day){
  const traded = cityHasTradeRoute(city.id);
  const delta = traded ? (4 + Math.floor(Math.random() * 5)) : (1 + Math.floor(Math.random() * 3));
  city.relation = clampRelation(city.relation + delta);
  city.lastRivalActionDay = day;
  if (typeof chronicleLog === 'function'){
    chronicleLog(t(traded ? 'rival.action.tradeBond' : 'rival.action.tradeInterest', { city: city.name }), 'good');
  }
}

function executeDiplomatRivalAction(city, day){
  city.relation = clampRelation(city.relation + (5 + Math.floor(Math.random() * 6)));
  const giftChance = typeof RIVAL_DIPLOMAT_GIFT_CHANCE === 'number' ? RIVAL_DIPLOMAT_GIFT_CHANCE : 0.20;
  if (Math.random() < giftChance){
    const giftMin = typeof RIVAL_DIPLOMAT_GIFT_MIN === 'number' ? RIVAL_DIPLOMAT_GIFT_MIN : 12;
    const giftMax = typeof RIVAL_DIPLOMAT_GIFT_MAX === 'number' ? RIVAL_DIPLOMAT_GIFT_MAX : 28;
    const gift = giftMin + Math.floor(Math.random() * (giftMax - giftMin + 1));
    treasury += gift;
    if (typeof chronicleLog === 'function'){
      chronicleLog(t('rival.action.gift', { city: city.name, gold: gift }), 'good');
    }
  } else if (typeof chronicleLog === 'function'){
    chronicleLog(t('rival.action.envoy', { city: city.name }), 'good');
  }
  city.lastRivalActionDay = day;
}

function executeRivalAction(city, day){
  const personality = city.personality || 'diplomat';
  if (personality === 'aggressive') executeAggressiveRivalAction(city, day);
  else if (personality === 'merchant') executeMerchantRivalAction(city, day);
  else executeDiplomatRivalAction(city, day);

  if (typeof renderWorldMap === 'function'){
    const panel = document.getElementById('worldMapPanel');
    if (panel && panel.classList.contains('open')) renderWorldMap();
  }
  if (typeof renderDiplomacyPanel === 'function') renderDiplomacyPanel();
  if (typeof saveGame === 'function') saveGame({ silent: true });
}

function tickRivalAI(){
  if (!rivalAiEnabled()) return;
  if (typeof isDialogOpen === 'function' && isDialogOpen()) return;
  if (typeof isColonyPhase === 'function' && isColonyPhase()) return;
  if (!worldCities || !worldCities.length || typeof getCalendarState !== 'function') return;

  const day = getCalendarState().day;
  const firstDay = typeof RIVAL_FIRST_ACTION_DAY === 'number' ? RIVAL_FIRST_ACTION_DAY : 6;
  if (day < firstDay) return;

  const city = pickRivalCityForDay(day);
  if (!city) return;
  executeRivalAction(city, day);
}

window.tickRivalAI = tickRivalAI;
