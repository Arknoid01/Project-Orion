/* ===================== COMMERCE EXTERIEUR ===================== */
// Le joueur construit un (ou plusieurs) comptoir(s) de commerce, puis active dans le
// panneau "Commerce extérieur" les marchandises qu'il veut exporter OU importer (un
// bien ne peut pas être les deux à la fois sur le même comptoir -- activer l'un
// désactive l'autre, voir toggleExport/toggleImport). Une fois par mois (déclenché par
// calendar.js sur changement de mois) :
//   - export : vend jusqu'à EXPORT_QTY_PER_POST unités de chaque bien activé, dans la
//     limite du stock disponible, crédite le trésor
//   - import : achète jusqu'à IMPORT_QTY_PER_POST unités de chaque bien activé, dans la
//     limite de la place de stockage ET du trésor disponible, débite le trésor
// L'export est traité EN PREMIER : les recettes du mois peuvent donc financer les
// achats du même mois.
let tradeExports = {}; // { resource: bool }
let tradeImports = {}; // { resource: bool }

function initTrade(){
  tradeExports = {};
  tradeImports = {};
  EXPORT_GOODS.forEach(g => { tradeExports[g.resource] = false; });
  IMPORT_GOODS.forEach(g => { tradeImports[g.resource] = false; });
}

// Complète l'état après chargement d'une sauvegarde (ou d'une version antérieure).
function ensureTradeState(){
  if (!tradeExports || typeof tradeExports !== 'object') tradeExports = {};
  if (!tradeImports || typeof tradeImports !== 'object') tradeImports = {};
  EXPORT_GOODS.forEach(g => {
    if (typeof tradeExports[g.resource] !== 'boolean') tradeExports[g.resource] = false;
  });
  IMPORT_GOODS.forEach(g => {
    if (typeof tradeImports[g.resource] !== 'boolean') tradeImports[g.resource] = false;
  });
}

function countTradePosts(){
  let n = 0;
  forEachBuilding((type) => { if (BUILDING_DEFS[type].isTradePost) n++; });
  return n;
}

// Débit/crédit mensuel total par bien = capacité d'un comptoir × nombre de comptoirs.
function exportCapacity(){
  return EXPORT_QTY_PER_POST * countTradePosts();
}
function importCapacity(){
  return IMPORT_QTY_PER_POST * countTradePosts();
}

function toggleExport(resource){
  ensureTradeState();
  tradeExports[resource] = !tradeExports[resource];
  if (tradeExports[resource]) tradeImports[resource] = false; // exclusif : pas les deux à la fois
  renderTradePanel();
  saveGame({ silent: true });
}

function toggleImport(resource){
  ensureTradeState();
  tradeImports[resource] = !tradeImports[resource];
  if (tradeImports[resource]) tradeExports[resource] = false;
  renderTradePanel();
  saveGame({ silent: true });
}

/* ===================== ECHANGES MENSUELS ===================== */
function processForeignTrade(){
  ensureTradeState();
  const expCap = exportCapacity();
  const impCap = importCapacity();
  if (expCap <= 0 && impCap <= 0) return; // aucun comptoir construit

  let income = 0;
  if (expCap > 0){
    EXPORT_GOODS.forEach(g => {
      if (!tradeExports[g.resource]) return;
      const qty = Math.min(expCap, Math.floor(resources[g.resource] || 0));
      if (qty <= 0) return;
      resources[g.resource] -= qty;
      income += qty * g.price;
    });
    if (income > 0) treasury += income;
  }

  let expense = 0;
  if (impCap > 0){
    const caps = computeCaps();
    IMPORT_GOODS.forEach(g => {
      if (!tradeImports[g.resource]) return;
      const room = Math.max(0, (caps[g.resource] || 0) - (resources[g.resource] || 0));
      const affordable = Math.floor(treasury / g.price);
      const qty = Math.min(impCap, room, affordable);
      if (qty <= 0) return;
      resources[g.resource] = (resources[g.resource] || 0) + qty;
      const cost = qty * g.price;
      treasury -= cost;
      expense += cost;
    });
  }

  if (income > 0 || expense > 0){
    if (income > 0) showNotification(t('trade.income', { gold: income }), 'good');
    if (expense > 0) showNotification(t('trade.expense', { gold: expense }), 'good');
    debugInfo('Commerce extérieur mensuel', { income, expense });
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

function estimatedImportExpense(){
  const capacity = importCapacity();
  const caps = computeCaps();
  let expense = 0;
  IMPORT_GOODS.forEach(g => {
    if (!tradeImports[g.resource]) return;
    const room = Math.max(0, (caps[g.resource] || 0) - (resources[g.resource] || 0));
    const affordable = Math.floor(treasury / g.price);
    const qty = Math.min(capacity, room, affordable);
    expense += qty * g.price;
  });
  return expense;
}

function renderTradePanel(){
  const el = document.getElementById('tradeList');
  if (!el) return;
  ensureTradeState();
  const posts = countTradePosts();

  if (posts === 0){
    el.innerHTML = `<p class="placeholder">${t('trade.noPost')}</p>`;
    return;
  }

  const exportRows = EXPORT_GOODS.map(g => {
    const on = tradeExports[g.resource];
    const stock = Math.floor(resources[g.resource] || 0);
    return `<button class="tradeRow buildBtn ${on ? 'active' : ''}" onclick="toggleExport('${g.resource}')">
      <span>${on ? '☑' : '☐'} ${t('resource.' + g.resource)}</span>
      <small>${g.price} dr./u · ${t('trade.inStock', { n: stock })}</small>
    </button>`;
  }).join('');

  const importRows = IMPORT_GOODS.map(g => {
    const on = tradeImports[g.resource];
    const stock = Math.floor(resources[g.resource] || 0);
    return `<button class="tradeRow buildBtn ${on ? 'active' : ''}" onclick="toggleImport('${g.resource}')">
      <span>${on ? '☑' : '☐'} ${t('resource.' + g.resource)}</span>
      <small>${g.price} dr./u · ${t('trade.inStock', { n: stock })}</small>
    </button>`;
  }).join('');

  el.innerHTML = `
    <p class="tradeInfo">${t('trade.capacity', { qty: exportCapacity(), posts })}</p>
    <h3 class="tradeSectionTitle">${t('trade.exportSection')}</h3>
    ${exportRows}
    <p class="tradeInfo">${t('trade.nextSale', { gold: estimatedExportIncome() })}</p>
    <h3 class="tradeSectionTitle">${t('trade.importSection')}</h3>
    ${importRows}
    <p class="tradeInfo">${t('trade.nextPurchase', { gold: estimatedImportExpense() })}</p>`;
}
