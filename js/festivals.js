/* ===================== FESTIVALS ===================== */
// Même principe que l'offrande (mythology.js) : action joueur, coûte des ressources,
// effet temporaire. Pas de nouveau stat "bonheur" séparé -- l'effet se traduit
// directement par un bonus de croissance et une réduction du risque d'émigration
// (voir migration.js : growthChance/emigrationChance lisent festivalHappinessBonus()).
let festivalTicksLeft = 0;

function holdFestival(){
  for (const [res, amt] of Object.entries(FESTIVAL_COST)){
    if (resources[res] < amt){
      showNotification(t('festival.notEnoughResources'), 'bad');
      return;
    }
  }
  for (const [res, amt] of Object.entries(FESTIVAL_COST)) resources[res] -= amt;

  favor = Math.min(FAVOR_MAX, favor + FESTIVAL_FAVOR_GAIN);
  festivalTicksLeft = FESTIVAL_DURATION_TICKS;

  debugInfo('Festival organisé', { favor });
  showNotification(t('festival.started'), 'good');
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

// Bonus actif pendant la durée du festival, lu par migration.js. 0 si aucun festival
// en cours.
function festivalHappinessBonus(){
  return festivalTicksLeft > 0 ? FESTIVAL_GROWTH_BONUS : 0;
}

function renderFestivalPanel(){
  const el = document.getElementById('festivalStatus');
  if (!el) return;
  el.textContent = festivalTicksLeft > 0
    ? t('festival.active', { ticks: festivalTicksLeft })
    : '';
}
