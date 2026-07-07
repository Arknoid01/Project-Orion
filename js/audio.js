/* ===================== MUSIQUE DE FOND ===================== */
// Pistes dans assets/music/ (~1 min chacune). Lecture aléatoire sans répétition
// consécutive. Démarrage au premier clic/touch (autoplay navigateur). Indépendant
// de la pause jeu / menus — la musique continue tant que l'onglet est actif.

const MUSIC_TRACKS = [
  'assets/music/music_01.mp3',
  'assets/music/music_02.mp3',
  'assets/music/music_03.mp3',
  'assets/music/music_04.mp3',
  'assets/music/music_05.mp3',
  'assets/music/music_06.mp3',
];

const MUSIC_VOLUME = 0.55;

let musicAudio = null;
let musicUnlocked = false;
let lastTrackIndex = -1;
let musicFailStreak = 0;

function pickNextTrackIndex(){
  if (!MUSIC_TRACKS.length) return -1;
  if (MUSIC_TRACKS.length === 1) return 0;
  const candidates = [];
  for (let i = 0; i < MUSIC_TRACKS.length; i++){
    if (i !== lastTrackIndex) candidates.push(i);
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function ensureMusicAudio(){
  if (!musicAudio){
    musicAudio = new Audio();
    musicAudio.volume = MUSIC_VOLUME;
    musicAudio.preload = 'auto';
    musicAudio.addEventListener('ended', () => playNextMusicTrack());
    musicAudio.addEventListener('playing', () => { musicFailStreak = 0; });
    musicAudio.addEventListener('error', () => {
      musicFailStreak++;
      console.warn('[audio] Piste inaccessible :', musicAudio && musicAudio.src);
      if (musicFailStreak >= MUSIC_TRACKS.length) return;
      playNextMusicTrack();
    });
  }
  return musicAudio;
}

function playNextMusicTrack(){
  if (!musicUnlocked || !MUSIC_TRACKS.length) return;
  const idx = pickNextTrackIndex();
  if (idx < 0) return;
  lastTrackIndex = idx;
  const audio = ensureMusicAudio();
  audio.src = MUSIC_TRACKS[idx];
  const playPromise = audio.play();
  if (playPromise && typeof playPromise.catch === 'function'){
    playPromise.catch(err => console.warn('[audio] Lecture bloquée :', err));
  }
}

function unlockMusic(){
  if (musicUnlocked) return;
  musicUnlocked = true;
  document.removeEventListener('pointerdown', unlockMusic, true);
  document.removeEventListener('keydown', unlockMusic, true);
  playNextMusicTrack();
}

function initMusic(){
  if (!MUSIC_TRACKS.length) return;
  document.addEventListener('pointerdown', unlockMusic, true);
  document.addEventListener('keydown', unlockMusic, true);
}

if (document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', initMusic);
} else {
  initMusic();
}

window.unlockMusic = unlockMusic;
window.playNextMusicTrack = playNextMusicTrack;
