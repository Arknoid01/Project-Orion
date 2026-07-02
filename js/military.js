/* ===================== MILITAIRE ===================== */
// Points de troupe calculés en temps réel à partir de la population et des casernes,
// modulés par le moral (qui dépend du paiement de l'entretien mensuel). L'attaque d'une
// cité compare nos points à sa puissance : on gagne si nos points sont supérieurs.
//   - victoire : on conquiert la cité (tribut immédiat + tribut mensuel)
//   - défaite  : la cité se braque (relation), avec un risque de représailles (tribut forcé)
// Voir config.js pour les constantes, world.js pour la puissance des cités, calendar.js
// pour l'entretien/tributs mensuels.
let army = { morale: 1 };

function initArmy(){ army = { morale: 1 }; }

function ensureArmyState(){
  if (!army || typeof army !== 'object') army = { morale: 1 };
  if (typeof army.morale !== 'number') army.morale = 1;
}

function countBarracks(){
  let n = 0;
  forEachBuilding((type) => { if (BUILDING_DEFS[type].isBarracks) n++; });
  return n;
}

/* ===================== POINTS DE TROUPE ===================== */
// Potentiel = min(capacité des casernes, plafond de population). Nul sans caserne.
function getArmyPotential(){
  const barracks = countBarracks();
  if (barracks === 0) return 0;
  const pop = computeTotalPopulation();
  return Math.min(barracks * TROOPS_PER_BARRACKS, Math.floor(pop * TROOPS_PER_POP));
}

function countArmories(){
  let n = 0;
  forEachBuilding((type) => { if (BUILDING_DEFS[type].isArmory) n++; });
  return n;
}

function armoryTroopBonus(){
  const stocked = (resources.arms || 0) >= ARMORY_TROOP_BONUS;
  return countArmories() * (stocked ? ARMORY_TROOP_BONUS : Math.floor(ARMORY_TROOP_BONUS * 0.4));
}

// Points de combat effectifs = potentiel × moral.
function getMilitaryPoints(){
  ensureArmyState();
  return Math.round(getArmyPotential() * army.morale)
    + ((typeof godMilitaryBonus === 'function') ? godMilitaryBonus() : 0)
    + (colonyTroopBonus || 0)
    + ((typeof artifactBonus === 'function') ? artifactBonus('military') : 0)
    + armoryTroopBonus();
}

function getArmyUpkeep(points){
  return {
    gold: Math.round(points * ARMY_UPKEEP_GOLD),
    wheat: Math.round(points * ARMY_UPKEEP_WHEAT),
    arms: Math.round(points * ARMY_UPKEEP_ARMS),
  };
}

// Mensuel : paie l'entretien du potentiel courant. Payé -> moral remonte ; impayé ->
// on prend ce qu'on peut et le moral chute (donc moins de points de combat ensuite).
function processArmyUpkeep(){
  ensureArmyState();
  const potential = getArmyPotential();
  if (potential <= 0){ army.morale = 1; return; }
  const up = getArmyUpkeep(potential);
  const hasArms = (resources.arms || 0) >= up.arms;
  if (treasury >= up.gold && (resources.wheat || 0) >= up.wheat && hasArms){
    treasury -= up.gold;
    resources.wheat -= up.wheat;
    resources.arms -= up.arms;
    army.morale = Math.min(1, army.morale + 0.1);
  } else {
    treasury = Math.max(0, treasury - up.gold);
    resources.wheat = Math.max(0, (resources.wheat || 0) - up.wheat);
    resources.arms = Math.max(0, (resources.arms || 0) - up.arms);
    army.morale = Math.max(0.2, army.morale - 0.25);
    showNotification(t('army.unpaid'), 'bad');
  }
  debugInfo('Entretien de l\'armée', { potential, morale: army.morale, upkeep: up });
}

/* ===================== PUISSANCE DES CITES ADVERSES ===================== */
function cityPower(city){ return Math.round((city && city.power) || 0); }

function cityPowerTier(power){
  if (power < 35) return 'weak';
  if (power < 60) return 'medium';
  if (power < 85) return 'strong';
  return 'fearsome';
}

// Tributs mensuels des cités conquises (versés au trésor).
function processTributes(){
  if (!worldCities) return;
  let total = 0;
  worldCities.forEach(c => {
    if (c.conquered){ const tr = Math.round((c.power || 0) * TRIBUTE_MONTHLY_PER_POWER); treasury += tr; total += tr; }
  });
  if (total > 0) showNotification(t('army.tributeIncome', { gold: total }), 'good');
}

/* ===================== ATTAQUE ===================== */
function launchAttack(){
  if (typeof ensureWorldState === 'function') ensureWorldState();
  if (typeof isMilitaryBusy === 'function' && isMilitaryBusy()){
    showNotification(t('army.campaignBusy'), 'info');
    return;
  }
  if (countBarracks() === 0){ showNotification(t('army.noBarracks'), 'bad'); return; }
  const points = getMilitaryPoints();
  const targets = (worldCities || []).filter(c => !c.conquered);
  if (targets.length === 0){ showNotification(t('army.noTargets'), 'info'); return; }
  const choices = targets.map(c => {
    const ep = cityPower(c);
    return {
      label: `${c.name} · ⚔️ ${ep} (${t('army.tier.' + cityPowerTier(ep))})`,
      type: points > ep ? 'good' : 'danger',
      onPick: () => {
        if (typeof beginAttackCampaign === 'function' && beginAttackCampaign(c)) return;
        resolveAttack(c);
      },
    };
  });
  choices.push({ label: t('dialog.no'), type: 'neutral' });
  showChoice({
    title: `🔥 ${t('army.attackTitle')}`,
    body: t('army.yourPoints', { n: points }),
    choices,
  });
}

function resolveAttack(city){
  const points = getMilitaryPoints();
  const enemy = cityPower(city);

  if (points > enemy){
    const tribute = Math.round(enemy * TRIBUTE_PER_POWER) + 100;
    treasury += tribute;
    city.conquered = true;
    city.relation = clampRelation(Math.max(city.relation, DIPLO_ALLY_THRESHOLD));
    showNotification(t('army.victoryNotif', { city: city.name }), 'good');
    showChoice({
      title: `🏆 ${t('army.victoryTitle')}`,
      body: t('army.victoryBody', { city: city.name, gold: tribute }),
      choices: [{ label: 'OK', type: 'good' }],
    });
    debugInfo('Victoire militaire', { city: city.name, points, enemy, tribute });
  } else {
    city.relation = clampRelation(city.relation - 25);
    let body = t('army.defeatBody', { city: city.name });
    if (Math.random() < REPRISAL_CHANCE){
      const tribute = Math.round(enemy * TRIBUTE_PER_POWER) + 50;
      const paid = Math.min(Math.floor(treasury), tribute);
      treasury -= paid;
      ensureArmyState();
      army.morale = Math.max(0.2, army.morale - 0.2);
      body += ' ' + t('army.reprisalBody', { city: city.name, gold: paid });
    }
    showNotification(t('army.defeatNotif', { city: city.name }), 'bad');
    showChoice({
      title: `💀 ${t('army.defeatTitle')}`,
      body,
      choices: [{ label: 'OK', type: 'danger' }],
    });
    debugInfo('Défaite militaire', { city: city.name, points, enemy });
  }

  updateResourceBar();
  if (typeof renderWorldMap === 'function') renderWorldMap();
  if (typeof checkObjectives === 'function') checkObjectives();
  saveGame({ silent: true });
}

/* ===================== ECRAN ARMEE (observateur) ===================== */
function buildArmyObserverData(){
  const barracks = countBarracks();
  if (barracks === 0){
    return { title: t('panel.army'), tiles: [{ icon: '🛡️', title: t('panel.army'), status: '', rows: [[t('army.noBarracks'), '']] }], actions: false };
  }
  ensureArmyState();
  const pop = computeTotalPopulation();
  const potential = getArmyPotential();
  const points = getMilitaryPoints();
  const up = getArmyUpkeep(potential);
  const moralePct = Math.round(army.morale * 100);
  const perMonth = t('inspector.perMonth').replace('/', '');
  return {
    title: t('panel.army'),
    tiles: [
      { icon: '⚔️', title: t('army.troops'), status: `${points} ${t('army.points')}`,
        rows: [
          [t('army.potential'), String(potential)],
          [t('army.morale'), `${moralePct}%`, army.morale < 0.6 ? 'bad' : 'ok'],
          [t('army.fromPop'), `${pop}`],
          [t('building.barracks'), `${barracks} 🛡️`],
        ] },
      { icon: '💰', title: t('army.upkeep'), status: '',
        rows: [
          [`🌾 ${t('resource.wheat')}`, `${up.wheat}/${perMonth}`],
          [`🪙 ${t('army.gold')}`, `${up.gold}/${perMonth}`],
        ] },
    ],
    actions: false,
  };
}

function openArmyPanel(){
  const panel = document.getElementById('observerPanel');
  if (!panel) return;
  const data = buildArmyObserverData();
  if (typeof closePanels === 'function') closePanels();
  const titleEl = document.getElementById('observerTitle');
  if (titleEl) titleEl.textContent = t('observer.prefix') + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.add('show');
}
