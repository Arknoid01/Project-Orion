/* ===================== CONFIG GRILLE / VUE (ISO FIXE) ===================== */
const GRID_COLS = 120;
const GRID_ROWS = 120;

const TILE_W = 64;
const TILE_H = 32;
const OFFSET_X = 3872;
const OFFSET_Y = 80;
const WORLD_WIDTH = 7808;
const WORLD_HEIGHT = 3960;
const ELEVATION_PIXELS = 26; // décalage vertical des entités (bâtiments, unités)
// Relief visuel des tuiles 3D (blocs atlas) — le relief est dans le sprite, pas via étirement.
const TERRAIN_ELEV_BASELINE = 0.28;       // sous ce niveau : ombre de relief minimale
const TERRAIN_BLOCK_HEIGHT_PER_ELEV = 24; // socle procédural optionnel (TERRAIN_USE_BASE_BLOCK)
const TERRAIN_USE_BASE_BLOCK = false;     // false : pas de socle procédural (évite les bandes beiges)
const TERRAIN_TILE_OVERLAP = 4;           // chevauchement entre losanges (masque les joints sans clip)
const TERRAIN_CAP_CLIP_PAD = 0;           // 0 = pas de clip dur sur les textures
const TERRAIN_EXPORT_SCALE = 2;           // PNG 128 px de large = TILE_W × 2

// Vue carte : rotation/inclinaison désactivées (iso bloc stable)
const MAP_ROTATION_ENABLED = false;
const MAP_ROTATION_STEP = 15;
const MAP_TILT_DEG = 0;
const TERRAIN_CANVAS_H = 88;              // hauteur export normalisée (assets/tiles/*.png)
const TERRAIN_FACE_ROW_FRAC = 38 / 88;    // ligne face iso dans le PNG (export normalisé)

/* ===================== ZOOM ===================== */
const ZOOM_DEFAULT = 0.55;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.15;
// Résolution interne du canvas (indépendante du zoom affiché) — limite le lag au zoom.
const RENDER_DPR_CAP = 1.5;
const BUILDING_SPRITE_W = 62; // largeur cible à l'écran (base 1 tuile, −2 px vs TILE_W)

/* ===================== ARBRES DE FORÊT (décor constructible) ===================== */
// Sprites iso « Isometric Asset - Lite » — affichés comme des bâtiments sur le terrain
// forest, masqués dès qu'une route ou un bâtiment occupe la case (pas de blocage de pose).
const FOREST_TREES_ENABLED = true;
const FOREST_TREE_SPRITE = 'assets/trees/tree.png';
const FOREST_TREE_SPRITES = [
  'assets/trees/tree.png',
  'assets/trees/tree2.png',
];
const FOREST_TREE_DENSITY = 1; // arbre sur chaque case forêt libre
const FOREST_TREE_SIZE = 1.1;     // +10 % vs largeur tuile de base (BUILDING_SPRITE_W)

/* ===================== DÉCOR HERBE (tufts, cailloux, souches…) ===================== */
const GRASS_DECOR_ENABLED = true;
const GRASS_DECOR_SPRITES = [
  'assets/grass/grass00.png',
  'assets/grass/rockPath00.png',
  'assets/grass/trunk00.png',
  'assets/grass/rockPile00.png',
  'assets/grass/bush00.png',
  'assets/grass/ruins/arch01.png',
  'assets/grass/ruins/arch02.png',
  'assets/grass/ruins/arch03.png',
  'assets/grass/ruins/arch04.png',
  'assets/grass/ruins/arch05.png',
  'assets/grass/ruins/arch06.png',
  'assets/grass/ruins/pillar04.png',
  'assets/grass/ruins/ruin01.png',
  'assets/grass/ruins/wall01.png',
];
const GRASS_DECOR_CHANCE = 1 / 6; // 1 chance sur 6 qu'un décor apparaisse sur une case herbe libre
const GRASS_DECOR_GRASS_KEEP = 0.7;  // touffes grass00 : −30 %
const GRASS_DECOR_RUINS_KEEP = 0.5;  // ruines : −50 %
const GRASS_DECOR_SIZE = 0.6;     // 60 % de la largeur tuile (petits props)
const GRASS_DECOR_RUINS_SIZE = 0.66; // ruines : +10 % vs GRASS_DECOR_SIZE
// false = bas du losange ; true = centre. lift = remontée en px (négatif = plus haut).
const GRASS_DECOR_ANCHOR_CENTER = false;
const NATURE_DECOR_LIFT = -5;

function natureDecorDrawOpts(){
  if (typeof GRASS_DECOR_ANCHOR_CENTER === 'boolean' && GRASS_DECOR_ANCHOR_CENTER){
    return { lift: 0, anchorCenter: true };
  }
  return { lift: typeof NATURE_DECOR_LIFT === 'number' ? NATURE_DECOR_LIFT : -5 };
}

/* ===================== OVERLAY BLÉ (épis sur terrain wheat) ===================== */
const WHEAT_CROPS_ENABLED = true;
const WHEAT_CROP_SPRITE = 'assets/wheat/wheat_crop.png';
const WHEAT_CROP_DENSITY = 1;   // 1 = 100 % des cases blé libres
const WHEAT_CROP_SIZE = 0.4;    // 0.6 × 0.67 (−33 %)

/* ===================== DEFINITIONS BATIMENTS ===================== */
// validTerrain: terrain requis sous le bâtiment
// produces / consumes : ressource produite/consommée par tick
// storageBonus : bonus de capacité de stockage apporté à la ville
// isService / range / capacity : bâtiments à walker (voir walkers.js).
// range = longueur max du trajet de patrouille (en cases de route), capacity = nb de
// maisons desservies au maximum par ce bâtiment.
// Économie : cost = prix de pose (drachmes), upkeep = entretien par tick (drachmes),
// workers = postes à pourvoir (uniquement l'industrie : voir labor.js).
// Chaînes de production : un bâtiment "produces" une ressource (à partir du terrain
// ou en "consumes"ant une ressource intermédiaire). Ex. olives -> huile, raisin -> vin.
const BUILDING_DEFS = {
  // ---- Industrie : matières premières (depuis le terrain) ----
  farm:      { name:'building.farm',      icon:'🌾', color:'#c9a227', validTerrain:'wheat',  produces:'wheat',  rate:2.0, sprite:'assets/buildings/farm.png', cost:70, upkeep:0.5, workers:5 },
  quarry:    { name:'building.quarry',    icon:'⛏️', color:'#9aa5ab', validTerrain:'marble', produces:'marble', rate:1.1, sprite:'assets/buildings/quarry.png', cost:85, upkeep:0.5, workers:5 },
  oliveGrove:{ name:'building.oliveGrove',icon:'🫒', color:'#7a8b3a', validTerrain:'grass',  produces:'olives', rate:1.35, sprite:'assets/buildings/oliveGrove.png', cost:65, upkeep:0.5, workers:4 },
  vineyard:  { name:'building.vineyard',  icon:'🍇', color:'#6b3a6b', validTerrain:'grass',  produces:'grapes', rate:1.35, sprite:'assets/buildings/vineyard.png', cost:65, upkeep:0.5, workers:4 },
  sheepFarm: { name:'building.sheepFarm', icon:'🐑', color:'#cbc6b8', validTerrain:'grass',  produces:'wool',   rate:1.0, sprite:'assets/buildings/sheepFarm.png', cost:75, upkeep:0.5, workers:4 },
  fishery:   { name:'building.fishery',   icon:'🐟', color:'#4a8fad', validTerrain:'water',  produces:'fish',   rate:1.2, sprite:'assets/buildings/fishery.png', cost:70, upkeep:0.5, workers:4 },
  charcoalPit:{ name:'building.charcoalPit',icon:'🪵', color:'#4a4035', validTerrain:'forest', produces:'coal',   rate:0.9, sprite:'assets/buildings/charcoalPit.png', cost:90, upkeep:0.5, workers:5 },
  // ---- Industrie : ateliers de transformation (consomment une matière) ----
  workshop:  { name:'building.workshop',  icon:'⚒️', color:'#b5651d', validTerrain:'grass',  consumes:{marble:1}, produces:'sculpture', rate:1.05, sprite:'assets/buildings/workshop.png', cost:140, upkeep:1, workers:7 },
  oilPress:  { name:'building.oilPress',  icon:'🛢️', color:'#b9a93a', validTerrain:'grass',  consumes:{olives:1}, produces:'oil',       rate:1.05, sprite:'assets/buildings/oilPress.png', cost:100, upkeep:0.5, workers:5 },
  winery:    { name:'building.winery',    icon:'🍷', color:'#7d2b46', validTerrain:'grass',  consumes:{grapes:1}, produces:'wine',      rate:1.05, sprite:'assets/buildings/winery.png', cost:100, upkeep:0.5, workers:5 },
  weaver:    { name:'building.weaver',    icon:'🧵', color:'#9a8b72', validTerrain:'grass',  consumes:{wool:1},   produces:'clothing', rate:0.95, sprite:'assets/buildings/weaver.png', cost:115, upkeep:0.5, workers:5 },
  foundry:   { name:'building.foundry',   icon:'🔥', color:'#8b6914', validTerrain:'grass',  consumes:{coal:1, marble:0.4}, produces:'bronze', rate:0.9, sprite:'assets/buildings/foundry.png', cost:155, upkeep:1, workers:6 },
  armory:    { name:'building.armory',    icon:'🗡️', color:'#5c6b7a', validTerrain:'grass',  consumes:{bronze:1, clothing:0.5}, produces:'arms', rate:0.85, cost:195, upkeep:1, workers:7, isArmory:true, sprite:'assets/buildings/armory.png' },
  // ---- Stockage ----
  granary:   { name:'building.granary',   icon:'🏺', color:'#8a5a3b', validTerrain:'grass',  storageBonus:{wheat:150}, sprite:'assets/buildings/granary.png', cost:55, upkeep:0.5 },
  warehouse: { name:'building.warehouse', icon:'📦', color:'#9c7b4a', validTerrain:'grass',  storageBonus:{ marble:40, sculpture:30, olives:80, oil:100, grapes:80, wine:100, wool:80, clothing:60, fish:60, coal:50, bronze:40, arms:30 }, sprite:'assets/buildings/warehouse.png', cost:70, upkeep:0.5 },
  // ---- Commerce extérieur ----
  // Exporte chaque mois les marchandises sélectionnées (voir trade.js). Plusieurs
  // comptoirs cumulent leur débit d'export.
  tradingPost:{ name:'building.tradingPost', icon:'⚖️', color:'#b08d57', validTerrain:'grass', isTradePost:true, cost:175, upkeep:1, workers:4, sprite:'assets/buildings/tradingPost.png' },
  // ---- Défense mythologique ----
  // Permet d'invoquer un héros quand un monstre menace la cité (voir creatures.js).
  heroTemple: { name:'building.heroTemple', icon:'⚔️', color:'#9a4a4a', validTerrain:'grass', isHeroTemple:true, cost:210, upkeep:1.5, sprite:'assets/buildings/heroTemple.png' },
  barracks:   { name:'building.barracks',   icon:'🛡️', color:'#6a6f7a', validTerrain:'grass', isBarracks:true, cost:175, upkeep:1, workers:6, sprite:'assets/buildings/barracks.png' },
  // ---- Services à walker (desservent les maisons à portée) ----
  fountain:  { name:'building.fountain',  icon:'⛲', color:'#5a8fae', validTerrain:'grass',  isService:true, serviceType:'water',    range:18, capacity:6, sprite:'assets/buildings/fountain.png', cost:55, upkeep:0.5 },
  market:    { name:'building.market',    icon:'🏪', color:'#c97b3d', validTerrain:'grass',  isService:true, serviceType:'market',   range:18, capacity:6, sprite:'assets/buildings/market.png', cost:85, upkeep:0.5 },
  temple:    { name:'building.temple',    icon:'🛕', color:'#c4b27a', validTerrain:'grass',  isService:true, serviceType:'religion', range:18, capacity:6, sprite:'assets/buildings/temple.png', cost:105, upkeep:1 },
  clinic:    { name:'building.clinic',    icon:'⚕️', color:'#9ec2c4', validTerrain:'grass',  isService:true, serviceType:'health',   range:18, capacity:6, sprite:'assets/buildings/clinic.png', cost:105, upkeep:1 },
  taxOffice: { name:'building.taxOffice', icon:'💰', color:'#b8943a', validTerrain:'grass',  isService:true, serviceType:'tax',      range:18, capacity:6, cost:105, upkeep:1, sprite:'assets/buildings/taxOffice.png' },
  watchtower:{ name:'building.watchtower',icon:'🗼', color:'#a05a3a', validTerrain:'grass',  isService:true, serviceType:'fire',     range:18, capacity:6, cost:105, upkeep:1, sprite:'assets/buildings/watchtower.png' },
  // ---- Habitation ----
  maison:    { name:'building.maison',    icon:'🏠', color:'#c9b68f', validTerrain:'grass',  isHouse:true, cost:30 },
  // ---- Décorations : diffusent du "cachet" (beauty) autour d'elles (voir beauty.js) ----
  statue:    { name:'building.statue',    icon:'🗿', color:'#cdc7ba', validTerrain:'grass', isDecoration:true, beauty:6, range:2, cost:85, upkeep:0.5, sprite:'assets/buildings/statue.png' },
  garden:    { name:'building.garden',    icon:'🌳', color:'#6f9a4c', validTerrain:'grass', isDecoration:true, beauty:4, range:3, cost:40 },
  colonnade: { name:'building.colonnade', icon:'🏛️', color:'#e3ddcf', validTerrain:'grass', isDecoration:true, beauty:5, range:2, cost:70, upkeep:0.5, sprite:'assets/buildings/colonnade.png' },
  // ---- Temples monumentaux (2×2 cases) : alliance avec un dieu, avantages puissants ----
  // Voir monuments.js. Coût propre à chaque dieu (GODS), affiché dans la modale de choix.
  grandTemple: { name:'building.grandTemple', icon:'🏛️', color:'#d4af37', validTerrain:'grass', isMonument:true, footprint:2, spriteScale:118,
    sprite:'assets/buildings/grandTemple.png', upkeep:2.5 },
};

// Biens distribués par les marchés — consommation PAR JOUR DE JEU (voir market.js).
// Chaque bien consomme 'perHouse' unités par maison et par jour lorsque le besoin
// correspond au palier actuel OU au palier suivant (voir houseMarketNeeds dans houses.js).
const MARKET_GOODS = [
  { need:'food', resource:'wheat', perHouse:1 },
  { need:'fish', resource:'fish', perHouse:1 },
  { need:'oil',  resource:'oil',   perHouse:1 },
  { need:'wine', resource:'wine',  perHouse:1 },
  { need:'clothing', resource:'clothing', perHouse:1 },
];

/* ===================== COMMERCE EXTERIEUR ===================== */
// EXPORT_GOODS = source unique des prix de référence. TRADE_BASE_PRICE et IMPORT_GOODS
// en dérivent (voir ci-dessous). Les cités du monde appliquent ensuite leur propre marge
// aléatoire (world.js). Une fois par mois, chaque comptoir vend jusqu'à
// EXPORT_QTY_PER_POST unités de chaque bien activé (trade.js).
const EXPORT_GOODS = [
  { resource:'wheat',     price:4 },
  { resource:'olives',    price:5 },
  { resource:'grapes',    price:5 },
  { resource:'oil',       price:10 },
  { resource:'wine',      price:13 },
  { resource:'wool',      price:9 },
  { resource:'clothing',  price:15 },
  { resource:'fish',      price:7 },
  { resource:'coal',      price:8 },
  { resource:'bronze',    price:18 },
  { resource:'arms',      price:24 },
  { resource:'marble',    price:7 },
  { resource:'sculpture', price:30 },
];
const EXPORT_QTY_PER_POST = 15;
const IMPORT_MARKUP = 1.45; // prix d'import de référence = export × markup
const TRADE_BASE_PRICE = Object.fromEntries(EXPORT_GOODS.map(g => [g.resource, g.price]));
const IMPORT_GOODS = EXPORT_GOODS.map(g => ({
  resource: g.resource,
  price: Math.round(g.price * IMPORT_MARKUP),
}));
const IMPORT_QTY_PER_POST = 12;
const TRADE_GOODS = EXPORT_GOODS.map(g => g.resource);

/* ===================== CARTE DU MONDE & CITES ===================== */
// À chaque nouvelle partie, on génère WORLD_CITY_COUNT cités voisines : nom + position
// (sur la carte du monde) + profil commercial (ce qu'elles ACHÈTENT = on leur exporte ;
// ce qu'elles VENDENT = on leur importe) + relation diplomatique. Ces mêmes cités
// serviront aussi aux combats (invasions). Voir world.js.
const WORLD_CITY_COUNT = 6;

// Effet de la relation sur les prix : à 100 de relation, +20% au prix de vente et −15%
// au prix d'achat ; effet inverse à 0. Linéaire autour de 50 (neutre).
const TRADE_RELATION_EXPORT_BONUS = 0.20;
const TRADE_RELATION_IMPORT_DISCOUNT = 0.15;

/* ===================== MILITAIRE ===================== */
// L'armée se mesure en POINTS de troupe, calculés en temps réel : il faut au moins une
// caserne, puis le potentiel = min(casernes × TROOPS_PER_BARRACKS, population × TROOPS_PER_POP).
// Plus la cité est peuplée, plus l'armée peut être nombreuse -- mais elle coûte un
// entretien mensuel (or + blé) proportionnel. Si l'entretien n'est pas payé, le moral
// chute et les points de combat effectifs baissent. Voir military.js.
const TROOPS_PER_BARRACKS = 30;   // points de troupe soutenus par caserne
const TROOPS_PER_POP = 0.4;       // plafond lié à la population (40 % des habitants)
const ARMY_UPKEEP_GOLD = 1.35;    // drachmes/mois par point de troupe
const ARMY_UPKEEP_WHEAT = 1.8;    // blé/mois par point de troupe
const ARMY_UPKEEP_ARMS = 0.10;    // armes/mois par point de troupe (armurerie)
const ARMORY_TROOP_BONUS = 8;     // points de troupe par armurerie approvisionnée

// Puissance militaire des cités voisines (générée à la création, voir world.js). Sert de
// score adverse lors d'une attaque : on gagne si nos points sont strictement supérieurs.
const WORLD_CITY_BASE_POWER = 45;        // puissance de référence
const TRIBUTE_PER_POWER = 6;             // tribut immédiat (drachmes) par point de puissance vaincue
const TRIBUTE_MONTHLY_PER_POWER = 0.4;   // tribut mensuel versé par une cité conquise
const REPRISAL_CHANCE = 0.5;             // probabilité de représailles après une défaite

// Pool de noms de cités grecques antiques. 6 tirés au hasard (sans doublon) par partie.
const WORLD_CITY_NAMES = [
  'Argos', 'Mycènes', 'Délos', 'Milet', 'Éphèse', 'Rhodes', 'Syracuse', 'Byzance',
  'Pergame', 'Halicarnasse', 'Cnossos', 'Mégare', 'Élis', 'Tirynthe', 'Naxos', 'Samos',
  'Chios', 'Cumes', 'Tarente', 'Massalia', 'Olynthe', 'Abdère', 'Égine', 'Phocée', 'Cyrène',
];

// Couleurs de repli, utilisées tant que le sprite de terrain n'est pas chargé.
const TERRAIN_COLORS = {
  grass:  '#7ea24c',
  wheat:  '#d4b35c',
  marble: '#cfcac0',
  water:  '#3f7ea6',
  sand:   '#d4c4a0',
  forest: '#4a6b38',
  rock:   '#8a8580',
  hill:   '#6d9348',
  road:   '#9c8868',
};

const TERRAIN_SPRITES = {
  grass:  'assets/tiles/grass.png',
  wheat:  'assets/tiles/wheat.png',
  marble: 'assets/tiles/marble.png',
  water:  'assets/tiles/water.png',
  sand:   'assets/tiles/sand.png',
  forest: 'assets/tiles/forest.png',
  rock:   'assets/tiles/rock.png',
  hill:   'assets/tiles/hill.png',
};

const ROAD_SPRITE_PATH = 'assets/tiles/road.png';

// Variantes depuis tiles_pretes.zip (losanges iso du pack nature)
const TERRAIN_TILE_VARIANTS = {
  grass: Array.from({ length: 10 }, (_, i) =>
    `assets/textures_source/tiles_pretes/grass${i + 1}.png`),
  sand: Array.from({ length: 4 }, (_, i) =>
    `assets/textures_source/tiles_pretes/dirt${i + 1}.png`),
};

// Sol : cubes texturés PNG (simple) OU calques procéduraux (legacy)
const TERRAIN_TEXTURED_CUBES = true;     // piles de blocs PNG — approche simple
const TERRAIN_CUBE_FULL_FACES = true;    // chaque niveau = cube entier (cap + parois), empilés
const TERRAIN_BLOCK_SIDE_H = 32;         // hauteur paroi uniforme (alignement empilement)

// Textures plates Comfy 512×512 → import_flat_textures.py → faces 64×64
//
// Modes rendu (empilement Lego validé) :
//   Nature pur     → TERRAIN_USE_FLAT_FACES=false, TERRAIN_FLAT_BLOCK_KEYS=[]
//   Hybride Comfy  → TERRAIN_USE_FLAT_FACES=false, TERRAIN_FLAT_BLOCK_KEYS=['stone', ...]
//   Full flat      → TERRAIN_USE_FLAT_FACES=true  (expérimental — casse l'empilement si incomplet)
//
const TERRAIN_USE_FLAT_FACES = false;
// [] = PNG nature uniquement (mode validé) — remplir pour tester Comfy bloc par bloc
const TERRAIN_FLAT_BLOCK_KEYS = [];
const TERRAIN_FLAT_SOURCE_PX = 512;      // taille export ComfyUI
const TERRAIN_FLAT_FACE_PX = 64;         // taille en jeu (losange 64×32, face lat. 64×16)
const TERRAIN_FLAT_TEXTURE_DIR = 'assets/textures/flat/game/';
const TERRAIN_FLAT_TEXTURE_VERSION = '20260630-nature'; // bump après import Comfy
// Mapping type Minecraft : top / left / right (noms sans .png)
const TERRAIN_BLOCK_FACES = {
  grass:  { top: 'grass_top',  left: 'dirt',  right: 'dirt' },
  dirt:   { top: 'dirt',       left: 'dirt',  right: 'dirt' },
  stone:  { top: 'stone',      left: 'stone', right: 'stone' },
  sand:   { top: 'sand_top',   left: 'sand',  right: 'sand' },
  forest: { top: 'forest_top', left: 'dirt',  right: 'dirt' },
};

const TERRAIN_USE_BLOCKS = true;
const TERRAIN_LAYERED_RENDER = true;
const TERRAIN_TEXTURE_LAYER = false;     // pas de calque cap séparé en mode cubes
const TERRAIN_CAP_USE_FLAT_SPRITES = false;

const TERRAIN_PROCEDURAL_CAPS = false;
const TERRAIN_POLIS_CLIFF_WALLS = false;
const TERRAIN_PROCEDURAL_3D = false;
const TERRAIN_CAP_DEPTH_RIM = false;
const TERRAIN_CAP_DETAIL_DENSITY = 1.0;
const TERRAIN_CAP_EDGE_FEATHER = true;
const TERRAIN_CONTACT_SHADOW = true;
// Texture de sommet selon la hauteur de pile (biomes listés dans TERRAIN_LEVEL_CAP_BIOMES)
const TERRAIN_LEVEL_CAP_MAP = { 2: 'hill', 3: 'hill' };
const TERRAIN_LEVEL_CAP_BIOMES = ['grass', 'hill', 'wheat'];
const TERRAIN_CLIFF_DARKEN = 0.12;       // assombrissement parois falaise
const TERRAIN_CLIFF_AO = 0.24;           // ombre interne bas de paroi (dans la face)
const TERRAIN_CLIFF_SHADOW = false;      // pas d'ombres portées flottantes
const TERRAIN_CUBE_WALL_H = 16;          // hauteur paroi latérale d'un cube (px)
const TERRAIN_BLOCK_MAX_LEVEL = 3;       // 0=eau, 1=plaine, 2=colline, 3=montagne
const LEGO_BRICK_STEP = 32;              // distance entre sommets de briques empilées (= TILE_H)
const TERRAIN_BLOCK_DRAW_W = 64;         // largeur d'une brique à l'écran
const TERRAIN_BLOCK_CLEAN_WALLS = true;  // parois procédurales uniformes (Mykonos)
const TERRAIN_BLOCK_SIDE_WALL_MIN = 8;
const TERRAIN_BLOCK_SIDE_WALL_MAX = 16;
const TERRAIN_CACHE_SCALE = 2;           // cache terrain HiDPI (1 = natif)
const TERRAIN_BLOCK_FILL = 'dirt';        // brique sous le sommet
const TERRAIN_BLOCK_SPRITES = {
  grass:  'assets/tiles/blocks/grass.png',
  dirt:   'assets/tiles/blocks/dirt.png',
  stone:  'assets/tiles/blocks/stone.png',
  sand:   'assets/tiles/blocks/sand.png',
  forest: 'assets/tiles/blocks/forest.png',
};
// terrain jeu → clé bloc (sommet de pile) ; wheat/marble = teinte dérivée (cf. TERRAIN_BLOCK_TINTS)
const TERRAIN_BLOCK_MAP = {
  grass: 'grass', wheat: 'wheat', forest: 'forest', hill: 'grass',
  sand: 'sand', water: null, rock: 'stone', marble: 'marble',
};
// Parois latérales selon biome / niveau de pile
const TERRAIN_BLOCK_FILL_MAP = {
  rock: 'stone', marble: 'stone', sand: 'dirt', hill: 'dirt', forest: 'dirt',
};
const TERRAIN_BLOCK_LEVEL_FILL = {
  3: 'stone',   // montagne (niveau max) → parois roche
  2: 'dirt',    // colline
};
// Teintes dérivées (base PNG + overlay) — blé = herbe jaune clair
const TERRAIN_BLOCK_TINTS = {
  wheat:  { base: 'grass', color: 'rgba(255, 238, 155, 0.58)' },
  marble: { base: 'stone', color: 'rgba(245, 242, 235, 0.40)' },
};

// Falaises auto (tools/extract_cliffs_from_nature_pack.py) — parois seules 64×48
const CLIFF_SPRITE_H = 48;
const CLIFF_LEVEL_STEP = 1;              // delta de niveau min. pour afficher une paroi
const CLIFF_DRAW_PAD = 3;                // chevauchement entre parois voisines
const CLIFF_SPRITE_IDS = ['n', 'e', 's', 'w', 'ne', 'se', 'sw', 'nw'];
const CLIFF_SPRITES = Object.fromEntries(CLIFF_SPRITE_IDS.map(id => [
  id, `assets/textures_source/cliffs/cliff_${id}.png`,
]));

const BASE_CAP = {
  wheat:60, marble:60, sculpture:30, olives:45, oil:45, grapes:45, wine:45, wool:45,
  clothing:40, fish:50, coal:40, bronze:30, arms:25,
};

// Stocks de départ (complément au trésor) — couvrent ~1–2 jours d'une petite cité.
const STARTING_RESOURCES = {
  wheat:35, marble:20, sculpture:2, olives:12, oil:10, grapes:12, wine:6, wool:6,
  clothing:0, fish:6, coal:0, bronze:0, arms:0,
};

/* ===================== NIVEAUX DE MAISON ===================== */
// requires : liste de clés de besoin (voir NEED_CHECKERS dans houses.js).
// route/water/food/oil/wine/wool/religion/health/fire/beauty — voir beauty.js pour le cachet.
// sprite : art réel par niveau (assets/houses/). Le niveau 'domaine' n'a pas encore
// de sprite dédié et réutilise le plus haut niveau disponible (voir render.js).
// Progression : chaque ressource/service est introduit à un palier précis, et le
// palais exige « un peu de tout ». Récap des nouveautés par niveau :
//   decent    -> +eau
//   villa     -> +nourriture
//   domaine   -> +huile, +beauté
//   residence -> +vin, +religion
//   palais    -> +laine, +santé, +protection incendie (donc TOUT : route, eau,
//                 nourriture, huile, vin, laine, religion, santé, beauté, feu)
const HOUSE_LEVELS = [
  { key:'hut',       nameKey:'houseLevel.hut',       population:2,  requires:[], sprite:'assets/houses/hut.png' },
  { key:'house',     nameKey:'houseLevel.house',     population:5,  requires:['route'], sprite:'assets/houses/house.png' },
  { key:'decent',    nameKey:'houseLevel.decent',    population:9,  requires:['route','water'], sprite:'assets/houses/decent.png' },
  { key:'villa',     nameKey:'houseLevel.villa',     population:15, requires:['route','water','food'], sprite:'assets/houses/villa.png' },
  { key:'domaine',   nameKey:'houseLevel.domaine',   population:24, requires:['route','water','food','oil','beauty'] },
  { key:'residence', nameKey:'houseLevel.residence', population:34, requires:['route','water','food','oil','wine','fish','religion','beauty'], sprite:'assets/houses/residence.png' },
  { key:'palais',    nameKey:'houseLevel.palais',    population:48, requires:['route','water','food','oil','wine','fish','clothing','religion','health','fire','beauty'], sprite:'assets/houses/palais.png' },
];

/* ===================== EMBELLISSEMENT (CACHET) ===================== */
// Cachet minimal accumulé sur la case d'une maison pour satisfaire le besoin 'beauty'
// (voir beauty.js pour la diffusion, houses.js pour la vérification du besoin).
const BEAUTY_THRESHOLD = 5;

/* ===================== ICONES DE STATUT (au-dessus des maisons) ===================== */
// Voir houses.js (getHouseStatusIcons) et render.js (drawHouseStatusIcons).
const NEED_ICONS = {
  route:    '🛣️',
  water:    '⛲',
  food:     '🍴',
  oil:      '🛢️',
  wine:     '🍷',
  wool:     '🐑',
  clothing: '👕',
  fish:     '🐟',
  religion: '🛕',
  health:   '🤢',
  fire:     '🔥',
  beauty:   '🌲',
};

/* ===================== ECONOMIE — CHAINES & EQUILIBRAGE ===================== */
// Chaînes complètes (matière → transformation → besoin maison / commerce / dieux) :
//   blé      : ferme → marché (nourriture) → armée (entretien mensuel)
//   marbre   : carrière → atelier → sculpture → offrandes, festivals, héros, temples
//   olives   : verger → pressoir → huile → marché (domaine+) → commerce
//   raisin   : vignoble → cave → vin → marché (résidence+) → diplomatie, festivals
//   laine    : bergerie → tisserand → vêtements → marché (palais)
//   poisson  : pêcherie (eau) → marché (résidence+)
//   charbon  : charbonnière (forêt) + marbre → fonderie → bronze
//   armes    : armurerie (bronze + vêtements) → entretien casernes
// Ratios visés (emploi 100 %, taux d'impôt 45 %, cycle JOURNALIER) :
//   1 ferme ≈ 19 blé/j → ~19 villas · les maisons « correctes » consomment aussi du blé
//     (besoin anticipé du palier villa, voir houseMarketNeeds)
//   1 verger + 1 pressoir ≈ 13 huile/j · 1 vignoble + 1 cave ≈ 13 vin/j
//   1 pêcherie ≈ 12 poisson/j · 1 carrière + 1 atelier ≈ 11 sculpture/j
// Marchés : 1 unité/bien/maison/jour. Croissance/émigration : 1 tirage/jour.
// Impôts/entretien/production : chaque tick (~1 s). Commerce/armée : chaque mois.
// Cité de départ type (~20 hab., 4 services + 1 ferme) : +8 à +15 dr./jour net.
const STARTING_TREASURY = 1650;
const TAX_PER_POP = 0.25;        // conservé pour compatibilité (non utilisé : voir TAX_BASE_PER_POP)
const ROAD_COST = 4;             // coût de pose d'une case de route (pas un BUILDING_DEFS)
const DEMOLISH_REFUND_RATE = 0.5; // fraction du coût de construction remboursée à la démolition

/* ===================== IMPOTS (BUREAU DES IMPOTS) ===================== */
// Contrairement à l'ancien système (taxe globale fixe sur toute la population),
// seules les maisons DESSERVIES par un bureau des impôts (walker, serviceType='tax')
// paient — voir economy.js. Le taux est réglable par le joueur (panneau Gouvernement),
// et influence trois choses :
//   - collecte    : proportionnelle directe au taux (voir taxCollectionRate)
//   - efficacité  : pénalise la production si le taux est haut (voir taxes.js)
//   - croissance  : ralentit l'évolution des maisons si le taux est haut (voir houses.js)
const TAX_BASE_PER_POP = 0.42;    // drachmes/habitant/tick desservi, AU TAUX MAXIMUM (1.0)
const TAX_RATE_DEFAULT = 0.45;    // taux neutre au démarrage
const TAX_EFFICIENCY_AT_ZERO = 1.12;
const TAX_EFFICIENCY_AT_MAX  = 0.72;
const TAX_GROWTH_CHANCE_AT_ZERO = 0.22;  // probabilité d'évolution PAR JOUR, taux 0
const TAX_GROWTH_CHANCE_AT_MAX  = 0.04;  // probabilité d'évolution PAR JOUR, taux 1

/* ===================== IMMIGRATION / EMIGRATION ===================== */
// Voir migration.js pour la logique (cityAttractiveness, growthChance, emigrationChance).
const GROWTH_FAVOR_INFLUENCE = 0.12;
const EMIGRATION_THRESHOLD = 0.38;
const EMIGRATION_STRENGTH = 0.22;
const MIGRANT_MOVE_EVERY_TICKS = 1;   // vitesse des colons sur la route (voir migrationAgents.js)
// Point d'entrée/sortie fixe au bord sud de la carte (colons qui arrivent et repartent).
const MIGRANT_ENTRY_COL = Math.floor(GRID_COLS / 2);
const MIGRANT_ENTRY_ROW = GRID_ROWS - 1;

/* ===================== TROUPES VISUELLES (CARTE) ===================== */
const TROOPS_NPCS_PER_POWER = 6;      // 1 soldat visible par tranche de 6 pts de puissance
const TROOPS_MOVE_EVERY_TICKS = 1;

/* ===================== INVASIONS ===================== */
const INVASION_MOVE_EVERY_TICKS = 2;
const INVASION_SPAWN_CHANCE = 0.003;
const INVASION_MIN_DAY = 10;

/* ===================== GENERATION DE CARTE PROCEDURALE ===================== */
// Style : 'mixed' (aléatoire), 'continent' (terre continue), 'island' (île + couloir vers le bord sud).
const MAP_LAND_STYLE = 'mixed';
const MAP_ISLAND_CHANCE = 0.30;
const MAP_LAND_BASE_BIAS = 0.06;           // relève les plaines → moins de cases eau
const MAP_NOISE_SCALE = 0.021;             // ~ moitié pour conserver la taille des reliefs à 120×120
const MAP_HEIGHT_OCTAVES = 6;
const MAP_RIDGE_STRENGTH = 0.52;           // crêtes plus marquées
const MAP_DETAIL_STRENGTH = 0.07;
const MAP_RANGE_STRENGTH = 0.24;           // chaînes montagneuses à grande échelle
const MAP_RANGE_SCALE_MUL = 0.46;
const MAP_MOUNTAIN_CENTER_BOOST = 0.08;    // léger renfort central (massifs via bruit ridgé)
const MAP_DOMAIN_WARP = 0.40;
const MAP_ISLAND_STRENGTH = 0.88;
const MAP_ISLAND_RADIUS = 0.48;            // île plus large (moins d'océan autour)
const MAP_VALLEY_STRENGTH = 0.10;
const MAP_HEIGHT_SMOOTH_PASSES = 1;
const MAP_WATER_THRESHOLD = 0.20;          // légèrement abaissé (plus de terre jouable)
const MAP_SAND_THRESHOLD = 0.33;
const MAP_MARBLE_THRESHOLD = 0.62;         // marbre un peu plus bas → massifs plus larges
const MAP_HILL_THRESHOLD = 0.44;
const MAP_HILL_MAX = 0.64;
const MAP_ROCK_SLOPE = 0.088;
const MAP_COAST_BEACH_SLOPE = 0.046;
const MAP_FOREST_MOISTURE = 0.52;
const MAP_FOREST_MIN_HEIGHT = 0.26;        // forêts de plaine et pied de montagne
const MAP_FOREST_MAX_HEIGHT = 0.50;        // pas de forêt en altitude
const MAP_FOREST_MAX_SLOPE = 0.048;
const MAP_WHEAT_MOISTURE = 0.46;
const MAP_WHEAT_MIN_HEIGHT = 0.26;
const MAP_WHEAT_MAX_HEIGHT = 0.42;         // plaines uniquement
const MAP_PLAIN_MARBLE_CHANCE = 0.028;     // carrières isolées en plaine près des monts
const MAP_RAIN_SHADOW = 0.26;
const MAP_RAIN_SHADOW_STEPS = 20;
const MAP_WIND_X = 0.62;
const MAP_WIND_Y = 0.28;
const MAP_BIOME_SMOOTH = 2;
const MAP_BIOME_SMOOTH_MAJORITY = 6;
const MAP_FLATTEN_RADIUS = 12;
const MAP_FLATTEN_STRENGTH = 0.34;
const MAP_PLAYABLE_ELEVATION = 0.36;
const MAP_EDGE_BORDER_WIDTH = 4;           // défaut (île) — voir MAP_*_EDGE_BORDER
const MAP_CONTINENT_EDGE_BORDER = 0;       // continent : pas d'anneau d'eau forcé
const MAP_ISLAND_EDGE_BORDER = 3;
const MAP_EDGE_WATER_LEVEL = 0.06;
const MAP_ENTRY_CORRIDOR_WIDTH = 4;        // largeur moyenne de l'isthme d'accès
const MAP_LAND_BRIDGE_LIFT = 0.34;
const MAP_LAND_BRIDGE_WIND = 0.38;         // sinuosité du chemin d'accès
const MAP_MOUNTAIN_MIN_LAND = 0.28;        // masque île min. pour les massifs
const MAP_MOUNTAIN_MIN_HEIGHT = 0.27;      // pas de montagne sous ce seuil (eau/littoral)

/* ===================== MAINTENANCE (INCENDIES / MALADIES) ===================== */
// Voir maintenance.js. Premiers chiffres, pas encore équilibrés en conditions réelles
// de jeu -- à ajuster une fois que tu auras une vraie ville qui tourne longtemps.
// Une maison NON desservie (fire/health) risque un sinistre à chaque tick ; une maison
// desservie garde un risque résiduel très faible, jamais totalement nul.
const FIRE_CHANCE_UNCOVERED = 0.0006;
const FIRE_CHANCE_COVERED = 0.00004;
const DISEASE_CHANCE_UNCOVERED = 0.0006;
const DISEASE_CHANCE_COVERED = 0.00004;

/* ===================== PALETTES MAISONS PROCEDURALES ===================== */
const HOUSE_WALL_COLORS  = ['#d8c9a3', '#c9b68f', '#bfa77d', '#e3d6b8'];
const HOUSE_ROOF_COLORS  = ['#a8512f', '#8c3f24', '#9c6b3f', '#6f5a4a'];
const HOUSE_TRIM_COLORS  = ['#a8472f', '#5d6b3a', '#7d6b4a'];
const HOUSE_ROOF_SHAPES  = ['pyramid', 'dome', 'flat'];

/* ===================== SPRITES PERSONNAGES (atlas 3×4, cf. tools/slice_walker_sheets.py) ===================== */
const CHARACTER_FRAME_SIZE = 96;
const CHARACTER_FRAMES = 3;
const CHARACTER_DIRECTION_ROWS = { up: 0, left: 1, down: 2, right: 3 };
// Chaque pas sur la grille iso est une diagonale à l'écran (tileCenter : x∝col−row, y∝col+row).
// Clé = diagonale iso. facing = rang LPC ; mirror = retourner le sprite si le profil
// est du mauvais côté pour cette diagonale (SW/left est la référence « parfaite »).
const ISO_DIAGONAL_FACING = {
  se: { facing: 'left',  mirror: true  }, // col+1  → bas-droite ✓
  sw: { facing: 'left',  mirror: false }, // row+1  → bas-gauche ✓
  nw: { facing: 'left',  mirror: false }, // col−1  → haut-gauche ✓
  ne: { facing: 'left',  mirror: true  }, // row−1  → haut-droite (miroir de NW)
};
// Décalage vertical des pieds sur la tuile iso (ancrage du sprite).
const CHARACTER_ISO_FOOT_PAD = 10;
const CHARACTER_DISPLAY_SIZE = 44;       // repli générique
const WALKER_DISPLAY_SIZE = 30;        // citoyens / services (plus petits)
const MIGRANT_DISPLAY_SIZE = 32;       // colons arrivants / partants (sac à dos)
const MIGRANT_SPRITE_PATH = 'assets/characters/migrants/migrant.png';
const HERO_DISPLAY_SIZE = 50;          // héros (un peu plus grands)
const GOD_DISPLAY_SIZE = 64;           // dieux errants (netement plus grands)
const MONSTER_DISPLAY_SIZE = 44;       // monstres
const CHARACTER_ANIM_FRAME_MS = 120;

// Sprites LPC : python tools/generate_lpc_characters.py  (lpc_repo requis)
// Atlas 3×4 @ 96 px — voir tools/lpc_compositor.py
const SERVICE_WALKER_SPRITES = {
  water:    'assets/characters/walkers/water.png',
  market:   'assets/characters/walkers/market.png',
  religion: 'assets/characters/walkers/religion.png',
  health:   'assets/characters/walkers/health.png',
  tax:      'assets/characters/walkers/tax.png',
  fire:     'assets/characters/walkers/fire.png',
};

// Dieux errants (temples monumentaux) — atlas LPC dans assets/characters/gods/
const GOD_SPRITES = {
  demeter:  'assets/characters/gods/demeter.png',
  zeus:     'assets/characters/gods/zeus.png',
  athena:   'assets/characters/gods/athena.png',
  dionysos: 'assets/characters/gods/dionysos.png',
  poseidon: 'assets/characters/gods/poseidon.png',
  apollo:   'assets/characters/gods/apollon.png',
  hera:     'assets/characters/gods/hera.png',
  ares:     'assets/characters/gods/ares.png',
  hermes:   'assets/characters/gods/hermes.png',
  artemis:  'assets/characters/gods/artemis.png',
  hephaistos:'assets/characters/gods/hephaistos.png',
  aphrodite:'assets/characters/gods/aphrodite.png',
  hestia:   'assets/characters/gods/hestia.png',
  hades:    'assets/characters/gods/hades.png',
};

// Repli générique si un atlas métier n'est pas encore découpé.
const WALKER_SPRITE_PATH = 'assets/characters/walkers/water.png';
const WALKER_FRAME_SIZE = CHARACTER_FRAME_SIZE;
const WALKER_FRAMES_PER_CYCLE = CHARACTER_FRAMES;
const WALKER_DIRECTION_ROWS = CHARACTER_DIRECTION_ROWS;
const WALKER_ANIM_FRAME_MS = 200;        // marche des citoyens (plus lent que héros/dieux)

/* ===================== MYTHOLOGIE ===================== */
const FAVOR_MAX = 100;
const FAVOR_DECAY_PER_TICK = 0.06;
const FAVOR_OFFERING_COST = { sculpture: 5 };
const FAVOR_OFFERING_GAIN = 15;
const FAVOR_BLESSING_THRESHOLD = 80;       // au-dessus : bénédiction possible
const FAVOR_CATASTROPHE_THRESHOLD = 20;    // en-dessous : catastrophe possible
const FAVOR_EVENT_CHANCE_PER_TICK = 0.03;  // 3%/tick une fois le seuil franchi
const PRODUCTION_BOOST_MULTIPLIER = 1.5;
const PRODUCTION_PENALTY_MULTIPLIER = 0.5;
const PRODUCTION_EFFECT_DURATION_TICKS = 20; // ~20 secondes

// Satisfaction individuelle par dieu (voir godSatisfaction.js)
const GOD_SAT_MAX = 100;
const GOD_SAT_DECAY = 0.03;              // déclin naturel / tick
const GOD_SAT_REQ_PENALTY = 0.07;        // pénalité / tick si exigence non remplie
const GOD_SAT_TEMPLE_GAIN = 0.10;        // bonus / tick si temple monumental au dieu
const GOD_SAT_FRIENDLY_DRIFT = 0.02;     // les dieux bienveillants gagnent lentement
const GOD_SAT_WRATH_THRESHOLD = 30;      // en dessous : colère possible
const GOD_SAT_BLESSING_THRESHOLD = 75;   // au-dessus : bénédiction (dieux amis)
const GOD_SAT_WRATH_CHANCE = 0.025;      // colère / tick (dieux hostiles ou furieux)
const GOD_SAT_BLESSING_CHANCE = 0.018;   // bénédiction / tick (dieux amis)
const GOD_SAT_EVENT_COOLDOWN = 90;       // ticks entre deux événements du même dieu
const GOD_SAT_HOSTILE_START = [18, 32];  // plage initiale dieux hostiles
const GOD_SAT_FRIENDLY_START = [68, 85]; // plage initiale dieux amis
const GOD_SAT_OFFERING_SHARE = 12;       // gain par dieu lors d'une offrande
const GOD_SAT_FESTIVAL_SHARE = 10;       // gain par dieu lors d'un festival
const GOD_SAT_MONUMENT_GAIN = 28;        // construire un grand temple au dieu
const GOD_SAT_MONUMENT_LOSS = 18;        // démolir son temple

// Exigences de chaque dieu : si non remplies, sa satisfaction baisse plus vite.
const GOD_REQUIREMENTS = {
  demeter:  { type:'resource', key:'wheat', min:30, labelKey:'god.req.demeter' },
  zeus:     { type:'building', key:'temple', min:1, labelKey:'god.req.zeus' },
  athena:   { type:'building', key:'clinic', min:1, labelKey:'god.req.athena' },
  dionysos: { type:'building', key:'winery', min:1, labelKey:'god.req.dionysos' },
  poseidon: { type:'building', key:'fountain', min:1, labelKey:'god.req.poseidon' },
  apollo:   { type:'building', key:'clinic', min:1, labelKey:'god.req.apollo' },
};

// Type de colère / bénédiction par dieu
const GOD_WRATH_TYPE = {
  zeus:'earthquake', athena:'monster', poseidon:'storm', apollo:'plague',
  demeter:'blight', dionysos:'curse',
};
const GOD_BLESSING_TYPE = {
  demeter:'wheat', zeus:'favor', athena:'treasury', apollo:'health',
  poseidon:'trade', dionysos:'wine',
};

// Temples monumentaux : chaque dieu confère un avantage passif tant que son temple
// existe (alliance choisie à la construction). Un seul temple par dieu dans la cité.
const MONUMENT_FOOTPRINT = 2;
const GODS = [
  { key:'demeter',  icon:'🌾', benefit:'wheatMax',       cost:320, costResources:{ marble:30, wheat:60 } },
  { key:'zeus',     icon:'⚡', benefit:'favorShield',   cost:560, costResources:{ marble:45, sculpture:22 } },
  { key:'athena',   icon:'🦉', benefit:'military',      cost:490, costResources:{ marble:40, wool:30 } },
  { key:'dionysos', icon:'🍷', benefit:'wineBoost',     cost:350, costResources:{ marble:25, wine:30, grapes:38 } },
  { key:'poseidon', icon:'🔱', benefit:'tradeBoost',    cost:385, costResources:{ marble:32, wheat:45 } },
  { key:'apollo',   icon:'☀️', benefit:'healthBlessing', cost:455, costResources:{ marble:35, sculpture:15 } },
];
const GOD_MILITARY_BONUS = 30;
const GOD_TRADE_BONUS = 0.5;           // +50 % revenus export
const GOD_WINE_MULTIPLIER = 2;
const GOD_FAVOR_FLOOR = 65;            // plancher de faveur (Zeus)
const GOD_APOLLO_FAVOR_MONTHLY = 15;
const GOD_APOLLO_DISEASE_MULT = 0.25;  // maladies ×0.25 avec temple d'Apollon (75 % de réduction)
const GOD_MOVE_EVERY_TICKS = 12; // promenade paisible dans la cité (plus lent qu'un monstre)

/* ===================== OBJECTIFS DE MISSION ===================== */
// metric : clé vers OBJECTIVE_METRICS (voir objectives.js), pas une fonction directement —
// même principe que NEED_CHECKERS, pour garder ce fichier en pure donnée.
const OBJECTIVES = [
  { key:'population',    nameKey:'objective.population',    metric:'population',    target:50 },
  { key:'wheatProduced',  nameKey:'objective.wheatProduced',  metric:'wheatProduced',  target:120 },
  { key:'villa',          nameKey:'objective.villa',          metric:'villa',          target:1 },
  { key:'favor',          nameKey:'objective.favor',          metric:'favor',          target:80 },
];

/* ===================== DEFAITE ===================== */
// Deux conditions, vérifiées chaque tick (voir defeat.js) -- un sinistre temporaire
// (un creux de population pendant un incendie, ou un trésor brièvement négatif) ne
// déclenche pas la défaite : il faut que ça dure plusieurs ticks de suite.
const DEFEAT_POPULATION_TICKS = 10;  // population à 0 pendant 10 ticks d'affilée
const DEFEAT_BANKRUPTCY_TICKS = 30;  // trésor négatif pendant 30 ticks d'affilée

/* ===================== FESTIVALS ===================== */
// Même principe que l'offrande (mythology.js) : action joueur, coûte des ressources,
// effet temporaire -- ici un bonus de croissance/réduction d'émigration (voir
// migration.js) plutôt qu'un nouveau stat "bonheur" séparé.
const FESTIVAL_COST = { wine: 8, sculpture: 4 };
const FESTIVAL_FAVOR_GAIN = 18;
const FESTIVAL_DURATION_TICKS = 50;
const FESTIVAL_GROWTH_BONUS = 0.10;

/* ===================== CALENDRIER (mois attiques) ===================== */
// Dérivé uniquement de DEBUG.tickCount (voir calendar.js) -- aucun état séparé à
// sauvegarder, donc aucun risque de désynchronisation avec une sauvegarde existante.
const DAY_DURATION_TICKS = 10;  // 1 jour = 10 ticks = 10 secondes
const DAYS_PER_MONTH = 7;       // 1 mois = 7 jours (~1 min 10s) -> 1 an = 84 jours (~14 min)

// Les 12 mois du calendrier attique (athénien), dans leur ordre traditionnel
// (l'année commence après le solstice d'été). Regroupés par saison pour l'icône.
const MONTHS = [
  { key:'hecatombaion',  season:'summer' },
  { key:'metageitnion',  season:'summer' },
  { key:'boedromion',    season:'summer' },
  { key:'pyanepsion',    season:'autumn' },
  { key:'maimakterion',  season:'autumn' },
  { key:'poseideon',     season:'autumn' },
  { key:'gamelion',      season:'winter' },
  { key:'anthesterion',  season:'winter' },
  { key:'elaphebolion',  season:'winter' },
  { key:'mounichion',    season:'spring' },
  { key:'thargelion',    season:'spring' },
  { key:'skirophorion',  season:'spring' },
];

const SEASON_ICONS = { summer:'☀️', autumn:'🍂', winter:'❄️', spring:'🌸' };

/* ===================== DIPLOMATIE ===================== */
// Cités-États voisines avec lesquelles Olympos entretient une relation (0-100).
// Un événement périodique propose un choix au joueur (voir diplomacy.js) dont les
// conséquences modifient trésor / ressources / faveur ET la relation avec la cité.
const DIPLO_CITIES = [
  { key: 'sparta',  icon: '🛡️' },
  { key: 'corinth', icon: '⚓' },
  { key: 'thebes',  icon: '🦅' },
];

const DIPLO_RELATION_START = 50;   // relation de départ avec chaque cité
const DIPLO_RELATION_MIN = 0;
const DIPLO_RELATION_MAX = 100;
const DIPLO_EVENT_INTERVAL_DAYS = 12; // un événement tous les ~12 jours de jeu
const DIPLO_FIRST_EVENT_DAY = 8;      // pas d'événement avant ce jour (laisse démarrer)

// Seuils de qualification d'une relation (libellé + couleur dans le panneau).
const DIPLO_ALLY_THRESHOLD = 66;
const DIPLO_HOSTILE_THRESHOLD = 34;

// Table d'événements. Pour chaque événement :
//   minRel/maxRel : plage de relation de la cité où l'événement peut se produire
//   weight        : poids du tirage aléatoire parmi les événements éligibles
//   vars          : valeurs injectées dans les textes i18n (titre/corps/résultat)
//   choices[]     : { key, type, requires?, effects, result, resultType }
//     requires : conditions pour activer le bouton ({ treasury, resources:{} })
//     effects  : deltas appliqués au choix ({ treasury, favor, relation, resources:{} })
//     result   : suffixe de clé i18n 'diplomacy.result.<result>' (notification)
const DIPLO_EVENTS = [
  {
    key: 'gift', minRel: 55, maxRel: 100, weight: 3,
    vars: { amount: 150 },
    choices: [
      { key: 'accept', type: 'good',    effects: { treasury: 150, relation: 4 },  result: 'giftAccepted',  resultType: 'good' },
      { key: 'decline', type: 'neutral', effects: { relation: 10 },                result: 'giftDeclined',  resultType: 'good' },
    ],
  },
  {
    key: 'alliance', minRel: 60, maxRel: 100, weight: 2,
    vars: { qty: 12, res: 'wine' },
    choices: [
      { key: 'accept', type: 'primary', requires: { resources: { wine: 12 } }, effects: { resources: { wine: -12 }, relation: 18, favor: 5 }, result: 'allianceSealed', resultType: 'good' },
      { key: 'decline', type: 'neutral', effects: { relation: -8 }, result: 'allianceDeclined', resultType: 'bad' },
    ],
  },
  {
    key: 'tradeDeal', minRel: 0, maxRel: 100, weight: 3,
    vars: { qty: 15, res: 'marble', gold: 280 },
    choices: [
      { key: 'accept', type: 'good', requires: { resources: { marble: 15 } }, effects: { resources: { marble: -15 }, treasury: 280, relation: 6 }, result: 'tradeAccepted', resultType: 'good' },
      { key: 'decline', type: 'neutral', effects: { relation: -3 }, result: 'tradeDeclined', resultType: 'bad' },
    ],
  },
  {
    key: 'tribute', minRel: 0, maxRel: 60, weight: 3,
    vars: { amount: 220 },
    choices: [
      { key: 'pay', type: 'primary', requires: { treasury: 220 }, effects: { treasury: -220, relation: 12 }, result: 'tributePaid', resultType: 'good' },
      { key: 'refuse', type: 'danger', effects: { relation: -15 }, result: 'tributeRefused', resultType: 'bad' },
    ],
  },
  {
    key: 'raidThreat', minRel: 0, maxRel: 38, weight: 2,
    vars: { amount: 160, loss: 320 },
    choices: [
      { key: 'pay', type: 'primary', requires: { treasury: 160 }, effects: { treasury: -160, relation: 10 }, result: 'raidAppeased', resultType: 'good' },
      { key: 'refuse', type: 'danger', effects: { treasury: -320, relation: -8, resources: { wheat: -15 } }, result: 'raidHappened', resultType: 'bad' },
    ],
  },
];

/* ===================== MONSTRES & HEROS ===================== */
// Sprites : python tools/generate_lpc_characters.py
const MONSTER_TYPES = [
  { key: 'medusa',   icon: '🐍', sprite: 'assets/characters/monsters/medusa.png',   heroKey: 'perseus',    hp: 5, moveEvery: 2, attackChance: 0.16 },
  { key: 'hydra',    icon: '🐉', sprite: 'assets/characters/monsters/hydra.png',    heroKey: 'heracles',   hp: 10, moveEvery: 3, attackChance: 0.20 },
  { key: 'minotaur', icon: '🐂', sprite: 'assets/characters/monsters/minotaur.png', heroKey: 'theseus',    hp: 8, moveEvery: 2, attackChance: 0.22 },
  { key: 'cyclops',  icon: '👁️', sprite: 'assets/characters/monsters/cyclops.png',  heroKey: 'ulysses',    hp: 7, moveEvery: 2, attackChance: 0.18 },
  { key: 'cerberus', icon: '🐺', sprite: 'assets/characters/monsters/cerberus.png', heroKey: 'orpheus',    hp: 9, moveEvery: 2, attackChance: 0.20 },
  { key: 'chimera',  icon: '🔥', sprite: 'assets/characters/monsters/chimera.png',  heroKey: 'bellerophon', hp: 8, moveEvery: 2, attackChance: 0.19 },
  { key: 'dragon',   icon: '🐲', sprite: 'assets/characters/monsters/dragon.png',   heroKey: 'jason',      hp: 9, moveEvery: 2, attackChance: 0.21 },
  { key: 'boar',     icon: '🐗', sprite: 'assets/characters/monsters/boar.png',     heroKey: 'achilles',   hp: 7, moveEvery: 2, attackChance: 0.20 },
];

// Un héros par monstre — seul le héros désigné est invoqué et peut le vaincre efficacement.
const HERO_TYPES = [
  { key: 'perseus',    icon: '🛡️', sprite: 'assets/characters/heroes/perseus.png',    damage: 2, moveEvery: 1 },
  { key: 'heracles',   icon: '💪', sprite: 'assets/characters/heroes/heracles.png',   damage: 3, moveEvery: 1 },
  { key: 'theseus',    icon: '⚔️', sprite: 'assets/characters/heroes/theseus.png',    damage: 2, moveEvery: 1 },
  { key: 'ulysses',    icon: '🏹', sprite: 'assets/characters/heroes/ulysses.png',    damage: 2, moveEvery: 1 },
  { key: 'orpheus',    icon: '🎵', sprite: 'assets/characters/heroes/orpheus.png',    damage: 2, moveEvery: 1 },
  { key: 'bellerophon', icon: '🦄', sprite: 'assets/characters/heroes/bellerophon.png', damage: 2, moveEvery: 1 },
  { key: 'jason',      icon: '⚓', sprite: 'assets/characters/heroes/jason.png',      damage: 2, moveEvery: 1 },
  { key: 'achilles',   icon: '🛡️', sprite: 'assets/characters/heroes/achilles.png',   damage: 3, moveEvery: 1 },
];

const HERO_VS_MONSTER_DAMAGE_MULT = 2;   // repli si combat non désigné (debug)
const HERO_WRONG_MATCH_DAMAGE_MULT = 0.4;

const MONSTER_HP = 6;                 // repli si type sans hp explicite
const MONSTER_MOVE_EVERY_TICKS = 2;
const MONSTER_ATTACK_CHANCE = 0.18;
const MONSTER_SPAWN_CHANCE = 0.004;
const MONSTER_MIN_DAY = 6;

const HERO_MOVE_EVERY_TICKS = 1;
const HERO_DAMAGE = 2;
const HERO_SUMMON_COST = { sculpture: 6, oil: 8, wine: 8 };

/* ===================== QUÊTES / AVENTURES ===================== */
// Missions hors carte : un héros part pour N ticks, combat auto ou énigme à la fin.
const ADVENTURE_MIN_DAY = 4;
const ADVENTURE_MAX_CONCURRENT = 3;
const ADVENTURE_BASE_SUCCESS = 0.58;
const ADVENTURE_IDEAL_HERO_BONUS = 0.28;
const ADVENTURE_DIFFICULTY_PENALTY = 0.11;

const ARTIFACTS = {
  aegis:       { nameKey:'artifact.aegis',       icon:'🛡️', effect:'military', value:12 },
  lyre:        { nameKey:'artifact.lyre',        icon:'🎵', effect:'favor',    value:5 },
  goldenFleece:{ nameKey:'artifact.goldenFleece',icon:'🏅', effect:'trade',    value:0.2 },
  lionPelt:    { nameKey:'artifact.lionPelt',    icon:'🦁', effect:'growth',   value:0.04 },
};

const ADVENTURE_DEFINITIONS = [
  {
    id:'nemean_lion', nameKey:'adventure.nemeanLion.name', descKey:'adventure.nemeanLion.desc',
    icon:'🦁', type:'combat', difficulty:2, heroKey:'heracles', durationTicks:40,
    cost:{ treasury:100 }, rewards:{ favor:6, resources:{ wool:25 } },
  },
  {
    id:'gorgon_hunt', nameKey:'adventure.gorgonHunt.name', descKey:'adventure.gorgonHunt.desc',
    icon:'🐍', type:'combat', difficulty:2, heroKey:'perseus', durationTicks:45,
    cost:{ treasury:130, resources:{ oil:5 } }, rewards:{ favor:8, resources:{ sculpture:15 }, artifact:'aegis' },
    oneTime:true,
  },
  {
    id:'labyrinth', nameKey:'adventure.labyrinth.name', descKey:'adventure.labyrinth.desc',
    icon:'🌀', type:'combat', difficulty:3, heroKey:'theseus', durationTicks:55,
    cost:{ treasury:175 }, rewards:{ treasury:250, resources:{ marble:20 } },
  },
  {
    id:'cyclops_cave', nameKey:'adventure.cyclops.name', descKey:'adventure.cyclops.desc',
    icon:'👁️', type:'combat', difficulty:2, heroKey:'ulysses', durationTicks:42,
    cost:{ treasury:85, resources:{ wine:8 } }, rewards:{ resources:{ wine:20, oil:10 }, favor:5 },
  },
  {
    id:'styx_crossing', nameKey:'adventure.styx.name', descKey:'adventure.styx.desc',
    icon:'🌑', type:'combat', difficulty:3, heroKey:'orpheus', durationTicks:50,
    cost:{ treasury:155, resources:{ sculpture:4 } }, rewards:{ favor:12, artifact:'lyre' },
    oneTime:true,
  },
  {
    id:'sphinx', nameKey:'adventure.sphinx.name', descKey:'adventure.sphinx.desc',
    icon:'🗿', type:'riddle', difficulty:2, heroKey:'ulysses', durationTicks:35,
    cost:{ treasury:70 }, rewards:{ favor:10, resources:{ wheat:40 } },
    riddleKey:'adventure.sphinx.riddle',
    riddleChoices:[
      { key:'man',   labelKey:'adventure.sphinx.choice.man',   correct:true },
      { key:'beast', labelKey:'adventure.sphinx.choice.beast', correct:false },
      { key:'god',   labelKey:'adventure.sphinx.choice.god',   correct:false },
    ],
  },
  {
    id:'delphi_oracle', nameKey:'adventure.delphi.name', descKey:'adventure.delphi.desc',
    icon:'🔮', type:'riddle', difficulty:1, heroKey:'orpheus', durationTicks:30,
    cost:{ treasury:80, resources:{ wine:5 } }, rewards:{ favor:15, resources:{ sculpture:8 } },
    riddleKey:'adventure.delphi.riddle',
    riddleChoices:[
      { key:'know',  labelKey:'adventure.delphi.choice.know',  correct:true },
      { key:'gold',  labelKey:'adventure.delphi.choice.gold',  correct:false },
      { key:'power', labelKey:'adventure.delphi.choice.power', correct:false },
    ],
  },
  {
    id:'golden_fleece', nameKey:'adventure.fleece.name', descKey:'adventure.fleece.desc',
    icon:'🏅', type:'combat', difficulty:3, heroKey:'jason', durationTicks:65,
    cost:{ treasury:300, resources:{ wool:15 } }, rewards:{ treasury:400, artifact:'goldenFleece', favor:10 },
    oneTime:true,
  },
];

