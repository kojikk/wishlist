'use strict';

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const defaultEmoji = '🎮';
const defaultTitle = 'Steam';

// Persistent name cache: /app/data/steam_names.json
const NAMES_CACHE_PATH = path.join(process.env.DATA_DIR || '/app/data', 'steam_names.json');
let namesCache = {};
try { namesCache = JSON.parse(fs.readFileSync(NAMES_CACHE_PATH, 'utf8')); } catch {}

function saveNamesCache() {
  try { fs.writeFileSync(NAMES_CACHE_PATH, JSON.stringify(namesCache)); } catch {}
}

function get(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    }, res => {
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
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Steam fetch timeout')); });
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function resolveVanity(vanity, apiKey) {
  const url = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${apiKey}&vanityurl=${encodeURIComponent(vanity)}`;
  const data = await get(url);
  if (data?.response?.success !== 1)
    throw new Error(`Could not resolve Steam vanity URL "${vanity}": ${data?.response?.message || 'not found'}`);
  return data.response.steamid;
}

async function getSteamId(profileUrl, apiKey) {
  const mProfiles = profileUrl.match(/\/profiles\/(\d{17})/);
  if (mProfiles) return mProfiles[1];
  const mId = profileUrl.match(/\/(?:id|wishlist\/id)\/([A-Za-z0-9_-]+)/);
  const vanity = mId ? mId[1] : profileUrl.trim().replace(/^https?:\/\/.*\//, '').replace(/\/$/, '');
  if (!vanity) throw new Error('Cannot extract Steam ID from URL: ' + profileUrl);
  return resolveVanity(vanity, apiKey);
}

async function fetchAppDetails(appid) {
  const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=english&cc=us`;
  const data = await get(url, 25000);
  const entry = data?.[appid];
  if (entry?.success && entry.data) {
    return {
      name: entry.data.name || null,
      genres: (entry.data.genres || []).map(g => g.description).slice(0, 5),
    };
  }
  return null;
}

// Fetch game details sequentially with persistent name cache
async function fetchGameDetails(appids) {
  const details = {};
  let cacheDirty = false;

  for (const appid of appids) {
    // Use cached name+genres if available
    if (namesCache[appid]) {
      details[appid] = namesCache[appid];
      continue;
    }
    // Fetch with up to 2 retries
    let d = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await sleep(600 * attempt);
        d = await fetchAppDetails(appid);
        if (d) break;
      } catch (e) {
        console.warn(`[steam parser] appdetails attempt ${attempt + 1} failed for ${appid}:`, e.message);
      }
    }
    if (d) {
      details[appid] = d;
      namesCache[appid] = d;
      cacheDirty = true;
    }
    // Small delay between requests to avoid rate-limiting
    await sleep(150);
  }

  if (cacheDirty) saveNamesCache();
  return details;
}

async function fetch(cfg) {
  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) throw new Error('STEAM_API_KEY is not set in environment');

  const steamId = await getSteamId(cfg.profile_url, apiKey);

  const url = `https://api.steampowered.com/IWishlistService/GetWishlist/v1/?key=${apiKey}&steamid=${steamId}`;
  const data = await get(url);

  const items = data?.response?.items;
  if (!Array.isArray(items) || items.length === 0) {
    if (data?.response && !items)
      throw new Error('Wishlist is private or empty — set Steam wishlist visibility to Public');
    return [];
  }

  const sorted = [...items].sort((a, b) => (a.priority ?? 9999) - (b.priority ?? 9999));
  const appids = sorted.map(i => String(i.appid));
  const details = await fetchGameDetails(appids);

  return sorted.map(item => {
    const appid = String(item.appid);
    const d = details[appid] || {};
    return {
      id: `steam_${appid}`,
      name: d.name || `App ${appid}`,
      sub: '',
      tags: d.genres || [],
      imageUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
      links: [{ label: 'Steam Store', url: `https://store.steampowered.com/app/${appid}/`, style: 'steam' }],
    };
  });
}

/**
 * @type {import('../parsers').ParserMeta}
 *
 * meta — публичный «паспорт» парсера. Используется auto-discovery в lib/parsers/index.js
 * и админкой для построения UI. Поле `id` ОБЯЗАНО совпадать с именем файла (steam.js → 'steam').
 */
const meta = {
  id: 'steam',
  defaultEmoji,
  defaultTitle,
  description: 'Импортирует вишлист из Steam через официальный Steam Web API',
  urlPlaceholder: 'https://store.steampowered.com/wishlist/id/USERNAME/',
  requiresEnv: ['STEAM_API_KEY'],
};

module.exports = { fetch, meta, defaultEmoji, defaultTitle };
