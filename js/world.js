/* ===================== CARTE DU MONDE & CITES ===================== */
// Entité unifiée "cité du monde" : relation diplomatique + profil commercial (ce qu'elle
// ACHÈTE = on lui exporte ; ce qu'elle VEND = on lui importe) + (plus tard) volet
// militaire. Générée aléatoirement à chaque nouvelle partie (nom, position, prix).
//   diplomacy.js  -> lit/écrit city.relation (événements)
//   trade.js      -> routes commerciales par cité (tradeRoutes)
//   observer.js   -> écran commerce avec menu déroulant de cité
let worldCities = [];
let selectedWorldCityId = null;

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

function makeCity(id, name, pos){
  const goods = shuffledArray(TRADE_GOODS);
  const buyCount = 2 + Math.floor(Math.random() * 2);  // 2 à 3 biens achetés
  const sellCount = 1 + Math.floor(Math.random() * 2); // 1 à 2 biens vendus
  const buys = goods.slice(0, buyCount).map(r => ({
    resource: r, price: Math.max(1, Math.round(TRADE_BASE_PRICE[r] * (0.9 + Math.random() * 0.45))),
  }));
  const sells = goods.slice(buyCount, buyCount + sellCount).map(r => ({
    resource: r, price: Math.max(1, Math.round(TRADE_BASE_PRICE[r] * (1.15 + Math.random() * 0.45))),
  }));
  return {
    id, name, x: pos.x, y: pos.y,
    relation: clampRelation(DIPLO_RELATION_START + Math.floor((Math.random() * 2 - 1) * 10)),
    buys, sells,
    power: Math.round(WORLD_CITY_BASE_POWER * (0.5 + Math.random() * 1.5)), // ~22 à ~112
    conquered: false,
  };
}

function generateWorldCities(count){
  count = count || WORLD_CITY_COUNT;
  const names = shuffledArray(WORLD_CITY_NAMES).slice(0, count);
  const positions = generateCityPositions(count);
  worldCities = names.map((name, i) => makeCity(i, name, positions[i]));
  selectedWorldCityId = worldCities.length ? worldCities[0].id : null;
}

// Repli au chargement d'une sauvegarde sans cités (antérieure à la carte du monde).
function ensureWorldState(){
  if (!Array.isArray(worldCities) || worldCities.length === 0){ generateWorldCities(); return; }
  worldCities.forEach(c => {
    if (typeof c.relation !== 'number') c.relation = DIPLO_RELATION_START;
    if (!Array.isArray(c.buys)) c.buys = [];
    if (!Array.isArray(c.sells)) c.sells = [];
    if (typeof c.power !== 'number') c.power = Math.round(WORLD_CITY_BASE_POWER * (0.5 + Math.random() * 1.5));
    if (typeof c.conquered !== 'boolean') c.conquered = false;
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

function renderWorldMap(){
  const area = document.getElementById('worldMapArea');
  if (!area) return;
  ensureWorldState();
  area.innerHTML = worldCities.map(c => {
    const st = worldRelationStatus(c.relation);
    const sel = c.id === selectedWorldCityId ? ' selected' : '';
    const pin = c.conquered ? '👑' : '🏛️';
    return `<button class="worldCityDot diplo-${st}${sel}" style="left:${(c.x * 100).toFixed(1)}%;top:${(c.y * 100).toFixed(1)}%" onclick="selectWorldCity(${c.id})">
      <span class="worldCityPin">${pin}</span><span class="worldCityName">${c.name}</span></button>`;
  }).join('');
  renderWorldCityDetail();
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
  const militaryLine = c.conquered
    ? `<p>👑 <b>${t('world.conquered')}</b></p>`
    : `<p><b>⚔️ ${t('world.military')} :</b> ${power} <small>(${tierLabel})</small></p>`;
  const attackBtn = c.conquered
    ? ''
    : `<button class="actionBtn" onclick="attackWorldCity(${c.id})">🔥 ${t('army.attack')}</button>`;
  box.innerHTML = `
    <h3>${c.name} <span class="diploStatus diplo-${st}">${t('diplomacy.status.' + st)} · ${Math.round(c.relation)}/100</span></h3>
    <p><b>${t('world.buys')} :</b> ${goodsListHtml(c.buys)}</p>
    <p><b>${t('world.sells')} :</b> ${goodsListHtml(c.sells)}</p>
    ${militaryLine}
    <button class="actionBtn" onclick="tradeWithCity(${c.id})">🚢 ${t('world.trade')}</button>
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
  if (typeof closePanels === 'function') closePanels();
  renderWorldMap();
  panel.classList.add('open');
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.add('show');
}
