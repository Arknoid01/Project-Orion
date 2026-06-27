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

  const identRows = [[t('inspector.terrain'), t('terrainName.' + def.validTerrain)], [t('inspector.cost'), `${def.cost} dr.`]];
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

  if (def.isTradePost){
    const exp = EXPORT_GOODS.filter(g => tradeExports[g.resource]).map(g => resLabel(g.resource)).join(', ') || '—';
    const imp = IMPORT_GOODS.filter(g => tradeImports[g.resource]).map(g => resLabel(g.resource)).join(', ') || '—';
    tiles.push({ icon: '🚢', title: t('inspector.exports'), status: '', rows: [[t('trade.exportSection'), exp], [t('trade.importSection'), imp]] });
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
          [t('government.taxRate'), `${Math.round(taxRate * 100)}%`],
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
          [resLabel('oil'), Math.floor(resources.oil)],
        ],
      },
      {
        icon: '🎯', title: t('panel.objectives'), status: victoryAnnounced ? '✔' : '…',
        rows: OBJECTIVES.map(o => [t(o.nameKey), `${Math.floor(o.current || 0)}/${o.target}`, o.done ? 'ok' : '']),
      },
    ],
    actions: false,
  };
}

// Ouvre l'observateur sur une case précise de la grille (maison / bâtiment / case vide).
// Branché depuis le clic sur le canvas (voir ui.js) quand aucun mode n'est actif.
function openTileObserver(col, row){
  if (!inBounds(col, row)) return;
  const cell = grid[row][col];

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
