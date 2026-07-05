/* ===================== ORACLE (prophéties → chronique 📜) ===================== */
// Prophéties publiées dans la chronique si la cité a un temple, un temple des héros
// ou un temple monumental d'Apollon. Style Zeus : avertir 1–4 jours avant certains événements.

const ORACLE_INTERVAL_DAYS = 4;
const ORACLE_MIN_DAY = 5;
const ORACLE_WRATH_SAT = 38;
const ORACLE_BLESS_SAT = 72;

let lastOracleCheckDay = -1;

function hasOracleAccess(){
  if (typeof hasGodTemple === 'function' && hasGodTemple('apollo')) return true;
  let heroTemple = false;
  let temple = false;
  forEachBuilding((type) => {
    if (type === 'heroTemple') heroTemple = true;
    if (type === 'temple') temple = true;
  });
  return heroTemple || temple;
}

function oracleProphecy(messageKey, vars, type){
  if (typeof showNotification !== 'function' || typeof t !== 'function') return;
  showNotification(t(messageKey, vars || {}), type || 'info', { category: 'oracle' });
}

function _oraclePickWeighted(options){
  const total = options.reduce((s, o) => s + (o.weight || 1), 0);
  let r = Math.random() * total;
  for (const o of options){
    r -= (o.weight || 1);
    if (r <= 0) return o;
  }
  return options[options.length - 1];
}

function _oracleAngryGod(){
  if (typeof godSatisfaction === 'undefined' || typeof hostileGods === 'undefined') return null;
  let worst = null;
  for (const key of hostileGods){
    const sat = godSatisfaction[key];
    if (typeof sat !== 'number' || sat > ORACLE_WRATH_SAT) continue;
    if (!worst || sat < worst.sat) worst = { key, sat };
  }
  if (worst) return worst;
  for (const g of GODS){
    const sat = godSatisfaction[g.key];
    if (typeof sat === 'number' && sat <= ORACLE_WRATH_SAT - 6){
      if (!worst || sat < worst.sat) worst = { key: g.key, sat };
    }
  }
  return worst;
}

function _oracleFriendlyGod(){
  if (typeof godSatisfaction === 'undefined' || typeof friendlyGods === 'undefined') return null;
  for (const key of friendlyGods){
    const sat = godSatisfaction[key];
    if (typeof sat === 'number' && sat >= ORACLE_BLESS_SAT) return { key, sat };
  }
  return null;
}

function _oracleDaysUntilDiplomacy(){
  if (typeof diplomacy === 'undefined' || typeof DIPLO_EVENT_INTERVAL_DAYS === 'undefined') return 99;
  const day = getCalendarState().day;
  if (day < DIPLO_FIRST_EVENT_DAY) return DIPLO_FIRST_EVENT_DAY - day;
  const next = diplomacy.lastEventDay + DIPLO_EVENT_INTERVAL_DAYS;
  return Math.max(0, next - day);
}

function buildOracleProphecyOptions(){
  const day = getCalendarState().day;
  const options = [];

  if (!monster && day >= MONSTER_MIN_DAY - 2
      && typeof computeTotalPopulation === 'function'
      && computeTotalPopulation() > 4){
    options.push({ weight: 28, key: 'oracle.prophecy.monster' });
  }

  const angry = _oracleAngryGod();
  if (angry){
    options.push({
      weight: 26,
      key: 'oracle.prophecy.wrath',
      vars: { god: t('god.' + angry.key), icon: (typeof godByKey === 'function' ? godByKey(angry.key)?.icon : null) || '⚡' },
    });
  }

  const diploIn = _oracleDaysUntilDiplomacy();
  if (diploIn <= 3 && typeof worldCities !== 'undefined' && worldCities.length > 0){
    options.push({ weight: 22, key: 'oracle.prophecy.diplomacy' });
  }

  if (typeof countCultureVenues === 'function' && countCultureVenues() >= 1
      && (resources.wine || 0) >= 4 && (resources.sculpture || 0) >= 2){
    options.push({ weight: 14, key: 'oracle.prophecy.spectacle' });
  }

  const friend = _oracleFriendlyGod();
  if (friend){
    options.push({
      weight: 12,
      key: 'oracle.prophecy.blessing',
      vars: { god: t('god.' + friend.key), icon: (typeof godByKey === 'function' ? godByKey(friend.key)?.icon : null) || '✨', homeCity: getPlayerCityName() },
    });
  }

  if (day >= 10 && (resources.wheat || 0) < 8 && typeof computeTotalPopulation === 'function'
      && computeTotalPopulation() > 10){
    options.push({ weight: 10, key: 'oracle.prophecy.famine' });
  }

  return options;
}

function tickOracle(){
  if (typeof isColonyPhase === 'function' && isColonyPhase()) return;
  if (typeof isGamePaused === 'function' && isGamePaused()) return;
  if (!hasOracleAccess()) return;
  if (DEBUG.tickCount % DAY_DURATION_TICKS !== 0) return;

  const day = getCalendarState().day;
  if (day < ORACLE_MIN_DAY) return;
  if (lastOracleCheckDay >= 0 && day - lastOracleCheckDay < ORACLE_INTERVAL_DAYS) return;

  lastOracleCheckDay = day;
  const options = buildOracleProphecyOptions();
  if (!options.length) return;

  const pick = _oraclePickWeighted(options);
  oracleProphecy(pick.key, pick.vars, pick.type || 'info');
  debugInfo('Prophétie oracle', { key: pick.key, day });
}

function resetOracleState(){
  lastOracleCheckDay = -1;
}

window.hasOracleAccess = hasOracleAccess;
window.tickOracle = tickOracle;
window.resetOracleState = resetOracleState;
window.oracleProphecy = oracleProphecy;
