'use strict';

const https = require('https');
const http  = require('http');

const defaultEmoji = '🎮';
const defaultTitle = 'Steam';

function buildDataUrl(input) {
  const m = input.match(/wishlist\/(id|profiles)\/([^/?#\s]+)/);
  if (m) return `https://store.steampowered.com/wishlist/${m[1]}/${m[2]}/wishlistdata/`;
  const plain = input.trim().replace(/^https?:\/\//, '').replace(/^store\.steampowered\.com\/id\//, '');
  if (/^[A-Za-z0-9_-]+$/.test(plain))
    return `https://store.steampowered.com/wishlist/id/${plain}/wishlistdata/`;
  throw new Error('Cannot parse Steam profile URL: ' + input);
}

function get(url, redirectsLeft = 6) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' },
    }, res => {
      if ([301, 302, 303].includes(res.statusCode) && res.headers.location && redirectsLeft > 0)
        return get(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('JSON parse error from ' + url)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Steam fetch timeout')); });
  });
}

async function fetch(cfg) {
  const baseUrl = buildDataUrl(cfg.profile_url);
  const all = {};
  for (let p = 0; p < 15; p++) {
    const data = await get(`${baseUrl}?p=${p}`);
    if (!data || typeof data !== 'object' || !Object.keys(data).length) break;
    Object.assign(all, data);
    if (Object.keys(data).length < 100) break;
  }
  return Object.entries(all)
    .filter(([, v]) => v?.name)
    .sort((a, b) => (a[1].priority ?? 9999) - (b[1].priority ?? 9999))
    .map(([appid, g]) => ({
      id: `steam_${appid}`,
      name: g.name,
      sub: g.is_free_game ? 'Бесплатная игра' : '',
      links: [{ label: 'Steam', url: `https://store.steampowered.com/app/${appid}/` }],
    }));
}

module.exports = { fetch, defaultEmoji, defaultTitle };
