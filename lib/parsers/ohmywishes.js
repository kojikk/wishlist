'use strict';

const https = require('https');

const defaultEmoji = '🎁';
const defaultTitle = 'OhMyWishes';

function extractUsername(input) {
  const m = input.match(/ohmywishes\.com\/users\/([A-Za-z0-9_.-]+)/);
  if (m) return m[1];
  const plain = input.trim().replace(/^https?:\/\//, '').replace(/^ohmywishes\.com\/users\//, '');
  if (/^[A-Za-z0-9_.-]+$/.test(plain)) return plain;
  throw new Error('Cannot parse OhMyWishes URL: ' + input);
}

function getJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        if (raw.trimStart().startsWith('<'))
          return reject(new Error('OhMyWishes returned HTML — profile may be private or not found'));
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('JSON parse error from ' + url)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('OhMyWishes fetch timeout')); });
  });
}

async function fetch(cfg) {
  const username = extractUsername(cfg.profile_url || cfg.wishlist_url || '');

  const profile = await getJSON(`https://ohmywishes.com/api/v3/users/${username}`);
  const userId = profile?.item?.id;
  if (!userId) throw new Error(`OhMyWishes user not found: ${username}`);

  const all = [];
  const PAGE_SIZE = 100;
  for (let page = 1; page <= 30; page++) {
    const data = await getJSON(
      `https://ohmywishes.com/api/v2/users/${userId}/wishes?size=${PAGE_SIZE}&page=${page}`
    );
    if (!Array.isArray(data) || !data.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return all
    .filter(w => !w.private && !w.fulfilled)
    .map(w => {
      const pricePart = w.price
        ? `${w.price.toLocaleString('ru-RU')} ${w.currency || 'RUB'}`
        : '';
      const sub = [pricePart, w.description || ''].filter(Boolean).join(' · ');
      const links = w.link ? [{ label: 'Купить', url: w.link }] : [];
      return { id: `omw_${w._id}`, name: w.title, sub, links };
    });
}

module.exports = { fetch, defaultEmoji, defaultTitle };
