# Люмен

React/Vite приложение для совместного просмотра видео с комнатами, чатом и синхронизацией воспроизведения.

## Локальный запуск

Фронтенд без онлайн-сервера:

```bash
npm install
npm run dev
```

Открыть `http://localhost:8080`.

Production-режим с WebSocket-сервером:

```bash
npm run build
npm start
```

Открыть `http://localhost:3000`.

## Проверка

```bash
npm run build
npm test
npm run lint
```

## Онлайн-деплой с настоящими комнатами

Для реальной синхронизации между разными устройствами нужен WebSocket-сервер. В проект добавлен `server/index.js` и `render.yaml`, поэтому самый простой бесплатный вариант:

1. Открыть Render.
2. Выбрать `New` -> `Blueprint`.
3. Подключить репозиторий `kgorlov/watch-together-pro`.
4. Render прочитает `render.yaml`, выполнит `npm ci && npm run build` и запустит `npm start`.

После деплоя сайт будет доступен по адресу Render. Именно эту ссылку нужно отправлять другу, например:

```text
https://lumen-watch-together.onrender.com/#/room/ABC123
```

## GitHub Pages

GitHub Pages тоже поддерживается, но там работает только статическая версия. Без переменной `VITE_SYNC_SERVER_URL` она использует локальный fallback через `BroadcastChannel`, то есть синхронизация работает только между вкладками одного браузера.

Если нужен GitHub Pages + отдельный WebSocket-сервер, добавь переменную GitHub Actions:

```text
VITE_SYNC_SERVER_URL=https://<render-service>.onrender.com
```

Тогда Pages-сборка будет подключаться к Render-серверу.
