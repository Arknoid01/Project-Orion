/* ===================== INVASIONS MILITAIRES (VISUEL) ===================== */
// Les troupes ennemies (et nos défenseurs) marchent sur la carte ; le combat abstrait
// ne se résout qu'au retour du dernier soldat (voir militaryAgents.js).

function resetInvasion(){ resetMilitaryAgents(); }

function findInvasionTarget(){
  let barracks = null;
  forEachBuilding((type, col, row) => {
    if (type === 'barracks' && !barracks) barracks = { col, row };
  });
  if (barracks) return barracks;

  let sumCol = 0, sumRow = 0, n = 0;
  forEachBuilding((type, col, row) => {
    if (type === 'maison'){ sumCol += col; sumRow += row; n++; }
  });
  if (n > 0) return { col: Math.round(sumCol / n), row: Math.round(sumRow / n) };
  return { col: Math.floor(GRID_COLS / 2), row: Math.floor(GRID_ROWS / 2) };
}

function spawnInvasion(city){
  if (isMilitaryBusy()) return;
  if (!beginInvasionCampaign(city)){
    resolveInvasionBattle(city.name, cityPower(city), getMilitaryPoints());
  }
}

function resolveInvasionBattle(cityName, enemyPower, defense){
  ensureArmyState();
  defense = defense ?? getMilitaryPoints();
  const enemy = enemyPower;

  if (defense > enemy){
    showNotification(t('invasion.repelled', { city: cityName }), 'good');
    showChoice({
      title: `🛡️ ${t('invasion.repelledTitle')}`,
      body: t('invasion.repelledBody', { city: cityName, defense, enemy }),
      choices: [{ label: 'OK', type: 'good' }],
    });
    debugInfo('Invasion repoussée', { city: cityName, defense, enemy });
  } else {
    const tribute = Math.round(enemy * TRIBUTE_PER_POWER * 0.5) + 80;
    const paid = Math.min(Math.floor(treasury), tribute);
    treasury -= paid;
    resources.wheat = Math.max(0, (resources.wheat || 0) - 15);
    army.morale = Math.max(0.2, army.morale - 0.15);
    showNotification(t('invasion.breached', { city: cityName }), 'bad');
    showChoice({
      title: `💀 ${t('invasion.breachedTitle')}`,
      body: t('invasion.breachedBody', { city: cityName, gold: paid, defense, enemy }),
      choices: [{ label: 'OK', type: 'danger' }],
    });
    debugInfo('Invasion réussie (ennemi)', { city: cityName, defense, enemy, paid });
  }

  updateResourceBar();
  saveGame({ silent: true });
}

function tickInvasion(){
  if (isMilitaryBusy()) return;
  if (typeof getCalendarState !== 'function') return;
  const day = getCalendarState().day;
  if (day < INVASION_MIN_DAY || !worldCities || worldCities.length === 0) return;
  let spawnChance = INVASION_SPAWN_CHANCE;
  const defense = getMilitaryPoints();
  if (defense >= 80) spawnChance *= 0.45;
  else if (defense >= 40) spawnChance *= 0.65;
  if (Math.random() >= spawnChance) return;
  const hostile = worldCities.filter(c => !c.conquered && c.relation <= DIPLO_HOSTILE_THRESHOLD);
  if (hostile.length === 0) return;
  spawnInvasion(hostile[Math.floor(Math.random() * hostile.length)]);
}
