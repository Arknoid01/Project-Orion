const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push('CON: ' + msg.text());
  });
  const fileUrl = 'file:///' + path.resolve(__dirname, '..').replace(/\\/g, '/') + '/index.html';
  await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2500);
  const state = await page.evaluate(() => {
    const hud = document.querySelector('.hud');
    const manageBtn = document.getElementById('manageBtn');
    const menu = document.getElementById('mainMenuOverlay');
    const quickBuild = document.getElementById('quickBuild');
    const tools = document.querySelector('.floatingTools');
    function info(el) {
      if (!el) return { exists: false };
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        exists: true,
        display: s.display,
        visibility: s.visibility,
        opacity: s.opacity,
        zIndex: s.zIndex,
        pointerEvents: s.pointerEvents,
        rect: { w: r.width, h: r.height, top: r.top, left: r.left },
      };
    }
    return {
      hud: info(hud),
      manageBtn: info(manageBtn),
      menuOpen: menu ? menu.classList.contains('open') : null,
      menu: info(menu),
      quickBuild: info(quickBuild),
      tools: info(tools),
      canvasWrap: info(document.getElementById('canvasWrap')),
      gridDefined: typeof grid !== 'undefined',
    };
  });
  console.log(JSON.stringify({ errors, state }, null, 2));
  await browser.close();
})().catch(e => {
  console.error('FAIL', e);
  process.exit(1);
});
