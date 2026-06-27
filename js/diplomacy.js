/* ===================== DIPLOMATIE ===================== */
// Chaque cité voisine a une relation (0-100). Périodiquement (cadence calée sur le
// calendrier), un événement propose au joueur un choix via la modale showChoice()
// dont les conséquences modifient trésor / ressources / faveur ET la relation.
// L'état (relations + jour du dernier événement) est persisté par save.js.
let diplomacy = { cities: {}, lastEventDay: 0 };

function initDiplomacy(){
  const cities = {};
  DIPLO_CITIES.forEach(c => { cities[c.key] = { relation: DIPLO_RELATION_START }; });
  // Décalé pour que le premier événement puisse tomber dès DIPLO_FIRST_EVENT_DAY.
  diplomacy = { cities, lastEventDay: DIPLO_FIRST_EVENT_DAY - DIPLO_EVENT_INTERVAL_DAYS };
}

// Repli sûr au chargement d'une sauvegarde antérieure à la diplomatie.
function ensureDiplomacyState(){
  if (!diplomacy || typeof diplomacy !== 'object') diplomacy = { cities: {}, lastEventDay: 0 };
  if (!diplomacy.cities) diplomacy.cities = {};
  DIPLO_CITIES.forEach(c => {
    if (!diplomacy.cities[c.key]) diplomacy.cities[c.key] = { relation: DIPLO_RELATION_START };
  });
  if (typeof diplomacy.lastEventDay !== 'number') diplomacy.lastEventDay = 0;
}

/* ===================== DECLENCHEUR PERIODIQUE ===================== */
function tickDiplomacy(){
  if (isDialogOpen()) return; // ne pas empiler les événements
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
  const cityDef = DIPLO_CITIES[Math.floor(Math.random() * DIPLO_CITIES.length)];
  const rel = diplomacy.cities[cityDef.key].relation;
  const eligible = DIPLO_EVENTS.filter(e => rel >= e.minRel && rel <= e.maxRel);
  if (eligible.length === 0) return;
  const event = pickWeighted(eligible);
  openDiplomacyDialog(cityDef, event);
}

/* ===================== AFFICHAGE & CONSEQUENCES ===================== */
function diploTextVars(cityDef, event){
  const v = Object.assign({ city: t('diplomacy.city.' + cityDef.key), icon: cityDef.icon }, event.vars || {});
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

function openDiplomacyDialog(cityDef, event){
  const vars = diploTextVars(cityDef, event);
  const choices = event.choices.map(choice => {
    const affordable = diploCanAfford(choice.requires);
    return {
      label: t('diplomacy.choice.' + choice.key),
      type: choice.type || 'neutral',
      disabled: !affordable,
      hint: affordable ? undefined : t('diplomacy.cannotAfford'),
      onPick: () => applyDiplomacyChoice(cityDef, event, choice),
    };
  });

  showChoice({
    title: `${cityDef.icon} ${t('diplomacy.event.' + event.key + '.title', vars)}`,
    body: t('diplomacy.event.' + event.key + '.body', vars),
    dismissible: false, // un événement diplomatique impose un choix
    choices,
  });
}

function applyDiplomacyEffects(cityKey, eff){
  if (!eff) return;
  if (eff.treasury) treasury += eff.treasury;
  if (eff.favor) favor = Math.max(0, Math.min(FAVOR_MAX, favor + eff.favor));
  if (eff.resources){
    for (const [r, a] of Object.entries(eff.resources)) resources[r] = Math.max(0, (resources[r] || 0) + a);
  }
  if (eff.relation){
    const c = diplomacy.cities[cityKey];
    c.relation = Math.max(DIPLO_RELATION_MIN, Math.min(DIPLO_RELATION_MAX, c.relation + eff.relation));
  }
}

function applyDiplomacyChoice(cityDef, event, choice){
  applyDiplomacyEffects(cityDef.key, choice.effects);
  const vars = diploTextVars(cityDef, event);
  showNotification(t('diplomacy.result.' + choice.result, vars), choice.resultType || 'info');
  debugInfo('Événement diplomatique résolu', { city: cityDef.key, event: event.key, choice: choice.key });
  updateResourceBar();
  renderDiplomacyPanel();
  saveGame({ silent: true });
}

/* ===================== PANNEAU ===================== */
function relationStatusKey(rel){
  if (rel >= DIPLO_ALLY_THRESHOLD) return 'ally';
  if (rel <= DIPLO_HOSTILE_THRESHOLD) return 'hostile';
  return 'neutral';
}

function renderDiplomacyPanel(){
  const el = document.getElementById('diplomacyList');
  if (!el) return;
  ensureDiplomacyState();
  el.innerHTML = DIPLO_CITIES.map(c => {
    const rel = diplomacy.cities[c.key].relation;
    const status = relationStatusKey(rel);
    return `<div class="diploRow">
      <span class="diploCity">${c.icon} ${t('diplomacy.city.' + c.key)}</span>
      <span class="diploStatus diplo-${status}">${t('diplomacy.status.' + status)}</span>
      <div class="diploBar"><div class="diploBarFill diplo-${status}" style="width:${rel}%"></div></div>
      <span class="diploValue">${Math.round(rel)}/100</span>
    </div>`;
  }).join('');
}
