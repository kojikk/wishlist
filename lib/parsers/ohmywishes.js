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
          return reject(new Error('OhMyWishes returned HTML — profile may be private'));
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('JSON parse error from ' + url)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('OhMyWishes fetch timeout')); });
  });
}

function mapItem(w) {
  const imageUrl = w.photos?.[0]?.thumbnails?.[0]?.url
    || w.photos?.[0]?.url
    || null;
  const pricePart = w.price
    ? `${w.price.toLocaleString('ru-RU')} ${w.currency || 'RUB'}`
    : '';
  const sub = [pricePart, w.description || ''].filter(Boolean).join(' · ');
  const links = w.link ? [{ label: 'Купить', url: w.link }] : [];
  return { id: `omw_${w._id}`, name: w.title, sub, imageUrl, links };
}

async function fetch(cfg) {
  const username = extractUsername(cfg.profile_url || cfg.wishlist_url || '');

  const profile = await getJSON(`https://ohmywishes.com/api/v3/users/${username}`);
  const userId = profile?.item?.id;
  if (!userId) throw new Error(`OhMyWishes user not found: ${username}`);

  // Fetch all wish lists (categories)
  const listsData = await getJSON(`https://ohmywishes.com/api/v3/users/${userId}/wish-lists`);
  const lists = listsData?.items || [];
  const listOrder = lists.map(l => l.id);

  // Fetch all wishes with pagination
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

  const visible = all.filter(w => !w.private && !w.fulfilled);

  // Group by all lists an item belongs to; items with no list → uncategorized bucket
  const byList = {};   // listId → items[]
  const uncategorized = [];

  for (const w of visible) {
    const item = mapItem(w);
    const lists = w.wish_lists || [];
    if (lists.length) {
      for (const wl of lists) {
        const listId = wl._id;
        if (!listId) continue;
        if (!byList[listId]) byList[listId] = [];
        byList[listId].push(item);
      }
    } else {
      uncategorized.push(item);
    }
  }

  const emoji = cfg.category_emoji || defaultEmoji;
  const cats = [];

  // Uncategorized first (if any)
  if (uncategorized.length) {
    cats.push({
      id: `__omw_other__`,
      title: cfg.category_title || defaultTitle,
      emoji,
      items: uncategorized,
    });
  }

  // Then in list order
  for (const listId of listOrder) {
    if (byList[listId]?.length) {
      const listMeta = lists.find(l => l.id === listId);
      cats.push({
        id: `__omw_${listId}__`,
        title: listMeta?.title || listId,
        emoji,
        items: byList[listId],
      });
    }
  }

  // If everything is flat (no lists), return items array for single-cat compat
  if (cats.length === 0) return [];

  return cats; // array of {id, title, emoji, items} — multi-category signal
}

module.exports = { fetch, defaultEmoji, defaultTitle };
