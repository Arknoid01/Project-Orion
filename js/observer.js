/* ===================== OBSERVATEUR (nouvelle interface) ===================== */
// Remplace OBSERVER_DATA (mock, dans le script de l'UI) par de vraies données tirées
// Format attendu par setObserverTiles() (js/observerUi.js)
// Au plus 4 tuiles affichées (limite du nombre de .obsTile statiques dans le HTML).

const WALKER_SERVICE_NEEDS = ['water', 'religion', 'health', 'fire', 'culture'];
const MARKET_NEEDS = ['food', 'oil', 'wine', 'fish', 'clothing'];

function observerWalkerPassEnabled(){
  return typeof WALKER_PASS_DELIVERY !== 'undefined' && WALKER_PASS_DELIVERY
    && typeof getWalkerPassStats === 'function';
}

function observerWalkerServiceStats(walker, def){
  if (walker && observerWalkerPassEnabled()){
    const ps = getWalkerPassStats(walker);
    return {
      served: ps.served,
      eligible: ps.eligible,
      status: `${ps.served}/${ps.eligible} ${t('inspector.servedToday')}`,
      inventory: ps.inventory,
      carry: ps.carry,
    };
  }
  const served = walker ? walker.servedHouses.length : 0;
  return {
    served,
    eligible: def.capacity,
    status: `${served}/${def.capacity}`,
    inventory: null,
    carry: null,
  };
}

/** Case actuellement inspectée dans l'observateur ({ col, row }). */
let observerTile = null;
/** Favori carte — recentrer via l'observateur ou le bouton épingler. */
let observerPinnedTile = null;
window.observerPinnedTile = null;

function _syncObserverPin(tile){
  observerPinnedTile = tile;
  window.observerPinnedTile = tile;
}

function buildObserverActionsHtml(col, row, cell){
  const pinned = observerPinnedTile && observerPinnedTile.col === col && observerPinnedTile.row === row;
  const def = cell.building ? BUILDING_DEFS[cell.building] : null;
  const showCoverage = !!(def && def.isService) || cell.building === 'maison';
  const canDemolish = !!(cell.building || cell.hasRoad);
  const pinLabel = pinned ? t('observer.unpin') : t('observer.pin');

  let html = '<div class="actionGrid">';
  html += `<button class="actionBtn" onclick="observerCenterOnTile()">📍 ${t('observer.center')}</button>`;
  html += `<button class="actionBtn" onclick="observerTogglePin()">⭐ ${pinLabel}</button>`;
  if (showCoverage){
    html += `<button class="actionBtn" onclick="observerShowCoverage()">🗺️ ${t('observer.coverage')}</button>`;
  }
  if (canDemolish){
    html += `<button class="actionBtn" onclick="observerDemolishTile()">🔨 ${t('observer.demolish')}</button>`;
  }
  html += '</div>';
  return html;
}

function observerActionsPayload(col, row, cell){
  return {
    actions: true,
    actionsTitle: t('observer.actions'),
    actionsHtml: buildObserverActionsHtml(col, row, cell),
  };
}

function observerCenterOnTile(){
  if (!observerTile) return;
  const { col, row } = observerTile;
  if (typeof isThreeReady === 'function' && isThreeReady() && typeof centerThreeOnTile === 'function'){
    centerThreeOnTile(col, row);
  } else if (typeof tileCenter === 'function' && typeof centerCameraOn === 'function'){
    const c = tileCenter(col, row);
    centerCameraOn(c.x, c.y);
  }
  if (typeof markOverlayCameraDirty === 'function') markOverlayCameraDirty();
  if (typeof markRenderDirty === 'function') markRenderDirty();
  if (typeof closePanels === 'function') closePanels();
}

function observerTogglePin(){
  if (!observerTile) return;
  const { col, row } = observerTile;
  if (observerPinnedTile && observerPinnedTile.col === col && observerPinnedTile.row === row){
    _syncObserverPin(null);
    if (typeof showNotification === 'function') showNotification(t('observer.unpinned'), 'info');
  } else {
    _syncObserverPin({ col, row });
    if (typeof showNotification === 'function') showNotification(t('observer.pinned'), 'good');
  }
  if (typeof markRenderDirty === 'function') markRenderDirty();
  if (typeof markOverlayDirty === 'function') markOverlayDirty();
  const cell = grid[row][col];
  let data;
  if (cell.building === 'maison') data = buildHouseObserverData(cell, col, row);
  else if (cell.building) data = buildBuildingObserverData(cell.building, col, row);
  else data = buildTileObserverData(cell, col, row);
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
}

function observerShowCoverage(){
  if (!observerTile) return;
  const { col, row } = observerTile;
  const cell = grid[row][col];
  const walker = walkers.find(w => w.col === col && w.row === row);
  let roads = [];
  let houses = [];
  let origin = { col, row };

  if (walker){
    const def = BUILDING_DEFS[walker.type];
    if (typeof computeServiceReach === 'function'){
      roads = computeServiceReach(col, row, def.range);
    }
    houses = walker.servedHouses.slice();
  } else if (cell.building === 'maison'){
    origin = null;
    walkers.forEach(w => {
      if (!w.servedHouses.some(h => h.col === col && h.row === row)) return;
      const def = BUILDING_DEFS[w.type];
      if (typeof computeServiceReach === 'function'){
        roads = roads.concat(computeServiceReach(w.col, w.row, def.range));
      }
      houses.push({ col, row });
    });
    // dédoublonner routes
    const seen = new Set();
    roads = roads.filter(t => {
      const k = t.col + ',' + t.row;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } else {
    if (typeof showNotification === 'function') showNotification(t('observer.noCoverage'), 'info');
    return;
  }

  if (typeof setObserverCoverage === 'function'){
    setObserverCoverage({ origin, roads, houses, until: performance.now() + 12000 });
  }
  if (typeof showNotification === 'function'){
    showNotification(t('observer.coverageShown', { roads: roads.length, houses: houses.length }), 'info');
  }
  if (typeof closePanels === 'function') closePanels();
}

function observerDemolishTile(){
  if (!observerTile) return;
  const { col, row } = observerTile;
  if (typeof demolishAtTile === 'function' && demolishAtTile(col, row)){
    observerTile = null;
    if (typeof clearObserverCoverage === 'function') clearObserverCoverage();
    if (typeof closePanels === 'function') closePanels();
  } else if (typeof showNotification === 'function'){
    showNotification(t('observer.cantDemolish'), 'bad');
  }
}

function setObserverTileContext(col, row){
  observerTile = { col, row };
  if (typeof renderInspector === 'function') renderInspector(col, row);
}

function needStatusDetail(need, col, row){
  const ok = NEED_CHECKERS[need] && NEED_CHECKERS[need](col, row);
  if (ok) return ['✔', 'ok'];

  if (need === 'route'){
    return [t('needHint.noRoute'), 'bad'];
  }
  if (need === 'beauty'){
    const charm = Math.round((grid[row][col].beauty || 0));
    return [`${charm}/${BEAUTY_THRESHOLD}`, 'bad'];
  }
  if (WALKER_SERVICE_NEEDS.includes(need)){
    const type = need === 'fire' ? 'fire' : need;
    const w = typeof findServingWalker === 'function' ? findServingWalker(type, col, row) : null;
    if (w){
      if (need === 'culture'){
        const def = BUILDING_DEFS[w.type];
        const range = def && def.range != null ? def.range : 18;
        const venuesOk = typeof isCultureVenueLinked === 'function'
          && isCultureVenueLinked(w.col, w.row, range);
        if (!venuesOk) return [t('needHint.noVenues.culture'), 'bad'];
      }
      return ['✔', 'ok'];
    }
    const hasService = walkers.some(x => x.serviceType === type);
    if (!hasService) return [t('needHint.noService.' + need), 'bad'];
    if (!hasAdjacentRoad(col, row)) return [t('needHint.noRoute'), 'bad'];
    return [t('needHint.outOfRange.' + need), 'bad'];
  }
  if (MARKET_NEEDS.includes(need)){
    const marketWalker = typeof findServingWalker === 'function' ? findServingWalker('market', col, row) : null;
    if (!walkers.some(w => w.serviceType === 'market')){
      return [t('needHint.noService.market'), 'bad'];
    }
    if (!marketWalker){
      if (!hasAdjacentRoad(col, row)) return [t('needHint.noRoute'), 'bad'];
      return [t('needHint.outOfRange.market'), 'bad'];
    }
    return [t('needHint.noStock.' + need), 'bad'];
  }
  return ['✖', 'bad'];
}

function buildNeedRows(requires, col, row){
  if (!requires || !requires.length) return [[t('need.none'), '✅', 'ok']];
  return requires.map(need => {
    const ok = NEED_CHECKERS[need] && NEED_CHECKERS[need](col, row);
    if (ok) return [t('need.' + need), '✅', 'ok'];
    const [detail] = needStatusDetail(need, col, row);
    const hint = (detail && detail !== '✖' && detail !== '✔') ? ' ' + detail : '';
    return [t('need.' + need), '❌' + hint, 'bad'];
  });
}

function buildHouseObserverData(cell, col, row){
  const levelDef = HOUSE_LEVELS[cell.houseLevel];
  const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];

  const currentReq = levelDef.requires || [];
  const currentRows = buildNeedRows(currentReq, col, row);
  const currentMet = currentReq.filter(n => NEED_CHECKERS[n] && NEED_CHECKERS[n](col, row)).length;

  const nextReq = nextDef ? (nextDef.requires || []) : [];
  const nextRows = nextDef ? buildNeedRows(nextReq, col, row) : [[t('need.maxLevel'), '🏆', 'ok']];
  const nextMet = nextDef ? nextReq.filter(n => NEED_CHECKERS[n] && NEED_CHECKERS[n](col, row)).length : 0;
  const canEvolve = nextDef && nextMet === nextReq.length;

  const fireOk = isHouseServedBy('fire', col, row);
  const healthOk = isHouseServedBy('health', col, row);
  const emig = emigrationChance();

  const riskRows = [
    [t('inspector.fireRisk'), fireOk ? '✅' : '❌', fireOk ? 'ok' : 'bad'],
    [t('inspector.diseaseRisk'), healthOk ? '✅' : '❌', healthOk ? 'ok' : 'bad'],
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
      icon: '📋',
      title: t('inspector.currentNeeds'),
      status: currentReq.length ? `${currentMet}/${currentReq.length}` : '✅',
      rows: currentRows,
    },
    {
      icon: canEvolve ? '⬆️' : '📈',
      title: nextDef ? `${t('inspector.nextNeeds')} · ${t(nextDef.nameKey)}` : t('need.maxLevel'),
      status: nextDef ? `${nextMet}/${nextReq.length}` : '🏆',
      rows: nextRows,
    },
    {
      icon: '🛡️', title: t('inspector.risks'), status: (fireOk && healthOk) ? 'OK' : '⚠️',
      rows: riskRows,
    },
  ];

  return { title: t(levelDef.nameKey), tiles, ...observerActionsPayload(col, row, cell) };
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
    const eff = def.rate * productionMultiplier * employment.ratio * taxEfficiencyMultiplier();
    const rows = Object.entries(def.consumes).map(([inRes, amt]) => {
      const ok = (resources[inRes] || 0) >= amt;
      return [`${amt} ${resLabel(inRes)}`, ok ? '✔' : '✖', ok ? 'ok' : 'bad'];
    });
    rows.unshift([`${resLabel(def.produces)}`, `+${fmtRate(eff)}${t('inspector.perTick')}`]);
    const allOk = Object.entries(def.consumes).every(([r, a]) => (resources[r] || 0) >= a);
    tiles.push({
      icon: '🔄', title: t('inspector.transforms'), status: allOk ? 'OK' : '⚠️', rows,
    });
  }

  if (def.isService){
    const walker = walkers.find(w => w.col === col && w.row === row);
    const svcStats = observerWalkerServiceStats(walker, def);
    const connected = !!walker && walker.path.length > 1;
    const reach = typeof serviceCoverageTileCount === 'function'
      ? serviceCoverageTileCount(col, row, def.range)
      : def.range;
    const svcRows = [
      [t('inspector.service'), t('service.' + def.serviceType)],
      [t('inspector.patrolRange'), `${def.range} ${t('inspector.tilesAlongRoad')}`],
      [t('inspector.coverageArea'), `${reach} ${t('inspector.roadTiles')}`],
      [t('inspector.connected'), connected ? '✔' : '✖', connected ? 'ok' : 'bad'],
    ];
    if (svcStats.inventory != null){
      svcRows.push([t('inspector.walkerInventory'), `${svcStats.inventory}/${svcStats.carry}`]);
    }
    tiles.push({
      icon: '🚶', title: t('inspector.service'), status: svcStats.status,
      rows: svcRows,
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

  return { title: t(def.name), tiles: tiles.slice(0, 4), ...observerActionsPayload(col, row, grid[row][col]) };
}

function buildTileObserverData(cell, col, row){
  const title = cell.hasRoad ? t('inspector.tileTitleRoad') : t('inspector.tileTitleEmpty');
  const rows = [[t('inspector.terrain'), t('terrainName.' + cell.terrain)]];
  if (cell.beauty) rows.push([t('inspector.beauty'), `${Math.round(cell.beauty)}/${BEAUTY_THRESHOLD}`]);
  const payload = (col != null && row != null) ? observerActionsPayload(col, row, cell) : { actions: false };
  return { title, tiles: [{ icon: cell.hasRoad ? '🛣️' : '🌿', title, status: '', rows }], ...payload };
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
          [resLabel('clothing'), Math.floor(resources.clothing || 0)],
          [resLabel('fish'), Math.floor(resources.fish || 0)],
          [resLabel('coal'), Math.floor(resources.coal || 0)],
          [resLabel('bronze'), Math.floor(resources.bronze || 0)],
          [resLabel('arms'), Math.floor(resources.arms || 0)],
        ],
      },
      {
        icon: '⚡', title: t('panel.gods'), status: `${Math.round(favor)}/${FAVOR_MAX}`,
        rows: (typeof getGodSatisfactionRows === 'function')
          ? getGodSatisfactionRows().map(row => {
            const mood = row.disposition === 'hostile' ? '😠' :
              row.disposition === 'friendly' ? '😊' : '😐';
            const req = row.reqMet ? '' : ' ⚠';
            return [`${row.icon} ${row.name} ${mood}${req}`, `${row.value}%`,
              row.value <= GOD_SAT_WRATH_THRESHOLD ? 'bad' :
              row.disposition === 'friendly' && row.value >= GOD_SAT_BLESSING_THRESHOLD ? 'ok' : ''];
          })
          : [[t('resource.favor'), `${Math.round(favor)}/${FAVOR_MAX}`]],
      },
      {
        icon: '🎯', title: t('panel.objectives'), status: victoryAnnounced ? '✔' : '…',
        rows: ((typeof activeObjectives !== 'undefined') ? activeObjectives : OBJECTIVES).map(o => [
          (typeof getObjectiveDisplayName === 'function') ? getObjectiveDisplayName(o) : t(o.nameKey),
          `${Math.floor(o.current || 0)}/${o.target}`,
          o.done ? 'ok' : '',
        ]),
      },
    ],
    actions: false,
    actionsTitle: t('cityActions.title'),
    actionsHtml: `<div class="actionGrid">
      <button class="actionBtn" onclick="cityManagementAction('makeOffering')">🏺 ${t('action.offeringShort')}</button>
      <button class="actionBtn" onclick="cityManagementAction('holdFestival')">🎉 ${t('action.festivalShort')}</button>
      <button class="actionBtn" onclick="cityManagementAction('openTradePanel')">🚢 ${t('panel.trade')}</button>
      <button class="actionBtn" onclick="cityManagementAction('summonHero')">🦸 ${t('cityActions.hero')}</button>
      <button class="actionBtn" onclick="cityManagementAction('openArmyPanel')">⚔️ ${t('panel.army')}</button>
      <button class="actionBtn" onclick="cityManagementAction('openNavyPanel')">⚓ ${t('panel.navy')}</button>
      <button class="actionBtn" onclick="cityManagementAction('launchAttack')">🔥 ${t('army.attack')}</button>
      <button class="actionBtn" onclick="cityManagementAction('openColoniesPanel')">🏝️ ${t('panel.colonies')}</button>
      <button class="actionBtn" onclick="cityManagementAction('openAdventuresPanel')">⚔️ ${t('panel.adventures')}</button>
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
  const ownScreen = ['openTradePanel', 'openArmyPanel', 'openNavyPanel', 'launchAttack', 'openColoniesPanel', 'openAdventuresPanel'];
  if (!ownScreen.includes(action) && typeof openCityManagement === 'function') openCityManagement();
}

// Vue dédiée à un marcheur (porteur d'eau, marchand, collecteur...) -- avant, il
// n'existait aucune vue réelle pour ça (seulement maisons/bâtiments/cases), donc un
// clic sur un marcheur retombait sur la case en dessous, qui ne bouge jamais.
function buildWalkerObserverData(walker){
  const def = BUILDING_DEFS[walker.type];
  const current = walker.path[walker.pathIndex];
  const connected = walker.path.length > 1;
  const reach = typeof serviceCoverageTileCount === 'function'
    ? serviceCoverageTileCount(walker.col, walker.row, def.range)
    : walker.path.length;
  const svcStats = observerWalkerServiceStats(walker, def);
  const passOn = observerWalkerPassEnabled();
  const servedKeys = walker.servedToday || new Set();
  const houseRows = walker.servedHouses.length
    ? walker.servedHouses.slice(0, 8).map(h => {
      const ok = !passOn || servedKeys.has(`${h.col},${h.row}`);
      return [`Maison (${h.col},${h.row})`, ok ? '✔' : '…', ok ? 'ok' : ''];
    })
    : [[t('inspector.served'), '0', 'bad']];
  const patrolRows = [
    [t('inspector.service'), t('service.' + walker.serviceType)],
    ['Départ', `${t(def.name)} (${walker.col},${walker.row})`],
    [t('inspector.patrolRange'), `${def.range} ${t('inspector.tilesAlongRoad')}`],
    [t('inspector.coverageArea'), `${reach} ${t('inspector.roadTiles')}`],
    [t('inspector.connected'), connected ? '✔' : '✖', connected ? 'ok' : 'bad'],
  ];
  if (svcStats.inventory != null){
    patrolRows.push([t('inspector.walkerInventory'), `${svcStats.inventory}/${svcStats.carry}`]);
  }

  return {
    title: `${def.icon} ${t('inspector.service')} : ${t('service.' + walker.serviceType)}`,
    tiles: [
      {
        icon: '🚶', title: t('inspector.service'), status: connected ? t('inspector.connected') : t('inspector.notConnected'),
        rows: patrolRows,
      },
      {
        icon: '🏠', title: t('inspector.served'), status: svcStats.status,
        rows: houseRows,
      },
      {
        icon: '🧭', title: 'Trajet', status: current ? `(${current.col},${current.row})` : '—',
        rows: [
          ['Position actuelle', current ? `${current.col},${current.row}` : '—'],
          ['Direction', walker.isoDiagonal ? walker.isoDiagonal.toUpperCase() : walker.facing],
          [t('inspector.coverageHint'), t('inspector.coverageHintDetail')],
        ],
      },
    ],
    ...observerActionsPayload(walker.col, walker.row, grid[walker.row][walker.col]),
  };
}

function openWalkerObserver(walker){
  const titleEl = document.getElementById('observerTitle');
  const panel = document.getElementById('observerPanel');
  const backdrop = document.getElementById('backdrop');
  if (!panel) return;

  setObserverTileContext(walker.col, walker.row);
  const data = buildWalkerObserverData(walker);
  if (typeof closePanels === 'function') closePanels();
  if (titleEl) titleEl.textContent = t('observer.prefix') + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
}

// Renvoie le marcheur dont la position écran actuelle (interpolée) est la plus
// proche du point cliqué, dans un rayon raisonnable -- sinon null.
function findWalkerNear(screenX, screenY, now){
  const threshold = (typeof isThreeReady === 'function' && isThreeReady())
    ? (typeof WALKER_DISPLAY_SIZE !== 'undefined' ? WALKER_DISPLAY_SIZE : 30) * 1.5
    : WALKER_DISPLAY_SIZE;
  let closest = null;
  let closestDist = threshold;
  walkers.forEach(w => {
    if (w.path.length <= 1) return;
    let px, py;
    if (typeof isThreeReady === 'function' && isThreeReady()
        && typeof getWalkerWorld3ScreenPos === 'function'){
      const s = getWalkerWorld3ScreenPos(w, now);
      px = s.x; py = s.y;
    } else {
      const pos = getWalkerScreenPos(w, now);
      px = pos.x; py = pos.y;
    }
    const dist = Math.hypot(px - screenX, py - screenY);
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
  if (!panel) return;
  const data = buildTradeObserverData();
  if (typeof closePanels === 'function') closePanels();
  const titleEl = document.getElementById('observerTitle');
  if (titleEl) titleEl.textContent = t('observer.prefix') + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  const backdrop = document.getElementById('backdrop');
  if (backdrop) backdrop.classList.add('show');
  tradeScreenOpen = true;
  if (typeof onTradePanelOpened === 'function') onTradePanelOpened();
}

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
  else data = buildTileObserverData(cell, col, row);

  setObserverTileContext(col, row);

  const titleEl = document.getElementById('observerTitle');
  const panel = document.getElementById('observerPanel');
  const backdrop = document.getElementById('backdrop');
  if (!panel) return;

  if (typeof closePanels === 'function') closePanels();
  if (titleEl) titleEl.textContent = t('observer.prefix') + data.title;
  if (typeof setObserverTiles === 'function') setObserverTiles(data);
  panel.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
}
