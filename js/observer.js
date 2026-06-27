/* ===================== OBSERVATEUR (nouvelle interface) ===================== */
// Remplace OBSERVER_DATA (mock, dans le script de l'UI) par de vraies données tirées
// de l'état du jeu. Format attendu par setObserverTiles() (déjà défini dans le script
// de l'UI) : { title, tiles: [{icon, title, status, rows: [[label, valeur, classeCss?]]}], actions }
// Au plus 4 tuiles affichées (limite du nombre de .obsTile statiques dans le HTML).

function buildHouseObserverData(cell, col, row){
  const levelDef = HOUSE_LEVELS[cell.houseLevel];
  const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];

  const needsRows = nextDef
    ? nextDef.requires.map(need => {
        const ok = NEED_CHECKERS[need](col, row);
        return [t('need.' + need), ok ? '✔' : '✖', ok ? 'ok' : 'bad'];
      })
    : [[t('need.maxLevel'), '—']];
  const metCount = nextDef ? nextDef.requires.filter(n => NEED_CHECKERS[n](col, row)).length : 0;

  const fireOk = isHouseServedBy('fire', col, row);
  const healthOk = isHouseServedBy('health', col, row);
  const emig = emigrationChance();

  const riskRows = [
    [t('inspector.fireRisk'), fireOk ? '✔' : '✖', fireOk ? 'ok' : 'bad'],
    [t('inspector.diseaseRisk'), healthOk ? '✔' : '✖', healthOk ? 'ok' : 'bad'],
  ];
  if (emig > 0) riskRows.push([t('migration.emigrationRisk'), `${Math.round(emig * 100)}%/tick`, 'bad']);

  const tiles = [
    {
      icon: '🏠', title: t(levelDef.nameKey), status: `${t('inspector.level')} ${cell.houseLevel}`,
      rows: [
        [t('inspector.population'), cell.population],
        [t('inspector.beauty'), `${Math.round(cell.beauty || 0)}/${BEAUTY_THRESHOLD}`],
      ],
    },
    {
      icon: '📋', title: t('inspector.nextNeeds'), status: nextDef ? `${metCount}/${nextDef.requires.length}` : '—',
      rows: needsRows,
    },
    {
      icon: '🛡️', title: t('inspector.fireRisk'), status: (fireOk && healthOk) ? 'OK' : '⚠️',
      rows: riskRows,
    },
  ];

  return { title: t(levelDef.nameKey), tiles, actions: true };
}

function buildBuildingObserverData(type, col, row){
  const def = BUILDING_DEFS[type];
  const tiles = [];

  const patron = grid[row][col].godPatron;
  const costLabel = (def.isMonument && patron && typeof godTempleCostLabel === 'function')
    ? godTempleCostLabel(patron)
    : (def.isMonument ? '—' : `${def.cost} dr.`);
  const identRows = [[t('inspector.terrain'), t('terrainName.' + def.validTerrain)], [t('inspector.cost'), costLabel]];
  if (def.upkeep) identRows.push([t('inspector.upkeep'), `${def.upkeep}${t('inspector.perTick')}`]);
  tiles.push({ icon: def.icon, title: t(def.name), status: '', rows: identRows });

  if (def.produces && !def.consumes){
    const eff = def.rate * productionMultiplier * employment.ratio * taxEfficiencyMultiplier();
    const rows = [[resLabel(def.produces), `+${fmtRate(eff)}${t('inspector.perTick')}`]];
    if (def.workers) rows.push([t('inspector.laborRate'), `${Math.round(employment.ratio * 100)}%`]);
    tiles.push({ icon: '📦', title: t('inspector.produces'), status: fmtRate(eff), rows });
  }

  if (def.consumes){
    const [inRes, amt] = Object.entries(def.consumes)[0];
    const eff = def.rate * productionMultiplier * employment.ratio * taxEfficiencyMultiplier();
    const ok = resources[inRes] >= amt;
    tiles.push({
      icon: '🔄', title: t('inspector.transforms'), status: ok ? 'OK' : '⚠️',
      rows: [
        [`${resLabel(inRes)} → ${resLabel(def.produces)}`, `${amt} → ${fmtRate(eff)}`],
        [t('inspector.inputOk'), ok ? '✔' : '✖', ok ? 'ok' : 'bad'],
      ],
    });
  }

  if (def.isService){
    const walker = walkers.find(w => w.col === col && w.row === row);
    const served = walker ? walker.servedHouses.length : 0;
    const connected = !!walker && walker.path.length > 1;
    tiles.push({
      icon: '🚶', title: t('inspector.service'), status: `${served}/${def.capacity}`,
      rows: [
        [t('inspector.service'), t('service.' + def.serviceType)],
        [t('inspector.range'), def.range],
        [t('inspector.connected'), connected ? '✔' : '✖', connected ? 'ok' : 'bad'],
      ],
    });
  }

  if (def.isDecoration){
    tiles.push({ icon: '🎨', title: t('inspector.decoration'), status: `+${def.beauty}`, rows: [[t('inspector.charm'), def.beauty], [t('inspector.range'), def.range]] });
  }

  if (def.isMonument){
    const patron = grid[row][col].godPatron;
    if (patron){
      const g = GODS.find(x => x.key === patron);
      tiles.push({ icon: g ? g.icon : '🏛️', title: t('monument.patron'), status: '',
        rows: [[t('god.' + patron), t('god.benefit.' + patron)]] });
    }
    tiles.push({ icon: '📐', title: t('monument.footprint'), status: '2×2',
      rows: [[t('monument.size'), t('monument.fourTiles')]] });
  }

  if (def.isTradePost){
    let exp = 0, imp = 0;
    (worldCities || []).forEach(c => {
      const r = tradeRoutes[c.id];
      if (!r) return;
      exp += Object.values(r.export || {}).filter(Boolean).length;
      imp += Object.values(r.import || {}).filter(Boolean).length;
    });
    tiles.push({ icon: '🚢', title: t('inspector.exports'), status: '', rows: [
      [t('trade.exportSection'), `${exp} ${t('world.routes')}`],
      [t('trade.importSection'), `${imp} ${t('world.routes')}`],
    ] });
  }

  return { title: t(def.name), tiles: tiles.slice(0, 4), actions: true };
}

function buildTileObserverData(cell){
  const title = cell.hasRoad ? t('inspector.tileTitleRoad') : t('inspector.tileTitleEmpty');
  const rows = [[t('inspector.terrain'), t('terrainName.' + cell.terrain)]];
  if (cell.beauty) rows.push([t('inspector.beauty'), `${Math.round(cell.beauty)}/${BEAUTY_THRESHOLD}`]);
  return { title, tiles: [{ icon: cell.hasRoad ? '🛣️' : '🌿', title, status: '', rows }], actions: false };
}

// Vue d'ensemble de la cité (bouton "Gestion de la ville" du menu).
function buildCityObserverData(){
  return {
    title: 'Cité',
    tiles: [
      {
        icon: '🏛️', title: 'Résumé', status: '',
        rows: [
          ['Trésor', `${Math.floor(treasury)} dr.`],
          [t('resource.population'), computeTotalPopulation()],
          [t('resource.favor'), `${Math.round(favor)}/${FAVOR_MAX}`],
          ['Attractivité', `${Math.round(cityAttractiveness() * 100)}%`],
        ],
      },
      {
        icon: '💰', title: t('panel.government'), status: `${Math.round(taxRate * 100)}%`,
        rows: [
          [t('government.taxRate'), `<button class="miniBtn" onclick="adjustTaxRate(-5)">−</button> ${Math.round(taxRate * 100)}% <button class="miniBtn" onclick="adjustTaxRate(5)">+</button>`],
          [t('government.efficiency'), `${Math.round(taxEfficiencyMultiplier() * 100)}%`],
          [t('government.growth'), `${Math.round(growthChance() * 100)}%`],
        ],
      },
      {
        icon: '📦', title: 'Ressources', status: '',
        rows: [
          [resLabel('wheat'), Math.floor(resources.wheat)],
          [resLabel('marble'), Math.floor(resources.marble)],
          [resLabel('sculpture'), Math.floor(resources.sculpture)],
          [resLabel('olives'), Math.floor(resources.olives)],
          [resLabel('oil'), Math.floor(resources.oil)],
          [resLabel('grapes'), Math.floor(resources.grapes)],
          [resLabel('wine'), Math.floor(resources.wine)],
          [resLabel('wool'), Math.floor(resources.wool)],
        ],
      },
      {
        icon: '🎯', title: t('panel.objectives'), status: victoryAnnounced ? '✔' : '…',
        rows: OBJECTIVES.map(o => [t(o.nameKey), `${Math.floor(o.current || 0)}/${o.target}`, o.done ? 'ok' : '']),
      },
    ],
    actions: false,
    // Actions non constructibles (déplacées hors du catalogue) : offrande, festival,
    // commerce extérieur, invocation de héros. Affichées dans la tuile d'actions.
    actionsTitle: t('cityActions.title'),
    actionsHtml: `<div class="actionGrid">
      <button class="actionBtn" onclick="cityManagementAction('makeOffering')">🏺 ${t('action.offeringShort')}</button>
      <button class="actionBtn" onclick="cityManagementAction('holdFestival')">🎉 ${t('action.festivalShort')}</button>
      <button class="actionBtn" onclick="cityManagementAction('openTradePanel')">🚢 ${t('panel.trade')}</button>
      <button class="actionBtn" onclick="cityManagementAction('summonHero')">🦸 ${t('cityActions.hero')}</button>
      <button class="actionBtn" onclick="cityManagementAction('openArmyPanel')">⚔️ ${t('panel.army')}</button>
      <button class="actionBtn" onclick="cityManagementAction('launchAttack')">🔥 ${t('army.attack')}</button>
    </div>`,
  };
}

// Exécute une action de cité depuis l'écran "Gestion de la ville". Le commerce ouvre
// son propre écran ; les autres rafraîchissent la gestion de la ville pour refléter
// l'effet (faveur, ressources...) immédiatement.
function cityManagementAction(action){
  if (typeof window[action] === 'function') window[action]();
  // Ces actions ouvrent leur propre écran/modale : ne pas réafficher la gestion de ville
  // par-dessus (sinon on referme l'écran qu'on vient d'ouvrir).
  const ownScreen = ['openTradePanel', 'openArmyPanel', 'launchAttack'];
  if (!ownScreen.includes(action) && typeof openCityManagement === 'function') openCityManagement();
}

// Vue dédiée à un marcheur (porteur d'eau, marchand, collecteur...) -- avant, il
// n'existait aucune vue réelle pour ça (seulement maisons/bâtiments/cases), donc un
// clic sur un marcheur retombait sur la case en dessous, qui ne bouge jamais.
function buildWalkerObserverData(walker){
  const def = BUILDING_DEFS[walker.type];
  const current = walker.path[walker.pathIndex];
  const connected = walker.path.length > 1;

  return {
    title: `${def.icon} ${t('inspector.service')} : ${t('service.' + walker.serviceType)}`,
    tiles: [
      {
        icon: '🚶', title: t('inspector.service'), status: connected ? t('inspector.connected') : t('inspector.notConnected'),
        rows: [
          [t('inspector.service'), t('service.' + walker.serviceType)],
          ['Départ', `${t(def.name)} (${walker.col},${walker.row})`],
          [t('inspector.connected'), connected ? '✔' : '✖', connected ? 'ok' : 'bad'],
        ],
      },
      {
        icon: '🏠', title: t('inspector.served'), status: `${walker.servedHouses.length}/${def.capacity}`,
        rows: walker.servedHouses.length
          ? walker.servedHouses.slice(0, 6).map(h => [`Maison (${h.col},${h.row})`, '✔', 'ok'])
          : [[t('inspector.served'), '0', 'bad']],
      },
      {
        icon: '🧭', title: 'Trajet', status: current ? `(${current.col},${current.row})` : '—',
        rows: [
          ['Position actuelle', current ? `${current.col},${current.row}` : '—'],
          ['Direction', walker.facing],
          ['Longueur du trajet', walker.path.length],
        ],
      },
    ],
    actions: false,
  };
}

function openWalkerObserver(walker){
  const titleEl = document.getElementById('observerTitle');
  const panel = document.getElementById('observerPanel');
  const backdrop = document.getElementById('backdrop');
  if (!panel) return;

  const data = buildWalkerObserverData(walker);
  if (typeof closePanels === 'function') closePanels();
  if (titleEl) titleEl.textContent = 'Observateur · ' + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
}

// Renvoie le marcheur dont la position écran actuelle (interpolée) est la plus
// proche du point cliqué, dans un rayon raisonnable -- sinon null.
function findWalkerNear(screenX, screenY, now){
  const threshold = WALKER_DISPLAY_SIZE;
  let closest = null;
  let closestDist = threshold;
  walkers.forEach(w => {
    if (w.path.length <= 1) return; // immobile, pas affiché -> pas cliquable
    const pos = getWalkerScreenPos(w, now);
    const dist = Math.hypot(pos.x - screenX, pos.y - screenY);
    if (dist <= closestDist){
      closest = w;
      closestDist = dist;
    }
  });
  return closest;
}
/* ===================== ECRAN COMMERCE EXTERIEUR (par cité) ===================== */
// Branche le bouton "🚢 Commerce" sur un écran observateur : un menu déroulant choisit
// la cité partenaire, puis on coche les biens à lui exporter (ce qu'elle achète) et à
// lui importer (ce qu'elle vend). Chaque toggle réutilise toggleCityExport/Import
// (trade.js) puis rouvre l'écran -- même schéma que adjustTaxRate.
let tradeScreenOpen = false;

function tradeCityToggleButton(kind, cityId, resource, on){
  const fn = kind === 'export' ? 'toggleCityExport' : 'toggleCityImport';
  return `<button class="miniBtn" onclick="${fn}(${cityId},'${resource}')">${on ? '☑' : '☐'}</button>`;
}

function tradeCityGoodRow(kind, cityId, resource, basePrice, effPrice, on){
  const stock = Math.floor(resources[resource] || 0);
  const label = `${resLabel(resource)} · ${Math.round(effPrice)} dr./u · ${t('trade.inStock', { n: stock })}`;
  return [label, tradeCityToggleButton(kind, cityId, resource, on), on ? 'ok' : ''];
}

function selectTradeCity(id){
  selectedTradeCityId = Number(id);
  if (typeof openTradePanel === 'function') openTradePanel();
}

function buildTradeObserverData(){
  const posts = countTradePosts();
  if (posts === 0){
    return { title: t('panel.trade'), tiles: [{ icon: '🚢', title: t('panel.trade'), status: '', rows: [[t('trade.noPost'), '']] }], actions: false };
  }
  ensureWorldState();
  let city = cityById(selectedTradeCityId) || worldCities[0];
  if (city) selectedTradeCityId = city.id;
  const route = routeFor(city.id);
  const st = (typeof relationStatusKey === 'function') ? relationStatusKey(city.relation) : 'neutral';

  const options = worldCities.map(c => `<option value="${c.id}"${c.id === city.id ? ' selected' : ''}>${c.name}</option>`).join('');
  const selectHtml = `<select class="tradeCitySelect" onchange="selectTradeCity(this.value)">${options}</select>`;

  const exportRows = city.buys.length
    ? city.buys.map(b => tradeCityGoodRow('export', city.id, b.resource, b.price, cityExportPrice(city, b.price), !!route.export[b.resource]))
    : [[t('world.nothingBought'), '']];
  const importRows = city.sells.length
    ? city.sells.map(s => tradeCityGoodRow('import', city.id, s.resource, s.price, cityImportPrice(city, s.price), !!route.import[s.resource]))
    : [[t('world.nothingSold'), '']];

  const perMonth = t('inspector.perMonth').replace('/', '');
  return {
    title: t('panel.trade'),
    tiles: [
      { icon: '🏛️', title: t('world.partner'), status: `${Math.round(city.relation)}/100`,
        rows: [
          [t('world.choose'), selectHtml],
          [t('diplomacy.status.' + st), '', st === 'hostile' ? 'bad' : (st === 'ally' ? 'ok' : '')],
          [t('trade.posts'), `${posts} · ${exportCapacity()}/${importCapacity()} u./${perMonth}`],
        ] },
      { icon: '🚢', title: t('trade.exportSection'), status: `+${estimatedCityIncome(city)} dr.`, rows: exportRows },
      { icon: '📥', title: t('trade.importSection'), status: '', rows: importRows },
    ],
    actions: false,
  };
}

function openTradePanel(){
  const panel = document.getElementById('observerPanel');
  if (!panel) return; // ancienne interface : pas d'observateur
  const data = buildTradeObserverData();
  if (typeof closePanels === 'function') closePanels();
  const titleEl = document.getElementById('observerTitle');
  if (titleEl) titleEl.textContent = 'Observateur · ' + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.add('show');
  tradeScreenOpen = true;
}

// Rappelée par toggleCityExport/toggleCityImport (trade.js) pour rafraîchir l'écran s'il est ouvert.
function refreshTradeScreen(){
  if (tradeScreenOpen && document.getElementById('observerPanel') && document.getElementById('observerPanel').classList.contains('open')){
    openTradePanel();
  }
}

function openTileObserver(col, row){
  if (!inBounds(col, row)) return;
  let cell = grid[row][col];
  if (cell.monumentPart){
    col = cell.monumentPart.col;
    row = cell.monumentPart.row;
    cell = grid[row][col];
  }

  let data;
  if (cell.building === 'maison') data = buildHouseObserverData(cell, col, row);
  else if (cell.building) data = buildBuildingObserverData(cell.building, col, row);
  else data = buildTileObserverData(cell);

  const titleEl = document.getElementById('observerTitle');
  const panel = document.getElementById('observerPanel');
  const backdrop = document.getElementById('backdrop');
  if (!panel) return; // ancienne interface : pas d'observateur, rien à faire

  if (typeof closePanels === 'function') closePanels();
  if (titleEl) titleEl.textContent = 'Observateur · ' + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
}
