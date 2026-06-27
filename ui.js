/* ===================== NOTIFICATIONS ===================== */
// Bannière temporaire pour les événements visibles par le joueur (bénédictions,
// catastrophes...). Générique, réutilisable par n'importe quel futur système.
let notificationTimer = null;
function showNotification(message, type){
  const el = document.getElementById('notification');
  el.textContent = message;
  el.className = `show notif-${type || 'info'}`;
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => { el.className = ''; }, 4000);
}

/* ===================== TIROIR MOBILE ===================== */
function toggleDrawer(){
  document.getElementById('sideDrawer').classList.toggle('open');
  document.getElementById('drawerBackdrop').classList.toggle('open');
}

function closeDrawerIfMobile(){
  // ne ferme que si le tiroir est en mode "overlay" (mobile) ; inoffensif sur desktop
  if (window.innerWidth <= 860){
    document.getElementById('sideDrawer').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('open');
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
  const cell = grid[row][col];
  if (cell.building || cell.hasRoad) return false;
  const def = BUILDING_DEFS[selectedBuilding];
  return cell.terrain === def.validTerrain;
}

// Version complète (terrain + budget) utilisée pour la surbrillance de survol.
function canPlace(col, row){
  if (!canPlaceTerrain(col, row)) return false;
  return canAfford(BUILDING_DEFS[selectedBuilding].cost);
}

function canPlaceRoadTerrain(col, row){
  if (!inBounds(col, row)) return false;
  const cell = grid[row][col];
  if (cell.building || cell.hasRoad) return false;
  return cell.terrain !== 'water';
}

function canPlaceRoad(col, row){
  return canPlaceRoadTerrain(col, row) && canAfford(ROAD_COST);
}

function canToggleBlock(col, row){
  if (!inBounds(col, row)) return false;
  return grid[row][col].hasRoad === true;
}

/* ===================== PALETTE DE BATIMENTS ===================== */
function buildPalette(){
  const container = document.getElementById('buildingButtons');
  Object.entries(BUILDING_DEFS).forEach(([key, def]) => {
    const btn = document.createElement('button');
    btn.className = 'buildBtn';
    btn.dataset.key = key;
    const reqLabel = t('terrainReq.' + def.validTerrain);
    const costLabel = t('economy.cost', { n: def.cost });
    btn.innerHTML = `<span class="swatch" style="background:${def.color}"></span>
      <span>${def.icon} ${t(def.name)}<small>${reqLabel} · ${costLabel}</small></span>`;
    btn.addEventListener('click', () => {
      demolishMode = false;
      roadMode = false;
      blockMode = false;
      selectedBuilding = (selectedBuilding === key) ? null : key;
      refreshButtonStates();
      render();
      closeDrawerIfMobile();
    });
    container.appendChild(btn);
  });
}

function refreshButtonStates(){
  document.querySelectorAll('.buildBtn[data-key]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.key === selectedBuilding);
  });
  document.getElementById('demolishBtn').classList.toggle('active', demolishMode);
  document.getElementById('roadBtn').classList.toggle('active', roadMode);
  document.getElementById('blockBtn').classList.toggle('active', blockMode);
}

// Grise les actions dont le coût dépasse le trésor (rafraîchi à chaque tick).
function refreshAffordability(){
  document.querySelectorAll('.buildBtn[data-key]').forEach(btn => {
    const def = BUILDING_DEFS[btn.dataset.key];
    btn.classList.toggle('unaffordable', !canAfford(def.cost));
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

function renderInspector(col, row){
  inspectedTile = inBounds(col, row) ? { col, row } : null;

  const panel = document.getElementById('inspector');
  const placeholder = panel.querySelector('.placeholder');
  let info = panel.querySelector('.houseInfo');

  if (!inspectedTile){
    placeholder.style.display = '';
    if (info) info.style.display = 'none';
    return;
  }

  placeholder.style.display = 'none';
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
document.getElementById('demolishBtn').addEventListener('click', () => {
  selectedBuilding = null;
  roadMode = false;
  blockMode = false;
  demolishMode = !demolishMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
});

document.getElementById('roadBtn').addEventListener('click', () => {
  selectedBuilding = null;
  demolishMode = false;
  blockMode = false;
  roadMode = !roadMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
});

document.getElementById('blockBtn').addEventListener('click', () => {
  selectedBuilding = null;
  demolishMode = false;
  roadMode = false;
  blockMode = !blockMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm(t('action.confirmReset'))) resetGame();
});

document.getElementById('saveBtn').addEventListener('click', () => saveGame());

document.getElementById('offeringBtn').addEventListener('click', () => makeOffering());

document.getElementById('taxRateSlider').addEventListener('input', (e) => {
  setTaxRate(e.target.value / 100);
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const { col, row } = screenToTile(mx, my);
  hoverTile = { col, row };

  const info = document.getElementById('infoBar');
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
  render();
});

canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const { col, row } = screenToTile(mx, my);
  if (!inBounds(col, row)) return;

  const cell = grid[row][col];

  if (demolishMode){
    if (cell.building){
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
    if (!spend(def.cost)){
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
  }
  recomputeBeauty(); // retour visuel immédiat du cachet (le tick le recalcule aussi)
  renderInspector(col, row);
  render();
  updateResourceBar();
});
