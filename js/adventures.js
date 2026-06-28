/* ===================== QUÊTES / AVENTURES (style Zeus) ===================== */
// Envoyer des héros en mission : combat (résolution auto) ou énigme (choix à la fin).
// Récompenses : ressources, faveur, artefacts passifs.

let adventureMissions = [];   // { id, questId, heroKey, ticksLeft }
let completedAdventures = [];   // ids oneTime complétées
let artifacts = {};           // { aegis: 1, ... }
let pendingRiddleMission = null; // mission en attente de réponse énigme
let adventureIdSeq = 0;

function resetAdventures(){
  adventureMissions = [];
  completedAdventures = [];
  artifacts = {};
  pendingRiddleMission = null;
  adventureIdSeq = 0;
}

function getAdventureDef(id){
  return ADVENTURE_DEFINITIONS.find(a => a.id === id);
}

function adventureUnlocked(){
  if (typeof isColonyPhase === 'function' && isColonyPhase()) return false;
  if (typeof countHeroTemples === 'function' && countHeroTemples() < 1) return false;
  if (typeof getCalendarState === 'function'){
    const cal = getCalendarState();
    if (cal.day < ADVENTURE_MIN_DAY) return false;
  }
  return true;
}

function maxActiveAdventures(){
  const temples = (typeof countHeroTemples === 'function') ? countHeroTemples() : 1;
  return Math.min(ADVENTURE_MAX_CONCURRENT, Math.max(1, temples));
}

function isHeroOnAdventure(heroKey){
  return adventureMissions.some(m => m.heroKey === heroKey);
}

function isHeroAvailableForAdventure(heroKey){
  if (isHeroOnAdventure(heroKey)) return false;
  if (typeof hero !== 'undefined' && hero && hero.typeKey === heroKey) return false;
  return true;
}

function availableHeroesForAdventure(){
  return HERO_TYPES.filter(h => isHeroAvailableForAdventure(h.key));
}

function isAdventureCompleted(questId){
  const def = getAdventureDef(questId);
  if (!def || !def.oneTime) return false;
  return completedAdventures.includes(questId);
}

function isAdventureActive(questId){
  return adventureMissions.some(m => m.questId === questId);
}

function canLaunchAdventure(questId){
  if (!adventureUnlocked()) return false;
  if (adventureMissions.length >= maxActiveAdventures()) return false;
  if (isAdventureCompleted(questId)) return false;
  if (isAdventureActive(questId)) return false;
  if (availableHeroesForAdventure().length === 0) return false;
  const def = getAdventureDef(questId);
  if (!def) return false;
  if (def.cost?.treasury && treasury < def.cost.treasury) return false;
  if (def.cost?.resources){
    for (const [res, amt] of Object.entries(def.cost.resources)){
      if ((resources[res] || 0) < amt) return false;
    }
  }
  return true;
}

function formatAdventureCost(def){
  const parts = [];
  if (def.cost?.treasury) parts.push(`🪙 ${def.cost.treasury} dr.`);
  if (def.cost?.resources){
    for (const [res, amt] of Object.entries(def.cost.resources)){
      parts.push(`${amt} ${t('resource.' + res)}`);
    }
  }
  return parts.join(' · ') || t('adventure.free');
}

function formatAdventureRewards(rewards){
  if (!rewards) return '—';
  const parts = [];
  if (rewards.treasury) parts.push(`🪙 ${rewards.treasury} dr.`);
  if (rewards.favor) parts.push(`⚡ +${rewards.favor} ${t('resource.favor')}`);
  if (rewards.resources){
    for (const [res, amt] of Object.entries(rewards.resources)){
      parts.push(`${amt} ${t('resource.' + res)}`);
    }
  }
  if (rewards.artifact && ARTIFACTS[rewards.artifact]){
    parts.push(`${ARTIFACTS[rewards.artifact].icon} ${t(ARTIFACTS[rewards.artifact].nameKey)}`);
  }
  return parts.join(' · ') || '—';
}

function spendAdventureCost(def){
  if (def.cost?.treasury) treasury -= def.cost.treasury;
  if (def.cost?.resources){
    for (const [res, amt] of Object.entries(def.cost.resources)) resources[res] -= amt;
  }
}

function computeAdventureSuccessChance(def, heroKey){
  let chance = ADVENTURE_BASE_SUCCESS - def.difficulty * ADVENTURE_DIFFICULTY_PENALTY;
  if (def.heroKey === heroKey) chance += ADVENTURE_IDEAL_HERO_BONUS;
  if (artifacts.aegis) chance += 0.05;
  return Math.min(0.92, Math.max(0.18, chance));
}

function grantArtifact(key){
  if (!ARTIFACTS[key]) return;
  artifacts[key] = (artifacts[key] || 0) + 1;
}

function applyAdventureRewards(rewards, multiplier){
  multiplier = multiplier == null ? 1 : multiplier;
  if (!rewards) return;
  if (rewards.treasury) treasury += Math.floor(rewards.treasury * multiplier);
  if (rewards.favor && typeof adjustGodSatisfaction === 'function'){
    for (const g of GODS) adjustGodSatisfaction(g.key, rewards.favor * multiplier / GODS.length);
    if (typeof syncGlobalFavor === 'function') syncGlobalFavor();
  } else if (rewards.favor){
    favor = Math.min(FAVOR_MAX, favor + rewards.favor * multiplier);
  }
  if (rewards.resources){
    for (const [res, amt] of Object.entries(rewards.resources)){
      resources[res] = (resources[res] || 0) + Math.floor(amt * multiplier);
    }
  }
  if (rewards.artifact && multiplier >= 1) grantArtifact(rewards.artifact);
  updateResourceBar();
}

function markAdventureCompleted(questId){
  const def = getAdventureDef(questId);
  if (def?.oneTime && !completedAdventures.includes(questId)){
    completedAdventures.push(questId);
  }
}

function removeAdventureMission(missionId){
  adventureMissions = adventureMissions.filter(m => m.id !== missionId);
}

function launchAdventure(questId, heroKey){
  const def = getAdventureDef(questId);
  if (!def || !canLaunchAdventure(questId)) return;
  if (!isHeroAvailableForAdventure(heroKey)) return;

  spendAdventureCost(def);
  adventureMissions.push({
    id: ++adventureIdSeq,
    questId,
    heroKey,
    ticksLeft: def.durationTicks,
  });

  showNotification(t('adventure.departed', {
    hero: t('hero.name.' + heroKey),
    quest: t(def.nameKey),
  }), 'good');
  debugInfo('Aventure lancée', { questId, heroKey });
  updateResourceBar();
  refreshAdventureUI();
  saveGame({ silent: true });
}

function confirmLaunchAdventure(questId){
  const def = getAdventureDef(questId);
  if (!def) return;
  if (!canLaunchAdventure(questId)){
    showNotification(t('adventure.cantLaunch'), 'bad');
    return;
  }
  const heroes = availableHeroesForAdventure();
  if (!heroes.length){
    showNotification(t('adventure.noHero'), 'bad');
    return;
  }

  const body = [
    t(def.descKey),
    '',
    t('adventure.costLabel') + ': ' + formatAdventureCost(def),
    t('adventure.rewardsLabel') + ': ' + formatAdventureRewards(def.rewards),
    def.heroKey ? t('adventure.idealHero', { hero: t('hero.name.' + def.heroKey) }) : '',
  ].filter(Boolean).join('\n');

  showChoice({
    title: t('adventure.pickHeroTitle', { quest: t(def.nameKey) }),
    body,
    choices: heroes.map(h => ({
      label: `${h.icon} ${t('hero.name.' + h.key)}`,
      type: h.key === def.heroKey ? 'good' : 'primary',
      hint: h.key === def.heroKey ? t('adventure.idealHeroShort') : '',
      onPick: () => launchAdventure(questId, h.key),
    })).concat([{ label: t('dialog.no'), type: 'neutral' }]),
  });
}

function resolveCombatMission(mission){
  const def = getAdventureDef(mission.questId);
  if (!def) return;
  const chance = computeAdventureSuccessChance(def, mission.heroKey);
  const success = Math.random() < chance;
  markAdventureCompleted(mission.questId);

  if (success){
    applyAdventureRewards(def.rewards);
    showNotification(t('adventure.success', {
      hero: t('hero.name.' + mission.heroKey),
      quest: t(def.nameKey),
      rewards: formatAdventureRewards(def.rewards),
    }), 'good');
  } else {
    showNotification(t('adventure.failure', {
      hero: t('hero.name.' + mission.heroKey),
      quest: t(def.nameKey),
    }), 'bad');
  }
  removeAdventureMission(mission.id);
  refreshAdventureUI();
  saveGame({ silent: true });
}

function showRiddleForMission(mission){
  const def = getAdventureDef(mission.questId);
  if (!def || !def.riddleChoices) return;
  pendingRiddleMission = mission;

  showChoice({
    title: t('adventure.riddleTitle', { quest: t(def.nameKey) }),
    body: t(def.riddleKey) + '\n\n' + t('adventure.riddleHint', { hero: t('hero.name.' + mission.heroKey) }),
    dismissible: false,
    choices: def.riddleChoices.map(c => ({
      label: t(c.labelKey),
      type: c.correct ? 'good' : 'neutral',
      onPick: () => resolveRiddleMission(c.correct),
    })),
  });
}

function resolveRiddleMission(correct){
  const mission = pendingRiddleMission;
  pendingRiddleMission = null;
  if (!mission) return;

  const def = getAdventureDef(mission.questId);
  markAdventureCompleted(mission.questId);
  removeAdventureMission(mission.id);

  if (correct){
    applyAdventureRewards(def.rewards);
    showNotification(t('adventure.riddleSuccess', {
      hero: t('hero.name.' + mission.heroKey),
      quest: t(def.nameKey),
      rewards: formatAdventureRewards(def.rewards),
    }), 'good');
  } else {
    applyAdventureRewards(def.rewards, 0.35);
    showNotification(t('adventure.riddleFail', {
      hero: t('hero.name.' + mission.heroKey),
      quest: t(def.nameKey),
    }), 'bad');
  }
  refreshAdventureUI();
  saveGame({ silent: true });
}

function tickAdventures(){
  if (!adventureMissions.length || pendingRiddleMission) return;

  for (const mission of adventureMissions.slice()){
    mission.ticksLeft--;
    if (mission.ticksLeft > 0) continue;

    const def = getAdventureDef(mission.questId);
    if (!def) { removeAdventureMission(mission.id); continue; }

    if (def.type === 'riddle') showRiddleForMission(mission);
    else resolveCombatMission(mission);
  }

  if (adventureMissions.length) refreshAdventureUI();
}

function artifactBonus(effect){
  let total = 0;
  for (const [key, count] of Object.entries(artifacts)){
    const def = ARTIFACTS[key];
    if (!def || def.effect !== effect) continue;
    total += def.value * count;
  }
  return total;
}

function buildAdventuresObserverData(){
  const questRows = ADVENTURE_DEFINITIONS.map(def => {
    const done = isAdventureCompleted(def.id);
    const active = isAdventureActive(def.id);
    const activeMission = adventureMissions.find(m => m.questId === def.id);
    let status = formatAdventureRewards(def.rewards);
    if (done) status = t('adventure.completed');
    else if (active && activeMission){
      status = t('adventure.inProgress', {
        hero: t('hero.name.' + activeMission.heroKey),
        ticks: activeMission.ticksLeft,
      });
    }
    const typeLabel = def.type === 'riddle' ? t('adventure.type.riddle') : t('adventure.type.combat');
    return [
      `${def.icon} ${t(def.nameKey)} (${typeLabel})`,
      status,
      done ? 'ok' : '',
    ];
  });

  const missionRows = adventureMissions.length
    ? adventureMissions.map(m => {
      const def = getAdventureDef(m.questId);
      return [
        `${t('hero.name.' + m.heroKey)} → ${def ? t(def.nameKey) : m.questId}`,
        t('adventure.ticksLeft', { ticks: m.ticksLeft }),
        '',
      ];
    })
    : [[t('adventure.noMissions'), '']];

  const artifactRows = Object.keys(ARTIFACTS).filter(k => artifacts[k] > 0).map(k => {
    const def = ARTIFACTS[k];
    return [`${def.icon} ${t(def.nameKey)}`, `×${artifacts[k]}`, 'ok'];
  });
  if (!artifactRows.length) artifactRows.push([t('adventure.noArtifacts'), '']);

  let actionsHtml = '';
  if (!adventureUnlocked()){
    actionsHtml = `<p class="manageHint">${t('adventure.needTemple')}</p>`;
  } else {
    actionsHtml = ADVENTURE_DEFINITIONS.map(def => {
      const done = isAdventureCompleted(def.id);
      const active = isAdventureActive(def.id);
      const disabled = done || active || !canLaunchAdventure(def.id);
      const typeIcon = def.type === 'riddle' ? '❓' : '⚔️';
      return `<button class="actionBtn" ${disabled ? 'disabled' : ''} onclick="confirmLaunchAdventure('${def.id}')">${def.icon} ${typeIcon} ${t(def.nameKey)}</button>`;
    }).join('');
  }

  return {
    title: t('panel.adventures'),
    tiles: [
      {
        icon: '⚔️',
        title: t('panel.adventures'),
        status: `${adventureMissions.length}/${maxActiveAdventures()}`,
        rows: questRows,
      },
      {
        icon: '🦸',
        title: t('adventure.activeTitle'),
        status: '',
        rows: missionRows,
      },
      {
        icon: '🏺',
        title: t('adventure.artifactsTitle'),
        status: `${Object.values(artifacts).reduce((a, b) => a + b, 0)}`,
        rows: artifactRows,
      },
    ],
    actions: false,
    actionsTitle: t('adventure.launch'),
    actionsHtml,
  };
}

function openAdventuresPanel(){
  const panel = document.getElementById('observerPanel');
  if (!panel) return;
  const data = buildAdventuresObserverData();
  if (typeof closePanels === 'function') closePanels();
  const titleEl = document.getElementById('observerTitle');
  if (titleEl) titleEl.textContent = t('observer.prefix') + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.add('show');
}

function renderAdventureHud(){
  const badge = document.getElementById('hudAdventureBadge');
  const label = document.getElementById('hudAdventureCount');
  if (!badge) return;
  const n = adventureMissions.length;
  if (n > 0){
    badge.style.display = '';
    if (label) label.textContent = String(n);
    badge.title = t('adventure.inProgressShort');
  } else {
    badge.style.display = 'none';
  }
}

function refreshAdventureUI(){
  renderAdventureHud();
}

function serializeAdventureState(){
  return {
    adventureMissions,
    completedAdventures,
    artifacts,
    adventureIdSeq,
  };
}

function restoreAdventureState(payload){
  adventureMissions = Array.isArray(payload.adventureMissions) ? payload.adventureMissions : [];
  completedAdventures = Array.isArray(payload.completedAdventures) ? payload.completedAdventures.slice() : [];
  artifacts = payload.artifacts && typeof payload.artifacts === 'object' ? payload.artifacts : {};
  adventureIdSeq = payload.adventureIdSeq || 0;
  pendingRiddleMission = null;
  refreshAdventureUI();
}
