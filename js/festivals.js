/* ===================== FESTIVALS ===================== */
// Même principe que l'offrande (mythology.js) : action joueur, coûte des ressources,
// effet temporaire. Pas de nouveau stat "bonheur" séparé -- l'effet se traduit
// directement par un bonus de croissance et une réduction du risque d'émigration
// (voir migration.js : growthChance/emigrationChance lisent festivalHappinessBonus()).
let festivalTicksLeft = 0;

function getFestivalDefForSeason(){
  const season = (typeof getCalendarState === 'function')
    ? getCalendarState().season
    : 'summer';
  const seasonal = (typeof FESTIVAL_BY_SEASON === 'object' && FESTIVAL_BY_SEASON[season])
    ? FESTIVAL_BY_SEASON[season]
    : null;
  if (seasonal) return Object.assign({ seasonKey: season }, seasonal);
  return {
    seasonKey: season,
    cost: FESTIVAL_COST,
    favorGain: FESTIVAL_FAVOR_GAIN,
    durationTicks: FESTIVAL_DURATION_TICKS,
    growthBonus: FESTIVAL_GROWTH_BONUS,
  };
}

function holdFestival(){
  const fest = getFestivalDefForSeason();
  for (const [res, amt] of Object.entries(fest.cost)){
    if ((resources[res] || 0) < amt){
      showNotification(t('festival.notEnoughResources'), 'bad');
      return;
    }
  }
  for (const [res, amt] of Object.entries(fest.cost)) resources[res] -= amt;

  if (typeof applyFestivalToGods === 'function') applyFestivalToGods();
  else favor = Math.min(FAVOR_MAX, favor + fest.favorGain);
  festivalTicksLeft = fest.durationTicks;

  debugInfo('Festival organisé', { season: fest.seasonKey, favor });
  const seasonLabel = t('season.' + fest.seasonKey);
  showNotification(t('festival.startedSeason', { season: seasonLabel }), 'good');
  updateResourceBar();
  renderFestivalPanel();
}

function tickFestival(){
  if (festivalTicksLeft > 0){
    festivalTicksLeft--;
    if (festivalTicksLeft === 0) debugInfo('Effet du festival terminé');
  }
  renderFestivalPanel();
}

function festivalHappinessBonus(){
  if (festivalTicksLeft <= 0) return 0;
  const fest = getFestivalDefForSeason();
  return fest.growthBonus != null ? fest.growthBonus : FESTIVAL_GROWTH_BONUS;
}

function renderFestivalPanel(){
  const el = document.getElementById('festivalStatus');
  if (!el) return;
  el.textContent = festivalTicksLeft > 0
    ? t('festival.active', { ticks: festivalTicksLeft })
    : '';
}
