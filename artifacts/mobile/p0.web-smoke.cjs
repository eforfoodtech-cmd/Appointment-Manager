// Isolated browser smoke test. No existing browser profile/session is accessed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Erkam/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const backend = process.env.P0_TEST_BACKEND || 'http://127.0.0.1:8083';
  let testToken;
  try {
    const page = await browser.newPage({ viewport: { width: Number(process.env.P0_TEST_WIDTH || 1280), height: 900 } });
    page.on('response', async response => { if (response.url().endsWith('/api/auth/login') && response.status() === 200) testToken = (await response.json()).token; });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Test the current frontend against the isolated new backend.
    await page.route('**/api/**', route => route.continue({ url: route.request().url().replace(/http:\/\/(?:localhost|127\.0\.0\.1):8080/, backend) }));
    await page.goto('http://127.0.0.1:8081/login');
    await page.getByPlaceholder('ornek@mail.com veya 5551112233').fill('5550000001');
    await page.getByPlaceholder('En az 6 karakter').fill('123456');
    await page.getByText('Giriş Yap', { exact: true }).last().click();
    await page.getByText('Profil', { exact: true }).last().click({ timeout: 30000 });
    await page.getByRole('button', { name: 'Hizmetler, fiyatlar ve izinler +' }).click();
    await page.getByText('Hizmet adı', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Hesap, görseller ve güvenlik +' }).click();
    await page.getByText('Cihaz oturumları', { exact: true }).waitFor();
    await page.screenshot({ path: 'p0-profile-smoke.png', fullPage: true });
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: web login, profile, service/calendar controls and account sessions render without page errors.');
  } finally {
    if (testToken) {
      const headers = { Authorization: `Bearer ${testToken}` };
      const response = await fetch(backend + '/api/account/sessions', { headers });
      if (response.ok) {
        const current = (await response.json()).find(session => session.current);
        if (current) await fetch(backend + '/api/account/sessions/' + current.id, { method: 'DELETE', headers });
      }
    }
    await browser.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
