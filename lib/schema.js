'use strict';

/**
 * Wishlist Protocol — формальный контракт данных.
 *
 * Это «public API» приложения. Любой форк ОБЯЗАН отдавать данные в этой форме
 * через стабильные эндпоинты (см. /api/manifest, /api/config, /api/bookings).
 * Изменение поля = breaking change → требует bump PROTOCOL_VERSION.
 *
 * Внешние оркестраторы полагаются на эту форму. Если меняете внутренние
 * структуры в форке — следите, чтобы выдаваемые наружу данные оставались
 * совместимыми с этой схемой.
 */

const PROTOCOL_VERSION = '1.0';

/**
 * Item — желание / товар.
 *
 * @typedef {object} Item
 * @property {string}  id        Уникальный идентификатор (стабильный — на него ссылаются брони)
 * @property {string}  name      Название (обязательно, непустое)
 * @property {string}  [sub]     Подпись/уточнение
 * @property {string}  [imageUrl] URL картинки превью
 * @property {string[]} [images] Дополнительные картинки (для карусели)
 * @property {string[]} [tags]   Теги / категории / жанры
 * @property {Link[]}   [links]  Ссылки на покупку / источники
 */

/**
 * Link — ссылка на покупку.
 *
 * @typedef {object} Link
 * @property {string} label  Видимая подпись (обязательно)
 * @property {string} url    URL (обязательно)
 * @property {string} [style] Опциональный визуальный стиль: 'steam' и т.п.
 */

/**
 * Category — категория желаний.
 *
 * @typedef {object} Category
 * @property {string}  id        Уникальный идентификатор категории
 * @property {string}  [emoji]   Эмодзи-иконка
 * @property {string}  title     Название (обязательно)
 * @property {string}  [sub]     Подпись/уточнение
 * @property {Item[]}  items     Список желаний (может быть пустым)
 * @property {string}  [source]  Источник данных (id парсера). Отсутствует у ручных категорий
 * @property {boolean} [_external] true, если категория сгенерирована парсером
 */

/**
 * Booking — бронь желания.
 *
 * @typedef {object} Booking
 * @property {string} id        Telegram user_id того, кто забронировал
 * @property {string} [username] Telegram @username (может отсутствовать)
 * @property {string} name      Имя для отображения
 * @property {number} [at]      Unix-timestamp создания брони (секунды)
 */

// ── Validators ──────────────────────────────────────────────────────────────

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

/**
 * Валидирует Item. Возвращает массив строк-ошибок (пустой = ok).
 * @param {any} item
 * @returns {string[]}
 */
function validateItem(item) {
  const errors = [];
  if (!item || typeof item !== 'object') return ['item must be an object'];
  if (!isNonEmptyString(item.id))   errors.push('item.id must be a non-empty string');
  if (!isNonEmptyString(item.name)) errors.push('item.name must be a non-empty string');
  if (item.links !== undefined) {
    if (!Array.isArray(item.links)) errors.push('item.links must be an array');
    else item.links.forEach((l, i) => {
      if (!isNonEmptyString(l?.label)) errors.push(`item.links[${i}].label must be a non-empty string`);
      if (!isNonEmptyString(l?.url))   errors.push(`item.links[${i}].url must be a non-empty string`);
    });
  }
  if (item.tags !== undefined && !Array.isArray(item.tags)) errors.push('item.tags must be an array');
  if (item.images !== undefined && !Array.isArray(item.images)) errors.push('item.images must be an array');
  return errors;
}

/**
 * Валидирует Category. Возвращает массив строк-ошибок (пустой = ok).
 * @param {any} cat
 * @returns {string[]}
 */
function validateCategory(cat) {
  const errors = [];
  if (!cat || typeof cat !== 'object') return ['category must be an object'];
  if (!isNonEmptyString(cat.id))    errors.push('category.id must be a non-empty string');
  if (!isNonEmptyString(cat.title)) errors.push('category.title must be a non-empty string');
  if (!Array.isArray(cat.items))    errors.push('category.items must be an array');
  else cat.items.forEach((it, i) => {
    validateItem(it).forEach(e => errors.push(`category.items[${i}]: ${e}`));
  });
  return errors;
}

module.exports = {
  PROTOCOL_VERSION,
  validateItem,
  validateCategory,
};
