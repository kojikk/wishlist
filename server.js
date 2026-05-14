'use strict';

require('dotenv').config();
const express  = require('express');
const sqlite3  = require('sqlite3').verbose();
const path     = require('path');
const fs       = require('fs');
const PARSERS  = require('./lib/parsers');

const PORT        = process.env.PORT        || 3000;
const DB_PATH     = process.env.DB_PATH     || path.join(__dirname, 'data', 'wishlist.db');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || null;
const CONFIG_DIR  = path.join(__dirname, 'config');
const PUBLIC_DIR  = path.join(__dirname, 'public');

// ─── Config ──────────────────────────────────────────────────────────────────

function loadConfig() {
  const wPath = path.join(CONFIG_DIR, 'wishlist.json');
  const aPath = path.join(CONFIG_DIR, 'app.json');
  if (!fs.existsSync(wPath)) throw new Error(`Not found: ${wPath}`);
  if (!fs.existsSync(aPath)) throw new Error(`Not found: ${aPath}`);
  return {
    wishlist: JSON.parse(fs.readFileSync(wPath, 'utf8')),
    app:      JSON.parse(fs.readFileSync(aPath, 'utf8')),
  };
}

try {
  const cfg = loadConfig();
  console.log(`Config OK: ${cfg.wishlist.length} categories loaded`);
} catch (e) {
  console.error('FATAL:', e.message);
  process.exit(1);
}

// ─── Parser cache ─────────────────────────────────────────────────────────────
// Map<parserId, { cat: { id, emoji, title, items, _external }, fetchedAt }>
const parserCache = new Map();
const parserTimers = {};

async function runParser(parserId, cfg) {
  const parser = PARSERS[parserId];
  if (!parser) throw new Error(`Unknown parser: ${parserId}`);
  const items = await parser.fetch(cfg);
  parserCache.set(parserId, {
    cat: {
      id: `__${parserId}__`,
      emoji: cfg.category_emoji || parser.defaultEmoji || '📋',
      title: cfg.category_title || parser.defaultTitle || parserId,
      items,
      _external: true,
    },
    fetchedAt: Date.now(),
  });
  console.log(`[parser:${parserId}] fetched ${items.length} items`);
  broadcastReload();
}

function scheduleParser(parserId, cfg) {
  clearTimeout(parserTimers[parserId]);
  if (!cfg?.enabled) {
    if (parserCache.has(parserId)) {
      parserCache.delete(parserId);
      broadcastReload();
    }
    return;
  }
  runParser(parserId, cfg).catch(e => console.error(`[parser:${parserId}] error:`, e.message));
  const ms = (cfg.refresh_hours || 6) * 3_600_000;
  parserTimers[parserId] = setTimeout(() => scheduleParser(parserId, cfg), ms);
}

function scheduleParsers() {
  try {
    const { app } = loadConfig();
    for (const [id, cfg] of Object.entries(app.parsers || {})) {
      scheduleParser(id, cfg);
    }
  } catch (e) {
    console.error('scheduleParsers:', e.message);
  }
}

// ─── SSE ─────────────────────────────────────────────────────────────────────

const sseClients = new Set();

function broadcastReload() {
  for (const res of sseClients) {
    try { res.write('data: reload\n\n'); } catch {}
  }
}

[
  path.join(CONFIG_DIR, 'wishlist.json'),
  path.join(CONFIG_DIR, 'app.json'),
].forEach(f => {
  fs.watch(f, () => {
    console.log(`Config changed: ${path.basename(f)}`);
    setTimeout(broadcastReload, 80);
  });
});

const indexPath = path.join(PUBLIC_DIR, 'index.html');
if (fs.existsSync(indexPath)) {
  fs.watch(indexPath, () => {
    console.log('index.html changed');
    setTimeout(broadcastReload, 80);
  });
}

// ─── DB ──────────────────────────────────────────────────────────────────────

const db = new sqlite3.Database(DB_PATH, err => {
  if (err) { console.error('DB error:', err); process.exit(1); }
  console.log(`SQLite: ${DB_PATH}`);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    item_id    TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    username   TEXT DEFAULT '',
    first_name TEXT DEFAULT 'Аноним',
    booked_at  INTEGER DEFAULT (strftime('%s','now'))
  )`);
});

const dbAll = (sql, p=[]) => new Promise((res,rej) => db.all(sql, p, (e,r) => e ? rej(e) : res(r)));
const dbRun = (sql, p=[]) => new Promise((res,rej) => db.run(sql, p, function(e) { e ? rej(e) : res(this); }));

// ─── App ─────────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(PUBLIC_DIR));

function adminAuth(req, res, next) {
  if (!ADMIN_TOKEN) return res.status(403).json({ error: 'ADMIN_TOKEN not configured' });
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ─── SSE endpoint ────────────────────────────────────────────────────────────

app.get('/api/reload-stream', (req, res) => {
  res.set({
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');
  const ka = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 25000);
  sseClients.add(res);
  req.on('close', () => { sseClients.delete(res); clearInterval(ka); });
});

// ─── Public API ──────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
  try {
    const cfg = loadConfig();
    const externalCats = [...parserCache.values()].map(c => c.cat);
    res.json({ wishlist: [...cfg.wishlist, ...externalCats], app: cfg.app });
  } catch (e) {
    console.error('Config read error:', e);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM bookings');
    const out = {};
    for (const r of rows) out[r.item_id] = { id: r.user_id, username: r.username, name: r.first_name, at: r.booked_at };
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/book', async (req, res) => {
  const { itemId, user } = req.body;
  if (!itemId || !user?.id) return res.status(400).json({ error: 'itemId and user required' });
  try {
    await dbRun(`INSERT INTO bookings (item_id,user_id,username,first_name) VALUES (?,?,?,?)`,
      [itemId, String(user.id), user.username||'', user.first_name||'Аноним']);
    res.json({ success: true });
  } catch { res.status(409).json({ error: 'Already booked' }); }
});

app.post('/api/unbook', async (req, res) => {
  const { itemId, user } = req.body;
  if (!itemId || !user?.id) return res.status(400).json({ error: 'itemId and user required' });
  try {
    const r = await dbRun(`DELETE FROM bookings WHERE item_id=? AND user_id=?`, [itemId, String(user.id)]);
    if (r.changes === 0) return res.status(403).json({ error: 'Not your booking' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Admin: bookings ─────────────────────────────────────────────────────────

app.get('/api/admin/bookings', adminAuth, async (req, res) => {
  res.json(await dbAll('SELECT * FROM bookings ORDER BY booked_at DESC'));
});

app.delete('/api/admin/bookings/:itemId', adminAuth, async (req, res) => {
  await dbRun('DELETE FROM bookings WHERE item_id=?', [req.params.itemId]);
  res.json({ success: true });
});

app.delete('/api/admin/bookings', adminAuth, async (req, res) => {
  await dbRun('DELETE FROM bookings');
  res.json({ success: true });
});

// ─── Admin: wishlist ─────────────────────────────────────────────────────────

app.get('/api/admin/wishlist', adminAuth, (req, res) => {
  try { res.json(loadConfig().wishlist); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/wishlist', adminAuth, (req, res) => {
  try {
    fs.writeFileSync(path.join(CONFIG_DIR, 'wishlist.json'), JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Admin: app config ───────────────────────────────────────────────────────

app.get('/api/admin/app-config', adminAuth, (req, res) => {
  try { res.json(loadConfig().app); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/app-config', adminAuth, (req, res) => {
  try {
    fs.writeFileSync(path.join(CONFIG_DIR, 'app.json'), JSON.stringify(req.body, null, 2), 'utf8');
    scheduleParsers();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Admin: parsers ───────────────────────────────────────────────────────────

app.get('/api/admin/parsers', adminAuth, (req, res) => {
  const { app: appCfg } = loadConfig();
  const result = {};
  for (const [id, cfg] of Object.entries(appCfg.parsers || {})) {
    const cached = parserCache.get(id);
    result[id] = {
      enabled: cfg.enabled,
      itemCount: cached?.cat?.items?.length ?? null,
      fetchedAt: cached?.fetchedAt ?? null,
    };
  }
  res.json(result);
});

app.post('/api/admin/parsers/:id/refresh', adminAuth, async (req, res) => {
  const { app: appCfg } = loadConfig();
  const cfg = appCfg.parsers?.[req.params.id];
  if (!cfg) return res.status(404).json({ error: 'Parser not found in config' });
  try {
    await runParser(req.params.id, cfg);
    res.json({ success: true, count: parserCache.get(req.params.id)?.cat?.items?.length ?? 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Admin UI ────────────────────────────────────────────────────────────────

app.get('/admin', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Wishlist running on :${PORT}`);
  if (!ADMIN_TOKEN || ADMIN_TOKEN === 'change_me_please')
    console.warn('⚠️  ADMIN_TOKEN not set — admin endpoints disabled');
  scheduleParsers();
});
