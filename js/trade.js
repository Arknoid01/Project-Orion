/* ===================== COMMERCE EXTERIEUR (par cité) ===================== */
// Le joueur construit des comptoirs, puis ouvre des routes commerciales avec les cités
// de la carte du monde (world.js) : pour CHAQUE cité, il choisit quels biens lui exporter
// (parmi ceux qu'elle achète) et quels biens lui importer (parmi ceux qu'elle vend).
// Une fois par mois (calendar.js), pour chaque route active :
//   - export : vend jusqu'à EXPORT_QTY_PER_POST × nb comptoirs unités, limité par le stock,
//     au prix d'achat de la cité modulé par la relation -> crédite le trésor
//   - import : achète jusqu'à IMPORT_QTY_PER_POST × nb comptoirs unités, limité par la place
//     de stockage ET le trésor, au prix de vente de la cité modulé par la relation
// L'export est traité en premier (ses recettes financent les imports du même mois).
let tradeRoutes = {};        // { [cityId]: { export:{res:true}, import:{res:true} } }
let selectedTradeCityId = null; // cité affichée dans l'écran commerce

function initTrade(){
  tradeRoutes = {};
  selectedTradeCityId = (typeof worldCities !== 'undefined' && worldCities.length) ? worldCities[0].id : null;
}

function ensureTradeState(){
  if (!tradeRoutes || typeof tradeRoutes !== 'object') tradeRoutes = {};
  if (selectedTradeCityId == null && typeof worldCities !== 'undefined' && worldCities.length){
    selectedTradeCityId = worldCities[0].id;
  }
}

function routeFor(cityId){
  if (!tradeRoutes[cityId]) tradeRoutes[cityId] = { export: {}, import: {} };
  if (!tradeRoutes[cityId].export) tradeRoutes[cityId].export = {};
  if (!tradeRoutes[cityId].import) tradeRoutes[cityId].import = {};
  return tradeRoutes[cityId];
}

function countTradePosts(){
  let n = 0;
  forEachBuilding((type) => { if (BUILDING_DEFS[type].isTradePost) n++; });
  return n;
}

function tradeIncomeMultiplier(){
  let m = (typeof godTradeMultiplier === 'function') ? godTradeMultiplier() : 1;
  if (typeof artifactBonus === 'function') m *= (1 + artifactBonus('trade'));
  return m;
}
function exportCapacity(){ return EXPORT_QTY_PER_POST * countTradePosts(); }
function importCapacity(){ return IMPORT_QTY_PER_POST * countTradePosts(); }

function toggleCityExport(cityId, resource){
  ensureTradeState();
  const r = routeFor(cityId);
  r.export[resource] = !r.export[resource];
  if (typeof refreshTradeScreen === 'function') refreshTradeScreen();
  saveGame({ silent: true });
}

function toggleCityImport(cityId, resource){
  ensureTradeState();
  const r = routeFor(cityId);
  r.import[resource] = !r.import[resource];
  if (typeof refreshTradeScreen === 'function') refreshTradeScreen();
  saveGame({ silent: true });
}

/* ===================== ECHANGES MENSUELS ===================== */
function processForeignTrade(){
  ensureTradeState();
  const expCap = exportCapacity();
  const impCap = importCapacity();
  if (expCap <= 0 && impCap <= 0) return; // aucun comptoir
  if (!worldCities || worldCities.length === 0) return;

  let income = 0;
  worldCities.forEach(city => {
    const route = tradeRoutes[city.id];
    if (!route || !route.export) return;
    city.buys.forEach(b => {
      if (!route.export[b.resource]) return;
      const qty = Math.min(expCap, Math.floor(resources[b.resource] || 0));
      if (qty <= 0) return;
      resources[b.resource] -= qty;
      income += Math.round(qty * cityExportPrice(city, b.price) * tradeIncomeMultiplier());
    });
  });
  if (income > 0) treasury += income;

  let expense = 0;
  const caps = computeCaps();
  worldCities.forEach(city => {
    const route = tradeRoutes[city.id];
    if (!route || !route.import) return;
    city.sells.forEach(s => {
      if (!route.import[s.resource]) return;
      const unit = cityImportPrice(city, s.price);
      const room = Math.max(0, (caps[s.resource] || 0) - (resources[s.resource] || 0));
      const affordable = Math.floor(treasury / unit);
      const qty = Math.min(impCap, room, affordable);
      if (qty <= 0) return;
      resources[s.resource] = (resources[s.resource] || 0) + qty;
      const cost = Math.round(qty * unit);
      treasury -= cost;
      expense += cost;
    });
  });

  if (income > 0 || expense > 0){
    if (income > 0) showNotification(t('trade.income', { gold: income }), 'good');
    if (expense > 0) showNotification(t('trade.expense', { gold: expense }), 'good');
    debugInfo('Commerce extérieur mensuel', { income, expense });
    updateResourceBar();
    if (typeof refreshTradeScreen === 'function') refreshTradeScreen();
  }
}

// Estimation (cité sélectionnée) pour l'affichage de l'écran commerce.
function estimatedCityIncome(city){
  const cap = exportCapacity();
  const route = tradeRoutes[city.id];
  if (!route) return 0;
  let income = 0;
  city.buys.forEach(b => {
    if (!route.export || !route.export[b.resource]) return;
    const qty = Math.min(cap, Math.floor(resources[b.resource] || 0));
    income += Math.round(qty * cityExportPrice(city, b.price) * tradeIncomeMultiplier());
  });
  return income;
}

// Ancien panneau latéral : absent de la nouvelle interface -> stub défensif.
function renderTradePanel(){
  const el = document.getElementById('tradeList');
  if (!el) return;
}
