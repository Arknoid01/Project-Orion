/* ===================== DIPLOMATIE ===================== */
// Les relations vivent désormais sur les cités de la carte du monde (world.js) :
// chaque cité a sa propre relation (0-100). Périodiquement, un événement propose un
// choix via la modale showChoice() dont les conséquences modifient trésor / ressources
// / faveur ET la relation de la cité concernée. Seul le "jour du dernier événement"
// est stocké ici ; les relations sont persistées avec les cités (save.js).
let diplomacy = { lastEventDay: 0 };

function initDiplomacy(){
  // Décalé pour que le premier événement puisse tomber dès DIPLO_FIRST_EVENT_DAY.
  diplomacy = { lastEventDay: DIPLO_FIRST_EVENT_DAY - DIPLO_EVENT_INTERVAL_DAYS };
}

function ensureDiplomacyState(){
  if (!diplomacy || typeof diplomacy !== 'object') diplomacy = { lastEventDay: 0 };
  if (typeof diplomacy.lastEventDay !== 'number') diplomacy.lastEventDay = 0;
  if (typeof ensureWorldState === 'function') ensureWorldState();
}

/* ===================== DECLENCHEUR PERIODIQUE ===================== */
function tickDiplomacy(){
  if (isDialogOpen()) return; // ne pas empiler les événements
  if (!worldCities || worldCities.length === 0) return;
  const day = getCalendarState().day;
  if (day < DIPLO_FIRST_EVENT_DAY) return;
  if (day - diplomacy.lastEventDay < DIPLO_EVENT_INTERVAL_DAYS) return;
  diplomacy.lastEventDay = day;
  triggerDiplomacyEvent();
}

function pickWeighted(list){
  const total = list.reduce((s, e) => s + (e.weight || 1), 0);
  let r = Math.random() * total;
  for (const e of list){ r -= (e.weight || 1); if (r <= 0) return e; }
  return list[list.length - 1];
}

function triggerDiplomacyEvent(){
  const city = worldCities[Math.floor(Math.random() * worldCities.length)];
  const rel = city.relation;
  const eligible = DIPLO_EVENTS.filter(e => rel >= e.minRel && rel <= e.maxRel);
  if (eligible.length === 0) return;
  const event = pickWeighted(eligible);
  openDiplomacyDialog(city, event);
}

/* ===================== AFFICHAGE & CONSEQUENCES ===================== */
function diploTextVars(city, event){
  const v = Object.assign({ city: city.name, icon: '🏛️' }, event.vars || {});
  if (v.res) v.res = t('resource.' + v.res); // version localisée pour le texte
  return v;
}

function diploCanAfford(req){
  if (!req) return true;
  if (req.treasury && treasury < req.treasury) return false;
  if (req.resources){
    for (const [r, a] of Object.entries(req.resources)) if ((resources[r] || 0) < a) return false;
  }
  return true;
}

function openDiplomacyDialog(city, event){
  const vars = diploTextVars(city, event);
  const choices = event.choices.map(choice => {
    const affordable = diploCanAfford(choice.requires);
    return {
      label: t('diplomacy.choice.' + choice.key),
      type: choice.type || 'neutral',
      disabled: !affordable,
      hint: affordable ? undefined : t('diplomacy.cannotAfford'),
      onPick: () => applyDiplomacyChoice(city, event, choice),
    };
  });

  showChoice({
    title: `🏛️ ${t('diplomacy.event.' + event.key + '.title', vars)}`,
    body: t('diplomacy.event.' + event.key + '.body', vars),
    dismissible: false, // un événement diplomatique impose un choix
    choices,
  });
}

function applyDiplomacyEffects(city, eff){
  if (!eff) return;
  if (eff.treasury) treasury += eff.treasury;
  if (eff.favor) favor = Math.max(0, Math.min(FAVOR_MAX, favor + eff.favor));
  if (eff.resources){
    for (const [r, a] of Object.entries(eff.resources)) resources[r] = Math.max(0, (resources[r] || 0) + a);
  }
  if (eff.relation) city.relation = clampRelation(city.relation + eff.relation);
}

function applyDiplomacyChoice(city, event, choice){
  if (event.key === 'raidThreat' && choice.key === 'refuse' && typeof spawnInvasion === 'function'){
    applyDiplomacyEffects(city, { relation: choice.effects.relation });
    spawnInvasion(city);
  } else {
    applyDiplomacyEffects(city, choice.effects);
  }
  const vars = diploTextVars(city, event);
  showNotification(t('diplomacy.result.' + choice.result, vars), choice.resultType || 'info');
  debugInfo('Événement diplomatique résolu', { city: city.name, event: event.key, choice: choice.key });
  updateResourceBar();
  renderDiplomacyPanel();
  if (typeof renderWorldMap === 'function') renderWorldMap(); // si la carte est ouverte
  saveGame({ silent: true });
}

/* ===================== STATUT RELATION (partagé : carte, commerce) ===================== */
function relationStatusKey(rel){
  if (rel >= DIPLO_ALLY_THRESHOLD) return 'ally';
  if (rel <= DIPLO_HOSTILE_THRESHOLD) return 'hostile';
  return 'neutral';
}

// Ancien panneau latéral (absent de la nouvelle interface) -- défensif : ne fait rien
// si l'élément n'existe pas. Les relations s'affichent maintenant sur la carte du monde.
function renderDiplomacyPanel(){
  const el = document.getElementById('diplomacyList');
  if (!el) return;
  ensureDiplomacyState();
  el.innerHTML = worldCities.map(c => {
    const status = relationStatusKey(c.relation);
    return `<div class="diploRow">
      <span class="diploCity">🏛️ ${c.name}</span>
      <span class="diploStatus diplo-${status}">${t('diplomacy.status.' + status)}</span>
      <div class="diploBar"><div class="diploBarFill diplo-${status}" style="width:${c.relation}%"></div></div>
      <span class="diploValue">${Math.round(c.relation)}/100</span>
    </div>`;
  }).join('');
}
