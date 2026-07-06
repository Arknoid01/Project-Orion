/* ===================== CHARGEMENT & DESSIN DES SPRITES PERSONNAGES ===================== */
// Atlas 3 frames × 4 directions (288×384 px à frame-size 96), aligné sur slice_walker_sheets.py.
// Directions LPC mappées aux 4 diagonales iso (SE / SW / NW / NE), voir ISO_DIAGONAL_FACING.

const characterSpriteImages = {};

function registerCharacterSprite(id, path){
  if (!path || characterSpriteImages[id]) return;
  const img = new Image();
  img.onload = () => { if (typeof render === 'function') render(); };
  img.onerror = () => debugWarn(`Sprite personnage introuvable : ${path}`);
  img.src = path;
  characterSpriteImages[id] = img;
}

function initCharacterSprites(){
  Object.entries(SERVICE_WALKER_SPRITES).forEach(([service, path]) => {
    registerCharacterSprite('walker_' + service, path);
  });
  MONSTER_TYPES.forEach(type => {
    if (type.sprite) registerCharacterSprite('monster_' + type.key, type.sprite);
  });
  HERO_TYPES.forEach(type => {
    if (type.sprite) registerCharacterSprite('hero_' + type.key, type.sprite);
  });
  if (typeof MIGRANT_SPRITE_PATH !== 'undefined'){
    registerCharacterSprite('migrant', MIGRANT_SPRITE_PATH);
  }
  if (typeof GOD_SPRITES !== 'undefined'){
    Object.entries(GOD_SPRITES).forEach(([key, path]) => {
      registerCharacterSprite('god_' + key, path);
    });
  }
  if (typeof MILITARY_SOLDIER_SPRITES !== 'undefined'){
    Object.entries(MILITARY_SOLDIER_SPRITES).forEach(([side, path]) => {
      registerCharacterSprite('soldier_' + side, path);
    });
  }
}

function isCharacterSpriteReady(id){
  const img = characterSpriteImages[id];
  return !!(img && img.complete && img.naturalWidth > 0);
}

function getCharacterDisplaySize(id){
  if (!id) return CHARACTER_DISPLAY_SIZE;
  if (id === 'migrant') return MIGRANT_DISPLAY_SIZE;
  if (id.startsWith('walker_')) return WALKER_DISPLAY_SIZE;
  if (id.startsWith('soldier_')) return SOLDIER_DISPLAY_SIZE;
  if (id.startsWith('hero_')) return HERO_DISPLAY_SIZE;
  if (id.startsWith('god_')) return GOD_DISPLAY_SIZE;
  if (id.startsWith('monster_')) return MONSTER_DISPLAY_SIZE;
  return CHARACTER_DISPLAY_SIZE;
}

function getCharacterAnimFrameMs(id){
  if (id === 'migrant' || (id && id.startsWith('walker_'))) return WALKER_ANIM_FRAME_MS;
  return CHARACTER_ANIM_FRAME_MS;
}

/** Diagonale iso parcourue (se | sw | nw | ne) à partir d'un delta grille 4-voisins. */
function isoDiagonalFromGridDelta(dcol, drow){
  if (dcol === 0 && drow === 0) return null;
  if (dcol > 0 && drow === 0) return 'se';
  if (dcol < 0 && drow === 0) return 'nw';
  if (drow > 0 && dcol === 0) return 'sw';
  if (drow < 0 && dcol === 0) return 'ne';
  const sx = dcol - drow;
  const sy = dcol + drow;
  if (sy > 0 && sx > 0) return 'se';
  if (sy > 0 && sx < 0) return 'sw';
  if (sy < 0 && sx < 0) return 'nw';
  if (sy < 0 && sx > 0) return 'ne';
  return 'se';
}

function resolveIsoFacingEntry(entry){
  if (!entry) return { facing: 'down', mirror: false };
  if (typeof entry === 'string') return { facing: entry, mirror: false };
  return { facing: entry.facing || 'down', mirror: !!entry.mirror };
}

function isoFacingFromGridDelta(dcol, drow){
  const diagonal = isoDiagonalFromGridDelta(dcol, drow);
  if (!diagonal) return null;
  const map = typeof ISO_DIAGONAL_FACING !== 'undefined' ? ISO_DIAGONAL_FACING : {
    se: { facing: 'down',  mirror: false },
    sw: { facing: 'left',  mirror: false },
    nw: { facing: 'left',  mirror: false },
    ne: { facing: 'down',  mirror: false },
  };
  const resolved = resolveIsoFacingEntry(map[diagonal]);
  return { diagonal, facing: resolved.facing, mirrorX: resolved.mirror };
}

function applyIsoFacingFromDelta(agent, dcol, drow){
  const iso = isoFacingFromGridDelta(dcol, drow);
  if (!iso) return;
  agent.isoDiagonal = iso.diagonal;
  agent.facing = iso.facing;
  agent.mirrorX = iso.mirrorX;
}

function getPatrolWalkerFacing(walker, now){
  if (typeof getWalkerInterp !== 'function') return null;
  const interp = getWalkerInterp(walker, now);
  if (!interp?.fromTile || !interp?.toTile) return null;
  const dcol = interp.toTile.col - interp.fromTile.col;
  const drow = interp.toTile.row - interp.fromTile.row;
  if (!dcol && !drow) return null;
  const iso = isoFacingFromGridDelta(dcol, drow);
  if (!iso) return null;
  walker.facing = iso.facing;
  walker.mirrorX = iso.mirrorX;
  walker.isoDiagonal = iso.diagonal;
  return iso;
}

/** Orientation pour le rendu (walkers : segment de patrouille en cours). */
function getAgentIsoFacing(agent){
  if (typeof isPatrolWalker === 'function' && isPatrolWalker(agent)){
    const patrol = getPatrolWalkerFacing(agent, performance.now());
    if (patrol) return patrol;
    if (typeof getWalkerMovementDelta === 'function'){
      const d = getWalkerMovementDelta(agent);
      if (d && (d.dcol || d.drow)){
        const iso = isoFacingFromGridDelta(d.dcol, d.drow);
        if (iso) return iso;
      }
    }
    return {
      diagonal: agent.isoDiagonal,
      facing: agent.facing || 'down',
      mirrorX: !!agent.mirrorX,
    };
  }
  if (agent.col !== undefined && agent.prevCol !== undefined
      && (agent.col !== agent.prevCol || agent.row !== agent.prevRow)){
    const iso = isoFacingFromGridDelta(agent.col - agent.prevCol, agent.row - agent.prevRow);
    if (iso) return iso;
  }
  if (agent.path && agent.pathIndex != null && agent.pathIndex < agent.path.length){
    const next = agent.path[agent.pathIndex];
    if (next && agent.col != null && agent.row != null){
      const iso = isoFacingFromGridDelta(next.col - agent.col, next.row - agent.row);
      if (iso) return iso;
    }
  }
  return {
    diagonal: agent.isoDiagonal,
    facing: agent.facing || 'down',
    mirrorX: !!agent.mirrorX,
  };
}

function drawCharacterSprite(id, x, y, facing, now, displaySize, mirrorX, animate){
  const img = characterSpriteImages[id];
  if (!img || !img.complete || !img.naturalWidth) return false;

  const frameMs = getCharacterAnimFrameMs(id);
  const frame = animate === false
    ? 0
    : Math.floor((now || performance.now()) / frameMs) % CHARACTER_FRAMES;
  const dirRows = (id && (id.startsWith('walker_') || id === 'migrant')
      && typeof WALKER_DIRECTION_ROWS !== 'undefined')
    ? WALKER_DIRECTION_ROWS
    : CHARACTER_DIRECTION_ROWS;
  const row = dirRows[facing] ?? dirRows.down;
  const sx = frame * CHARACTER_FRAME_SIZE;
  const sy = row * CHARACTER_FRAME_SIZE;
  const d = displaySize ?? getCharacterDisplaySize(id);
  const footPad = typeof CHARACTER_ISO_FOOT_PAD === 'number' ? CHARACTER_ISO_FOOT_PAD : 8;
  const dx = x - d / 2;
  const dy = y - d + footPad;

  if (mirrorX){
    ctx.save();
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }
  ctx.drawImage(
    img,
    sx, sy, CHARACTER_FRAME_SIZE, CHARACTER_FRAME_SIZE,
    dx, dy, d, d,
  );
  if (mirrorX) ctx.restore();
  return true;
}

function updateAgentFacing(agent){
  applyIsoFacingFromDelta(agent, agent.col - agent.prevCol, agent.row - agent.prevRow);
  if (!agent.facing) agent.facing = 'down';
  if (agent.mirrorX === undefined) agent.mirrorX = false;
}

function getMonsterTypeDef(key){
  return MONSTER_TYPES.find(t => t.key === key) || MONSTER_TYPES[0];
}

function getHeroTypeDef(key){
  return HERO_TYPES.find(t => t.key === key) || HERO_TYPES[0];
}

function pickHeroForMonster(monsterKey){
  const monster = getMonsterTypeDef(monsterKey);
  return getHeroTypeDef(monster.heroKey);
}

function isDesignatedHero(heroKey, monsterKey){
  return getMonsterTypeDef(monsterKey).heroKey === heroKey;
}

function heroDamageAgainst(hero, monsterKey){
  const base = hero.damage ?? HERO_DAMAGE;
  const mult = isDesignatedHero(hero.typeKey || hero.key, monsterKey)
    ? HERO_VS_MONSTER_DAMAGE_MULT
    : HERO_WRONG_MATCH_DAMAGE_MULT;
  return base * mult;
}

initCharacterSprites();
