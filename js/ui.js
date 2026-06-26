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
let hoverTile = null;

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
}

/* ===================== INSPECTEUR (stub, Phase 2 le remplira) ===================== */
function renderInspector(col, row){
  // TODO Phase 2 : afficher niveau/population/besoins si la case contient une maison.
  // Pour l'instant le panneau reste sur son texte de placeholder (voir index.html).
}

/* ===================== EVENEMENTS ===================== */
document.getElementById('demolishBtn').addEventListener('click', () => {
  selectedBuilding = null;
  roadMode = false;
  demolishMode = !demolishMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
});

document.getElementById('roadBtn').addEventListener('click', () => {
  selectedBuilding = null;
  demolishMode = false;
  roadMode = !roadMode;
  refreshButtonStates();
  render();
  closeDrawerIfMobile();
});

document.getElementById('resetBtn').addEventListener('click', () => resetGame());

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
    }
  } else if (roadMode){
    if (canPlaceRoad(col, row)){
      debugInfo('Route construite', { col, row });
      cell.hasRoad = true;
    }
  } else if (selectedBuilding && canPlace(col, row)){
    debugInfo(`Construction : ${t(BUILDING_DEFS[selectedBuilding].name)}`, { col, row });
    cell.building = selectedBuilding;
  }
  renderInspector(col, row);
  render();
  updateResourceBar();
});
