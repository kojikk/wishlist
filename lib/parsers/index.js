'use strict';

/**
 * Реестр парсеров с auto-discovery.
 *
 * Чтобы добавить парсер в форке:
 *   1. Создайте файл lib/parsers/myparser.js
 *   2. Экспортируйте { fetch, meta } (см. ParserMeta ниже и пример в steam.js)
 *   3. Добавьте конфиг в config/app.json → parsers.myparser
 *
 * Никаких правок этого файла не требуется — он сканирует папку при загрузке.
 *
 * @typedef {object} ParserMeta
 * @property {string}   id              Уникальный id (должен совпадать с именем файла без .js)
 * @property {string}   defaultTitle    Название категории по умолчанию
 * @property {string}   defaultEmoji    Эмодзи категории по умолчанию
 * @property {string}   [description]   Краткое описание (показывается в админке)
 * @property {string}   [urlPlaceholder] Подсказка для поля URL в админке
 * @property {string[]} [requiresEnv]   Список .env-переменных, обязательных для работы
 *
 * @typedef {object} ParserModule
 * @property {(cfg: object) => Promise<Item[]|Category[]>} fetch
 * @property {ParserMeta} meta
 */

const fs   = require('fs');
const path = require('path');

const PARSERS = {};

const files = fs.readdirSync(__dirname).filter(f =>
  f.endsWith('.js') && f !== 'index.js'
);

for (const file of files) {
  const id = path.basename(file, '.js');
  let mod;
  try {
    mod = require(path.join(__dirname, file));
  } catch (e) {
    console.warn(`[parsers] failed to load ${file}:`, e.message);
    continue;
  }
  if (typeof mod?.fetch !== 'function') {
    console.warn(`[parsers] ${file}: missing fetch() — skipped`);
    continue;
  }
  if (!mod.meta || mod.meta.id !== id) {
    console.warn(`[parsers] ${file}: meta.id must equal '${id}' — skipped`);
    continue;
  }
  PARSERS[id] = mod;
}

console.log(`[parsers] discovered: ${Object.keys(PARSERS).join(', ') || '(none)'}`);

module.exports = PARSERS;
