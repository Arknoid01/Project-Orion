/* ===================== MAIN-D'OEUVRE (EMPLOI) ===================== */
// Modèle léger : un seul pool d'ouvriers GLOBAL, pas d'accès par route.
//   - offre  (supply) = population totale logée
//   - demande (demand) = somme des postes (workers) de l'industrie
//   - ratio = min(1, offre / demande) ; module la production (voir production.js)
// Si l'industrie demande plus d'ouvriers que la population n'en fournit, tout
// tourne au ralenti proportionnellement — ce qui pousse à loger avant d'industrialiser.

let employment = { supply: 0, demand: 0, ratio: 1 };

function recomputeLabor(){
  let demand = 0;
  forEachBuilding((type) => { demand += BUILDING_DEFS[type].workers || 0; });
  const supply = computeTotalPopulation();
  employment = {
    supply,
    demand,
    ratio: demand > 0 ? Math.min(1, supply / demand) : 1,
  };
  return employment;
}
