# Люмен

Красивый React/Vite интерфейс для совместного просмотра видео.

## Запуск

```bash
npm install
npm run dev
```

Открыть `http://localhost:8080`.

## Проверка

```bash
npm run build
npm test
```

## Деплой на GitHub Pages

В проект добавлен workflow `.github/workflows/deploy.yml`.

1. Запушить проект в репозиторий `kgorlov/watch-together-pro`.
2. Открыть `Settings` -> `Pages`.
3. В `Build and deployment` выбрать `GitHub Actions`.
4. Запушить изменения в ветку `main`.

После выполнения workflow сайт будет доступен по адресу:

```text
https://kgorlov.github.io/watch-together-pro/
```

## Важный нюанс

Сейчас проект статический: синхронизация работает через `BroadcastChannel` между вкладками одного браузера на одном origin. Для реального совместного просмотра между разными пользователями по интернету нужен backend/WebSocket.
