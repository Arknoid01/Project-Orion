/* ===================== COMMERCE EXTERIEUR ===================== */
// Le joueur construit un (ou plusieurs) comptoir(s) de commerce, puis active dans le
// panneau "Commerce extérieur" les marchandises qu'il veut exporter. Une fois par
// mois (déclenché par calendar.js sur changement de mois), chaque comptoir vend
// jusqu'à EXPORT_QTY_PER_POST unités de chaque bien activé, dans la limite du stock,
// et crédite le trésor au prix unitaire défini dans EXPORT_GOODS.
let tradeExports = {}; // { resource: bool }

function initTrade(){
  tradeExports = {};
  EXPORT_GOODS.forEach(g => { tradeExports[g.resource] = false; });
}

// Complète l'état après chargement d'une sauvegarde (ou d'une version antérieure).
function ensureTradeState(){
  if (!tradeExports || typeof tradeExports !== 'object') tradeExports = {};
  EXPORT_GOODS.forEach(g => {
    if (typeof tradeExports[g.resource] !== 'boolean') tradeExports[g.resource] = false;
  });
}

function countTradePosts(){
  let n = 0;
  forEachBuilding((type) => { if (BUILDING_DEFS[type].isTradePost) n++; });
  return n;
}

// Débit mensuel total par bien = capacité d'un comptoir × nombre de comptoirs.
function exportCapacity(){
  return EXPORT_QTY_PER_POST * countTradePosts();
}

function toggleExport(resource){
  ensureTradeState();
  tradeExports[resource] = !tradeExports[resource];
  renderTradePanel();
  saveGame({ silent: true });
}

/* ===================== VENTE MENSUELLE ===================== */
function processForeignTrade(){
  ensureTradeState();
  const capacity = exportCapacity();
  if (capacity <= 0) return; // aucun comptoir construit

  let income = 0;
  EXPORT_GOODS.forEach(g => {
    if (!tradeExports[g.resource]) return;
    const qty = Math.min(capacity, Math.floor(resources[g.resource] || 0));
    if (qty <= 0) return;
    resources[g.resource] -= qty;
    income += qty * g.price;
  });

  if (income > 0){
    treasury += income;
    showNotification(t('trade.income', { gold: income }), 'good');
    debugInfo('Exportations mensuelles', { income });
    updateResourceBar();
    renderTradePanel();
  }
}

/* ===================== PANNEAU ===================== */
function estimatedExportIncome(){
  const capacity = exportCapacity();
  let income = 0;
  EXPORT_GOODS.forEach(g => {
    if (!tradeExports[g.resource]) return;
    const qty = Math.min(capacity, Math.floor(resources[g.resource] || 0));
    income += qty * g.price;
  });
  return income;
}

function renderTradePanel(){
  const el = document.getElementById('tradeList');
  if (!el) return;
  ensureTradeState();
  const posts = countTradePosts();
  const capacity = exportCapacity();

  if (posts === 0){
    el.innerHTML = `<p class="placeholder">${t('trade.noPost')}</p>`;
    return;
  }

  const rows = EXPORT_GOODS.map(g => {
    const on = tradeExports[g.resource];
    const stock = Math.floor(resources[g.resource] || 0);
    return `<button class="tradeRow buildBtn ${on ? 'active' : ''}" onclick="toggleExport('${g.resource}')">
      <span>${on ? '☑' : '☐'} ${t('resource.' + g.resource)}</span>
      <small>${g.price} dr./u · ${t('trade.inStock', { n: stock })}</small>
    </button>`;
  }).join('');

  el.innerHTML = `
    <p class="tradeInfo">${t('trade.capacity', { qty: capacity, posts })}</p>
    ${rows}
    <p class="tradeInfo">${t('trade.nextSale', { gold: estimatedExportIncome() })}</p>`;
}
