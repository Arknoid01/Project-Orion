/* Chargement dynamique de scripts (fallback Canvas2D, modules optionnels). */
window.loadGameScript = function(src){
  return new Promise(function(resolve, reject){
    const existing = document.querySelector('script[data-dynamic-src="' + src + '"]');
    if (existing){ resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.dataset.dynamicSrc = src;
    s.onload = function(){ resolve(); };
    s.onerror = function(){ reject(new Error('Échec chargement ' + src)); };
    document.head.appendChild(s);
  });
};

window.loadGameScripts = function(list){
  let chain = Promise.resolve();
  list.forEach(function(src){
    chain = chain.then(function(){ return window.loadGameScript(src); });
  });
  return chain;
};
