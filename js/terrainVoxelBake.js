/* ===================== BAKE TERRAIN (technique Mykonos) ===================== */
// Losange du sommet extrait + parois latérales procédurales uniformes.
// Les parois intérieures sont masquées par le painter's order iso.

/** Recadre les bords transparents d'une image. */
function trimTransparentCanvas(image){
  const w0 = image.naturalWidth || image.width;
  const h0 = image.naturalHeight || image.height;
  const tmp = document.createElement('canvas');
  tmp.width = w0;
  tmp.height = h0;
  const tctx = tmp.getContext('2d');
  tctx.drawImage(image, 0, 0);
  let data;
  try {
    data = tctx.getImageData(0, 0, w0, h0).data;
  } catch {
    return { canvas: tmp, width: w0, height: h0 };
  }
  let minX = w0, minY = h0, maxX = -1, maxY = -1;
  for (let y = 0; y < h0; y++){
    for (let x = 0; x < w0; x++){
      if (data[(y * w0 + x) * 4 + 3] > 12){
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { canvas: tmp, width: w0, height: h0 };
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d').drawImage(tmp, minX, minY, cw, ch, 0, 0, cw, ch);
  return { canvas: out, width: cw, height: ch };
}

/** Géométrie du losange supérieur d'un bloc iso (silhouette hexagonale). */
function detectTopDiamondGeometry(canvas){
  const w = canvas.width;
  const h = canvas.height;
  let data;
  try { data = canvas.getContext('2d').getImageData(0, 0, w, h).data; }
  catch { return null; }

  const lefts = new Int32Array(h);
  const rights = new Int32Array(h);
  let xMin = w, xMax = -1;
  for (let y = 0; y < h; y++){
    let l = w, r = -1;
    const rowOff = y * w * 4;
    for (let x = 0; x < w; x++){
      if (data[rowOff + x * 4 + 3] > 12){
        if (x < l) l = x;
        if (x > r) r = x;
      }
    }
    lefts[y] = r >= 0 ? l : -1;
    rights[y] = r;
    if (r >= 0){
      if (l < xMin) xMin = l;
      if (r > xMax) xMax = r;
    }
  }
  if (xMax < 0) return null;

  let topY = -1;
  for (let y = 0; y < h; y++){
    if (rights[y] >= 0){ topY = y; break; }
  }

  let leftCornerY = -1;
  for (let y = 0; y < h; y++){
    if (lefts[y] === xMin){ leftCornerY = y; break; }
  }
  let rightCornerY = -1;
  for (let y = 0; y < h; y++){
    if (rights[y] === xMax){ rightCornerY = y; break; }
  }
  if (leftCornerY < 0 || rightCornerY < 0) return null;
  const cornerY = Math.max(leftCornerY, rightCornerY);

  const diamondWidth = xMax - xMin;
  if (diamondWidth < 8) return null;
  // Coin avant du losange = ligne des coins latéraux (pas +width/4 : incluait les parois).
  const frontCornerY = cornerY;
  if (frontCornerY <= topY + 4) return null;

  // Garde-fou anti-lecture-partielle : un losange iso correct a ses deux coins
  // latéraux (gauche/droite) à peu près à la même hauteur. Un fort déséquilibre
  // trahit un getImageData lu avant la fin du décodage GPU (bug mobile observé
  // sur Adreno) -> on rejette plutôt que de baker un triangle de façon permanente.
  const cornerSkew = Math.abs(leftCornerY - rightCornerY);
  if (cornerSkew > (frontCornerY - topY) * 0.6) return null;

  return {
    topY,
    cornerY,
    frontCornerY,
    xMin,
    xMax,
    diamondWidth,
    diamondHeight: frontCornerY - topY,
  };
}

/** Échantillonne les couleurs des faces latérales gauche/droite du PNG source. */
function sampleSideWallColors(canvas, geo){
  const w = canvas.width;
  const h = canvas.height;
  let data;
  try { data = canvas.getContext('2d').getImageData(0, 0, w, h).data; }
  catch { return null; }

  const center = Math.round((geo.xMin + geo.xMax) / 2);
  const yStart = Math.min(h - 1, geo.frontCornerY + Math.round(geo.diamondWidth / 16));
  const yEnd = Math.min(h - 1, geo.frontCornerY + Math.round(geo.diamondWidth / 4));
  if (yEnd - yStart < 4) return null;

  let lR = 0, lG = 0, lB = 0, lN = 0;
  let rR = 0, rG = 0, rB = 0, rN = 0;
  for (let y = yStart; y <= yEnd; y++){
    const rowOff = y * w * 4;
    for (let x = geo.xMin; x <= geo.xMax; x++){
      const i = rowOff + x * 4;
      if (data[i + 3] > 200){
        if (x < center){ lR += data[i]; lG += data[i + 1]; lB += data[i + 2]; lN++; }
        else { rR += data[i]; rG += data[i + 1]; rB += data[i + 2]; rN++; }
      }
    }
  }
  if (lN < 20 || rN < 20) return null;
  return {
    left: `rgb(${(lR / lN) | 0},${(lG / lN) | 0},${(lB / lN) | 0})`,
    right: `rgb(${(rR / rN) | 0},${(rG / rN) | 0},${(rB / rN) | 0})`,
  };
}

/** Parois latérales iso procédurales (forme uniforme par type de bloc). */
function paintCleanSideWalls(ctx, isoW, isoH, sideH, colors){
  ctx.fillStyle = colors.left;
  ctx.beginPath();
  ctx.moveTo(0, isoH / 2);
  ctx.lineTo(isoW / 2, isoH);
  ctx.lineTo(isoW / 2, isoH + sideH);
  ctx.lineTo(0, isoH / 2 + sideH);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = colors.right;
  ctx.beginPath();
  ctx.moveTo(isoW / 2, isoH);
  ctx.lineTo(isoW, isoH / 2);
  ctx.lineTo(isoW, isoH / 2 + sideH);
  ctx.lineTo(isoW / 2, isoH + sideH);
  ctx.closePath();
  ctx.fill();

  const grad = ctx.createLinearGradient(0, isoH, 0, isoH + sideH * 0.4);
  grad.addColorStop(0, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, isoH / 2);
  ctx.lineTo(isoW / 2, isoH);
  ctx.lineTo(isoW, isoH / 2);
  ctx.lineTo(isoW, isoH / 2 + sideH * 0.4);
  ctx.lineTo(isoW / 2, isoH + sideH * 0.4);
  ctx.lineTo(0, isoH / 2 + sideH * 0.4);
  ctx.closePath();
  ctx.fill();
}

function voxelShadeHex(hex, amount){
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  let r = (num >> 16) & 0xff;
  let g = (num >> 8) & 0xff;
  let b = num & 0xff;
  if (amount >= 0){
    r = Math.round(r + (255 - r) * amount);
    g = Math.round(g + (255 - g) * amount);
    b = Math.round(b + (255 - b) * amount);
  } else {
    r = Math.round(r * (1 + amount));
    g = Math.round(g * (1 + amount));
    b = Math.round(b * (1 + amount));
  }
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Repli procédural : losange + parois à partir d'une couleur biome. */
function renderProceduralBlockCanvas(topHex, fillHex, isoW, isoH){
  const sideMin = typeof TERRAIN_BLOCK_SIDE_WALL_MIN === 'number' ? TERRAIN_BLOCK_SIDE_WALL_MIN : 8;
  const sideMax = typeof TERRAIN_BLOCK_SIDE_WALL_MAX === 'number' ? TERRAIN_BLOCK_SIDE_WALL_MAX : 16;
  let sideH = Math.max(sideMin, Math.min(sideMax, Math.round(isoH * 0.45)));
  if (typeof TERRAIN_CUBE_FULL_FACES === 'boolean' && TERRAIN_CUBE_FULL_FACES
      && typeof TERRAIN_BLOCK_SIDE_H === 'number'){
    sideH = TERRAIN_BLOCK_SIDE_H;
  }
  const colors = {
    left: voxelShadeHex(fillHex || topHex, -0.18),
    right: fillHex || topHex,
  };

  const out = document.createElement('canvas');
  out.width = isoW;
  out.height = isoH + sideH;
  const ctx = out.getContext('2d');
  paintCleanSideWalls(ctx, isoW, isoH, sideH, colors);

  ctx.beginPath();
  ctx.moveTo(isoW / 2, 0);
  ctx.lineTo(isoW, isoH / 2);
  ctx.lineTo(isoW / 2, isoH);
  ctx.lineTo(0, isoH / 2);
  ctx.closePath();
  ctx.fillStyle = voxelShadeHex(topHex, 0.12);
  ctx.fill();
  ctx.fillStyle = topHex;
  ctx.beginPath();
  ctx.moveTo(isoW / 2, isoH * 0.08);
  ctx.lineTo(isoW * 0.92, isoH / 2);
  ctx.lineTo(isoW / 2, isoH * 0.92);
  ctx.lineTo(isoW * 0.08, isoH / 2);
  ctx.closePath();
  ctx.fill();

  const cap = document.createElement('canvas');
  cap.width = isoW;
  cap.height = isoH;
  cap.getContext('2d').drawImage(out, 0, 0, isoW, isoH, 0, 0, isoW, isoH);

  return { canvas: out, capCanvas: cap, sideH, diamondH: isoH, procedural: true };
}

/** Couleur de repli si PNG face manquant. */
const _FLAT_FACE_FALLBACK = {
  grass_top: '#b8a856', grass_side: '#9a7a52',
  forest_top: '#6a8a48', sand_top: '#e8c878', sand: '#d4b070',
  dirt: '#c4a868', stone: '#c4b8a0', marble: '#e8e2d4',
};

function createFlatFallbackFace(name){
  const hex = _FLAT_FACE_FALLBACK[name]
    || (typeof TERRAIN_COLORS === 'object' && TERRAIN_COLORS[name])
    || '#888888';
  const px = typeof TERRAIN_FLAT_FACE_PX === 'number' ? TERRAIN_FLAT_FACE_PX : 64;
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, px, px);
  return c;
}

function resolveFlatFace(name){
  if (typeof flatFaceImage === 'function'){
    const img = flatFaceImage(name);
    if (img) return img;
  }
  return createFlatFallbackFace(name);
}

/** Projette une texture carrée sur le losange du dessus. */
function paintFlatTopFace(ctx, isoW, isoH, topSrc){
  if (!topSrc) return;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.beginPath();
  ctx.moveTo(isoW / 2, 0);
  ctx.lineTo(isoW, isoH / 2);
  ctx.lineTo(isoW / 2, isoH);
  ctx.lineTo(0, isoH / 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(topSrc, 0, 0, isoW, isoH);
  ctx.restore();
}

/** Parois latérales texturées (gauche / droite). */
function paintTexturedSideWalls(ctx, isoW, isoH, sideH, leftSrc, rightSrc){
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, isoH / 2);
  ctx.lineTo(isoW / 2, isoH);
  ctx.lineTo(isoW / 2, isoH + sideH);
  ctx.lineTo(0, isoH / 2 + sideH);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(leftSrc, 0, 0, isoW / 2, sideH);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, isoH / 2, isoW / 2, sideH);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(isoW / 2, isoH);
  ctx.lineTo(isoW, isoH / 2);
  ctx.lineTo(isoW, isoH / 2 + sideH);
  ctx.lineTo(isoW / 2, isoH + sideH);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(rightSrc, 0, 0, isoW / 2, sideH);
  ctx.restore();
}

/**
 * Compose un cube iso depuis des faces plates (top / left / right).
 * @param {string} blockKey — clé dans TERRAIN_BLOCK_FACES
 */
function bakeTerrainBlockFromFlatFaces(blockKey, isoW, isoH){
  const faces = typeof TERRAIN_BLOCK_FACES === 'object' && TERRAIN_BLOCK_FACES
    ? TERRAIN_BLOCK_FACES[blockKey]
    : null;
  if (!faces) return null;

  const sideMin = typeof TERRAIN_BLOCK_SIDE_WALL_MIN === 'number' ? TERRAIN_BLOCK_SIDE_WALL_MIN : 8;
  const sideMax = typeof TERRAIN_BLOCK_SIDE_WALL_MAX === 'number' ? TERRAIN_BLOCK_SIDE_WALL_MAX : 16;
  let sideH = typeof TERRAIN_BLOCK_SIDE_H === 'number' ? TERRAIN_BLOCK_SIDE_H : 16;
  sideH = Math.max(sideMin, Math.min(sideMax, sideH));

  const topSrc = resolveFlatFace(faces.top);
  const leftSrc = resolveFlatFace(faces.left || faces.top);
  const rightSrc = resolveFlatFace(faces.right || faces.left || faces.top);

  const out = document.createElement('canvas');
  out.width = isoW;
  out.height = isoH + sideH;
  const ctx = out.getContext('2d');

  paintTexturedSideWalls(ctx, isoW, isoH, sideH, leftSrc, rightSrc);
  paintFlatTopFace(ctx, isoW, isoH, topSrc);

  const cap = document.createElement('canvas');
  cap.width = isoW;
  cap.height = isoH;
  cap.getContext('2d').drawImage(out, 0, 0, isoW, isoH, 0, 0, isoW, isoH);

  return { canvas: out, capCanvas: cap, sideH, diamondH: isoH, flat: true };
}

const _BLOCK_BIOME_COLORS = {
  grass: { top: '#b8a856', fill: '#9a7a52' },
  dirt:  { top: '#c4a868', fill: '#9a7a52' },
  stone: { top: '#c4b8a0', fill: '#a8a090' },
  sand:  { top: '#e8c878', fill: '#d4b070' },
  forest:{ top: '#6a8a48', fill: '#8a6840' },
};

/**
 * Compose losange propre + parois latérales (Mykonos renderTerrainTile).
 * @returns {{ canvas: HTMLCanvasElement, sideH: number } | null}
 */
function bakeTerrainBlockCanvas(sourceCanvas, isoW, isoH){
  const geo = detectTopDiamondGeometry(sourceCanvas);
  if (!geo) return null;

  const colors = sampleSideWallColors(sourceCanvas, geo);
  const aiSideH = Math.max(0, sourceCanvas.height - geo.frontCornerY);
  const scale = isoW / geo.diamondWidth;
  const sideMin = typeof TERRAIN_BLOCK_SIDE_WALL_MIN === 'number' ? TERRAIN_BLOCK_SIDE_WALL_MIN : 8;
  const sideMax = typeof TERRAIN_BLOCK_SIDE_WALL_MAX === 'number' ? TERRAIN_BLOCK_SIDE_WALL_MAX : 16;
  let sideH = Math.max(sideMin, Math.min(isoH, Math.round(aiSideH * scale)));
  sideH = Math.min(sideMax, sideH);
  if (typeof TERRAIN_CUBE_FULL_FACES === 'boolean' && TERRAIN_CUBE_FULL_FACES
      && typeof TERRAIN_BLOCK_SIDE_H === 'number'){
    sideH = TERRAIN_BLOCK_SIDE_H;
  }

  const out = document.createElement('canvas');
  out.width = isoW;
  out.height = isoH + sideH;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (colors) paintCleanSideWalls(ctx, isoW, isoH, sideH, colors);

  // Recadrage interne : on évite la vignette naturelle du PNG source (bordure plus
  // sombre près des bords du losange, confirmée par mesure : ~60 points de luminosité
  // d'écart entre centre et bord gauche/droit). En zoomant légèrement sur le centre
  // avant d'agrandir à la taille cible, cette bordure sombre est coupée plutôt que
  // recopiée jusqu'au bord de la tuile, où elle créait un quadrillage visible entre
  // tuiles voisines, peu importe le padding/chevauchement utilisé.
  const capInset = typeof TERRAIN_BLOCK_CAP_INSET === 'number' ? TERRAIN_BLOCK_CAP_INSET : 0.28;
  const insetX = geo.diamondWidth * capInset;
  const insetY = geo.diamondHeight * capInset;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(isoW / 2, 0);
  ctx.lineTo(isoW, isoH / 2);
  ctx.lineTo(isoW / 2, isoH);
  ctx.lineTo(0, isoH / 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(
    sourceCanvas,
    geo.xMin + insetX, geo.topY + insetY,
    geo.diamondWidth - insetX * 2, geo.diamondHeight - insetY * 2,
    0, 0, isoW, isoH,
  );
  ctx.restore();

  // Durcit l'alpha du bord du losange (0 ou 255, jamais entre les deux).
  // ctx.clip() laisse un anti-aliasing semi-transparent sur le contour ; en
  // superposant des tuiles voisines (chevauchement anti-couture), ces pixels
  // semi-transparents s'accumulent et certains moteurs de rendu (Skia/Android)
  // les rendent visibles sous forme de liseré sombre répété sur toute la carte.
  // Un alpha binaire élimine ce cumul, quelle que soit la plateforme.
  try {
    const capData = ctx.getImageData(0, 0, isoW, isoH);
    const d = capData.data;
    for (let i = 3; i < d.length; i += 4){
      d[i] = d[i] > 96 ? 255 : 0;
    }
    ctx.putImageData(capData, 0, 0);
  } catch { /* canvas non lisible (tainted) : on laisse l'anti-aliasing d'origine */ }

  const cap = document.createElement('canvas');
  cap.width = isoW;
  cap.height = isoH;
  cap.getContext('2d').drawImage(out, 0, 0, isoW, isoH, 0, 0, isoW, isoH);

  return { canvas: out, capCanvas: cap, sideH, diamondH: isoH };
}

function bakeTerrainBlockFromImage(image, isoW, isoH, blockKey){
  const trimmed = trimTransparentCanvas(image);
  const baked = bakeTerrainBlockCanvas(trimmed.canvas, isoW, isoH);
  if (baked) return baked;

  const palette = _BLOCK_BIOME_COLORS[blockKey] || _BLOCK_BIOME_COLORS.grass;
  const topHex = (typeof TERRAIN_COLORS === 'object' && TERRAIN_COLORS[blockKey])
    ? TERRAIN_COLORS[blockKey]
    : palette.top;
  const fillHex = palette.fill;
  return renderProceduralBlockCanvas(topHex, fillHex, isoW, isoH);
}

function bakeTerrainBlockFromCanvas(sourceCanvas, isoW, isoH, blockKey){
  const baked = bakeTerrainBlockCanvas(sourceCanvas, isoW, isoH);
  if (baked) return baked;
  const palette = _BLOCK_BIOME_COLORS[blockKey] || _BLOCK_BIOME_COLORS.grass;
  return renderProceduralBlockCanvas(palette.top, palette.fill, isoW, isoH);
}
