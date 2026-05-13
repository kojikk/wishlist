# Wishlist Mini App

Личный вишлист в виде Telegram Web App. Гости открывают мини-приложение прямо в Telegram, видят список желаний и могут забронировать подарок, чтобы другие не задублировались. Администратор управляет списком через веб-интерфейс.

---

## Возможности

- **Категории и желания** — структурированный список с поддержкой ссылок-магазинов для каждого желания
- **Бронирование** — гость бронирует желание под своим Telegram-аккаунтом; другим гостям показывается, что оно уже занято
- **Закреплённые ссылки** — произвольные ссылки вверху страницы (например, на внешний вишлист); Steam-ссылки получают особое оформление
- **Парсер Steam** — автоматически подтягивает игры из вишлиста Steam в отдельную категорию; обновляется по расписанию
- **Информационные карточки** — блоки с текстом и контактами (например, «к кому обратиться за советом»)
- **Горячая перезагрузка** — страница обновляется автоматически при изменении конфигов или обновлении данных парсера (SSE)
- **Админ-панель** — редактирование вишлиста, drag-and-drop сортировка категорий, управление закреплёнными ссылками и парсерами, просмотр броней

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
├── server.js              # Express-сервер, вся бизнес-логика
├── lib/
│   └── parsers/
│       ├── index.js       # Реестр парсеров
│       └── steam.js       # Steam wishlist парсер
├── public/
│   ├── index.html         # Главная страница (Telegram Web App)
│   ├── admin.html         # Админ-панель
│   └── media/             # Изображения и иконки
├── config/
│   ├── app.json           # Настройки приложения (не в git)
│   ├── wishlist.json      # Список желаний (не в git)
│   ├── app.json.example   # Шаблон app.json
│   └── wishlist.json.example
├── data/
│   └── wishlist.db        # SQLite (не в git, монтируется как volume)
├── Dockerfile
├── docker-compose.yml
├── .env                   # Переменные окружения (не в git)
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

Отредактировать `.env` — обязательно задать `ADMIN_TOKEN`:

```bash
# Генерация случайного токена
openssl rand -hex 32
```

### 3. Создать конфиги

```bash
cp config/app.json.example config/app.json
cp config/wishlist.json.example config/wishlist.json
```

Отредактировать оба файла под свои данные (подробнее в разделе [Конфигурация](#конфигурация)).

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

| Переменная | По умолчанию | Описание |
|---|---|---|
| `PORT` | `3000` | Порт внутри контейнера |
| `DB_PATH` | `/app/data/wishlist.db` | Путь к SQLite-файлу |
| `ADMIN_TOKEN` | — | Токен для доступа к `/admin` и API. **Обязательно задать.** |
| `NODE_ENV` | `production` | Режим запуска |

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
      "url": "https://store.steampowered.com/wishlist/id/YOUR_STEAM_ID/",
      "note": "Подпись под названием (необязательно)"
    },
    {
      "id": "ozon",
      "type": "link",
      "icon": "🛒",           // Эмодзи-иконка (только для type: "link")
      "label": "Ozon",
      "url": "https://ozon.ru/...",
      "note": ""
    }
  ],

  // Парсеры внешних вишлистов
  "parsers": {
    "steam": {
      "enabled": true,
      "profile_url": "https://store.steampowered.com/wishlist/id/YOUR_STEAM_ID/",
      "category_emoji": "🎮",
      "category_title": "Steam",
      "refresh_hours": 6      // Интервал автообновления в часах
    }
  },

  // Информационные карточки — показываются под закреплёнными ссылками
  "info_cards": [
    {
      "id": "gift",
      "icon": "🎁",
      "title": "Заголовок карточки",
      "text": "Текст карточки",
      "style": "accent"       // "accent" | "default" | "blue" | "green"
    },
    {
      "id": "contacts",
      "icon": "💬",
      "title": "Спросите у близких",
      "text": "Текст",
      "style": "default",
      "contacts": [           // Кнопки-ссылки на Telegram-контакты (необязательно)
        { "username": "friend1", "label": "@friend1" }
      ]
    }
  ]
}
```

### `config/wishlist.json`

Список категорий и желаний. Редактируется из админ-панели или вручную.

```jsonc
[
  {
    "id": "electronics",      // Уникальный идентификатор категории
    "emoji": "📱",
    "title": "Электроника",
    "sub": "Подпись под категорией (необязательно)",
    "items": [
      {
        "id": "item_1234",    // Уникальный идентификатор (используется для броней)
        "name": "Название желания",
        "sub": "Уточнение или пожелание",
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

---

## Админ-панель

Доступна по адресу `/admin`. Для входа нужен `ADMIN_TOKEN` из `.env`.

### Вкладки

**📋 Вишлист**
- Добавление/удаление категорий и желаний
- Drag-and-drop сортировка категорий за ручку `⠿`
- Стрелки `↑ ↓` для сортировки элементов внутри категории
- Автосохранение с задержкой 1.5 с после последнего изменения
- Блок внешней категории Steam (если парсер включён) с кнопкой ручного обновления

**🔒 Брони**
- Таблица всех активных броней: что забронировано, кем и когда
- Удаление отдельной брони или сброс всех

**⚙️ Настройки**
- Редактирование закреплённых ссылок (порядок, тип, адрес, заметка)
- Управление парсерами: включение/отключение, URL профиля, ручной запуск, статус последней загрузки

---

## Парсер Steam

При включении (`parsers.steam.enabled: true`) сервер:

1. При старте запрашивает вишлист через Steam API (до 1500 игр, пагинация по 100)
2. Сортирует игры по приоритету из вишлиста Steam
3. Создаёт категорию «Steam» в памяти (не пишется в `wishlist.json`)
4. Отправляет SSE-событие браузерам — страница обновляется без перезагрузки
5. Повторяет шаги 1–4 каждые `refresh_hours` часов

Поддерживаются форматы URL:
- `https://store.steampowered.com/wishlist/id/USERNAME/`
- `https://store.steampowered.com/wishlist/profiles/STEAMID64/`
- Просто `USERNAME` (будет развёрнуто автоматически)

### Добавление нового парсера

1. Создать файл `lib/parsers/mysite.js` с экспортом:

```js
async function fetch(cfg) {
  // cfg — объект из app.json → parsers.mysite
  // Вернуть массив:
  return [
    {
      id: 'mysite_123',
      name: 'Название товара',
      sub: 'Уточнение',
      links: [{ label: 'Купить', url: 'https://...' }],
    },
  ];
}

module.exports = { fetch, defaultEmoji: '🛒', defaultTitle: 'My Site' };
```

2. Зарегистрировать в `lib/parsers/index.js`:

```js
const PARSERS = {
  steam:  require('./steam'),
  mysite: require('./mysite'), // добавить сюда
};
```

3. Добавить секцию в `config/app.json → parsers`:

```json
"mysite": {
  "enabled": true,
  "wishlist_url": "https://mysite.ru/user/me/wishlist",
  "category_emoji": "🛒",
  "category_title": "My Site",
  "refresh_hours": 12
}
```

---

## API

Все `/api/admin/*` эндпоинты требуют заголовок `x-admin-token: <ADMIN_TOKEN>`.

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/config` | Весь конфиг (вишлист + данные парсеров + app) |
| GET | `/api/bookings` | Все брони `{ [item_id]: { id, username, name, at } }` |
| POST | `/api/book` | Забронировать `{ itemId, user }` |
| POST | `/api/unbook` | Отменить бронь `{ itemId, user }` |
| GET | `/api/reload-stream` | SSE-поток для горячей перезагрузки |
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
cp .env.example .env          # задать ADMIN_TOKEN
cp config/app.json.example config/app.json
cp config/wishlist.json.example config/wishlist.json
mkdir -p data
npm run dev                   # node --watch (горячая перезагрузка сервера)
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
