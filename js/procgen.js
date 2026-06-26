/* ===================== GENERATION PROCEDURALE DETERMINISTE ===================== */
// Une même position (col, row) donne toujours le même seed, donc la même apparence
// de maison d'un rendu à l'autre — pas un random qui change à chaque frame.

function hashSeed(col, row){
  let h = (col * 374761393 + row * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr){ return arr[Math.floor(rng() * arr.length)]; }

function composeHouseVariant(seed){
  const rng = mulberry32(seed);
  return {
    wallColor: pick(rng, HOUSE_WALL_COLORS),
    roofColor: pick(rng, HOUSE_ROOF_COLORS),
    roofShape: pick(rng, HOUSE_ROOF_SHAPES),
    trimColor: pick(rng, HOUSE_TRIM_COLORS),
    hasTrim: rng() < 0.5,
    hasAnnex: rng() < 0.35,
    widthScale: 0.85 + rng() * 0.3
  };
}
