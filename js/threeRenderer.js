/* ===================== THREE.JS RENDERER — OLYMPOS =====================
 * Lit grid[row][col] pour construire le terrain 3D (InstancedMesh).
 * Vue isométrique fixe (45°/35°). Pan via camera.js.
 * Pixi.js gère les décors et entités par-dessus (canvas transparent).
 * ===================================================================== */

// Import Three.js via ES module — chargé dynamiquement pour ne pas bloquer
// le reste des scripts non-module du jeu.
let _THREE = null;

window._threeReady   = false;
window._threeScene   = null;
window._threeRenderer= null;
window._threeCam     = null;
window._threeGroup   = null;
window._decorSprites = [];

// Matériaux Three.js par terrain (initialisés après chargement de THREE)
window._terrainMats  = {};

/* ---------------------------------------------------------------
   CORRESPONDANCE terrain → hauteur 3D
   --------------------------------------------------------------- */
const TERRAIN_HEIGHT = {
  water:  0,
  sand:   1,
  grass:  1,
  wheat:  1,
  hill:   2,
  forest: 2,
  rock:   3,
  marble: 2,
};

const TERRAIN_TOP_COLOR = {
  water:  0x3a86c8,
  sand:   0xd4b870,
  grass:  0x5aaa38,
  wheat:  0xd4a830,
  hill:   0x6ab048,
  forest: 0x2a7a1a,
  rock:   0x8a8070,
  marble: 0xddd8c8,
};

const TERRAIN_SIDE_COLOR = {
  water:  0x2a66a8,
  sand:   0xc4a860,
  grass:  0x7a5230,
  wheat:  0xb89820,
  hill:   0x5a4020,
  forest: 0x1a5a0a,
  rock:   0x6a6050,
  marble: 0xccc8b8,
};

/* ---------------------------------------------------------------
   TEXTURE PIXEL ART PROCÉDURALE
   --------------------------------------------------------------- */
function makePixelTex(THREE, colorHex){
  const S = 16;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const r=(colorHex>>16&255), g=(colorHex>>8&255), b=(colorHex&255);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0,0,S,S);
  for(let i=0;i<40;i++){
    const px=Math.floor(Math.random()*S/2)*2;
    const py=Math.floor(Math.random()*S/2)*2;
    const f=Math.random()>.5?.82:1.18;
    ctx.fillStyle=`rgb(${Math.min(255,r*f|0)},${Math.min(255,g*f|0)},${Math.min(255,b*f|0)})`;
    ctx.fillRect(px,py,2,2);
  }
  const t=new THREE.CanvasTexture(cv);
  t.magFilter=THREE.NearestFilter;
  t.minFilter=THREE.NearestFilter;
  return t;
}

function makeCubeMats(THREE, topColor, sideColor){
  const top  = makePixelTex(THREE, topColor);
  const side = makePixelTex(THREE, sideColor);
  const bot  = makePixelTex(THREE, sideColor * 0.6 | 0);
  return [side,side,top,bot,side,side].map(t=>new THREE.MeshLambertMaterial({map:t}));
}

/* ---------------------------------------------------------------
   INIT THREE.JS
   --------------------------------------------------------------- */
window.initThreeRenderer = async function(){
  try {
    const mod = await import('./three.module.min.js');
    _THREE = mod;

    // Renderer WebGL
    const rnd = new _THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    rnd.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    rnd.setSize(window.innerWidth, window.innerHeight);
    rnd.domElement.style.cssText = 'position:fixed;inset:0;z-index:1;touch-action:none;';

    // Remplace le gameCanvas existant
    const old = document.getElementById('gameCanvas');
    if(old) old.parentElement.replaceChild(rnd.domElement, old);
    else document.getElementById('canvasWrap').appendChild(rnd.domElement);

    window._threeRenderer = rnd;

    // Scene
    const scene = new _THREE.Scene();
    scene.background = new _THREE.Color(0x87ceeb);
    scene.fog = new _THREE.Fog(0x87ceeb, 80, 130);
    window._threeScene = scene;

    // Lumières
    scene.add(new _THREE.AmbientLight(0xffffff, 0.72));
    const sun = new _THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(8, 16, 6);
    scene.add(sun);

    // Caméra orthographique ISO fixe
    const cam = new _THREE.OrthographicCamera(-1,1,1,-1,-200,200);
    window._threeCam = cam;
    window._threeTarget = new _THREE.Vector3(0,0,0);
    window._threeZoom = 16;
    _updateThreeCam();

    // Matériaux par terrain
    for(const [key] of Object.entries(TERRAIN_HEIGHT)){
      window._terrainMats[key] = makeCubeMats(_THREE, TERRAIN_TOP_COLOR[key]||0x888888, TERRAIN_SIDE_COLOR[key]||0x666666);
    }

    // Listeners resize
    window.addEventListener('resize', ()=>{
      rnd.setSize(window.innerWidth, window.innerHeight);
      _updateThreeCam();
    });

    // Listeners caméra (pan tactile + souris)
    _initThreeControls();

    window._threeReady = true;
    console.log('[Three] OK — WebGL', rnd.capabilities.isWebGL2 ? '2' : '1');
    return true;
  } catch(e){
    console.error('[Three] init:', e);
    return false;
  }
};

/* ---------------------------------------------------------------
   CAMÉRA ISO FIXE
   --------------------------------------------------------------- */
const ISO_H = Math.PI / 4;
const ISO_V = Math.atan(1 / Math.sqrt(2));

function _updateThreeCam(){
  if(!window._threeCam) return;
  const z = window._threeZoom;
  const a = window.innerWidth / window.innerHeight;
  const cam = window._threeCam;
  cam.left=-z*a/2; cam.right=z*a/2; cam.top=z/2; cam.bottom=-z/2;
  cam.updateProjectionMatrix();
  const d=60, t=window._threeTarget||new _THREE.Vector3();
  cam.position.set(
    t.x + d*Math.cos(ISO_V)*Math.sin(ISO_H),
    t.y + d*Math.sin(ISO_V),
    t.z + d*Math.cos(ISO_V)*Math.cos(ISO_H)
  );
  cam.lookAt(t);
}

/* ---------------------------------------------------------------
   CONSTRUCTION DU TERRAIN DEPUIS grid[][]
   --------------------------------------------------------------- */
window.buildThreeTerrain = function(){
  if(!_THREE || !Array.isArray(grid) || !grid.length) return;
  if(typeof isTerrainGenerationInProgress==='function' && isTerrainGenerationInProgress()) return;

  const scene = window._threeScene;
  if(window._threeGroup) scene.remove(window._threeGroup);
  window._threeGroup = new _THREE.Group();

  const geo   = new _THREE.BoxGeometry(1,1,1);
  const ROWS  = grid.length;
  const COLS  = grid[0].length;
  const offR  = ROWS / 2;
  const offC  = COLS / 2;

  // Compter les instances par terrain
  const counts = {};
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell = grid[r][c];
      if(!cell) continue;
      const terrain = cell.terrain || 'grass';
      const h = Math.max(1, TERRAIN_HEIGHT[terrain]||1);
      counts[terrain] = (counts[terrain]||0) + h;
    }
  }

  // InstancedMesh par terrain
  const meshes={}, idx={};
  for(const [key,count] of Object.entries(counts)){
    if(!count) continue;
    const mats = window._terrainMats[key] || window._terrainMats['grass'];
    meshes[key] = new _THREE.InstancedMesh(geo, mats, count);
    meshes[key].instanceMatrix.setUsage(_THREE.StaticDrawUsage);
    window._threeGroup.add(meshes[key]);
    idx[key] = 0;
  }

  const mat4 = new _THREE.Matrix4();
  const DIRT  = 'grass'; // couches inférieures

  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell = grid[r][c];
      if(!cell) continue;
      const terrain = cell.terrain || 'grass';
      const h = Math.max(1, TERRAIN_HEIGHT[terrain]||1);
      const x3 = c - offC + 0.5;
      const z3 = r - offR + 0.5;

      for(let y=0;y<h;y++){
        const t = y===h-1 ? terrain : DIRT;
        if(!meshes[t]) continue;
        mat4.makeTranslation(x3, y-0.5, z3);
        meshes[t].setMatrixAt(idx[t]++, mat4);
      }
    }
  }

  for(const mesh of Object.values(meshes)){
    mesh.instanceMatrix.needsUpdate = true;
  }

  scene.add(window._threeGroup);

  // Centrer la caméra sur le centre des terres
  if(typeof computeLandCentroid==='function'){
    const land = computeLandCentroid();
    if(land){
      window._threeTarget.set(
        Math.round(land.col) - offC,
        1,
        Math.round(land.row) - offR
      );
      _updateThreeCam();
    }
  }

  if(typeof buildThreeDecors==='function') buildThreeDecors();
  console.log('[Three] Terrain', COLS+'x'+ROWS, 'généré');
};

/* ---------------------------------------------------------------
   DÉCORS (arbres sur forêt, via Pixi)
   --------------------------------------------------------------- */
window.buildThreeDecors = function(){
  if(!window._threeReady || !Array.isArray(grid)) return;
  if(!window.PIXI || !window._pixiDecorApp) return;

  // Détruire les anciens
  for(const d of window._decorSprites) d.gfx.destroy();
  window._decorSprites = [];
  window._pixiDecorApp.stage.removeChildren();

  const ROWS=grid.length, COLS=grid[0].length;
  const offR=ROWS/2, offC=COLS/2;

  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      const cell=grid[r][c];
      if(!cell || cell.terrain!=='forest') continue;
      if(Math.sin(c*13.7+r*7.3)*.5+.5 > 0.55) continue;

      const h = TERRAIN_HEIGHT['forest']||2;
      const x3=c-offC+.5, y3=h, z3=r-offR+.5;

      const g=new PIXI.Graphics();
      const S=16;
      g.rect(-S*.15,0,S*.3,S*.5); g.fill({color:0x5c3d1a});
      g.circle(0,-S*.4,S*.6);     g.fill({color:0x2a6a1a});
      g.circle(0,-S*.7,S*.45);    g.fill({color:0x3a8a2a});
      window._pixiDecorApp.stage.addChild(g);
      window._decorSprites.push({gfx:g, x3, y3, z3});
    }
  }
  _repositionDecors();
  console.log('[Three] Décors:', window._decorSprites.length, 'arbres');
};

/* ---------------------------------------------------------------
   REPOSITIONNEMENT DÉCORS (projection 3D→2D)
   --------------------------------------------------------------- */
let _lastDecorUpdate=0;
window.repositionDecorsThrottled = function(){
  const now=performance.now();
  if(now-_lastDecorUpdate < 80) return;
  _lastDecorUpdate=now;
  _repositionDecors();
};

function _repositionDecors(){
  if(!window._threeCam || !_THREE) return;
  const cam=window._threeCam;
  const v=new _THREE.Vector3();
  for(const d of window._decorSprites){
    v.set(d.x3,d.y3,d.z3);
    v.project(cam);
    const sx=(v.x+1)/2*window.innerWidth;
    const sy=(-v.y+1)/2*window.innerHeight;
    d.gfx.x=sx; d.gfx.y=sy;
    d.gfx.visible=sx>-40&&sx<window.innerWidth+40&&sy>-40&&sy<window.innerHeight+40;
  }
}

/* ---------------------------------------------------------------
   CONTRÔLES PAN (caméra iso fixe, déplacement dans le monde)
   --------------------------------------------------------------- */
function _initThreeControls(){
  const el = window._threeRenderer.domElement;
  let lastT=null, pinch=null;

  function pan(dx,dy){
    const t=window._threeTarget;
    const spd=window._threeZoom*0.012;
    t.x -= (dx*Math.cos(ISO_H) + dy*Math.sin(ISO_H)*0.5) * spd * 0.1;
    t.z -= (-dx*Math.sin(ISO_H)*0.5 + dy*Math.cos(ISO_H)) * spd * 0.1;
    const half=Math.max(grid.length,grid[0]?.length||60)/2;
    t.x=Math.max(-half,Math.min(half,t.x));
    t.z=Math.max(-half,Math.min(half,t.z));
    _updateThreeCam();
  }

  el.addEventListener('touchstart',e=>{
    if(e.touches.length===1) lastT={x:e.touches[0].clientX,y:e.touches[0].clientY};
    if(e.touches.length===2) pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
  },{passive:true});

  el.addEventListener('touchmove',e=>{
    e.preventDefault();
    if(e.touches.length===1&&lastT){
      pan(e.touches[0].clientX-lastT.x, e.touches[0].clientY-lastT.y);
      lastT={x:e.touches[0].clientX,y:e.touches[0].clientY};
    }
    if(e.touches.length===2&&pinch){
      const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
      window._threeZoom=Math.max(4,Math.min(50,window._threeZoom*pinch/d));
      pinch=d; _updateThreeCam();
    }
  },{passive:false});

  el.addEventListener('touchend',e=>{
    if(e.touches.length<1)lastT=null;
    if(e.touches.length<2)pinch=null;
  });

  let mDown=false,mLast=null;
  el.addEventListener('mousedown',e=>{mDown=true;mLast={x:e.clientX,y:e.clientY};});
  window.addEventListener('mouseup',()=>mDown=false);
  window.addEventListener('mousemove',e=>{
    if(!mDown||!mLast)return;
    pan(e.clientX-mLast.x,e.clientY-mLast.y);
    mLast={x:e.clientX,y:e.clientY};
  });
  el.addEventListener('wheel',e=>{
    window._threeZoom=Math.max(4,Math.min(50,window._threeZoom+e.deltaY*0.02));
    _updateThreeCam();
  },{passive:true});
}

/* ---------------------------------------------------------------
   BOUCLE DE RENDU (appelée depuis loop.js)
   --------------------------------------------------------------- */
window.renderThree = function(){
  if(!window._threeReady) return;
  window._threeRenderer.render(window._threeScene, window._threeCam);
  window.repositionDecorsThrottled();
};

window.isThreeReady = function(){ return !!window._threeReady; };

/* ---------------------------------------------------------------
   INVALIDATION (appelée quand le terrain change)
   --------------------------------------------------------------- */
window.invalidateThreeTerrain = function(){
  if(window._threeReady) window.buildThreeTerrain();
};

console.log('[threeRenderer.js] chargé');
