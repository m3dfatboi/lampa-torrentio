# Lampa Torrentio

Плагин подключает Stremio-аддон [Torrentio](https://torrentio.strem.fun/) как источник торрентов в Lampa. Заменяет встроенный парсер Lampa (jackett/prowlarr/torrserver) на агрегатор Torrentio с трекерами:

`rarbg, 1337x, thepiratebay, nyaasi, tokyotosho, anidex, rutor, rutracker`

## Что умеет

- Перехватывает `Lampa.Parser.get` и возвращает результаты от Torrentio в формате который понимает Lampa.
- Для фильмов берёт IMDb ID и тянет `/stream/movie/{imdb}.json`.
- Для сериалов опрашивает первые до 6 сезонов параллельно (`/stream/series/{imdb}:S:1.json`) — Torrentio для каждого эпизода возвращает в том числе сезонные пакеты, поэтому покрытие нормальное.
- Парсит название, размер, сидеров и трекер из текста стрима.
- Конструирует magnet с public-трекерами для надёжной раздачи.
- Если IMDb ID не нашёлся или Torrentio упал — fall back на штатный парсер Lampa.

Без настроек — провайдеры захардкожены. Если хочешь поменять — отредактируй `TORRENTIO_BASE` в начале файла.

## Установка

1. Размести `torrentio.js` на HTTPS-хостинге (GitHub Pages подходит).
2. В Lampa: `Настройки → Расширения → Добавить плагин`.
3. Укажи URL до `torrentio.js`.
4. Перезайди в карточку фильма/сериала — на странице торрентов будут результаты Torrentio.

## Требования

- TorrServer запущен и настроен в Lampa (как для штатного парсера).
- IMDb ID карточки. Lampa получает его автоматически через TMDB для большинства тайтлов.

## Диагностика

Открой DevTools → Console. При загрузке плагина появится:

```
[Torrentio] plugin source loaded v1
[Torrentio] Lampa.Parser.get hooked v1
```

При открытии торрент-страницы:

```
[Torrentio] fetch https://torrentio.strem.fun/.../stream/movie/tt0245429.json
[Torrentio] returned 50 streams
[Torrentio] total 47 unique torrents for tt0245429
```

## Как это работает

[Torrentio](https://torrentio.strem.fun/) — Stremio-аддон, который парсит публичные торрент-трекеры и отдаёт результаты в JSON по IMDb ID. CORS открыт, ключи не нужны. Этот плагин просто оборачивает запросы и приводит ответ к формату который ожидает Lampa torrents-компонент.
