/* ===================== SATISFACTION PAR DIEU ===================== */
// Chaque dieu a sa propre humeur (0–100). Au début de partie, 1–2 dieux hostiles
// et 2 bienveillants sont tirés au sort. Les hostiles déclenchent colères variées ;
// les amis accordent des bonus passifs. La faveur globale (favor) est la moyenne.

let godSatisfaction = {};
let hostileGods = [];
let friendlyGods = [];
let neutralGods = [];
let godEventCooldown = {}; // godKey → tickCount restant

function shuffleKeys(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randRange(min, max){
  return min + Math.random() * (max - min);
}

function initGodDispositionsLegacy(legacyFavor){
  hostileGods = [];
  friendlyGods = [];
  neutralGods = GODS.map(g => g.key);
  godSatisfaction = {};
  godEventCooldown = {};
  for (const g of GODS){
    godSatisfaction[g.key] = legacyFavor;
    godEventCooldown[g.key] = 0;
  }
  syncGlobalFavor();
}

function initGodDispositions(announce){
  const keys = GODS.map(g => g.key);
  const shuffled = shuffleKeys(keys);
  const hostileCount = Math.random() < 0.45 ? 1 : 2;

  hostileGods = shuffled.slice(0, hostileCount);
  friendlyGods = shuffled.slice(hostileCount, hostileCount + 2);
  neutralGods = shuffled.slice(hostileCount + 2);

  godSatisfaction = {};
  godEventCooldown = {};
  for (const key of keys){
    if (hostileGods.includes(key)){
      godSatisfaction[key] = randRange(GOD_SAT_HOSTILE_START[0], GOD_SAT_HOSTILE_START[1]);
    } else if (friendlyGods.includes(key)){
      godSatisfaction[key] = randRange(GOD_SAT_FRIENDLY_START[0], GOD_SAT_FRIENDLY_START[1]);
    } else {
      godSatisfaction[key] = randRange(44, 56);
    }
    godEventCooldown[key] = 0;
  }

  syncGlobalFavor();
  debugInfo('Disposition des dieux', { hostile: hostileGods, friendly: friendlyGods });

  if (announce !== false && typeof showChoice === 'function'){
    setTimeout(() => announceGodDispositions(), 500);
  }
}

function restoreGodDispositions(payload){
  godSatisfaction = payload.godSatisfaction || {};
  hostileGods = Array.isArray(payload.hostileGods) ? payload.hostileGods : [];
  friendlyGods = Array.isArray(payload.friendlyGods) ? payload.friendlyGods : [];
  neutralGods = Array.isArray(payload.neutralGods) ? payload.neutralGods : [];
  godEventCooldown = payload.godEventCooldown || {};
  for (const g of GODS){
    if (typeof godSatisfaction[g.key] !== 'number') godSatisfaction[g.key] = 50;
    if (typeof godEventCooldown[g.key] !== 'number') godEventCooldown[g.key] = 0;
  }
  syncGlobalFavor();
}

function serializeGodDispositions(){
  return {
    godSatisfaction,
    hostileGods,
    friendlyGods,
    neutralGods,
    godEventCooldown,
  };
}

function godDisposition(key){
  if (hostileGods.includes(key)) return 'hostile';
  if (friendlyGods.includes(key)) return 'friendly';
  return 'neutral';
}

function adjustGodSatisfaction(key, delta){
  if (typeof godSatisfaction[key] !== 'number') godSatisfaction[key] = 50;
  godSatisfaction[key] = Math.max(0, Math.min(GOD_SAT_MAX, godSatisfaction[key] + delta));
}

function getGodSatisfactionValue(godKey){
  return typeof godSatisfaction[godKey] === 'number' ? Math.round(godSatisfaction[godKey]) : 0;
}

function syncGlobalFavor(){
  const vals = GODS.map(g => godSatisfaction[g.key]).filter(v => typeof v === 'number');
  favor = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 50;
}

function countBuildings(type){
  let n = 0;
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      if (grid[row][col].building === type) n++;
    }
  }
  return n;
}

function isGodRequirementMet(godKey){
  const req = GOD_REQUIREMENTS[godKey];
  if (!req) return true;
  if (req.type === 'resource') return (resources[req.key] || 0) >= req.min;
  if (req.type === 'building') return countBuildings(req.key) >= req.min;
  return true;
}

function tickGodSatisfaction(){
  for (const g of GODS){
    const key = g.key;
    let delta = -GOD_SAT_DECAY;

    if (!isGodRequirementMet(key)) delta -= GOD_SAT_REQ_PENALTY;
    if (typeof hasGodTemple === 'function' && hasGodTemple(key)) delta += GOD_SAT_TEMPLE_GAIN;
    if (friendlyGods.includes(key) && godSatisfaction[key] >= GOD_SAT_BLESSING_THRESHOLD - 5){
      delta += GOD_SAT_FRIENDLY_DRIFT;
    }
    if (typeof artifactBonus === 'function') delta += artifactBonus('favor') * 0.002;

    adjustGodSatisfaction(key, delta);

    if (godEventCooldown[key] > 0) godEventCooldown[key]--;
  }

  if (typeof hasGodBenefit === 'function' && hasGodBenefit('favorShield')){
    godSatisfaction.zeus = Math.max(godSatisfaction.zeus || 0, GOD_FAVOR_FLOOR);
  }

  syncGlobalFavor();
  tickGodEvents();
  if (typeof renderGodSatisfactionPanel === 'function') renderGodSatisfactionPanel();
}

function tickGodEvents(){
  for (const g of GODS){
    const key = g.key;
    const sat = godSatisfaction[key] || 0;
    if (godEventCooldown[key] > 0) continue;

    const canWrath = sat <= GOD_SAT_WRATH_THRESHOLD &&
      (hostileGods.includes(key) || sat <= GOD_SAT_WRATH_THRESHOLD - 8);
    const canBless = friendlyGods.includes(key) && sat >= GOD_SAT_BLESSING_THRESHOLD;

    if (canWrath && Math.random() < GOD_SAT_WRATH_CHANCE){
      triggerGodWrath(key);
      godEventCooldown[key] = GOD_SAT_EVENT_COOLDOWN;
    } else if (canBless && Math.random() < GOD_SAT_BLESSING_CHANCE){
      triggerGodBlessing(key);
      godEventCooldown[key] = GOD_SAT_EVENT_COOLDOWN;
    }
  }
}

function triggerGodWrath(godKey){
  const wrath = GOD_WRATH_TYPE[godKey];
  const god = godByKey(godKey);
  const name = t('god.' + godKey);
  debugWarn('Colère divine', { god: godKey, wrath, satisfaction: godSatisfaction[godKey] });

  switch (wrath){
    case 'earthquake':
      triggerGodEarthquake(godKey);
      break;
    case 'monster':
      if (typeof spawnMonster === 'function' && spawnMonster({ godKey })){
        // Notification gérée dans spawnMonster.
      } else if (monster){
        showNotification(t('god.wrath.monsterAlready', {
          icon: god?.icon || '👹',
          god: name,
          monster: t('monster.name.' + monster.typeKey),
        }), 'bad');
      }
      break;
    case 'storm':
      triggerGodStorm(godKey);
      break;
    case 'plague':
      triggerGodPlague(godKey);
      break;
    case 'blight':
      if (resources.wheat > 0){
        const lost = Math.ceil(resources.wheat * 0.35);
        resources.wheat = Math.max(0, resources.wheat - lost);
        showNotification(t('god.wrath.blight', { icon: god?.icon || '🌾', god: name, lost }), 'bad');
      } else {
        showNotification(t('god.wrath.blightEmpty', { icon: god?.icon || '🌾', god: name }), 'bad');
      }
      break;
    case 'curse':
      if (resources.wine > 0) resources.wine = Math.max(0, resources.wine - 12);
      if (typeof productionMultiplier !== 'undefined'){
        productionMultiplier = PRODUCTION_PENALTY_MULTIPLIER;
        productionEffectTicksLeft = PRODUCTION_EFFECT_DURATION_TICKS;
      }
      showNotification(t('god.wrath.curse', { icon: god?.icon || '🍷', god: name }), 'bad');
      break;
    default:
      showNotification(t('god.wrath.generic', { icon: god?.icon || '⚡', god: name }), 'bad');
  }
  adjustGodSatisfaction(godKey, -5);
  syncGlobalFavor();
}

function triggerGodBlessing(godKey){
  const kind = GOD_BLESSING_TYPE[godKey];
  const god = godByKey(godKey);
  const name = t('god.' + godKey);
  debugInfo('Bénédiction divine', { god: godKey, kind });

  switch (kind){
    case 'wheat':
      resources.wheat = (resources.wheat || 0) + 45;
      showNotification(t('god.blessing.wheat', { icon: god?.icon || '🌾', god: name }), 'good');
      break;
    case 'favor':
      adjustGodSatisfaction(godKey, 12);
      showNotification(t('god.blessing.favor', { icon: god?.icon || '⚡', god: name }), 'good');
      break;
    case 'treasury':
      treasury += 180;
      showNotification(t('god.blessing.treasury', { icon: god?.icon || '🦉', god: name }), 'good');
      break;
    case 'health':
      for (const g of GODS) adjustGodSatisfaction(g.key, 3);
      showNotification(t('god.blessing.health', { icon: god?.icon || '☀️', god: name }), 'good');
      break;
    case 'trade':
      treasury += 140;
      showNotification(t('god.blessing.trade', { icon: god?.icon || '🔱', god: name }), 'good');
      break;
    case 'wine':
      resources.wine = (resources.wine || 0) + 18;
      showNotification(t('god.blessing.wine', { icon: god?.icon || '🍷', god: name }), 'good');
      break;
    default:
      showNotification(t('god.blessing.generic', { icon: god?.icon || '✨', god: name }), 'good');
  }
  syncGlobalFavor();
}

function triggerGodEarthquake(godKey){
  const god = godByKey(godKey);
  const candidates = [];
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const cell = grid[row][col];
      if (!cell.building) continue;
      if (cell.monumentPart) continue;
      if (typeof isMonumentAnchor === 'function' && isMonumentAnchor(col, row)) continue;
      candidates.push({ col, row, building: cell.building });
    }
  }
  if (!candidates.length){
    showNotification(t('god.wrath.earthquakeSafe', { icon: god?.icon || '⚡', god: t('god.' + godKey) }), 'bad');
    return;
  }
  const hits = Math.min(2, candidates.length);
  const razed = [];
  for (let i = 0; i < hits; i++){
    const idx = Math.floor(Math.random() * candidates.length);
    const { col, row, building } = candidates.splice(idx, 1)[0];
    if (building === 'maison' && typeof triggerDisaster === 'function'){
      triggerDisaster(col, row, 'fire');
    } else {
      grid[row][col].building = null;
      grid[row][col].houseLevel = 0;
      grid[row][col].population = 0;
      razed.push({ col, row });
    }
  }
  // Nettoyage rendu Three (dalle) + Pixi (sprite) pour ne pas laisser de tuile fantôme.
  if (razed.length){
    if (typeof syncThreeBuildingPads === 'function') syncThreeBuildingPads(razed);
    if (typeof patchThreeDecors === 'function') patchThreeDecors(razed);
    if (typeof invalidatePixiBuildings === 'function') invalidatePixiBuildings();
  }
  if (typeof recomputeAllWalkers === 'function') recomputeAllWalkers();
  showNotification(t('god.wrath.earthquake', { icon: god?.icon || '⚡', god: t('god.' + godKey) }), 'bad');
}

function triggerGodStorm(godKey){
  const god = godByKey(godKey);
  let hit = 0;
  for (let i = 0; i < 3; i++){
    const col = Math.floor(Math.random() * GRID_COLS);
    const row = Math.floor(Math.random() * GRID_ROWS);
    const cell = grid[row][col];
    if (cell.building === 'maison' && typeof triggerDisaster === 'function'){
      triggerDisaster(col, row, Math.random() < 0.5 ? 'fire' : 'disease');
      hit++;
    }
  }
  if (!hit) showNotification(t('god.wrath.stormMiss', { icon: god?.icon || '🔱', god: t('god.' + godKey) }), 'bad');
  else showNotification(t('god.wrath.storm', { icon: god?.icon || '🔱', god: t('god.' + godKey) }), 'bad');
}

function triggerGodPlague(godKey){
  const god = godByKey(godKey);
  for (let tries = 0; tries < 40; tries++){
    const col = Math.floor(Math.random() * GRID_COLS);
    const row = Math.floor(Math.random() * GRID_ROWS);
    if (grid[row][col].building === 'maison' && typeof triggerDisaster === 'function'){
      triggerDisaster(col, row, 'disease');
      showNotification(t('god.wrath.plague', { icon: god?.icon || '☀️', god: t('god.' + godKey) }), 'bad');
      return;
    }
  }
  showNotification(t('god.wrath.plagueMiss', { icon: god?.icon || '☀️', god: t('god.' + godKey) }), 'bad');
}

function applyOfferingToGods(){
  for (const g of GODS) adjustGodSatisfaction(g.key, GOD_SAT_OFFERING_SHARE);
  syncGlobalFavor();
}

function applyFestivalToGods(){
  for (const g of GODS) adjustGodSatisfaction(g.key, GOD_SAT_FESTIVAL_SHARE);
  syncGlobalFavor();
}

function onGodMonumentBuilt(godKey){
  adjustGodSatisfaction(godKey, GOD_SAT_MONUMENT_GAIN);
  syncGlobalFavor();
  if (typeof checkObjectives === 'function') checkObjectives();
}

function onGodMonumentDemolished(godKey){
  if (!godKey) return;
  adjustGodSatisfaction(godKey, -GOD_SAT_MONUMENT_LOSS);
  syncGlobalFavor();
}

function announceGodDispositions(){
  const fmt = keys => keys.map(k => {
    const g = godByKey(k);
    return `${g ? g.icon : '🏛️'} ${t('god.' + k)}`;
  }).join('\n');

  showChoice({
    title: t('god.dispositionTitle'),
    body: t('god.dispositionBody', {
      hostile: fmt(hostileGods),
      friendly: fmt(friendlyGods),
    }),
    dismissible: true,
    choices: [{ label: t('dialog.yes'), type: 'primary' }],
  });
}

function getGodSatisfactionRows(){
  return GODS.map(g => ({
    key: g.key,
    icon: g.icon,
    name: t('god.' + g.key),
    value: Math.round(godSatisfaction[g.key] || 0),
    disposition: godDisposition(g.key),
    reqMet: isGodRequirementMet(g.key),
    reqLabel: GOD_REQUIREMENTS[g.key] ? t(GOD_REQUIREMENTS[g.key].labelKey) : '',
    hasTemple: typeof hasGodTemple === 'function' && hasGodTemple(g.key),
  }));
}

function renderGodSatisfactionPanel(){
  const el = document.getElementById('godSatisfactionList');
  if (!el) return;

  el.innerHTML = getGodSatisfactionRows().map(row => {
    const dispIcon = row.disposition === 'hostile' ? '😠' :
      row.disposition === 'friendly' ? '😊' : '😐';
    const reqHint = row.reqMet ? '' : ` · ${row.reqLabel}`;
    const templeHint = row.hasTemple ? ` · ${t('god.hasTemple')}` : '';
    const warnClass = row.value <= GOD_SAT_WRATH_THRESHOLD ? ' eco-warn' :
      row.disposition === 'friendly' && row.value >= GOD_SAT_BLESSING_THRESHOLD ? ' eco-good' : '';
    return `<div class="row${warnClass}"><span>${row.icon} ${row.name} ${dispIcon}${reqHint}${templeHint}</span><b>${row.value}%</b></div>`;
  }).join('');
}
