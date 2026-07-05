/* ===================== NOM DE LA CITÉ DU JOUEUR ===================== */
let playerCityName = 'Olympos';

const DEFAULT_PLAYER_CITY_NAME = 'Olympos';
const PLAYER_CITY_NAME_MAX = 24;

function sanitizePlayerCityName(name){
  if (typeof name !== 'string') return DEFAULT_PLAYER_CITY_NAME;
  const cleaned = name.trim().replace(/[<>&"']/g, '').slice(0, PLAYER_CITY_NAME_MAX);
  return cleaned || DEFAULT_PLAYER_CITY_NAME;
}

function getPlayerCityName(){
  return sanitizePlayerCityName(typeof playerCityName === 'string' ? playerCityName : DEFAULT_PLAYER_CITY_NAME);
}

function setPlayerCityName(name){
  playerCityName = sanitizePlayerCityName(name);
}

function initPlayerCityName(name){
  setPlayerCityName(name || DEFAULT_PLAYER_CITY_NAME);
}

function escapeHtmlAttr(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function promptPlayerCityName(onConfirm, onCancel){
  const defaultName = getPlayerCityName();
  showChoice({
    title: t('cityName.promptTitle'),
    body: t('cityName.promptBody'),
    dismissible: false,
    bodyHtml: `<label class="dialogCityLabel" for="playerCityNameInput">${t('cityName.label')}</label>
      <input id="playerCityNameInput" class="dialogCityInput" type="text" maxlength="${PLAYER_CITY_NAME_MAX}"
        value="${escapeHtmlAttr(defaultName)}" autocomplete="off" spellcheck="false">`,
    choices: [
      {
        label: t('dialog.cancel'),
        type: 'neutral',
        onPick: () => { if (typeof onCancel === 'function') onCancel(); },
      },
      {
        label: t('cityName.confirm'),
        type: 'primary',
        onPick: () => {
          const input = document.getElementById('playerCityNameInput');
          setPlayerCityName(input ? input.value : defaultName);
          if (typeof onConfirm === 'function') onConfirm();
        },
      },
    ],
  });
  setTimeout(() => {
    const input = document.getElementById('playerCityNameInput');
    if (!input) return;
    input.focus();
    input.select();
    input.onkeydown = (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      setPlayerCityName(input.value);
      closeDialog();
      if (typeof onConfirm === 'function') onConfirm();
    };
  }, 60);
}

function promptThenStartScenario(scenarioId){
  promptPlayerCityName(() => {
    if (typeof startScenario === 'function') startScenario(scenarioId);
  });
}

function promptThenStartCampaignEpisode(pathId, episodeIndex, opts){
  promptPlayerCityName(() => {
    if (typeof startCampaignEpisode === 'function') startCampaignEpisode(pathId, episodeIndex, opts);
  });
}

window.getPlayerCityName = getPlayerCityName;
window.setPlayerCityName = setPlayerCityName;
window.initPlayerCityName = initPlayerCityName;
window.promptPlayerCityName = promptPlayerCityName;
window.promptThenStartScenario = promptThenStartScenario;
window.promptThenStartCampaignEpisode = promptThenStartCampaignEpisode;
