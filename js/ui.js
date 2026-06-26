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
function canPlace(col, row){
  if (!inBounds(col, row)) return false;
  const cell = grid[row][col];
  if (cell.building || cell.hasRoad) return false;
  const def = BUILDING_DEFS[selectedBuilding];
  return cell.terrain === def.validTerrain;
}

function canPlaceRoad(col, row){
  if (!inBounds(col, row)) return false;
  const cell = grid[row][col];
  if (cell.building || cell.hasRoad) return false;
  return cell.terrain !== 'water';
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
    btn.innerHTML = `<span class="swatch" style="background:${def.color}"></span>
      <span>${def.icon} ${t(def.name)}<small>${reqLabel}</small></span>`;
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

/* ===================== INSPECTEUR ===================== */
function renderInspector(col, row){
  inspectedTile = inBounds(col, row) ? { col, row } : null;

  const panel = document.getElementById('inspector');
  const placeholder = panel.querySelector('.placeholder');
  let info = panel.querySelector('.houseInfo');

  const cell = inspectedTile ? grid[row][col] : null;
  if (!cell || cell.building !== 'maison'){
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

  const levelDef = HOUSE_LEVELS[cell.houseLevel];
  const nextDef = HOUSE_LEVELS[cell.houseLevel + 1];
  const needsHtml = nextDef
    ? nextDef.requires.map(need => {
        const ok = NEED_CHECKERS[need](col, row);
        return `<li class="${ok ? 'need-ok' : 'need-missing'}">${ok ? '✅' : '❌'} ${t('need.' + need)}</li>`;
      }).join('')
    : `<li>${t('need.maxLevel')}</li>`;

  info.innerHTML = `
    <p><strong>${t(levelDef.nameKey)}</strong> — ${t('inspector.level')} ${cell.houseLevel}</p>
    <p>👥 ${t('inspector.population')} : ${cell.population}</p>
    <p class="needsTitle">${t('inspector.nextNeeds')}</p>
    <ul class="needsList">${needsHtml}</ul>
  `;
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

document.getElementById('resetBtn').addEventListener('click', () => resetGame());

document.getElementById('offeringBtn').addEventListener('click', () => makeOffering());

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
    if (canPlaceRoad(col, row)){
      debugInfo('Route construite', { col, row });
      cell.hasRoad = true;
      recomputeAllWalkers();
    }
  } else if (blockMode){
    if (canToggleBlock(col, row)){
      cell.patrolBlock = !cell.patrolBlock;
      debugInfo(cell.patrolBlock ? 'Borne de blocage posée' : 'Borne de blocage retirée', { col, row });
      recomputeAllWalkers();
    }
  } else if (selectedBuilding && canPlace(col, row)){
    debugInfo(`Construction : ${t(BUILDING_DEFS[selectedBuilding].name)}`, { col, row });
    cell.building = selectedBuilding;
    if (selectedBuilding === 'maison'){
      cell.houseLevel = 0;
      cell.population = HOUSE_LEVELS[0].population;
    }
    recomputeAllWalkers();
  }
  renderInspector(col, row);
  render();
  updateResourceBar();
});
