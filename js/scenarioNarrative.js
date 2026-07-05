/* ===================== RÉCIT DES SCÉNARIOS & CAMPAGNE ===================== */
// Briefings au début (histoire + objectifs) et épilogue à la victoire.

function storyScenarioKey(scenarioId, part){
  return `story.scenario.${scenarioId}.${part}`;
}

function storyCampaignKey(pathId, episodeIndex, part){
  return `story.campaign.${pathId}.${episodeIndex + 1}.${part}`;
}

function getStoryText(key, fallbackKey){
  if (typeof t !== 'function') return '';
  const text = t(key);
  if (text && text !== key) return text;
  if (fallbackKey){
    const fb = t(fallbackKey);
    if (fb && fb !== fallbackKey) return fb;
  }
  return '';
}

function formatObjectivesListHtml(objectives){
  if (!objectives || !objectives.length) return '';
  const items = objectives.map(obj => {
    const name = typeof getObjectiveDisplayName === 'function'
      ? getObjectiveDisplayName(obj)
      : (obj.nameKey && typeof t === 'function' ? t(obj.nameKey) : obj.key || '');
    const target = obj.target != null ? obj.target : '?';
    return `<li>${name} — <b>${target}</b></li>`;
  }).join('');
  return `<p class="dialogSectionTitle">${t('story.objectivesTitle')}</p><ul class="dialogObjectives">${items}</ul>`;
}

function showStoryBriefing(opts){
  opts = opts || {};
  if (typeof showChoice !== 'function') return;
  const story = getStoryText(opts.storyKey, opts.fallbackKey);
  const objectivesHtml = formatObjectivesListHtml(opts.objectives);
  if (!story && !objectivesHtml){
    if (typeof opts.onContinue === 'function') opts.onContinue();
    if (typeof flushGodDispositionAnnounce === 'function') flushGodDispositionAnnounce();
    return;
  }

  showChoice({
    title: opts.title || t('story.briefingTitle'),
    body: story,
    bodyHtml: objectivesHtml,
    dismissible: false,
    choices: [{
      label: opts.buttonLabel || t('story.begin'),
      type: 'primary',
      onPick: () => {
        if (typeof opts.onContinue === 'function') opts.onContinue();
        if (typeof flushGodDispositionAnnounce === 'function') flushGodDispositionAnnounce();
      },
    }],
  });
}

function showStoryOutro(opts){
  opts = opts || {};
  if (typeof showChoice !== 'function'){
    if (typeof opts.onContinue === 'function') opts.onContinue();
    return;
  }
  const story = getStoryText(opts.storyKey, opts.fallbackKey);
  if (!story){
    if (typeof opts.onContinue === 'function') opts.onContinue();
    return;
  }
  showChoice({
    title: opts.title || t('story.outroTitle'),
    body: story,
    dismissible: false,
    choices: [{
      label: opts.buttonLabel || t('story.continue'),
      type: 'primary',
      onPick: typeof opts.onContinue === 'function' ? opts.onContinue : undefined,
    }],
  });
}

function showScenarioStoryIntro(scenario){
  if (!scenario || scenario.id === 'sandbox' || !scenario.objectives || !scenario.objectives.length){
    if (typeof flushGodDispositionAnnounce === 'function') flushGodDispositionAnnounce();
    return;
  }
  showStoryBriefing({
    title: `${scenario.icon || '📜'} ${t(scenario.nameKey)}`,
    storyKey: storyScenarioKey(scenario.id, 'intro'),
    fallbackKey: scenario.descKey,
    objectives: activeObjectives,
  });
}

function showScenarioStoryOutro(scenarioId, onContinue){
  if (!scenarioId || scenarioId === 'sandbox') {
    if (typeof onContinue === 'function') onContinue();
    return;
  }
  const scenario = typeof getScenario === 'function' ? getScenario(scenarioId) : null;
  showStoryOutro({
    title: scenario ? `${scenario.icon || '🏆'} ${t(scenario.nameKey)}` : t('story.outroTitle'),
    storyKey: storyScenarioKey(scenarioId, 'outro'),
    onContinue,
  });
}

function showCampaignEpisodeStoryIntro(path, episodeIndex){
  const ep = path && path.episodes && path.episodes[episodeIndex];
  if (!path || !ep) return;
  showStoryBriefing({
    title: `${path.icon || '🗺️'} ${t('campaign.episodeLabel', { n: episodeIndex + 1 })} — ${t(ep.nameKey)}`,
    storyKey: storyCampaignKey(path.id, episodeIndex, 'intro'),
    fallbackKey: ep.descKey,
    objectives: activeObjectives,
    buttonLabel: t('story.beginEpisode'),
  });
}

function showCampaignEpisodeStoryOutro(path, episodeIndex, onContinue){
  const ep = path && path.episodes && path.episodes[episodeIndex];
  if (!path || !ep){
    if (typeof onContinue === 'function') onContinue();
    return;
  }
  showStoryOutro({
    title: t('campaign.episodeCompleteTitle'),
    storyKey: storyCampaignKey(path.id, episodeIndex, 'outro'),
    fallbackKey: ep.descKey,
    onContinue,
  });
}

window.showScenarioStoryIntro = showScenarioStoryIntro;
window.showScenarioStoryOutro = showScenarioStoryOutro;
window.showCampaignEpisodeStoryIntro = showCampaignEpisodeStoryIntro;
window.showCampaignEpisodeStoryOutro = showCampaignEpisodeStoryOutro;
