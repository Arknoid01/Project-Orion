/* ===================== ETAT RESSOURCES ===================== */
let resources = { wheat:0, marble:0, sculpture:0 };

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
  const caps = computeCaps();

  // production simple (ferme, carrière)
  forEachBuilding((type) => {
    const def = BUILDING_DEFS[type];
    if (def.produces && !def.consumes){
      const before = resources[def.produces];
      resources[def.produces] = Math.min(caps[def.produces], resources[def.produces] + def.rate);
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
        resources[def.produces] = Math.min(caps[def.produces], resources[def.produces] + def.rate);
      }
    }
  });

  debugCheckInvariants();
  processMarkets();
  evaluateHouses();
  advanceWalkers();
  if (inspectedTile) renderInspector(inspectedTile.col, inspectedTile.row);
  updateResourceBar(caps);
  render();
}

function updateResourceBar(caps){
  caps = caps || computeCaps();
  document.getElementById('resWheat').textContent = `${Math.floor(resources.wheat)}/${caps.wheat}`;
  document.getElementById('resMarble').textContent = `${Math.floor(resources.marble)}/${caps.marble}`;
  document.getElementById('resSculpture').textContent = `${Math.floor(resources.sculpture)}/${caps.sculpture}`;
  document.getElementById('resPopulation').textContent = computeTotalPopulation();
}
