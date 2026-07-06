/* ===================== DÉCOR NATURE (planche triée — arbres + arbustes) ===================== */
// Placement organique : bords de forêt irréguliers, bosquets, zones vides/denses.

const MEDITERRANEAN_TREE_IMAGES = [];
const MEDITERRANEAN_PROP_IMAGES = [];
const MEDITERRANEAN_HILL_ROCK_IMAGES = [];
let mediterraneanTreeSpritesExpected = 0;
let mediterraneanTreeSpritesLoaded = 0;
let mediterraneanPropSpritesExpected = 0;
let mediterraneanPropSpritesLoaded = 0;
let mediterraneanHillRockSpritesExpected = 0;
let mediterraneanHillRockSpritesLoaded = 0;

const MEDITERRANEAN_NOISE = {
  zone: 0x536f48,
  cluster: 0x634b37,
  edge: 0x4e4154,
  spill: 0x72894a,
};

function mediterraneanDecorEnabled(){
  return typeof MEDITERRANEAN_DECOR_ENABLED === 'boolean' && MEDITERRANEAN_DECOR_ENABLED;
}

function mediterraneanTreeSpritePaths(){
  if (typeof GENERATED_NATURE_USE !== 'undefined' && GENERATED_NATURE_USE
    && typeof GENERATED_NATURE_TREE_SPRITES === 'object' && GENERATED_NATURE_TREE_SPRITES.length){
    return GENERATED_NATURE_TREE_SPRITES;
  }
  if (typeof MEDITERRANEAN_TREE_SPRITES === 'object' && Array.isArray(MEDITERRANEAN_TREE_SPRITES)){
    return MEDITERRANEAN_TREE_SPRITES;
  }
  return [];
}

function mediterraneanPropSpritePaths(){
  if (typeof GENERATED_NATURE_USE !== 'undefined' && GENERATED_NATURE_USE
    && typeof GENERATED_NATURE_PROP_SPRITES === 'object' && GENERATED_NATURE_PROP_SPRITES.length){
    return GENERATED_NATURE_PROP_SPRITES;
  }
  if (typeof MEDITERRANEAN_PROP_SPRITES === 'object' && Array.isArray(MEDITERRANEAN_PROP_SPRITES)){
    return MEDITERRANEAN_PROP_SPRITES;
  }
  return [];
}

function mediterraneanHillRockSpritePaths(){
  if (typeof MEDITERRANEAN_HILL_ROCK_SPRITES === 'object' && Array.isArray(MEDITERRANEAN_HILL_ROCK_SPRITES)){
    return MEDITERRANEAN_HILL_ROCK_SPRITES;
  }
  return [];
}

function areMediterraneanDecorSpritesReady(){
  const treesOk = mediterraneanTreeSpritesExpected === 0
    || mediterraneanTreeSpritesLoaded >= mediterraneanTreeSpritesExpected;
  const propsOk = mediterraneanPropSpritesExpected === 0
    || mediterraneanPropSpritesLoaded >= mediterraneanPropSpritesExpected;
  const rocksOk = mediterraneanHillRockSpritesExpected === 0
    || mediterraneanHillRockSpritesLoaded >= mediterraneanHillRockSpritesExpected;
  return treesOk && propsOk && rocksOk;
}

function mediterraneanDecorLoadSprites(paths, bucket, onLoad){
  paths.forEach(path => {
    const img = new Image();
    img.onload = () => {
      onLoad();
      if (typeof measureSpriteFoot === 'function') measureSpriteFoot(img);
      if (typeof debugInfo === 'function') debugInfo(`Sprite chargé : ${path}`);
      if (typeof render === 'function') render();
    };
    img.onerror = () => {
      onLoad();
      if (typeof debugWarn === 'function'){
        debugWarn(`Sprite décor méditerranéen introuvable : ${path}`);
      }
    };
    img.src = path;
    bucket.push(img);
  });
}

if (mediterraneanDecorEnabled()){
  const treePaths = mediterraneanTreeSpritePaths();
  const propPaths = mediterraneanPropSpritePaths();
  const hillRockPaths = mediterraneanHillRockSpritePaths();
  mediterraneanTreeSpritesExpected = treePaths.length;
  mediterraneanPropSpritesExpected = propPaths.length;
  mediterraneanHillRockSpritesExpected = hillRockPaths.length;
  mediterraneanDecorLoadSprites(treePaths, MEDITERRANEAN_TREE_IMAGES, () => { mediterraneanTreeSpritesLoaded++; });
  mediterraneanDecorLoadSprites(propPaths, MEDITERRANEAN_PROP_IMAGES, () => { mediterraneanPropSpritesLoaded++; });
  mediterraneanDecorLoadSprites(hillRockPaths, MEDITERRANEAN_HILL_ROCK_IMAGES, () => { mediterraneanHillRockSpritesLoaded++; });
}

function mediterraneanCellAt(col, row){
  if (typeof inBounds === 'function' && !inBounds(col, row)) return null;
  if (!Array.isArray(grid) || !grid[row] || !grid[row][col]) return null;
  return grid[row][col];
}

function mediterraneanTerrainAt(col, row){
  const cell = mediterraneanCellAt(col, row);
  return cell ? cell.terrain : null;
}

function mediterraneanDecorNoise(col, row, seed, scale, octaves){
  if (typeof fbm === 'function'){
    return fbm(col * scale + 1.7, row * scale + 2.3, seed, octaves || 3);
  }
  return mulberry32(hashSeed(col, row) ^ seed)();
}

function mediterraneanForestNeighborRatio(col, row, radius){
  let forest = 0;
  let total = 0;
  for (let dr = -radius; dr <= radius; dr++){
    for (let dc = -radius; dc <= radius; dc++){
      if (dr === 0 && dc === 0) continue;
      const terrain = mediterraneanTerrainAt(col + dc, row + dr);
      if (!terrain) continue;
      total++;
      if (terrain === 'forest') forest++;
    }
  }
  return total > 0 ? forest / total : 0;
}

function mediterraneanDistanceToForest(col, row, maxDist){
  if (mediterraneanTerrainAt(col, row) === 'forest') return 0;
  for (let dist = 1; dist <= maxDist; dist++){
    for (let dr = -dist; dr <= dist; dr++){
      for (let dc = -dist; dc <= dist; dc++){
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== dist) continue;
        if (mediterraneanTerrainAt(col + dc, row + dr) === 'forest') return dist;
      }
    }
  }
  return maxDist + 1;
}

function mediterraneanForestInteriorScore(col, row){
  if (mediterraneanTerrainAt(col, row) !== 'forest') return 0;
  const near = mediterraneanForestNeighborRatio(col, row, 1);
  const far = mediterraneanForestNeighborRatio(col, row, 2);
  return near * 0.42 + far * 0.58;
}

function mediterraneanNearWater(col, row){
  for (let dr = -1; dr <= 1; dr++){
    for (let dc = -1; dc <= 1; dc++){
      if (dr === 0 && dc === 0) continue;
      const terrain = mediterraneanTerrainAt(col + dc, row + dr);
      if (terrain === 'water') return true;
    }
  }
  return false;
}

function mediterraneanNearCliff(col, row){
  const cell = mediterraneanCellAt(col, row);
  if (!cell) return false;
  const cliffTerrains = ['rock', 'marble'];
  for (let dr = -2; dr <= 2; dr++){
    for (let dc = -2; dc <= 2; dc++){
      if (dr === 0 && dc === 0) continue;
      const neighbor = mediterraneanCellAt(col + dc, row + dr);
      if (!neighbor) continue;
      if (cliffTerrains.includes(neighbor.terrain)) return true;
      if (Math.abs((neighbor.elevation || 0) - (cell.elevation || 0)) > 0.07) return true;
    }
  }
  return false;
}

function mediterraneanClusterBoost(col, row){
  const cluster = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.cluster, 0.14, 2);
  let boost = 0;
  if (cluster > 0.62) boost += 0.18;
  if (cluster > 0.78) boost += 0.12;

  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  let strongNeighbors = 0;
  for (let i = 0; i < offsets.length; i++){
    const oc = col + offsets[i][0];
    const or = row + offsets[i][1];
    if (mediterraneanDecorNoise(oc, or, MEDITERRANEAN_NOISE.cluster, 0.14, 2) > 0.58){
      strongNeighbors++;
    }
  }
  if (strongNeighbors >= 2) boost += 0.14;
  if (strongNeighbors >= 4) boost += 0.1;
  return boost;
}

function mediterraneanTreeSpawnChance(col, row){
  const terrain = mediterraneanTerrainAt(col, row);
  if (terrain !== 'forest') return 0;

  const zone = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.zone, 0.07, 3);
  const edge = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.edge, 0.11, 2);
  const clusterBoost = mediterraneanClusterBoost(col, row);
  const interior = mediterraneanForestInteriorScore(col, row);
  let chance;

  if (interior >= 0.92){
    chance = 0.93;
    if (zone < 0.2) chance *= 0.28;
  } else if (interior >= 0.72){
    chance = 0.82;
    if (zone < 0.24) chance *= 0.35;
  } else if (interior >= 0.45){
    chance = 0.48 + edge * 0.34;
    if (edge < 0.28) chance *= 0.18;
  } else {
    chance = 0.14 + edge * 0.42;
    if (edge < 0.42) chance *= 0.12;
  }

  let out = Math.min(0.98, chance + clusterBoost);
  if (typeof GENERATED_NATURE_USE !== 'undefined' && GENERATED_NATURE_USE){
    out = Math.min(0.55, out * 0.48 + clusterBoost * 0.45);
  }
  return out;
}

function mediterraneanPalmSpawnChance(col, row){
  const terrain = mediterraneanTerrainAt(col, row);
  if (terrain !== 'sand') return 0;

  const cluster = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.cluster, 0.16, 2);
  const zone = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.zone, 0.09, 2);
  const nearWater = mediterraneanNearWater(col, row);

  let chance = 0.06 + cluster * 0.20;
  if (nearWater) chance += 0.16 + cluster * 0.14;
  if (zone < 0.22) chance *= 0.32;

  return Math.min(0.48, chance);
}

function mediterraneanPropSpawnChance(col, row){
  const terrain = mediterraneanTerrainAt(col, row);
  if (terrain !== 'grass') return 0;

  // Trois familles naturelles :
  // 70% zones quasi vides, 20% petits groupes, 10% poches très denses.
  const family = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.zone, 0.032, 3);
  const cluster = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.cluster, 0.19, 2);
  const micro = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.spill, 0.38, 1);
  const distForest = mediterraneanDistanceToForest(col, row, 3);
  const nearWater = mediterraneanNearWater(col, row);
  const nearCliff = mediterraneanNearCliff(col, row);

  let chance;
  if (family < 0.70){
    chance = 0.006;
    if (cluster > 0.82 && micro > 0.55) chance = 0.035; // touffe isolée dans une zone vide
  } else if (family < 0.90){
    if (cluster < 0.48) return 0;
    chance = 0.10 + (cluster - 0.48) * 0.46;
  } else {
    chance = cluster < 0.34 ? 0.16 : 0.34 + cluster * 0.28;
  }

  if (distForest === 1 && family > 0.54) chance = Math.max(chance, 0.20 + cluster * 0.16);
  else if (distForest === 2 && family > 0.66) chance = Math.max(chance, 0.08 + cluster * 0.08);

  if (nearWater && family > 0.62 && cluster > 0.42) chance += 0.08 + cluster * 0.05;
  if (nearCliff && family > 0.58 && cluster > 0.38) chance += 0.08 + cluster * 0.05;

  if (cluster > 0.86 && family > 0.70) chance += 0.09;
  if (family < 0.70 && distForest > 1 && !nearWater && !nearCliff) chance *= 0.28;

  return Math.min(0.72, chance);
}

function mediterraneanHillRockSpawnChance(col, row){
  const terrain = mediterraneanTerrainAt(col, row);
  if (terrain !== 'hill') return 0;

  const family = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.zone, 0.034, 3);
  const cluster = mediterraneanDecorNoise(col, row, MEDITERRANEAN_NOISE.cluster, 0.17, 2);
  const nearCliff = mediterraneanNearCliff(col, row);
  const nearWater = mediterraneanNearWater(col, row);

  let chance;
  if (family < 0.62){
    chance = 0.022 + cluster * 0.06;
  } else if (family < 0.88){
    chance = 0.12 + (cluster - 0.32) * 0.40;
    if (cluster < 0.32) return 0;
  } else {
    chance = 0.28 + cluster * 0.30;
  }

  if (nearCliff) chance += 0.12 + cluster * 0.10;
  if (nearWater && cluster > 0.40) chance += 0.06;
  if (cluster > 0.82) chance += 0.08;

  return Math.min(0.72, chance);
}

function mediterraneanHillRockVariantSizeMul(variant){
  if (typeof MEDITERRANEAN_HILL_ROCK_VARIANT_SIZE_MUL === 'object'
    && Array.isArray(MEDITERRANEAN_HILL_ROCK_VARIANT_SIZE_MUL)
    && variant >= 0
    && variant < MEDITERRANEAN_HILL_ROCK_VARIANT_SIZE_MUL.length){
    const mul = MEDITERRANEAN_HILL_ROCK_VARIANT_SIZE_MUL[variant];
    if (typeof mul === 'number' && mul > 0) return mul;
  }
  return 1;
}

function mediterraneanPickHillRockVariant(rng){
  const count = MEDITERRANEAN_HILL_ROCK_IMAGES.length;
  if (count <= 0) return 0;
  const weights = typeof MEDITERRANEAN_HILL_ROCK_VARIANT_WEIGHTS === 'object'
    && Array.isArray(MEDITERRANEAN_HILL_ROCK_VARIANT_WEIGHTS)
    && MEDITERRANEAN_HILL_ROCK_VARIANT_WEIGHTS.length >= count
    ? MEDITERRANEAN_HILL_ROCK_VARIANT_WEIGHTS
    : null;
  if (!weights) return Math.floor(rng() * count);
  let total = 0;
  for (let i = 0; i < count; i++) total += weights[i] || 1;
  let pick = rng() * total;
  for (let i = 0; i < count; i++){
    pick -= weights[i] || 1;
    if (pick <= 0) return i;
  }
  return count - 1;
}

function mediterraneanTreeVisualVariation(rng){
  return {
    scale: 0.90 + rng() * 0.25,
    rotateDeg: (rng() * 2 - 1) * 3,
    flipH: rng() < 0.5,
    brightness: 0.95 + rng() * 0.10,
    saturation: 0.95 + rng() * 0.10,
  };
}

function mediterraneanTreeVariantSizeMul(variant){
  if (typeof MEDITERRANEAN_TREE_VARIANT_SIZE_MUL === 'object'
    && Array.isArray(MEDITERRANEAN_TREE_VARIANT_SIZE_MUL)
    && variant >= 0
    && variant < MEDITERRANEAN_TREE_VARIANT_SIZE_MUL.length){
    const mul = MEDITERRANEAN_TREE_VARIANT_SIZE_MUL[variant];
    if (typeof mul === 'number' && mul > 0) return mul;
  }
  return 1;
}

function mediterraneanDecorDrawOptsFor(decor){
  const base = mediterraneanDecorDrawOpts();
  if (!decor || decor.kind !== 'tree') return base;
  base.rotateDeg = decor.rotateDeg;
  base.flipH = decor.flipH;
  base.brightness = decor.brightness;
  base.saturation = decor.saturation;
  return base;
}

function mediterraneanHillRockDrawOptsFor(decor){
  const base = mediterraneanDecorDrawOpts();
  if (decor && decor.flipH) base.flipH = true;
  return base;
}

function mediterraneanTreeVariantPool(terrain){
  const count = MEDITERRANEAN_TREE_IMAGES.length;
  if (count <= 0) return [];
  if (terrain === 'sand'){
    const palms = typeof MEDITERRANEAN_TREE_PALM_INDICES === 'object'
      && Array.isArray(MEDITERRANEAN_TREE_PALM_INDICES)
      ? MEDITERRANEAN_TREE_PALM_INDICES
      : [8, 9];
    return palms.filter(i => i >= 0 && i < count);
  }
  if (terrain === 'forest'){
    const forest = typeof MEDITERRANEAN_TREE_FOREST_INDICES === 'object'
      && Array.isArray(MEDITERRANEAN_TREE_FOREST_INDICES)
      ? MEDITERRANEAN_TREE_FOREST_INDICES
      : null;
    if (forest && forest.length){
      return forest.filter(i => i >= 0 && i < count);
    }
    const palmSet = typeof MEDITERRANEAN_TREE_PALM_INDICES === 'object'
      && Array.isArray(MEDITERRANEAN_TREE_PALM_INDICES)
      ? MEDITERRANEAN_TREE_PALM_INDICES
      : [8, 9];
    const out = [];
    for (let i = 0; i < count; i++){
      if (!palmSet.includes(i)) out.push(i);
    }
    return out;
  }
  return [];
}

function mediterraneanPickTreeVariant(rng, allowedIndices){
  const count = MEDITERRANEAN_TREE_IMAGES.length;
  if (count <= 0) return 0;
  const pool = Array.isArray(allowedIndices) && allowedIndices.length
    ? allowedIndices.filter(i => i >= 0 && i < count)
    : Array.from({ length: count }, (_, i) => i);
  if (!pool.length) return 0;
  const weights = typeof MEDITERRANEAN_TREE_VARIANT_WEIGHTS === 'object'
    && Array.isArray(MEDITERRANEAN_TREE_VARIANT_WEIGHTS)
    && MEDITERRANEAN_TREE_VARIANT_WEIGHTS.length >= count
    ? MEDITERRANEAN_TREE_VARIANT_WEIGHTS
    : null;
  if (!weights){
    return pool[Math.floor(rng() * pool.length)];
  }
  let total = 0;
  for (let p = 0; p < pool.length; p++) total += weights[pool[p]] || 1;
  let pick = rng() * total;
  for (let p = 0; p < pool.length; p++){
    pick -= weights[pool[p]] || 1;
    if (pick <= 0) return pool[p];
  }
  return pool[pool.length - 1];
}

function mediterraneanTreeAtCell(col, row){
  const terrain = mediterraneanTerrainAt(col, row);
  let chance = 0;
  if (terrain === 'forest') chance = mediterraneanTreeSpawnChance(col, row);
  else if (terrain === 'sand') chance = mediterraneanPalmSpawnChance(col, row);
  else return null;

  const variantPool = mediterraneanTreeVariantPool(terrain);
  if (!variantPool.length) return null;
  if (chance <= 0) return null;

  const globalMul = typeof MEDITERRANEAN_TREE_DENSITY === 'number' ? MEDITERRANEAN_TREE_DENSITY : 1;
  const rng = mulberry32(hashSeed(col, row) ^ 0x7a3f2c1d);
  if (rng() > Math.min(0.98, chance * globalMul)) return null;

  const count = MEDITERRANEAN_TREE_IMAGES.length;
  if (count <= 0) return null;
  const variant = mediterraneanPickTreeVariant(rng, variantPool);
  const visual = mediterraneanTreeVisualVariation(rng);
  return {
    scale: visual.scale * mediterraneanTreeVariantSizeMul(variant),
    rotateDeg: visual.rotateDeg,
    flipH: visual.flipH,
    brightness: visual.brightness,
    saturation: visual.saturation,
    variant,
    kind: 'tree',
  };
}

function mediterraneanPropAtCell(col, row){
  const terrain = mediterraneanTerrainAt(col, row);
  if (terrain !== 'grass') return null;
  if (mediterraneanTreeAtCell(col, row)) return null;

  const chance = mediterraneanPropSpawnChance(col, row);
  if (chance <= 0) return null;

  const globalMul = typeof MEDITERRANEAN_PROP_DENSITY === 'number'
    ? MEDITERRANEAN_PROP_DENSITY
    : (typeof MEDITERRANEAN_PROP_CHANCE === 'number' ? MEDITERRANEAN_PROP_CHANCE * 2.6 : 1);
  const rng = mulberry32(hashSeed(col, row) ^ 0x5e4a3b2c);
  if (rng() > Math.min(0.95, chance * globalMul)) return null;

  const count = MEDITERRANEAN_PROP_IMAGES.length;
  if (count <= 0) return null;
  const variant = Math.floor(rng() * count);
  return {
    scale: 0.82 + rng() * 0.2,
    variant,
    kind: 'prop',
  };
}

function mediterraneanHillRockAtCell(col, row){
  const terrain = mediterraneanTerrainAt(col, row);
  if (terrain !== 'hill') return null;
  if (mediterraneanTreeAtCell(col, row)) return null;

  const chance = mediterraneanHillRockSpawnChance(col, row);
  if (chance <= 0) return null;

  const globalMul = typeof MEDITERRANEAN_HILL_ROCK_DENSITY === 'number'
    ? MEDITERRANEAN_HILL_ROCK_DENSITY
    : 1;
  const rng = mulberry32(hashSeed(col, row) ^ 0x3c8d1e5a);
  if (rng() > Math.min(0.95, chance * globalMul)) return null;

  const count = MEDITERRANEAN_HILL_ROCK_IMAGES.length;
  if (count <= 0) return null;
  const variant = mediterraneanPickHillRockVariant(rng);
  const baseScale = 0.88 + rng() * 0.22;
  return {
    scale: baseScale * mediterraneanHillRockVariantSizeMul(variant),
    variant,
    flipH: rng() < 0.5,
    kind: 'hillRock',
  };
}

function mediterraneanTreeImageForCell(col, row){
  const tree = mediterraneanTreeAtCell(col, row);
  if (!tree) return null;
  const img = MEDITERRANEAN_TREE_IMAGES[tree.variant];
  if (img && img.complete && img.naturalWidth > 0) return img;
  for (let i = 0; i < MEDITERRANEAN_TREE_IMAGES.length; i++){
    const fallback = MEDITERRANEAN_TREE_IMAGES[i];
    if (fallback && fallback.complete && fallback.naturalWidth > 0) return fallback;
  }
  return null;
}

function mediterraneanPropImageForCell(col, row){
  const decor = mediterraneanPropAtCell(col, row);
  if (!decor) return null;
  const img = MEDITERRANEAN_PROP_IMAGES[decor.variant];
  if (img && img.complete && img.naturalWidth > 0) return img;
  for (let i = 0; i < MEDITERRANEAN_PROP_IMAGES.length; i++){
    const fallback = MEDITERRANEAN_PROP_IMAGES[i];
    if (fallback && fallback.complete && fallback.naturalWidth > 0) return fallback;
  }
  return null;
}

function mediterraneanHillRockImageForCell(col, row){
  const decor = mediterraneanHillRockAtCell(col, row);
  if (!decor) return null;
  const img = MEDITERRANEAN_HILL_ROCK_IMAGES[decor.variant];
  if (img && img.complete && img.naturalWidth > 0) return img;
  for (let i = 0; i < MEDITERRANEAN_HILL_ROCK_IMAGES.length; i++){
    const fallback = MEDITERRANEAN_HILL_ROCK_IMAGES[i];
    if (fallback && fallback.complete && fallback.naturalWidth > 0) return fallback;
  }
  return null;
}

function mediterraneanDecorCellBlocked(cell){
  return !cell || cell.building || cell.monumentPart || cell.hasRoad;
}

function cellShowsMediterraneanDecor(cell, col, row){
  if (!mediterraneanDecorEnabled()) return false;
  if (mediterraneanDecorCellBlocked(cell)) return false;
  if (mediterraneanTreeAtCell(col, row) !== null) return true;
  if (cell.terrain === 'hill'){
    return mediterraneanHillRockAtCell(col, row) !== null;
  }
  if (cell.terrain === 'grass'){
    return mediterraneanPropAtCell(col, row) !== null;
  }
  return false;
}

function mediterraneanDecorDrawOpts(){
  return typeof natureDecorDrawOpts === 'function'
    ? natureDecorDrawOpts()
    : { lift: -5 };
}

function drawMediterraneanDecorOnCell(cx, cy, col, row, cell){
  if (!areMediterraneanDecorSpritesReady()) return;
  if (mediterraneanDecorCellBlocked(cell)) return;

  let decor = mediterraneanTreeAtCell(col, row);
  let sprite = decor ? mediterraneanTreeImageForCell(col, row) : null;
  let sizeMul = typeof MEDITERRANEAN_TREE_SIZE === 'number' ? MEDITERRANEAN_TREE_SIZE : 0.79;

  if (!decor){
    decor = mediterraneanHillRockAtCell(col, row);
    if (decor){
      sprite = mediterraneanHillRockImageForCell(col, row);
      sizeMul = typeof MEDITERRANEAN_HILL_ROCK_SIZE === 'number' ? MEDITERRANEAN_HILL_ROCK_SIZE : 0.54;
    }
  }

  if (!decor){
    decor = mediterraneanPropAtCell(col, row);
    if (!decor) return;
    sprite = mediterraneanPropImageForCell(col, row);
    sizeMul = typeof MEDITERRANEAN_PROP_SIZE === 'number' ? MEDITERRANEAN_PROP_SIZE : 0.47;
  }

  if (!sprite) return;

  let targetW = BUILDING_SPRITE_W * decor.scale * sizeMul;
  if (typeof spriteDrawWidthForTile === 'function'){
    targetW = spriteDrawWidthForTile(sprite, 1) * decor.scale * sizeMul;
  }

  const drawOpts = decor.kind === 'hillRock'
    ? mediterraneanHillRockDrawOptsFor(decor)
    : mediterraneanDecorDrawOptsFor(decor);

  if (typeof drawSpriteOnTile === 'function'){
    drawSpriteOnTile(cx, cy, sprite, targetW, drawOpts);
    return;
  }

  const scale = targetW / sprite.naturalWidth;
  const targetH = sprite.naturalHeight * scale;
  const footY = drawOpts.anchorCenter ? cy + TILE_H / 2 : cy + TILE_H;
  const m = typeof measureSpriteFoot === 'function' ? measureSpriteFoot(sprite) : null;
  const footNx = m ? m.footNx : 0.5;
  const footNy = m ? m.footNy : 1;
  ctx.drawImage(
    sprite,
    cx - targetW * footNx, footY - targetH * footNy + (drawOpts.lift || 0),
    targetW, targetH
  );
}
