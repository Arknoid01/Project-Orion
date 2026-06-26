/* ===================== DISTRIBUTION DE NOURRITURE ===================== */
// Contrairement à l'eau (simple "desservi ou pas"), la nourriture consomme
// vraiment le stock de blé de la ville. S'il n'y a pas assez de blé pour tout
// le monde, les maisons les plus proches du marché dans le trajet de patrouille
// sont nourries en priorité — les autres restent simplement non nourries ce tick.
let fedHouses = new Set();

function processMarkets(){
  fedHouses = new Set();
  walkers
    .filter(w => w.serviceType === 'food')
    .forEach(w => {
      for (const house of w.servedHouses){
        if (resources.wheat < FOOD_PER_HOUSE) break; // stock épuisé, le reste attendra le prochain tick
        resources.wheat -= FOOD_PER_HOUSE;
        fedHouses.add(tileKey(house.col, house.row));
      }
    });
}

function isHouseFed(col, row){
  return fedHouses.has(tileKey(col, row));
}
