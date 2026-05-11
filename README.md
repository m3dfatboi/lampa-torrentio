# Lampa Torrentio

Подключает Stremio-аддон [Torrentio](https://torrentio.strem.fun/) как источник торрентов в Lampa. Агрегирует публичные трекеры:

`rarbg, 1337x, thepiratebay, nyaasi, tokyotosho, anidex`

## Что умеет

- Регистрируется как **полноценный тип парсера** в нативных настройках Lampa: `Настройки → Парсер → Тип парсера для торрентов → Torrentio` (рядом с Jackett / Prowlarr / TorrServer).
- Может работать **как дополнительный парсер**: оставляешь свой основной (jacred / jackett / torrserver) и в `Настройках → Парсер` включаешь тогл «Torrentio: дополнительный парсер» — Lampa параллельно опросит и выбранный парсер, и Torrentio. Результаты мерджатся, дедуп по `infoHash`, сортировка по сидерам.
- Для фильмов берёт IMDb ID и тянет `/stream/movie/{imdb}.json`.
- Для сериалов берёт IMDb ID через TMDB TV endpoint и опрашивает первые до 6 сезонов (`/stream/series/{imdb}:S:1.json`); если episode-запросы пустые, пробует bulk `/stream/series/{imdb}.json`.
- Парсит название, размер, сидеров и трекер из текстового описания стрима.
- Конструирует magnet с `infoHash` + публичными udp-трекерами + `&so=fileIdx` для multi-file пакетов (TorrServer открывает правильный эпизод).
- Скрывает блоки «Качают» и дату публикации в карточках Torrentio (Stremio addon эти поля не отдаёт, чтобы не показывать пустые/нулевые значения).
- Если IMDb ID не нашёлся или Torrentio упал — fall back на штатный парсер Lampa.

Без настроек — провайдеры и URL захардкожены. Если хочешь поменять — отредактируй `TORRENTIO_BASE` в начале файла.

## Установка

1. Размести `torrentio.js` на HTTPS-хостинге (GitHub Pages подходит).
2. В Lampa: `Настройки → Расширения → Добавить плагин`.
3. Укажи URL до `torrentio.js`. Для cache-bust добавь `?v=N`.
4. Открой `Настройки → Парсер` — там новые опции:
   - В выпадающем «Тип парсера для торрентов» появится `Torrentio` — выбери, если хочешь использовать только его.
   - Под «Использовать парсер» появится тогл «Torrentio: дополнительный парсер» — включи, если хочешь оставить основной и добавить Torrentio как второй источник.

## Требования

- TorrServer запущен и настроен в Lampa (как для штатного парсера).
- IMDb ID карточки. Lampa получает его автоматически через TMDB для большинства тайтлов.

## Диагностика

Открой DevTools → Console. При загрузке плагина:

```
[Torrentio] plugin source loaded v11-series-resolver
[Torrentio] registered parser type torrentio in Lampa.Params.values.parser_torrent_type
[Torrentio] registered toggle torrentio_as_extra in parser settings
[Torrentio] Lampa.Template.get hooked v11-series-resolver
[Torrentio] Lampa.Parser.get hooked v11-series-resolver
```

При открытии торрент-страницы:

```
[Torrentio] fetch https://torrentio.strem.fun/.../stream/movie/tt0245429.json
[Torrentio] returned 50 streams
[Torrentio] total 47 unique torrents for tt0245429
```

В режиме «дополнительного парсера»:

```
[Torrentio] combined: native=12 addon=47 merged=58
```

## Как это работает

[Torrentio](https://torrentio.strem.fun/) — Stremio-аддон, парсит публичные торрент-трекеры и отдаёт результаты JSON по IMDb ID. CORS открыт, ключи не нужны.

Плагин:

1. Хукает `Lampa.Parser.get` — функцию которую Lampa вызывает на странице торрентов карточки. Wrapper смотрит в `Lampa.Storage.field('parser_torrent_type')`:
   - Если `'torrentio'` → роутит в наш fetcher.
   - Иначе если включён тогл `torrentio_as_extra` → запускает оба парсера параллельно и объединяет.
   - Иначе → штатный парсер.
2. Регистрирует `'torrentio'` в `Lampa.Params.values.parser_torrent_type` — нативный селектор подхватывает.
3. Хукает `Lampa.Template.get` для шаблона `'torrent'` и удаляет `.torrent-item__date` + `.torrent-item__grabs` для наших айтемов (помечены `source: 'torrentio'`).
4. Все хуки идемпотентны через тег `_torrentio_*_version` на обёртках/функциях — переустановка плагина в той же вкладке не ломает состояние.
