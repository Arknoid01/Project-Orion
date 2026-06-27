/* ===================== TERRAINS — REGLES PARTAGEES ===================== */
// Terrains constructibles « comme l'herbe » (maisons, services, industrie sur herbe).
const GRASS_LIKE_TERRAINS = ['grass', 'hill', 'sand'];

// Terrains où l'on ne peut ni marcher ni construire.
const BLOCKED_TERRAINS = ['water', 'rock'];

function terrainMatchesBuilding(cellTerrain, validTerrain){
  if (cellTerrain === validTerrain) return true;
  if (validTerrain === 'grass'){
    return GRASS_LIKE_TERRAINS.includes(cellTerrain) || cellTerrain === 'forest';
  }
  return false;
}

function isPassableTerrain(terrain){
  return !BLOCKED_TERRAINS.includes(terrain);
}

function isRoadTerrain(terrain){
  return terrain !== 'water' && terrain !== 'rock';
}

function isHillTerrain(terrain){
  return terrain === 'hill' || terrain === 'grass';
}
