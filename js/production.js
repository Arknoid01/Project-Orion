/* ===================== ETAT RESSOURCES ===================== */
let resources = { wheat:0, marble:0, sculpture:0, olives:0, oil:0, grapes:0, wine:0, wool:0 };

/* ===================== PRODUCTION (TICK) ===================== */
function computeCaps(){
  const caps = { ...BASE_CAP };
  forEachBuilding((type) => {
    const def = BUILDING_DEFS[type];
    if (def.storageBonus){
      for (const res in def.storageBonus){
        caps[res] = (caps[res] || 0) + def.storageBonus[res];
      }
    }
  });
  return caps;
}

function forEachBuilding(callback){
  for (let row = 0; row < GRID_ROWS; row++){
    for (let col = 0; col < GRID_COLS; col++){
      const b = grid[row][col].building;
      if (b) callback(b, col, row);
    }
  }
}

function tick(){
  DEBUG.tickCount++;
  lastTickTimestamp = performance.now();
  tickMythology();

  // Économie : taxes encaissées, entretien payé, puis main-d'œuvre recalculée
  // (l'industrie produit ensuite au prorata du ratio d'emploi).
  collectTaxes();
  payUpkeep();
  recomputeLabor();

  const caps = computeCaps();

  // production simple (ferme, carrière)
  forEachBuilding((type) => {
    const def = BUILDING_DEFS[type];
    if (def.produces && !def.consumes){
      const before = resources[def.produces];
      resources[def.produces] = Math.min(caps[def.produces], resources[def.produces] + def.rate * productionMultiplier * employment.ratio * taxEfficiencyMultiplier());
      const added = resources[def.produces] - before;
      if (def.produces === 'wheat') totalWheatProduced += added;
      if (before < caps[def.produces] && resources[def.produces] >= caps[def.produces]){
        debugWarn(`Stock saturé : ${def.produces} a atteint son plafond (${caps[def.produces]})`);
      }
    }
  });

  // production avec consommation (atelier)
  forEachBuilding((type) => {
    const def = BUILDING_DEFS[type];
    if (def.consumes){
      const [resName, amount] = Object.entries(def.consumes)[0];
      if (resources[resName] >= amount){
        resources[resName] -= amount;
        resources[def.produces] = Math.min(caps[def.produces], resources[def.produces] + def.rate * productionMultiplier * employment.ratio * taxEfficiencyMultiplier());
      }
    }
  });

  debugCheckInvariants();
  processMarkets();
  recomputeBeauty();
  evaluateHouses();
  checkMaintenanceRisks();
  advanceWalkers();
  checkObjectives();
  if (inspectedTile) renderInspector(inspectedTile.col, inspectedTile.row);
  updateResourceBar(caps);
  render();
}

function updateResourceBar(caps){
  caps = caps || computeCaps();
  document.getElementById('resWheat').textContent = `${Math.floor(resources.wheat)}/${caps.wheat}`;
  document.getElementById('resMarble').textContent = `${Math.floor(resources.marble)}/${caps.marble}`;
  document.getElementById('resSculpture').textContent = `${Math.floor(resources.sculpture)}/${caps.sculpture}`;
  document.getElementById('resOil').textContent = `${Math.floor(resources.oil)}/${caps.oil}`;
  document.getElementById('resWine').textContent = `${Math.floor(resources.wine)}/${caps.wine}`;
  document.getElementById('resWool').textContent = `${Math.floor(resources.wool)}/${caps.wool}`;
  document.getElementById('resPopulation').textContent = computeTotalPopulation();
  document.getElementById('resFavor').textContent = `${Math.round(favor)}/${FAVOR_MAX}`;
  document.getElementById('resTreasury').textContent = Math.floor(treasury);
  // emploi : main-d'œuvre disponible (population) / postes à pourvoir (industrie)
  document.getElementById('resEmployment').textContent = `${employment.supply}/${employment.demand}`;
  refreshAffordability();
}
