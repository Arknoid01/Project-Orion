/* ===================== NOTIFICATIONS ===================== */
// Bannière temporaire pour les événements visibles par le joueur (bénédictions,
// catastrophes...). Générique, réutilisable par n'importe quel futur système.
// Défensif : si l'interface actuelle n'a pas (encore) cet élément, on ne plante
// jamais -- on logue juste en debug et on continue (voir le brief de migration UI).
let notificationTimer = null;
function showNotification(message, type){
  const el = document.getElementById('notification');
  if (!el){
    if (typeof debugInfo === 'function') debugInfo('[notification ignorée, élément absent]', { message });
    return;
  }
  el.textContent = message;
  el.className = `show notif-${type || 'info'}`;
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => { el.className = ''; }, 4000);
}

/* ===================== TIROIR MOBILE ===================== */
function toggleDrawer(){
  const drawer = document.getElementById('sideDrawer');
  const backdrop = document.getElementById('drawerBackdrop');
  if (drawer) drawer.classList.toggle('open');
  if (backdrop) backdrop.classList.toggle('open');
}

function closeDrawerIfMobile(){
  // ne ferme que si le tiroir est en mode "overlay" (mobile) ; inoffensif sur desktop
  if (window.innerWidth <= 860){
    const drawer = document.getElementById('sideDrawer');
    const backdrop = document.getElementById('drawerBackdrop');
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
  }
}

/* ===================== ETAT UI ===================== */
let selectedBuilding = null; // clé de BUILDING_DEFS
let demolishMode = false;
let roadMode = false;
let blockMode = false; // pose/retrait de borne de blocage de patrouille
let hoverTile = null;
let inspectedTile = null; // { col, row } de la dernière case cliquée, pour rafraîchir l'inspecteur à chaque tick

/* ===================== REGLES DE PLACEMENT ===================== */
// Vérifie uniquement le terrain/occupation (sans le coût) — sert à distinguer
// "emplacement invalide" de "trop cher" pour la notification au clic.
function canPlaceTerrain(col, row){
  if (!inBounds(col, row)) return false;
  const def = BUILDING_DEFS[selectedBuilding];
  if (!def) return false;
  if (def.footprint && def.footprint > 1){
    return typeof canPlaceMonumentTerrain === 'function' && canPlaceMonumentTerrain(col, row, selectedBuilding);
  }
  const cell = grid[row][col];
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  return cell.terrain === def.validTerrain || terrainMatchesBuilding(cell.terrain, def.validTerrain);
}

// Version complète (terrain + budget) utilisée pour la surbrillance de survol.
function canPlace(col, row){
  if (!canPlaceTerrain(col, row)) return false;
  const def = BUILDING_DEFS[selectedBuilding];
  if (def.isMonument) return true;
  if (def.costResources || (def.footprint && def.footprint > 1)){
    return typeof canAffordBuilding === 'function' && canAffordBuilding(selectedBuilding);
  }
  return canAfford(def.cost);
}

function canPlaceRoadTerrain(col, row){
  if (!inBounds(col, row)) return false;
  const cell = grid[row][col];
  if (cell.building || cell.monumentPart || cell.hasRoad) return false;
  return isRoadTerrain(cell.terrain);
}

function canPlaceRoad(col, row){
  return canPlaceRoadTerrain(col, row) && canAfford(ROAD_COST);
}

function canToggleBlock(col, row){
  if (!inBounds(col, row)) return false;
  return grid[row][col].hasRoad === true;
}

/* ===================== SELECTION (boutons + callGameAction de la nouvelle UI) ===================== */
// Fonctions canoniques, appelables des DEUX interfaces : les boutons de l'ancienne
// (#roadBtn etc.) ET les cartes de la nouvelle (via callGameAction('selectRoadMode')
// etc., déjà présent dans son HTML). Une seule logique, pas de duplication.
function selectBuilding(key){
  if (!BUILDING_DEFS[key]){
    showNotification(t('action.notYetAvailable'), 'bad'); // ex: 'barracks' (Guerre, pas encore construit)
    return;
  }
  demolishMode = false;
  roadMode = false;
  blockMode = false;
  selectedBuilding = (selectedBuilding === key) ? null : key;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
  updateSelectedBuildPill();
  updateBuildInfoPanel(selectedBuilding);
}

// Affiche nom, description et coût dans les panneaux de construction (#buildInfo et #catalogBuildInfo).
function updateBuildInfoPanel(key){
  const targets = [
    { title: 'buildInfoTitle', text: 'buildInfoText', cost: 'buildInfoCost' },
    { title: 'catalogBuildInfoTitle', text: 'catalogBuildInfoText', cost: 'catalogBuildInfoCost' },
  ];
  targets.forEach(ids => {
    const tEl = document.getElementById(ids.title);
    const dEl = document.getElementById(ids.text);
    const cEl = document.getElementById(ids.cost);
    if (!tEl && !dEl && !cEl) return;
    if (!key){
      if (tEl) tEl.textContent = t('build.selectTitle');
      if (dEl) dEl.textContent = t('build.selectHint');
      if (cEl) cEl.textContent = '';
      return;
    }
    const def = BUILDING_DEFS[key];
    if (!def) return;
    if (tEl) tEl.textContent = t(def.name);
    const descKey = 'building.desc.' + key;
    if (dEl) dEl.textContent = t(descKey) !== descKey ? t(descKey) : '';
    if (cEl){
      if (def.isMonument){
        cEl.textContent = '';
      } else if (def.costResources){
        cEl.textContent = t('build.cost') + ' : ' + (typeof monumentCostLabel === 'function' ? monumentCostLabel(key) : `${def.cost} dr.`);
      } else {
        cEl.textContent = t('build.cost') + ' : 🪙 ' + def.cost + ' dr.';
      }
    }
  });
}

function buildingCostSummary(key){
  const def = BUILDING_DEFS[key];
  if (!def) return '';
  if (def.isMonument) return '';
  if (def.costResources) return t('build.cost') + ' : ' + monumentCostLabel(key);
  return t('build.cost') + ' : 🪙 ' + def.cost + ' dr.';
}

function selectRoadMode(){
  selectedBuilding = null;
  demolishMode = false;
  blockMode = false;
  roadMode = !roadMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
  updateSelectedBuildPill();
}

function selectBlockMode(){
  selectedBuilding = null;
  demolishMode = false;
  roadMode = false;
  blockMode = !blockMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
  updateSelectedBuildPill();
}

function selectDemolishMode(){
  selectedBuilding = null;
  roadMode = false;
  blockMode = false;
  demolishMode = !demolishMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
  updateSelectedBuildPill();
}

// Pastille "sélection actuelle" de la nouvelle interface (#selectedBuildPill).
// Inoffensif si absent (ancienne interface).
function updateSelectedBuildPill(){
  const pill = document.getElementById('selectedBuildPill');
  const nameEl = document.getElementById('selectedBuildName');
  if (!pill || !nameEl) return;
  if (selectedBuilding){
    nameEl.textContent = t(BUILDING_DEFS[selectedBuilding].name);
    pill.classList.add('show');
  } else if (roadMode){
    nameEl.textContent = t('action.road');
    pill.classList.add('show');
  } else if (blockMode){
    nameEl.textContent = t('action.block');
    pill.classList.add('show');
  } else if (demolishMode){
    nameEl.textContent = t('action.demolish');
    pill.classList.add('show');
  } else {
    pill.classList.remove('show');
  }
}

// Annule le mode en cours (bâtiment/route/borne/démolir) et repasse en mode
// observation (clic sur une case = inspection, voir openTileObserver dans
// observer.js). Branché sur la pastille #selectedBuildPill (cliquable) et sur Échap.
function cancelSelection(){
  selectedBuilding = null;
  roadMode = false;
  blockMode = false;
  demolishMode = false;
  refreshButtonStates();
  render();
  updateSelectedBuildPill();
  updateBuildInfoPanel(null);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cancelSelection();
});

// Ajuste le taux d'imposition depuis la fiche "Gestion de la ville" de
// l'observateur (boutons +/- intégrés directement dans la ligne, voir observer.js).
function adjustTaxRate(deltaPercent){
  setTaxRate(taxRate + deltaPercent / 100);
  if (typeof openCityManagement === 'function') openCityManagement(); // réaffiche avec la nouvelle valeur
}

/* ===================== PALETTE DE BATIMENTS ===================== */
// Défensif : sur une interface qui n'a pas encore de #buildingButtons (migration UI
// en cours), on ne construit juste pas la palette -- pas de crash.
function buildPalette(){
  const container = document.getElementById('buildingButtons');
  if (!container) return;
  Object.entries(BUILDING_DEFS).forEach(([key, def]) => {
    const btn = document.createElement('button');
    btn.className = 'buildBtn';
    btn.dataset.key = key;
    const reqLabel = t('terrainReq.' + def.validTerrain);
    const costLabel = def.isMonument ? '' : t('economy.cost', { n: def.cost });
    btn.innerHTML = `<span class="swatch" style="background:${def.color}"></span>
      <span>${def.icon} ${t(def.name)}<small>${reqLabel}${costLabel ? ' · ' + costLabel : ''}</small></span>`;
    btn.addEventListener('click', () => selectBuilding(key));
    container.appendChild(btn);
  });
}

function refreshButtonStates(){
  document.querySelectorAll('.buildBtn[data-key]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === selectedBuilding);
  });
  const demolishBtn = document.getElementById('demolishBtn');
  const roadBtn = document.getElementById('roadBtn');
  const blockBtn = document.getElementById('blockBtn');
  if (demolishBtn) demolishBtn.classList.toggle('active', demolishMode);
  if (roadBtn) roadBtn.classList.toggle('active', roadMode);
  if (blockBtn) blockBtn.classList.toggle('active', blockMode);
}

// Grise les actions dont le coût dépasse le trésor (rafraîchi à chaque tick).
function refreshAffordability(){
  document.querySelectorAll('.buildBtn[data-key]').forEach(btn => {
    const def = BUILDING_DEFS[btn.dataset.key];
    const unaffordable = def.isMonument ? false
      : (typeof canAffordBuilding === 'function' && def.costResources)
        ? !canAffordBuilding(btn.dataset.key)
        : !canAfford(def.cost);
    btn.classList.toggle('unaffordable', unaffordable);
  });
  const roadBtn = document.getElementById('roadBtn');
  if (roadBtn) roadBtn.classList.toggle('unaffordable', !canAfford(ROAD_COST));
}

/* ===================== INSPECTEUR ===================== */
// Arrondi d'affichage des cadences (1 décimale max).
function fmtRate(n){ return `${Math.round(n * 10) / 10}`; }
function resLabel(key){ return t('resource.' + key); }

// --- Maison : niveau, population, cachet, besoins du prochain niveau ---
function houseInspectorHtml(cell, col, row){
  const levelDef = HOUSE_LEVELS[cell.houseLevel];
  const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];
  const needsHtml = nextDef
    ? nextDef.requires.map(need => {
        const ok = NEED_CHECKERS[need](col, row);
        return `<li class="${ok ? 'need-ok' : 'need-missing'}">${ok ? '✅' : '❌'} ${t('need.' + need)}</li>`;
      }).join('')
    : `<li>${t('need.maxLevel')}</li>`;
  return `
    <p><strong>${t(levelDef.nameKey)}</strong> — ${t('inspector.level')} ${cell.houseLevel}</p>
    <p>👥 ${t('inspector.population')} : ${cell.population}</p>
    <p>🎨 ${t('inspector.beauty')} : ${Math.round(cell.beauty || 0)} / ${BEAUTY_THRESHOLD}</p>
    <p class="${isHouseServedBy('fire', col, row) ? 'need-ok' : 'need-missing'}">
      ${isHouseServedBy('fire', col, row) ? '✅' : '❌'} ${t('inspector.fireRisk')}</p>
    <p class="${isHouseServedBy('health', col, row) ? 'need-ok' : 'need-missing'}">
      ${isHouseServedBy('health', col, row) ? '✅' : '❌'} ${t('inspector.diseaseRisk')}</p>
    ${emigrationChance() > 0 ? `<p class="need-missing">⚠️ ${t('migration.emigrationRisk')} : ${Math.round(emigrationChance() * 100)}%/tick</p>` : ''}
    <p class="needsTitle">${t('inspector.nextNeeds')}</p>
    <ul class="needsList">${needsHtml}</ul>`;
}

// --- Bâtiment : production / transformation / stockage / service / déco ---
function buildingInspectorHtml(type, col, row){
  const def = BUILDING_DEFS[type];
  let html = `<p><strong>${def.icon} ${t(def.name)}</strong></p>`;
  html += `<p>🧱 ${t('inspector.terrain')} : ${t('terrainName.' + def.validTerrain)}</p>`;

  let eco = `💰 ${t('inspector.cost')} : ${def.cost} dr.`;
  if (def.upkeep) eco += ` · ${t('inspector.upkeep')} : ${def.upkeep}${t('inspector.perTick')}`;
  html += `<p>${eco}</p>`;

  if (def.workers){
    html += `<p>👷 ${t('inspector.workers')} : ${def.workers} · ${t('inspector.laborRate')} : ${Math.round(employment.ratio * 100)}%</p>`;
  }

  // production simple (matière première depuis le terrain)
  if (def.produces && !def.consumes){
    const eff = def.rate * productionMultiplier * employment.ratio * taxEfficiencyMultiplier();
    html += `<p>📦 ${t('inspector.produces')} : ${resLabel(def.produces)} — ${fmtRate(eff)}${t('inspector.perTick')} (${t('inspector.baseRate')} ${def.rate})</p>`;
    if (employment.ratio < 1) html += `<p class="need-missing">⚠️ ${t('inspector.laborShortage')}</p>`;
  }

  // transformation (consomme une matière -> produit un bien)
  if (def.consumes){
    const [inRes, amt] = Object.entries(def.consumes)[0];
    const eff = def.rate * productionMultiplier * employment.ratio * taxEfficiencyMultiplier();
    html += `<p>🔄 ${t('inspector.transforms')} : ${amt} ${resLabel(inRes)} → ${fmtRate(eff)} ${resLabel(def.produces)}${t('inspector.perTick')}</p>`;
    const ok = resources[inRes] >= amt;
    html += `<p class="${ok ? 'need-ok' : 'need-missing'}">${ok ? '✅ ' + t('inspector.inputOk') : '❌ ' + t('inspector.inputMissing')} (${resLabel(inRes)} : ${Math.floor(resources[inRes])})</p>`;
    if (employment.ratio < 1) html += `<p class="need-missing">⚠️ ${t('inspector.laborShortage')}</p>`;
  }

  // stockage (augmente les plafonds de la ville)
  if (def.storageBonus){
    const parts = Object.entries(def.storageBonus).map(([r, n]) => `${resLabel(r)} +${n}`).join(', ');
    html += `<p>🏬 ${t('inspector.storage')} : ${parts}</p>`;
  }

  // service à walker (couverture des maisons)
  if (def.isService){
    const walker = walkers.find(w => w.col === col && w.row === row);
    const served = walker ? walker.servedHouses.length : 0;
    const connected = !!walker && walker.path.length > 1;
    html += `<p>🚶 ${t('inspector.service')} : ${t('service.' + def.serviceType)}</p>`;
    html += `<p>📡 ${t('inspector.range')} : ${def.range} · ${t('inspector.capacity')} : ${def.capacity}</p>`;
    html += `<p class="${served > 0 ? 'need-ok' : ''}">🏠 ${t('inspector.served')} : ${served}/${def.capacity}</p>`;
    html += `<p class="${connected ? 'need-ok' : 'need-missing'}">${connected ? '✅ ' + t('inspector.connected') : '❌ ' + t('inspector.notConnected')}</p>`;
    if (def.serviceType === 'market'){
      const goods = MARKET_GOODS.map(g => `${resLabel(g.resource)} (${Math.floor(resources[g.resource])})`).join(', ');
      html += `<p>🛒 ${t('inspector.distributes')} : ${goods}</p>`;
    }
    if (def.serviceType === 'tax'){
      const estimate = served * taxCollectionRate(); // approximation : population moyenne ignorée ici
      html += `<p>💰 ${t('government.collection')} (${t('government.thisOffice')}) ≈ ${estimate.toFixed(1)} dr.${t('inspector.perTick')}</p>`;
    }
  }

  // décoration (diffuse du cachet)
  if (def.isDecoration){
    html += `<p>🎨 ${t('inspector.decoration')} — ${t('inspector.charm')} : ${def.beauty} · ${t('inspector.range')} : ${def.range}</p>`;
  }

  // comptoir de commerce (routes commerciales par cité, voir trade.js / world.js)
  if (def.isTradePost){
    let exp = 0, imp = 0;
    (worldCities || []).forEach(c => {
      const r = (typeof tradeRoutes !== 'undefined' && tradeRoutes[c.id]) ? tradeRoutes[c.id] : null;
      if (!r) return;
      exp += Object.values(r.export || {}).filter(Boolean).length;
      imp += Object.values(r.import || {}).filter(Boolean).length;
    });
    html += `<p>🚢 ${t('trade.exportSection')} : ${exp} ${t('world.routes')}</p>`;
    html += `<p>📦 ${t('inspector.exportRate')} : ${EXPORT_QTY_PER_POST}${t('inspector.perMonth')}</p>`;
    html += `<p>🛬 ${t('trade.importSection')} : ${imp} ${t('world.routes')}</p>`;
  }

  return html;
}

// --- Case sans bâtiment : route ou terrain libre ---
function tileInspectorHtml(cell){
  const title = cell.hasRoad ? `🛣️ ${t('inspector.tileTitleRoad')}` : t('inspector.tileTitleEmpty');
  let html = `<p><strong>${title}</strong></p>`;
  html += `<p>🧱 ${t('inspector.terrain')} : ${t('terrainName.' + cell.terrain)}</p>`;
  if (cell.beauty) html += `<p>🎨 ${t('inspector.beauty')} : ${Math.round(cell.beauty)} / ${BEAUTY_THRESHOLD}</p>`;
  return html;
}

// Défensif : sur une interface sans #inspector (migration UI en cours), on calcule
// quand même inspectedTile (d'autres systèmes en dépendent) mais on n'écrit rien au DOM.
function renderInspector(col, row){
  inspectedTile = inBounds(col, row) ? { col, row } : null;

  const panel = document.getElementById('inspector');
  if (!panel) return;

  const placeholder = panel.querySelector('.placeholder');
  let info = panel.querySelector('.houseInfo');

  if (!inspectedTile){
    if (placeholder) placeholder.style.display = '';
    if (info) info.style.display = 'none';
    return;
  }

  if (placeholder) placeholder.style.display = 'none';
  if (!info){
    info = document.createElement('div');
    info.className = 'houseInfo';
    panel.appendChild(info);
  }
  info.style.display = '';

  const cell = grid[row][col];
  if (cell.building === 'maison'){
    info.innerHTML = houseInspectorHtml(cell, col, row);
  } else if (cell.building){
    info.innerHTML = buildingInspectorHtml(cell.building, col, row);
  } else {
    info.innerHTML = tileInspectorHtml(cell);
  }
}

/* ===================== EVENEMENTS ===================== */
// Petit utilitaire : attache un listener seulement si l'élément existe dans
// l'interface actuelle -- aucune de ces lignes ne doit jamais faire planter le
// reste du fichier, qui que ce soit la page HTML chargée autour (voir le brief
// de migration UI : plusieurs interfaces peuvent coexister pendant la transition).
function on(id, event, handler){
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

on('demolishBtn', 'click', () => selectDemolishMode());
on('roadBtn', 'click', () => selectRoadMode());
on('blockBtn', 'click', () => selectBlockMode());

on('resetBtn', 'click', () => {
  if (typeof showConfirm === 'function'){
    showConfirm(t('action.reset'), t('action.confirmReset'), () => resetGame());
  } else if (confirm(t('action.confirmReset'))){
    resetGame();
  }
});

on('saveBtn', 'click', () => saveGame());
on('offeringBtn', 'click', () => makeOffering());
on('festivalBtn', 'click', () => holdFestival());

on('taxRateSlider', 'input', (e) => {
  setTaxRate(e.target.value / 100);
});

on('zoomInBtn', 'click', () => zoomIn());
on('zoomOutBtn', 'click', () => zoomOut());

// canvas existe toujours (render.js le crée avant ui.js dans l'ordre de chargement),
// donc pas besoin de garde ici -- mais infoBar (à l'intérieur du handler) si.
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / zoomLevel;
  const my = (e.clientY - rect.top) / zoomLevel;
  const { col, row } = screenToTile(mx, my);
  hoverTile = { col, row };

  const info = document.getElementById('infoBar');
  if (info){
    if (inBounds(col, row)){
      const cell = grid[row][col];
      const buildingLabel = cell.building ? t(BUILDING_DEFS[cell.building].name) : t('info.empty');
      let text = t('info.tile', { col, row, terrain: t('terrainName.' + cell.terrain), building: buildingLabel });
      if (cell.hasRoad) text += ` — ${t('info.hasRoad')}`;
      if (cell.beauty) text += ` — ${t('info.beauty', { n: Math.round(cell.beauty) })}`;
      info.textContent = text;
    } else {
      info.textContent = t('info.hover');
    }
  }
  // Le rendu est géré par requestAnimationFrame (loop.js) — pas de render() ici.
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / zoomLevel;
  const my = (e.clientY - rect.top) / zoomLevel;
  const { col, row } = screenToTile(mx, my);
  if (!inBounds(col, row)) return;

  const cell = grid[row][col];

  if (demolishMode){
    const anchor = (typeof monumentAnchorAt === 'function') ? monumentAnchorAt(col, row) : null;
    if (anchor && grid[anchor.row][anchor.col].building){
      debugInfo('Démolition : temple monumental', anchor);
      demolishMonument(anchor.col, anchor.row);
    } else if (cell.building){
      debugInfo(`Démolition : ${t(BUILDING_DEFS[cell.building].name)}`, { col, row });
      cell.building = null;
    } else if (cell.hasRoad){
      debugInfo('Route supprimée', { col, row });
      cell.hasRoad = false;
      cell.patrolBlock = false;
    }
    recomputeAllWalkers();
  } else if (roadMode){
    if (canPlaceRoadTerrain(col, row)){
      if (!spend(ROAD_COST)){
        showNotification(t('economy.cantAfford'), 'bad');
      } else {
        debugInfo('Route construite', { col, row });
        cell.hasRoad = true;
        recomputeAllWalkers();
      }
    }
  } else if (blockMode){
    if (canToggleBlock(col, row)){
      cell.patrolBlock = !cell.patrolBlock;
      debugInfo(cell.patrolBlock ? 'Borne de blocage posée' : 'Borne de blocage retirée', { col, row });
      recomputeAllWalkers();
    }
  } else if (selectedBuilding && canPlaceTerrain(col, row)){
    const def = BUILDING_DEFS[selectedBuilding];
    if (def.isMonument){
      openMonumentGodDialog(col, row, selectedBuilding);
    } else if (!spend(def.cost)){
      showNotification(t('economy.cantAfford'), 'bad');
    } else {
      debugInfo(`Construction : ${t(def.name)}`, { col, row });
      cell.building = selectedBuilding;
      if (selectedBuilding === 'maison'){
        cell.houseLevel = 0;
        cell.population = HOUSE_LEVELS[0].population;
      }
      recomputeAllWalkers();
    }
  } else if (!demolishMode && !roadMode && !blockMode && !selectedBuilding){
    // Aucun mode actif : on inspecte ce qui a été tapé -- un marcheur en mouvement
    // s'il est sous le doigt, sinon la case (ouvre l'observateur, nouvelle UI).
    const now = performance.now();
    const hitWalker = (typeof findWalkerNear === 'function') ? findWalkerNear(mx, my, now) : null;
    if (hitWalker && typeof openWalkerObserver === 'function'){
      openWalkerObserver(hitWalker);
    } else if (typeof openTileObserver === 'function'){
      openTileObserver(col, row);
    }
  }
  recomputeBeauty(); // retour visuel immédiat du cachet (le tick le recalcule aussi)
  renderInspector(col, row);
  renderTradePanel(); // le nombre de comptoirs (donc la capacité d'export) a pu changer
  render();
  updateResourceBar();
  if (typeof renderHud === 'function') renderHud();
});
