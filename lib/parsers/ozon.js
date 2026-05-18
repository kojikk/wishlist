'use strict';

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const defaultEmoji = '🛍️';
const defaultTitle = 'Ozon';

const CHROMIUM_PATH  = process.env.CHROMIUM_PATH  || '/usr/bin/chromium-browser';
const COOKIES_PATH   = process.env.OZON_COOKIES_PATH
  || path.join(process.env.DATA_DIR || '/app/config', 'ozon_cookies.json');

/**
 * Загружает куки из файла.
 * Поддерживает два формата:
 *   - JSON (массив объектов Playwright)
 *   - Netscape (текстовый, экспорт из браузера)
 */
function loadCookies() {
  let raw;
  try {
    raw = fs.readFileSync(COOKIES_PATH, 'utf8');
  } catch {
    return null;
  }

  const trimmed = raw.trim();

  // JSON-формат
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { return null; }
  }

  // Netscape-формат: domain TAB flag TAB path TAB secure TAB expires TAB name TAB value
  const cookies = [];
  for (const line of trimmed.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [domain, , cookiePath, secure, expires, name, value] = parts;
    cookies.push({
      name:     name.trim(),
      value:    value.trim(),
      domain:   domain.trim(),
      path:     cookiePath.trim() || '/',
      secure:   secure.trim().toUpperCase() === 'TRUE',
      httpOnly: false,
      ...(expires && !isNaN(Number(expires)) ? { expires: Math.floor(Number(expires)) } : {}),
    });
  }
  return cookies.length > 0 ? cookies : null;
}

async function fetch(cfg) {
  const cookies = loadCookies();
  if (!cookies) {
    throw new Error(
      `Ozon: файл с куками не найден (${COOKIES_PATH}). ` +
      'Экспортируйте куки из браузера (расширение Cookie-Editor → Export All → JSON) ' +
      `и сохраните в ${COOKIES_PATH}`
    );
  }

  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 },
    });

    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US'] });
      window.chrome = { runtime: {} };
    });

    // Нормализуем куки: убираем невалидные поля, фиксируем домен
    const normalizedCookies = cookies.map(c => ({
      name:     c.name,
      value:    c.value,
      domain:   c.domain || '.ozon.ru',
      path:     c.path || '/',
      secure:   c.secure ?? true,
      httpOnly: c.httpOnly ?? false,
      sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax',
      ...(c.expires && c.expires > 0 ? { expires: c.expires } : {}),
    }));
    await ctx.addCookies(normalizedCookies);

    const page = await ctx.newPage();

    // Перехватываем ответы виджета с товарами (Ozon widget JSON API)
    let interceptedItems = null;
    page.on('response', async res => {
      if (interceptedItems) return; // уже поймали
      const url = res.url();
      if (!url.includes('widget/json') && !url.includes('entrypoint-api')) return;
      if (res.status() !== 200) return;
      try {
        const json = await res.json();
        const items = extractItemsFromWidget(json);
        if (items && items.length > 0) interceptedItems = items;
      } catch {}
    });

    await page.goto(cfg.profile_url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Ждём загрузки товаров в DOM
    try {
      await page.waitForSelector('.tile-root', { timeout: 45000 });
    } catch {
      const url = page.url();
      if (url.includes('ozonid') || url.includes('login')) {
        throw new Error('Ozon: куки устарели или невалидны — обновите config/ozon_cookies.json');
      }
      throw new Error(
        'Ozon: товары не загрузились (таймаут). Убедитесь, что куки актуальны и ' +
        `страница доступна: ${url}`
      );
    }

    // Прокрутка для lazy-load
    let prevCount = 0;
    for (let i = 0; i < 30; i++) {
      const count = await page.locator('.tile-root').count();
      if (count === prevCount && i > 0) break;
      prevCount = count;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(1000);
    }

    return await page.$$eval('.tile-root', tiles =>
      tiles.map(tile => {
        // Ссылки на продукт
        const linkEls = Array.from(tile.querySelectorAll('a[href*="/product/"]'));
        const rawUrl  = linkEls[0]?.href || '';
        const cleanUrl = rawUrl.split('?')[0];
        const idMatch  = cleanUrl.match(/(\d+)\/?$/);
        const productId = idMatch ? idMatch[1] : null;

        // Название — ссылка без <img>
        const nameLink = linkEls.find(a => !a.querySelector('img'));
        const name     = nameLink?.querySelector('span')?.textContent.trim() || '';

        // Цена
        const priceEl = tile.querySelector('[class*="tsHeadline500Medium"]');
        const price   = priceEl?.textContent.trim() || '';

        // Изображение
        const imgEl   = tile.querySelector('img[loading]');
        const imageUrl = imgEl?.src || '';

        return { productId, name, price, imageUrl, cleanUrl };
      })
    ).then(items =>
      items
        .filter(i => i.name && i.cleanUrl && i.productId)
        .map(i => ({
          id:       `ozon_${i.productId}`,
          name:     i.name,
          sub:      i.price || '',
          imageUrl: i.imageUrl,
          tags:     [],
          links:    [{ label: 'Купить на Ozon', url: i.cleanUrl }],
        }))
    );

  } finally {
    await browser.close();
  }
}

/**
 * Пытается извлечь товары из перехваченного JSON-ответа виджета Ozon.
 * Используется как запасной вариант, если DOM-парсинг недоступен.
 */
function extractItemsFromWidget(json) {
  try {
    const str = JSON.stringify(json);
    if (!str.includes('"name"') || !str.includes('/product/')) return null;
    // Ищем массивы с полями name + url
    const found = [];
    JSON.stringify(json, (key, val) => {
      if (
        val && typeof val === 'object' &&
        typeof val.name === 'string' && val.name.length > 3 &&
        typeof val.url === 'string' && val.url.includes('/product/')
      ) {
        found.push(val);
      }
      return val;
    });
    return found.length > 0 ? found : null;
  } catch {
    return null;
  }
}

const meta = {
  id:             'ozon',
  defaultEmoji,
  defaultTitle,
  description:    'Импортирует подборку или вишлист с Ozon. Требует куки браузера: config/ozon_cookies.json',
  urlPlaceholder: 'https://ozon.ru/t/XXXXXXX',
  requiresEnv:    [],
  cookiesFile:    'ozon_cookies.json',
};

module.exports = { fetch, meta, defaultEmoji, defaultTitle };
