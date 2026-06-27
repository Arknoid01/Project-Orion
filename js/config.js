/* ===================== CONFIG GRILLE / ISO ===================== */
const GRID_COLS = 20;
const GRID_ROWS = 20;
const TILE_W = 64;
const TILE_H = 32;
// OFFSET_X = centre horizontal. Doit valoir au moins (N-1)*TILE_W/2 + TILE_W/2 pour
// que la tuile la plus à gauche reste dans le canvas (voir tileCenter dans grid.js).
const OFFSET_X = 660; // centre horizontal du canvas (grille 20x20)
const OFFSET_Y = 50;  // marge haute

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
  farm:      { name:'building.farm',      icon:'🌾', color:'#c9a227', validTerrain:'wheat',  produces:'wheat',  rate:2,   sprite:'assets/buildings/farm.png', cost:100, upkeep:1, workers:6 },
  quarry:    { name:'building.quarry',    icon:'⛏️', color:'#9aa5ab', validTerrain:'marble', produces:'marble', rate:1,   sprite:'assets/buildings/quarry.png', cost:120, upkeep:1, workers:6 },
  oliveGrove:{ name:'building.oliveGrove',icon:'🫒', color:'#7a8b3a', validTerrain:'grass',  produces:'olives', rate:1.5, sprite:'assets/buildings/oliveGrove.png', cost:90,  upkeep:1, workers:4 },
  vineyard:  { name:'building.vineyard',  icon:'🍇', color:'#6b3a6b', validTerrain:'grass',  produces:'grapes', rate:1.5, sprite:'assets/buildings/vineyard.png', cost:90,  upkeep:1, workers:4 },
  sheepFarm: { name:'building.sheepFarm', icon:'🐑', color:'#cbc6b8', validTerrain:'grass',  produces:'wool',   rate:1,   sprite:'assets/buildings/sheepFarm.png', cost:110, upkeep:1, workers:4 },
  // ---- Industrie : ateliers de transformation (consomment une matière) ----
  workshop:  { name:'building.workshop',  icon:'⚒️', color:'#b5651d', validTerrain:'grass',  consumes:{marble:1}, produces:'sculpture', rate:0.5, sprite:'assets/buildings/workshop.png', cost:200, upkeep:2, workers:8 },
  oilPress:  { name:'building.oilPress',  icon:'🛢️', color:'#b9a93a', validTerrain:'grass',  consumes:{olives:1}, produces:'oil',       rate:1,   sprite:'assets/buildings/oilPress.png', cost:140, upkeep:1, workers:5 },
  winery:    { name:'building.winery',    icon:'🍷', color:'#7d2b46', validTerrain:'grass',  consumes:{grapes:1}, produces:'wine',      rate:1,   sprite:'assets/buildings/winery.png', cost:140, upkeep:1, workers:5 },
  // ---- Stockage ----
  granary:   { name:'building.granary',   icon:'🏺', color:'#8a5a3b', validTerrain:'grass',  storageBonus:{wheat:150}, sprite:'assets/buildings/granary.png', cost:80, upkeep:1 },
  warehouse: { name:'building.warehouse', icon:'📦', color:'#9c7b4a', validTerrain:'grass',  storageBonus:{olives:80, oil:100, grapes:80, wine:100, wool:100}, sprite:'assets/buildings/warehouse.png', cost:100, upkeep:1 },
  // ---- Services à walker (desservent les maisons à portée) ----
  fountain:  { name:'building.fountain',  icon:'⛲', color:'#5a8fae', validTerrain:'grass',  isService:true, serviceType:'water',    range:20, capacity:8, sprite:'assets/buildings/fountain.png', cost:80,  upkeep:1 },
  market:    { name:'building.market',    icon:'🏪', color:'#c97b3d', validTerrain:'grass',  isService:true, serviceType:'market',   range:20, capacity:8, sprite:'assets/buildings/market.png', cost:120, upkeep:1 },
  temple:    { name:'building.temple',    icon:'🛕', color:'#c4b27a', validTerrain:'grass',  isService:true, serviceType:'religion', range:20, capacity:8, sprite:'assets/buildings/temple.png', cost:150, upkeep:2 },
  clinic:    { name:'building.clinic',    icon:'⚕️', color:'#9ec2c4', validTerrain:'grass',  isService:true, serviceType:'health',   range:20, capacity:8, sprite:'assets/buildings/clinic.png', cost:150, upkeep:2 },
  taxOffice: { name:'building.taxOffice', icon:'💰', color:'#b8943a', validTerrain:'grass',  isService:true, serviceType:'tax',      range:20, capacity:8, cost:150, upkeep:2 },
  watchtower:{ name:'building.watchtower',icon:'🗼', color:'#a05a3a', validTerrain:'grass',  isService:true, serviceType:'fire',     range:20, capacity:8, cost:150, upkeep:2 },
  // ---- Habitation ----
  maison:    { name:'building.maison',    icon:'🏠', color:'#c9b68f', validTerrain:'grass',  isHouse:true, cost:40 },
  // ---- Décorations : diffusent du "cachet" (beauty) autour d'elles (voir beauty.js) ----
  statue:    { name:'building.statue',    icon:'🗿', color:'#cdc7ba', validTerrain:'grass', isDecoration:true, beauty:6, range:2, cost:120, upkeep:1 },
  garden:    { name:'building.garden',    icon:'🌳', color:'#6f9a4c', validTerrain:'grass', isDecoration:true, beauty:4, range:3, cost:60 },
  colonnade: { name:'building.colonnade', icon:'🏛️', color:'#e3ddcf', validTerrain:'grass', isDecoration:true, beauty:5, range:2, cost:100, upkeep:1 }
};

// Biens distribués par les marchés aux maisons couvertes (en plus de l'eau, gérée
// par les fontaines). Chaque bien consomme 'perHouse' unités de stock par maison/tick.
// La clé 'need' relie le bien au besoin de maison correspondant (voir houses.js).
const MARKET_GOODS = [
  { need:'food', resource:'wheat', perHouse:1 },
  { need:'oil',  resource:'oil',   perHouse:1 },
  { need:'wine', resource:'wine',  perHouse:1 },
  { need:'wool', resource:'wool',  perHouse:1 },
];

// Couleurs de repli, utilisées tant que le sprite de terrain n'est pas chargé.
const TERRAIN_COLORS = {
  grass:  '#7ea24c',
  wheat:  '#d4b35c',
  marble: '#cfcac0',
  water:  '#3f7ea6'
};

// Sprites de sol (losanges générés, voir comfy_batch_generate.py -> mode procédural).
const TERRAIN_SPRITES = {
  grass:  'assets/tiles/grass.png',
  wheat:  'assets/tiles/wheat.png',
  marble: 'assets/tiles/marble.png',
  water:  'assets/tiles/water.png'
};

const ROAD_SPRITE_PATH = 'assets/tiles/road.png';

const BASE_CAP = { wheat:50, marble:60, sculpture:30, olives:40, oil:40, grapes:40, wine:40, wool:40 };

/* ===================== NIVEAUX DE MAISON ===================== */
// requires : liste de clés de besoin (voir NEED_CHECKERS dans houses.js).
// route/water/food sont fonctionnels. 'beauty' reste un stub en attente
// de la phase embellissement, et renverra toujours false jusqu'à ce moment-là.
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
  { key:'residence', nameKey:'houseLevel.residence', population:34, requires:['route','water','food','oil','wine','religion','beauty'], sprite:'assets/houses/residence.png' },
  { key:'palais',    nameKey:'houseLevel.palais',    population:48, requires:['route','water','food','oil','wine','wool','religion','health','fire','beauty'], sprite:'assets/houses/palais.png' },
];

/* ===================== EMBELLISSEMENT (CACHET) ===================== */
// Cachet minimal accumulé sur la case d'une maison pour satisfaire le besoin 'beauty'
// (voir beauty.js pour la diffusion, houses.js pour la vérification du besoin).
const BEAUTY_THRESHOLD = 6;

/* ===================== ICONES DE STATUT (au-dessus des maisons) ===================== */
// Voir houses.js (getHouseStatusIcons) et render.js (drawHouseStatusIcons).
const NEED_ICONS = {
  route:    '🛣️',
  water:    '⛲',
  food:     '🍴',
  oil:      '🛢️',
  wine:     '🍷',
  wool:     '🐑',
  religion: '🛕',
  health:   '🤢',
  fire:     '🔥',
  beauty:   '🌲',
};

/* ===================== ECONOMIE ===================== */
// Tout est en drachmes. Modèle léger : taxes et entretien passifs (par tick),
// un seul ratio d'emploi global (voir economy.js et labor.js).
const STARTING_TREASURY = 1500;  // trésor au démarrage d'une partie
const TAX_PER_POP = 0.25;        // conservé pour compatibilité (non utilisé : voir TAX_BASE_PER_POP)
const ROAD_COST = 5;             // coût de pose d'une case de route (pas un BUILDING_DEFS)

/* ===================== IMPOTS (BUREAU DES IMPOTS) ===================== */
// Contrairement à l'ancien système (taxe globale fixe sur toute la population),
// seules les maisons DESSERVIES par un bureau des impôts (walker, serviceType='tax')
// paient — voir economy.js. Le taux est réglable par le joueur (panneau Gouvernement),
// et influence trois choses :
//   - collecte    : proportionnelle directe au taux (voir taxCollectionRate)
//   - efficacité  : pénalise la production si le taux est haut (voir taxes.js)
//   - croissance  : ralentit l'évolution des maisons si le taux est haut (voir houses.js)
const TAX_BASE_PER_POP = 0.5;     // drachmes/habitant/tick desservi, AU TAUX MAXIMUM (1.0)
const TAX_RATE_DEFAULT = 0.5;     // taux neutre au démarrage (0 = aucun impôt, 1 = maximum)
// Courbes (linéaires) : voir taxes.js pour les fonctions qui les appliquent.
const TAX_EFFICIENCY_AT_ZERO = 1.2;  // multiplicateur de production à taux 0 (bonus)
const TAX_EFFICIENCY_AT_MAX  = 0.7;  // multiplicateur de production à taux 1 (pénalité)
const TAX_GROWTH_CHANCE_AT_ZERO = 0.9;   // probabilité d'évolution d'une maison par tick, taux 0
const TAX_GROWTH_CHANCE_AT_MAX  = 0.15;  // probabilité d'évolution d'une maison par tick, taux 1

/* ===================== IMMIGRATION / EMIGRATION ===================== */
// Voir migration.js pour la logique (cityAttractiveness, growthChance, emigrationChance).
const GROWTH_FAVOR_INFLUENCE = 0.3;   // amplitude du bonus/malus de faveur sur la croissance
const EMIGRATION_THRESHOLD = 0.35;    // attractivité en-dessous de laquelle l'émigration démarre
const EMIGRATION_STRENGTH = 0.3;      // intensité du risque une fois sous le seuil

/* ===================== MAINTENANCE (INCENDIES / MALADIES) ===================== */
// Voir maintenance.js. Premiers chiffres, pas encore équilibrés en conditions réelles
// de jeu -- à ajuster une fois que tu auras une vraie ville qui tourne longtemps.
// Une maison NON desservie (fire/health) risque un sinistre à chaque tick ; une maison
// desservie garde un risque résiduel très faible, jamais totalement nul.
const FIRE_CHANCE_UNCOVERED = 0.001;     // ~0.1%/tick, sans tour de guet à portée
const FIRE_CHANCE_COVERED = 0.00005;     // ~0.005%/tick, même protégée (risque résiduel)
const DISEASE_CHANCE_UNCOVERED = 0.001;  // ~0.1%/tick, sans infirmerie à portée
const DISEASE_CHANCE_COVERED = 0.00005;  // ~0.005%/tick, même protégée

/* ===================== PALETTES MAISONS PROCEDURALES ===================== */
const HOUSE_WALL_COLORS  = ['#d8c9a3', '#c9b68f', '#bfa77d', '#e3d6b8'];
const HOUSE_ROOF_COLORS  = ['#a8512f', '#8c3f24', '#9c6b3f', '#6f5a4a'];
const HOUSE_TRIM_COLORS  = ['#a8472f', '#5d6b3a', '#7d6b4a'];
const HOUSE_ROOF_SHAPES  = ['pyramid', 'dome', 'flat'];

/* ===================== SPRITE DE PERSONNAGE (WALKER) ===================== */
// Feuille LPC (Universal LPC Spritesheet) : 64x64 par frame, 4 lignes (directions),
// 9 frames de marche utilisées par ligne (les colonnes 9-12 sont du remplissage vide).
const WALKER_SPRITE_PATH = 'assets/characters/walk.png';
const WALKER_FRAME_SIZE = 64;
const WALKER_FRAMES_PER_CYCLE = 9;
const WALKER_DIRECTION_ROWS = { up: 0, left: 1, down: 2, right: 3 };
const WALKER_ANIM_FRAME_MS = 110; // ~9 frames -> un cycle complet toutes les ~990ms
const WALKER_DISPLAY_SIZE = 40;   // taille d'affichage sur la grille (mise à l'échelle depuis 64px)

/* ===================== MYTHOLOGIE ===================== */
const FAVOR_MAX = 100;
const FAVOR_DECAY_PER_TICK = 0.1;          // déclin naturel, sans offrande
const FAVOR_OFFERING_COST = { sculpture: 5 };
const FAVOR_OFFERING_GAIN = 15;
const FAVOR_BLESSING_THRESHOLD = 80;       // au-dessus : bénédiction possible
const FAVOR_CATASTROPHE_THRESHOLD = 20;    // en-dessous : catastrophe possible
const FAVOR_EVENT_CHANCE_PER_TICK = 0.03;  // 3%/tick une fois le seuil franchi
const PRODUCTION_BOOST_MULTIPLIER = 1.5;
const PRODUCTION_PENALTY_MULTIPLIER = 0.5;
const PRODUCTION_EFFECT_DURATION_TICKS = 20; // ~20 secondes

/* ===================== OBJECTIFS DE MISSION ===================== */
// metric : clé vers OBJECTIVE_METRICS (voir objectives.js), pas une fonction directement —
// même principe que NEED_CHECKERS, pour garder ce fichier en pure donnée.
const OBJECTIVES = [
  { key:'population',    nameKey:'objective.population',    metric:'population',    target:50 },
  { key:'wheatProduced',  nameKey:'objective.wheatProduced',  metric:'wheatProduced',  target:100 },
  { key:'villa',          nameKey:'objective.villa',          metric:'villa',          target:1 },
  { key:'favor',          nameKey:'objective.favor',          metric:'favor',          target:80 },
];
