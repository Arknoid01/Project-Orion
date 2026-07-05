/* ===================== CARTE DU MONDE & CITES ===================== */
// Entité unifiée "cité du monde" : relation diplomatique + profil commercial (ce qu'elle
// ACHÈTE = on lui exporte ; ce qu'elle VEND = on lui importe) + (plus tard) volet
// militaire. Générée aléatoirement à chaque nouvelle partie (nom, position, prix).
//   diplomacy.js  -> lit/écrit city.relation (événements)
//   trade.js      -> routes commerciales par cité (tradeRoutes)
//   observer.js   -> écran commerce avec menu déroulant de cité
let worldCities = [];
let selectedWorldCityId = null;
let selectedWorldMapTarget = { kind: 'city', id: null }; // 'city' | 'colony' | 'home'

function shuffledArray(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clampRelation(rel){
  return Math.max(DIPLO_RELATION_MIN, Math.min(DIPLO_RELATION_MAX, rel));
}

// Positions étalées sur la carte (fractions 0..1), avec une distance minimale entre cités.
function generateCityPositions(n){
  const pts = [];
  let tries = 0;
  while (pts.length < n && tries < 1000){
    tries++;
    const x = 0.08 + Math.random() * 0.84;
    const y = 0.14 + Math.random() * 0.72;
    if (pts.every(p => Math.hypot(p.x - x, p.y - y) > 0.18)) pts.push({ x, y });
  }
  while (pts.length < n) pts.push({ x: 0.1 + Math.random() * 0.8, y: 0.15 + Math.random() * 0.7 });
  return pts;
}

function pickCityPersonality(){
  const roll = Math.random();
  if (roll < 0.4) return 'aggressive';
  if (roll < 0.75) return 'merchant';
  return 'diplomat';
}

function makeCity(id, name, pos){
  const goods = shuffledArray(TRADE_GOODS);
  const buyCount = 2 + Math.floor(Math.random() * 2);  // 2 à 3 biens achetés
  const sellCount = 1 + Math.floor(Math.random() * 2); // 1 à 2 biens vendus
  const buys = goods.slice(0, buyCount).map(r => ({
    resource: r, price: Math.max(1, Math.round(TRADE_BASE_PRICE[r] * (0.92 + Math.random() * 0.38))),
  }));
  const sells = goods.slice(buyCount, buyCount + sellCount).map(r => ({
    resource: r, price: Math.max(1, Math.round(TRADE_BASE_PRICE[r] * (1.32 + Math.random() * 0.38))),
  }));
  return {
    id, name, x: pos.x, y: pos.y,
    relation: clampRelation(DIPLO_RELATION_START + Math.floor((Math.random() * 2 - 1) * 10)),
    buys, sells,
    power: Math.round(WORLD_CITY_BASE_POWER * (0.5 + Math.random() * 1.5)), // ~22 à ~112
    conquered: false,
    personality: pickCityPersonality(),
    ambition: Math.floor(40 + Math.random() * 55),
    lastRivalActionDay: 0,
    navalPower: Math.round(WORLD_CITY_BASE_POWER * (0.22 + Math.random() * 0.48)),
  };
}

function generateWorldCities(count){
  count = count || WORLD_CITY_COUNT;
  const names = shuffledArray(WORLD_CITY_NAMES).slice(0, count);
  const positions = generateCityPositions(count);
  worldCities = names.map((name, i) => makeCity(i, name, positions[i]));
  selectedWorldCityId = worldCities.length ? worldCities[0].id : null;
}

/** Ajoute des cités voisines sans effacer la diplomatie / le commerce en cours. */
function expandWorldCitiesIfNeeded(count){
  count = count || WORLD_CITY_COUNT;
  ensureWorldState();
  if (worldCities.length >= count) return;
  const usedNames = new Set(worldCities.map(c => c.name));
  const freeNames = WORLD_CITY_NAMES.filter(n => !usedNames.has(n));
  const positions = generateCityPositions(count);
  const startId = worldCities.length;
  for (let i = startId; i < count; i++){
    const name = freeNames.shift() || (WORLD_CITY_NAMES[i % WORLD_CITY_NAMES.length] + ' ' + (i + 1));
    worldCities.push(makeCity(i, name, positions[i] || { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6 }));
    if (typeof ensureDiplomacyState === 'function') ensureDiplomacyState();
    if (typeof ensureTradeState === 'function') ensureTradeState();
  }
  if (selectedWorldCityId == null && worldCities.length) selectedWorldCityId = worldCities[0].id;
}
window.expandWorldCitiesIfNeeded = expandWorldCitiesIfNeeded;

/** Garantit qu'au moins une cité voisine vend les ressources requises par le profil de carte. */
function configureWorldTradeForMapProfile(profile){
  if (!profile || !Array.isArray(profile.requiredImports) || !worldCities.length) return;
  profile.requiredImports.forEach(function(resource){
    const hasSeller = worldCities.some(function(c){
      return !c.conquered && Array.isArray(c.sells) && c.sells.some(function(s){ return s.resource === resource; });
    });
    if (hasSeller) return;
    const target = worldCities.find(function(c){ return !c.conquered; }) || worldCities[0];
    if (!target.sells) target.sells = [];
    const base = (typeof TRADE_BASE_PRICE !== 'undefined' && TRADE_BASE_PRICE[resource]) ? TRADE_BASE_PRICE[resource] : 8;
    target.sells.push({
      resource,
      price: Math.max(1, Math.round(base * (1.35 + Math.random() * 0.25))),
    });
  });
}
window.configureWorldTradeForMapProfile = configureWorldTradeForMapProfile;

// Repli au chargement d'une sauvegarde sans cités (antérieure à la carte du monde).
function ensureWorldState(){
  if (!Array.isArray(worldCities) || worldCities.length === 0){ generateWorldCities(); return; }
  worldCities.forEach(c => {
    if (typeof c.relation !== 'number') c.relation = DIPLO_RELATION_START;
    if (!Array.isArray(c.buys)) c.buys = [];
    if (!Array.isArray(c.sells)) c.sells = [];
    if (typeof c.power !== 'number') c.power = Math.round(WORLD_CITY_BASE_POWER * (0.5 + Math.random() * 1.5));
    if (typeof c.conquered !== 'boolean') c.conquered = false;
    if (!c.personality) c.personality = pickCityPersonality();
    if (typeof c.ambition !== 'number') c.ambition = 50;
    if (typeof c.lastRivalActionDay !== 'number') c.lastRivalActionDay = 0;
    if (typeof c.navalPower !== 'number') c.navalPower = Math.round((c.power || WORLD_CITY_BASE_POWER) * (0.25 + Math.random() * 0.35));
  });
  if (selectedWorldCityId == null) selectedWorldCityId = worldCities[0].id;
}

function cityById(id){
  return worldCities.find(c => c.id === Number(id)) || null;
}

/* ===================== PRIX MODULES PAR LA RELATION ===================== */
function relationFactor(rel){ return (rel - 50) / 50; } // -1 (hostile) .. +1 (allié)
function cityExportPrice(city, basePrice){ return basePrice * (1 + relationFactor(city.relation) * TRADE_RELATION_EXPORT_BONUS); }
function cityImportPrice(city, basePrice){ return basePrice * (1 - relationFactor(city.relation) * TRADE_RELATION_IMPORT_DISCOUNT); }

/* ===================== ECRAN CARTE DU MONDE ===================== */
function worldRelationStatus(rel){
  return (typeof relationStatusKey === 'function') ? relationStatusKey(rel) : 'neutral';
}

function applyWorldMapBackground(area){
  const url = (typeof WORLD_MAP_BG === 'string' && WORLD_MAP_BG) ? WORLD_MAP_BG : '';
  if (url){
    area.style.backgroundImage = `url('${url}')`;
    area.style.backgroundSize = 'cover';
    area.style.backgroundPosition = 'center';
    area.classList.add('has-map-texture');
  } else {
    area.style.backgroundImage = '';
    area.classList.remove('has-map-texture');
  }
}

function colonyVisibleOnMap(def){
  if (!def) return false;
  const completed = typeof completedColonies !== 'undefined' && completedColonies.includes(def.id);
  const active = typeof gamePhase !== 'undefined' && gamePhase === 'colony'
    && typeof activeColonyId !== 'undefined' && activeColonyId === def.id;
  return completed || active;
}

function colonyMapStatus(def){
  if (!def) return 'locked';
  if (typeof completedColonies !== 'undefined' && completedColonies.includes(def.id)) return 'completed';
  if (typeof gamePhase !== 'undefined' && gamePhase === 'colony' && activeColonyId === def.id) return 'active';
  return 'locked';
}

/** Décale les étiquettes pour limiter les chevauchements (pins inchangés). */
const WORLD_MAP_LABEL_DIRS = [
  { ox: 0, oy: 0.058 },
  { ox: 0, oy: -0.082 },
  { ox: 0.10, oy: 0.018 },
  { ox: -0.10, oy: 0.018 },
  { ox: 0.075, oy: -0.055 },
  { ox: -0.075, oy: -0.055 },
  { ox: 0.055, oy: 0.072 },
  { ox: -0.055, oy: 0.072 },
];

function assignWorldMapLabelOffsets(markers){
  if (!markers.length) return markers;
  markers.forEach((m, i) => {
    const dir = WORLD_MAP_LABEL_DIRS[i % WORLD_MAP_LABEL_DIRS.length];
    m.labelOx = dir.ox;
    m.labelOy = dir.oy;
  });
  for (let i = 0; i < markers.length; i++){
    for (let j = i + 1; j < markers.length; j++){
      const pinDist = Math.hypot(markers[i].x - markers[j].x, markers[i].y - markers[j].y);
      if (pinDist >= 0.16) continue;
      const same = Math.abs(markers[i].labelOx - markers[j].labelOx) < 0.02
        && Math.abs(markers[i].labelOy - markers[j].labelOy) < 0.02;
      if (!same) continue;
      const alt = WORLD_MAP_LABEL_DIRS[(j + 2 + i) % WORLD_MAP_LABEL_DIRS.length];
      markers[j].labelOx = alt.ox;
      markers[j].labelOy = alt.oy;
    }
  }
  const minSep = 0.105;
  for (let pass = 0; pass < 10; pass++){
    let moved = false;
    for (let i = 0; i < markers.length; i++){
      for (let j = i + 1; j < markers.length; j++){
        const lx1 = markers[i].x + markers[i].labelOx;
        const ly1 = markers[i].y + markers[i].labelOy;
        const lx2 = markers[j].x + markers[j].labelOx;
        const ly2 = markers[j].y + markers[j].labelOy;
        const d = Math.hypot(lx1 - lx2, ly1 - ly2);
        if (d >= minSep || d < 0.0001) continue;
        const push = (minSep - d) / 2;
        const nx = (lx1 - lx2) / d;
        const ny = (ly1 - ly2) / d;
        markers[i].labelOx += nx * push;
        markers[i].labelOy += ny * push;
        markers[j].labelOx -= nx * push;
        markers[j].labelOy -= ny * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return markers;
}

function worldMapLabelStyle(m){
  const ox = ((m.labelOx || 0) * 100).toFixed(1);
  const oy = ((m.labelOy || 0.058) * 100).toFixed(1);
  return `--label-x:${ox}%;--label-y:${oy}%;`;
}

function worldMapMarkerHtml(m){
  const sel = m.selected ? ' selected' : '';
  const style = `left:${(m.x * 100).toFixed(1)}%;top:${(m.y * 100).toFixed(1)}%;${worldMapLabelStyle(m)}`;
  return `<button type="button" class="worldMapMarker ${m.cls}${sel}" style="${style}" onclick="${m.onclick}">
    <span class="worldCityPin">${m.pin}</span><span class="worldCityName">${m.label}</span></button>`;
}

function collectWorldMapMarkers(){
  const markers = [];
  const home = (typeof WORLD_MAP_HOME === 'object' && WORLD_MAP_HOME) ? WORLD_MAP_HOME : null;
  if (home && !(typeof isColonyPhase === 'function' && isColonyPhase())){
    markers.push({
      x: home.x, y: home.y,
      pin: '🏛️',
      label: (typeof getPlayerCityName === 'function') ? getPlayerCityName() : 'Olympos',
      cls: 'worldHomeDot',
      selected: selectedWorldMapTarget.kind === 'home',
      onclick: 'selectWorldHome()',
    });
  }
  if (Array.isArray(COLONY_DEFINITIONS)){
    COLONY_DEFINITIONS.forEach(def => {
      if (!colonyVisibleOnMap(def)) return;
      const status = colonyMapStatus(def);
      const pin = status === 'completed' ? '✅' : (status === 'active' ? '🚩' : def.icon);
      markers.push({
        x: typeof def.mapX === 'number' ? def.mapX : 0.5,
        y: typeof def.mapY === 'number' ? def.mapY : 0.5,
        pin,
        label: t(def.nameKey),
        cls: `worldColonyDot colony-${status}`,
        selected: selectedWorldMapTarget.kind === 'colony' && selectedWorldMapTarget.id === def.id,
        onclick: `selectWorldColony('${def.id}')`,
      });
    });
  }
  worldCities.forEach(c => {
    const st = worldRelationStatus(c.relation);
    markers.push({
      x: c.x, y: c.y,
      pin: c.conquered ? '👑' : '🏛️',
      label: c.name,
      cls: `worldCityDot diplo-${st}`,
      selected: selectedWorldMapTarget.kind === 'city' && selectedWorldMapTarget.id === c.id,
      onclick: `selectWorldCity(${c.id})`,
    });
  });
  return assignWorldMapLabelOffsets(markers);
}

function renderWorldMap(){
  const area = document.getElementById('worldMapArea');
  if (!area) return;
  ensureWorldState();
  applyWorldMapBackground(area);
  if (selectedWorldMapTarget.kind === 'colony'
      && !colonyVisibleOnMap(COLONY_DEFINITIONS && COLONY_DEFINITIONS.find(c => c.id === selectedWorldMapTarget.id))){
    selectedWorldMapTarget = selectedWorldCityId != null
      ? { kind: 'city', id: selectedWorldCityId }
      : { kind: 'home', id: null };
  }
  area.innerHTML = collectWorldMapMarkers().map(worldMapMarkerHtml).join('');
  renderWorldMapDetail();
}

function renderWorldMapDetail(){
  if (selectedWorldMapTarget.kind === 'colony') renderWorldColonyDetail();
  else if (selectedWorldMapTarget.kind === 'home') renderWorldHomeDetail();
  else renderWorldCityDetail();
}

function renderWorldHomeDetail(){
  const box = document.getElementById('worldCityDetail');
  if (!box) return;
  box.innerHTML = `<h3>🏛️ ${getPlayerCityName()}</h3><p>${t('world.homeCityDesc')}</p>`;
}

function renderWorldColonyDetail(){
  const box = document.getElementById('worldCityDetail');
  if (!box || !Array.isArray(COLONY_DEFINITIONS)) return;
  const def = COLONY_DEFINITIONS.find(c => c.id === selectedWorldMapTarget.id);
  if (!def){ box.innerHTML = ''; return; }
  const status = colonyMapStatus(def);
  const statusLabel = t('world.colonyStatus.' + status);
  const launchBtn = (typeof canLaunchColony === 'function' && canLaunchColony(def.id))
    ? `<button class="actionBtn" onclick="confirmLaunchColony('${def.id}')">🏝️ ${t('colony.launchConfirm')}</button>`
    : '';
  const panelBtn = `<button class="actionBtn" onclick="openColoniesPanel()">📋 ${t('panel.colonies')}</button>`;
  box.innerHTML = `
    <h3>${def.icon} ${t(def.nameKey)} <span class="diploStatus">${statusLabel}</span></h3>
    <p>${t(def.descKey)}</p>
    <p><b>${t('colony.launchCost', { cost: typeof COLONY_LAUNCH_COST === 'number' ? COLONY_LAUNCH_COST : 250 })}</b></p>
    ${launchBtn}
    ${panelBtn}`;
}

function goodsListHtml(list){
  return list.length ? list.map(g => `${resLabel(g.resource)} <small>(${g.price})</small>`).join(' · ') : '—';
}

function renderWorldCityDetail(){
  const box = document.getElementById('worldCityDetail');
  if (!box) return;
  const c = cityById(selectedWorldCityId);
  if (!c){ box.innerHTML = ''; return; }
  const st = worldRelationStatus(c.relation);
  const power = (typeof cityPower === 'function') ? cityPower(c) : (c.power || 0);
  const tierKey = (typeof cityPowerTier === 'function') ? cityPowerTier(power) : 'medium';
  const tierLabel = t('army.tier.' + tierKey);
  const persKey = c.personality ? ('rival.personality.' + c.personality) : null;
  const persLine = persKey ? `<p><b>🎭 ${t('rival.personalityLabel')} :</b> ${t(persKey)}</p>` : '';
  const navalPower = (typeof cityNavalPower === 'function') ? cityNavalPower(c) : 0;
  const navalLine = c.conquered
    ? ''
    : `<p><b>⚓ ${t('navy.enemyFleet')} :</b> ${navalPower}</p>`;
  const militaryLine = c.conquered
    ? `<p>👑 <b>${t('world.conquered')}</b></p>`
    : `<p><b>⚔️ ${t('world.military')} :</b> ${power} <small>(${tierLabel})</small></p>`;
  const attackBtn = c.conquered
    ? ''
    : `<button class="actionBtn" onclick="attackWorldCity(${c.id})">🔥 ${t('army.attack')}</button>`;
  const navalBtn = (c.conquered || typeof canLaunchNavalRaid !== 'function' || !canLaunchNavalRaid())
    ? ''
    : `<button class="actionBtn" onclick="launchNavalRaidOnCity(${c.id})">⚓ ${t('navy.raid')}</button>`;
  box.innerHTML = `
    <h3>${c.name} <span class="diploStatus diplo-${st}">${t('diplomacy.status.' + st)} · ${Math.round(c.relation)}/100</span></h3>
    <p><b>${t('world.buys')} :</b> ${goodsListHtml(c.buys)}</p>
    <p><b>${t('world.sells')} :</b> ${goodsListHtml(c.sells)}</p>
    ${persLine}
    ${militaryLine}
    ${navalLine}
    <button class="actionBtn" onclick="tradeWithCity(${c.id})">🚢 ${t('world.trade')}</button>
    ${navalBtn}
    ${attackBtn}`;
}

// Attaque directe depuis la carte du monde (confirme puis résout via military.js).
function attackWorldCity(id){
  const c = cityById(id);
  if (!c || typeof resolveAttack !== 'function') return;
  if (countBarracks() === 0){ showNotification(t('army.noBarracks'), 'bad'); return; }
  const points = (typeof getMilitaryPoints === 'function') ? getMilitaryPoints() : 0;
  showConfirm(
    `🔥 ${t('army.attackTitle')}`,
    t('army.confirmAttack', { city: c.name, mine: points, enemy: cityPower(c) }),
    () => resolveAttack(c)
  );
}

function selectWorldCity(id){
  selectedWorldCityId = Number(id);
  selectedWorldMapTarget = { kind: 'city', id: Number(id) };
  renderWorldMap();
}

function selectWorldColony(id){
  selectedWorldMapTarget = { kind: 'colony', id: String(id) };
  renderWorldMap();
}

function selectWorldHome(){
  selectedWorldMapTarget = { kind: 'home', id: null };
  renderWorldMap();
}

// Depuis la carte : "Commercer" sélectionne la cité dans l'écran commerce et l'ouvre.
function tradeWithCity(id){
  selectedTradeCityId = Number(id);
  if (typeof openTradePanel === 'function') openTradePanel();
}

function openWorldMap(){
  const panel = document.getElementById('worldMapPanel');
  if (!panel) return;
  ensureWorldState();
  if (selectedWorldMapTarget.kind === 'city' && selectedWorldCityId != null){
    selectedWorldMapTarget = { kind: 'city', id: selectedWorldCityId };
  } else if (selectedWorldMapTarget.kind === 'city' && worldCities.length){
    selectedWorldCityId = worldCities[0].id;
    selectedWorldMapTarget = { kind: 'city', id: worldCities[0].id };
  }
  if (typeof closePanels === 'function') closePanels();
  renderWorldMap();
  panel.classList.add('open');
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.add('show');
}

window.renderWorldMap = renderWorldMap;
