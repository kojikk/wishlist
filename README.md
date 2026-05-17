# Wishlist Mini App

Личный вишлист в виде Telegram Web App. Гости открывают мини-приложение прямо в Telegram, видят список желаний и могут забронировать подарок, чтобы другие не задублировались. Администратор управляет списком через веб-интерфейс.

---

## Оглавление

- [Возможности](#возможности)
- [Стек](#стек)
- [Структура проекта](#структура-проекта)
- [Быстрый старт (Docker)](#быстрый-старт-docker)
- [Конфигурация](#конфигурация)
- [Админ-панель](#админ-панель)
- [Парсеры](#парсеры)
  - [Steam](#steam)
  - [OhMyWishes](#ohmywishes)
  - [Добавление своего парсера](#добавление-своего-парсера)
- [Кастомизация для форков](#кастомизация-для-форков)
  - [Тема и цвета](#тема-и-цвета)
  - [UI и вёрстка](#ui-и-вёрстка)
- [Совместимость с оркестратором](#совместимость-с-оркестратором)
  - [Стабильный контракт](#стабильный-контракт)
  - [Внутренние эндпоинты](#внутренние-эндпоинты)
- [API](#api)
- [Локальная разработка](#локальная-разработка-без-docker)
- [Развёртывание на сервере](#развёртывание-на-сервере)

---

## Возможности

- **Категории и желания** — структурированный список со ссылками на магазины для каждого желания
- **Бронирование** — гость бронирует желание под своим Telegram-аккаунтом; другим показывается, что оно уже занято
- **Закреплённые ссылки** — произвольные ссылки вверху страницы; Steam-ссылки получают особое оформление
- **Парсеры внешних вишлистов** — Steam, OhMyWishes; легко добавить свой (auto-discovery)
- **Информационные карточки** — блоки с текстом и контактами (например, «к кому обратиться за советом»)
- **Горячая перезагрузка** — страница обновляется автоматически при изменении конфигов или обновлении данных парсера (SSE)
- **Админ-панель** — редактирование вишлиста, drag-and-drop сортировка, управление парсерами, просмотр броней

---

## Стек

| Слой | Технология |
|---|---|
| Backend | Node.js (Express) |
| База данных | SQLite (через `sqlite3`) |
| Frontend | Vanilla JS, Telegram Web App SDK |
| Контейнеризация | Docker + Docker Compose |

---

## Структура проекта

```
wishlist-2/
├── server.js                 # Express-сервер, вся бизнес-логика
├── lib/
│   ├── schema.js             # Контракт данных (Item/Category/Booking) + PROTOCOL_VERSION
│   └── parsers/
│       ├── index.js          # Auto-discovery парсеров
│       ├── steam.js          # Steam Web API
│       └── ohmywishes.js     # OhMyWishes JSON
├── public/
│   ├── theme.css             # Палитра — редактируйте, чтобы сменить цвета
│   ├── index.html            # Главная страница (Telegram Web App)
│   ├── admin.html            # Админ-панель
│   └── media/                # Изображения и иконки
├── config/
│   ├── app.json              # Настройки приложения (не в git)
│   ├── wishlist.json         # Список желаний (не в git)
│   ├── app.json.example
│   └── wishlist.json.example
├── data/
│   └── wishlist.db           # SQLite (не в git, монтируется как volume)
├── Dockerfile
├── docker-compose.yml
├── .env                      # Переменные окружения (не в git)
└── .env.example
```

---

## Быстрый старт (Docker)

### 1. Клонировать репозиторий

```bash
git clone https://github.com/kojikk/wishlist.git
cd wishlist
```

### 2. Создать файл окружения

```bash
cp .env.example .env
```

Отредактируйте `.env` — обязательно задайте `ADMIN_TOKEN`:

```bash
openssl rand -hex 32   # сгенерировать случайный токен
```

### 3. Создать конфиги

```bash
cp config/app.json.example     config/app.json
cp config/wishlist.json.example config/wishlist.json
```

Отредактируйте оба файла под свои данные (подробнее в разделе [Конфигурация](#конфигурация)).

### 4. Запустить

```bash
docker compose up -d
```

Приложение будет доступно на `http://localhost:3050`.

### Обновление после изменений кода

```bash
docker compose up -d --build
```

### Просмотр логов

```bash
docker compose logs -f
```

---

## Конфигурация

### `.env`

| Переменная | Обязательность | Описание |
|---|---|---|
| `PORT` | нет (default `3000`) | Порт внутри контейнера |
| `DB_PATH` | нет (default `/app/data/wishlist.db`) | Путь к SQLite-файлу |
| `ADMIN_TOKEN` | **да** | Токен для доступа к `/admin` и `/api/admin/*` |
| `STEAM_API_KEY` | только если включён Steam-парсер | Ключ Steam Web API ([получить](https://steamcommunity.com/dev/apikey)) |
| `NODE_ENV` | нет (default `production`) | Режим запуска |

### `config/app.json`

Главный файл настроек приложения.

```jsonc
{
  // Закреплённые ссылки — показываются вверху главной страницы
  "pinned_links": [
    {
      "id": "steam",          // Уникальный идентификатор
      "type": "steam",        // "steam" — особое оформление, "link" — обычная ссылка
      "label": "Вишлист в Steam",
      "url":  "https://store.steampowered.com/wishlist/id/YOUR_STEAM_ID/",
      "note": "Подпись под названием (необязательно)"
    }
  ],

  // Парсеры внешних вишлистов (см. раздел "Парсеры")
  "parsers": {
    "steam": {
      "enabled": true,
      "profile_url": "https://store.steampowered.com/wishlist/id/YOUR_STEAM_ID/",
      "category_emoji": "🎮",
      "category_title": "Steam",
      "refresh_hours": 6
    },
    "ohmywishes": {
      "enabled": false,
      "profile_url": "https://ohmywishes.com/users/YOUR_USERNAME",
      "category_emoji": "🎁",
      "category_title": "OhMyWishes",
      "refresh_hours": 16
    }
  },

  // Информационные карточки — показываются под закреплёнными ссылками
  "info_cards": [
    {
      "id": "gift",
      "icon": "🎁",
      "title": "Заголовок карточки",
      "text":  "Текст карточки",
      "style": "accent"       // "accent" | "default" | "blue" | "green"
    }
  ]
}
```

### `config/wishlist.json`

Список категорий и желаний. Редактируется из админ-панели или вручную.

```jsonc
[
  {
    "id": "electronics",
    "emoji": "📱",
    "title": "Электроника",
    "sub":   "Подпись под категорией (необязательно)",
    "items": [
      {
        "id":   "item_1234",   // Уникальный идентификатор (используется для броней)
        "name": "Название желания",
        "sub":  "Уточнение или пожелание",
        "links": [
          { "label": "Купить на Ozon", "url": "https://ozon.ru/..." },
          { "label": "Wildberries",    "url": "https://wb.ru/..." }
        ]
      }
    ]
  }
]
```

> **Важно:** не меняйте `id` у уже созданных элементов — на них ссылаются брони в базе данных.

Полное описание схемы — в [`lib/schema.js`](lib/schema.js).

---

## Админ-панель

Доступна по адресу `/admin`. Для входа нужен `ADMIN_TOKEN` из `.env`.

### Вкладки

**📋 Вишлист**
- Добавление/удаление категорий и желаний
- Drag-and-drop сортировка категорий за ручку `⠿`
- Стрелки `↑ ↓` для сортировки элементов внутри категории
- Автосохранение с задержкой 1.5 с после последнего изменения
- Блоки внешних категорий (Steam, OhMyWishes…) с кнопкой ручного обновления

**🔒 Брони**
- Таблица всех активных броней: что забронировано, кем и когда
- Удаление отдельной брони или сброс всех

**⚙️ Настройки**
- Редактирование закреплённых ссылок (порядок, тип, адрес, заметка)
- Управление парсерами: включение/отключение, URL, ручной запуск, статус последней загрузки

---

## Парсеры

Парсер — это модуль, который превращает внешний источник (Steam, чужой сайт) в категорию вишлиста.
Все парсеры автоматически обнаруживаются при старте: всё, что лежит в `lib/parsers/*.js` и
экспортирует `{ fetch, meta }`, попадает в реестр.

### Steam

Подтягивает вишлист из Steam через официальный Web API. Включается флагом `parsers.steam.enabled` в `app.json`.

Поддерживаемые форматы URL:
- `https://store.steampowered.com/wishlist/id/USERNAME/`
- `https://store.steampowered.com/wishlist/profiles/STEAMID64/`
- Просто `USERNAME` (будет развёрнуто через ResolveVanityURL)

Требуется `STEAM_API_KEY` в `.env`. Вишлист должен быть публичным.

### OhMyWishes

Подтягивает списки желаний с публичного профиля ohmywishes.com. Многосписковый — каждый список становится отдельной категорией.

URL: `https://ohmywishes.com/users/USERNAME`.

### Добавление своего парсера

1. Создайте файл `lib/parsers/myparser.js` со следующим экспортом:

   ```js
   'use strict';

   async function fetch(cfg) {
     // cfg — объект из config/app.json → parsers.myparser
     // Вернуть один из вариантов:
     //   (a) массив Item — будет одна категория
     //   (b) массив Category — несколько категорий
     return [
       {
         id:   'myparser_123',
         name: 'Название товара',
         sub:  'Уточнение',
         imageUrl: 'https://...',
         tags: ['tag1', 'tag2'],
         links: [{ label: 'Купить', url: 'https://...' }],
       },
     ];
   }

   const meta = {
     id: 'myparser',                                   // ОБЯЗАНО совпадать с именем файла
     defaultTitle: 'My Site',
     defaultEmoji: '🛒',
     description:  'Импортирует желания с my-site.ru',
     urlPlaceholder: 'https://my-site.ru/u/USERNAME',
     requiresEnv:    [],                               // .env-переменные, без которых парсер не работает
   };

   module.exports = { fetch, meta };
   ```

   Формат Item/Category — см. [`lib/schema.js`](lib/schema.js). Можно прогнать данные через `validateItem`/`validateCategory` оттуда же, чтобы убедиться в корректности.

2. Добавьте секцию в `config/app.json → parsers`:

   ```json
   "myparser": {
     "enabled": true,
     "profile_url": "https://my-site.ru/u/USERNAME",
     "category_emoji": "🛒",
     "category_title": "My Site",
     "refresh_hours": 12
   }
   ```

Никаких других правок не нужно — парсер появится в админке автоматически.

---

## Кастомизация для форков

Цель архитектуры: форкер может менять стили, вёрстку и набор парсеров, не ломая
[стабильный контракт](#совместимый-контракт) — а значит, оркестратор продолжает с ним работать.

### Тема и цвета

Все цвета вынесены в [`public/theme.css`](public/theme.css). Переменные с комментариями — меняйте только их.

Пример: сменить акцентный цвет на сине-фиолетовый

```css
:root {
  --ac:   #818cf8;
  --adim: rgba(129,140,248,0.1);
  --abr:  rgba(129,140,248,0.28);
}
```

После сохранения файла страница обновится автоматически (SSE).

Локальные нецветовые переменные (`--r` — радиус скругления, `--sw` — ширина сайдбара) остаются в `<style>` соответствующего HTML.

### UI и вёрстка

Главная и админ-панель — два самостоятельных HTML-файла (`public/index.html`, `public/admin.html`).
Меняйте разметку, JS, шрифты как угодно — главное, не ломайте связь с публичными эндпоинтами
(`/api/config`, `/api/bookings`, `/api/book`, `/api/unbook`), если хотите оставить совместимость с
оркестратором.

---

## Совместимость с оркестратором

Приложение спроектировано так, чтобы оркестратор (агрегатор нескольких вишлистов) мог работать с любым форком без правок, если форк сохраняет **стабильный контракт**.

### Стабильный контракт

Эти эндпоинты и формы их ответов считаются публичным API. Их нельзя ломать без bump `PROTOCOL_VERSION` в `lib/schema.js`.

| Эндпоинт | Назначение |
|---|---|
| `GET /api/manifest` | Самоописание инстанса: версия протокола, имя, поддерживаемые фичи, список парсеров |
| `GET /api/config` | Вишлист (категории и желания) + список парсеров, отображаемых на странице |
| `GET /api/bookings` | Текущие брони `{ [item_id]: Booking }` |
| `POST /api/book` | Забронировать `{ itemId, user }` |
| `POST /api/unbook` | Снять бронь `{ itemId, user }` |
| `GET /api/reload-stream` | SSE-поток для горячего обновления клиента |

Схема `Item` / `Category` / `Booking` зафиксирована в [`lib/schema.js`](lib/schema.js). Поля могут только **добавляться** без bump версии; удаление и переименование полей — breaking change.

Пример ответа `/api/manifest`:

```json
{
  "protocolVersion": "1.0",
  "name": "wishlist-mini-app",
  "features": { "bookings": true, "sse": true, "parsers": true },
  "sources": [
    { "id": "steam",      "title": "Steam",      "emoji": "🎮", "description": "..." },
    { "id": "ohmywishes", "title": "OhMyWishes", "emoji": "🎁", "description": "..." }
  ],
  "endpoints": {
    "config":    "/api/config",
    "bookings":  "/api/bookings",
    "book":      "/api/book",
    "unbook":    "/api/unbook",
    "reloadSSE": "/api/reload-stream"
  }
}
```

### Внутренние эндпоинты

Всё под `/api/admin/*` — внутреннее. Форк свободен переписывать админку, менять формат сохраняемого конфига, добавлять/убирать эндпоинты под админкой. Оркестратор полагаться на них не должен.

UI (`/`, `/admin`) — тоже внутреннее. Меняйте как угодно.

---

## API

### Stable (контракт для оркестраторов)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/manifest` | Манифест инстанса (см. выше) |
| GET | `/api/config` | Вишлист + данные парсеров + app-конфиг (только чтение) |
| GET | `/api/bookings` | Все брони `{ [item_id]: Booking }` |
| POST | `/api/book` | Забронировать `{ itemId, user }` |
| POST | `/api/unbook` | Отменить бронь `{ itemId, user }` |
| GET | `/api/reload-stream` | SSE для горячей перезагрузки |

### Internal (только для админки)

Требуют заголовок `x-admin-token: <ADMIN_TOKEN>`.

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/admin/wishlist` | Получить wishlist.json |
| PUT | `/api/admin/wishlist` | Сохранить wishlist.json |
| GET | `/api/admin/app-config` | Получить app.json |
| PUT | `/api/admin/app-config` | Сохранить app.json (перезапускает парсеры) |
| GET | `/api/admin/bookings` | Все брони (подробно) |
| DELETE | `/api/admin/bookings/:itemId` | Удалить конкретную бронь |
| DELETE | `/api/admin/bookings` | Удалить все брони |
| GET | `/api/admin/parsers` | Статус парсеров (кол-во позиций, дата обновления) |
| POST | `/api/admin/parsers/:id/refresh` | Вручную обновить парсер |

---

## Локальная разработка (без Docker)

```bash
npm install
cp .env.example .env                              # задать ADMIN_TOKEN
cp config/app.json.example      config/app.json
cp config/wishlist.json.example config/wishlist.json
mkdir -p data
npm run dev                                       # node --watch (горячая перезагрузка сервера)
```

Приложение будет доступно на `http://localhost:3000`.

---

## Развёртывание на сервере

Приложение не содержит встроенного HTTPS — рекомендуется запускать за reverse proxy (Nginx, Caddy).

Пример Nginx:

```nginx
server {
    listen 443 ssl;
    server_name wishlist.example.com;

    location / {
        proxy_pass http://127.0.0.1:3050;
        proxy_http_version 1.1;
        proxy_set_header Connection '';   # нужно для SSE
        proxy_buffering off;              # нужно для SSE
    }
}
```
