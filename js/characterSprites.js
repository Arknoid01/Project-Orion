/* ===================== CHARGEMENT & DESSIN DES SPRITES PERSONNAGES ===================== */
// Atlas 3 frames × 4 directions (288×384 px à frame-size 96), aligné sur slice_walker_sheets.py.

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
}

function isCharacterSpriteReady(id){
  const img = characterSpriteImages[id];
  return !!(img && img.complete && img.naturalWidth > 0);
}

function drawCharacterSprite(id, x, y, facing, now, displaySize){
  const img = characterSpriteImages[id];
  if (!img || !img.complete || !img.naturalWidth) return false;

  const frame = Math.floor((now || performance.now()) / CHARACTER_ANIM_FRAME_MS) % CHARACTER_FRAMES;
  const row = CHARACTER_DIRECTION_ROWS[facing] ?? CHARACTER_DIRECTION_ROWS.down;
  const sx = frame * CHARACTER_FRAME_SIZE;
  const sy = row * CHARACTER_FRAME_SIZE;
  const d = displaySize || CHARACTER_DISPLAY_SIZE;

  ctx.drawImage(
    img,
    sx, sy, CHARACTER_FRAME_SIZE, CHARACTER_FRAME_SIZE,
    x - d / 2, y - d + 8, d, d,
  );
  return true;
}

function updateAgentFacing(agent){
  if (agent.col > agent.prevCol) agent.facing = 'right';
  else if (agent.col < agent.prevCol) agent.facing = 'left';
  else if (agent.row > agent.prevRow) agent.facing = 'down';
  else if (agent.row < agent.prevRow) agent.facing = 'up';
  if (!agent.facing) agent.facing = 'down';
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
