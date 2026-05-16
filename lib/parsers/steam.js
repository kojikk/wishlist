'use strict';

const https = require('https');

const defaultEmoji = '🎮';
const defaultTitle = 'Steam';

function get(url) {
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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Steam fetch timeout')); });
  });
}

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

// Fetch game details (name + genres) in parallel, 10 at a time
async function fetchGameDetails(appids) {
  const details = {};
  const CONCURRENCY = 10;
  for (let i = 0; i < appids.length; i += CONCURRENCY) {
    const batch = appids.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async appid => {
      try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`;
        const data = await get(url);
        const entry = data?.[appid];
        if (entry?.success && entry.data) {
          details[appid] = {
            name: entry.data.name || null,
            genres: (entry.data.genres || []).map(g => g.description).slice(0, 5),
          };
        }
      } catch (e) {
        console.warn(`[steam parser] appdetails failed for ${appid}:`, e.message);
      }
    }));
  }
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

module.exports = { fetch, defaultEmoji, defaultTitle };
