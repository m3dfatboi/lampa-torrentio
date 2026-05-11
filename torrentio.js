(function () {
    'use strict';

    var PLUGIN_ID = 'torrentio';
    var PLUGIN_TITLE = 'Torrentio';
    var PLUGIN_VERSION = 'v14-series-episodes';
    var PARSER_TYPE = 'torrentio';

    var TORRENTIO_BASE = 'https://torrentio.strem.fun/providers=rarbg,1337x,thepiratebay,nyaasi,tokyotosho,anidex';
    var MAX_SERIES_ENDPOINTS = 80;
    var SERIES_CONCURRENCY = 6;

    if (!window.Lampa) return;

    var Lampa = window.Lampa;

    if (window.console && window.console.log) {
        try { console.log('[Torrentio]', 'plugin source loaded', PLUGIN_VERSION); } catch (e) {}
    }

    if (!Lampa.Parser || typeof Lampa.Parser.get !== 'function') {
        if (window.console && console.log) console.log('[Torrentio]', 'Lampa.Parser not available, abort');
        return;
    }

    function logDebug() {
        if (!window.console || !console.log) return;
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[Torrentio]');
            console.log.apply(console, args);
        }
        catch (e) {}
    }

    function isSeries(movie) {
        if (!movie) return false;
        return Boolean(
            movie.name ||
            movie.original_name ||
            movie.number_of_seasons ||
            movie.number_of_episodes ||
            movie.first_air_date ||
            movie.media_type === 'tv' ||
            movie.type === 'tv'
        );
    }

    function tmdbType(type) {
        return type === 'series' ? 'tv' : 'movie';
    }

    function tmdbApi() {
        if (Lampa.Api && Lampa.Api.sources && Lampa.Api.sources.tmdb && typeof Lampa.Api.sources.tmdb.external_imdb_id === 'function') {
            return Lampa.Api.sources.tmdb;
        }

        if (Lampa.TMDB && typeof Lampa.TMDB.external_imdb_id === 'function') {
            return Lampa.TMDB;
        }

        return null;
    }

    function normalizeImdb(imdb) {
        if (!imdb) return '';
        imdb = (imdb + '').trim();
        if (!/^tt\d+/i.test(imdb)) imdb = 'tt' + imdb.replace(/\D/g, '');
        return /^tt\d+/i.test(imdb) ? imdb : '';
    }

    function loadImdb(movie, type, done) {
        var embedded = movie && (movie.imdb_id || (movie.external_ids && movie.external_ids.imdb_id));
        if (embedded) return done(normalizeImdb(embedded));

        var api = tmdbApi();
        if (!movie || !movie.id || !api) return done('');

        api.external_imdb_id({ type: tmdbType(type), id: movie.id }, function (imdb) {
            imdb = normalizeImdb(imdb);
            if (imdb && movie) movie.imdb_id = imdb;
            done(imdb);
        });
    }

    var SIZE_UNITS = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };

    function parseSize(text) {
        if (!text) return 0;
        var m = text.match(/([\d.]+)\s*([KMGT]?B)/i);
        if (!m) return 0;
        var num = parseFloat(m[1]);
        var unit = m[2].toUpperCase();
        return Math.round(num * (SIZE_UNITS[unit] || 1));
    }

    function parseTitle(stream) {
        var raw = (stream.title || '').replace(/\r/g, '');
        var lines = raw.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);

        var name = lines[0] || stream.name || 'unknown';
        var meta = lines.slice(1).join(' ');

        var seedsMatch = meta.match(/👤\s*([\d,]+)/);
        var sizeMatch = meta.match(/💾\s*([\d.]+\s*[KMGT]?B)/i);
        var trackerMatch = meta.match(/⚙️\s*([^\s/]+)/);

        var quality = '';
        var qualityMatch = (stream.name || '').match(/(\d{3,4}p|2160p|4K|HDR|REMUX)/i);
        if (qualityMatch) quality = qualityMatch[1];

        var languages = [];
        var langTags = raw.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu);
        if (langTags) {
            langTags.forEach(function (flag) {
                var lang = flagToLang(flag);
                if (lang && languages.indexOf(lang) === -1) languages.push(lang);
            });
        }

        return {
            name: name,
            seeds: seedsMatch ? parseInt(seedsMatch[1].replace(/,/g, ''), 10) || 0 : 0,
            size: sizeMatch ? parseSize(sizeMatch[1]) : 0,
            tracker: trackerMatch ? trackerMatch[1] : (stream.name || '').split('\n')[0] || 'Stremio',
            quality: quality,
            languages: languages
        };
    }

    function flagToLang(flag) {
        var map = {
            '🇷🇺': 'ru', '🇺🇦': 'uk', '🇬🇧': 'en', '🇺🇸': 'en',
            '🇯🇵': 'ja', '🇨🇳': 'zh', '🇰🇷': 'ko',
            '🇫🇷': 'fr', '🇩🇪': 'de', '🇪🇸': 'es', '🇮🇹': 'it',
            '🇵🇱': 'pl', '🇹🇷': 'tr', '🇵🇹': 'pt', '🇧🇷': 'pt'
        };
        return map[flag] || '';
    }

    function buildMagnet(stream, name, type) {
        var hash = (stream.infoHash || '').toLowerCase();
        if (!hash) return '';

        var magnet = 'magnet:?xt=urn:btih:' + hash;
        if (name) magnet += '&dn=' + encodeURIComponent(name);
        if (type !== 'series' && typeof stream.fileIdx === 'number' && stream.fileIdx >= 0) magnet += '&so=' + stream.fileIdx;

        var trackers = [
            'udp://tracker.opentrackr.org:1337/announce',
            'udp://9.rarbg.com:2810/announce',
            'udp://tracker.openbittorrent.com:6969/announce',
            'udp://tracker.torrent.eu.org:451/announce',
            'udp://exodus.desync.com:6969/announce',
            'udp://open.stealth.si:80/announce',
            'udp://tracker.coppersurfer.tk:6969/announce',
            'udp://tracker.leechers-paradise.org:6969/announce'
        ];
        trackers.forEach(function (t) { magnet += '&tr=' + encodeURIComponent(t); });

        return magnet;
    }

    function streamsToResults(streams, type) {
        if (!streams || !streams.length) return [];

        var seen = {};
        var results = [];
        var nowIso = new Date().toISOString();

        streams.forEach(function (stream) {
            if (!stream || !stream.infoHash) return;

            var hash = stream.infoHash.toLowerCase();
            if (seen[hash]) return;
            seen[hash] = true;

            var parsed = parseTitle(stream);
            var magnet = buildMagnet(stream, parsed.name, type);
            if (!magnet) return;

            results.push({
                Title: parsed.name,
                MagnetUri: magnet,
                Link: magnet,
                Size: parsed.size,
                Seeders: parsed.seeds,
                Peers: 0,
                Tracker: parsed.tracker,
                PublishDate: nowIso,
                hash: hash,
                quality: parsed.quality,
                languages: parsed.languages,
                source: 'torrentio'
            });
        });

        return results;
    }

    function buildUrl(type, imdb, season, episode) {
        if (type === 'series' && season && episode) {
            return TORRENTIO_BASE + '/stream/series/' + imdb + ':' + season + ':' + episode + '.json';
        }
        if (type === 'series') return TORRENTIO_BASE + '/stream/series/' + imdb + '.json';
        return TORRENTIO_BASE + '/stream/movie/' + imdb + '.json';
    }

    var network = new Lampa.Reguest();

    function fetchStreams(imdb, type, season, episode, done) {
        var url = buildUrl(type, imdb, season, episode);
        logDebug('fetch', url);

        network.timeout(15000);
        network.silent(url, function (json) {
            var streams = json && json.streams ? json.streams : [];
            logDebug('returned', streams.length, 'streams');
            done(null, streamsToResults(streams, type));
        }, function (xhr) {
            logDebug('error', xhr && xhr.status);
            done(xhr || true, []);
        });
    }

    function torrentioGet(params, oncomplete, onerror) {
        var movie = params && params.movie ? params.movie : {};
        var type = isSeries(movie) ? 'series' : 'movie';

        loadImdb(movie, type, function (imdb) {
            if (!imdb) {
                logDebug('no imdb id, fall back to native parser');
                return originalGet(params, oncomplete, onerror);
            }

            fetchSeriesOrMovie(movie, imdb, type, function (err, results) {
                var deduped = dedupByHash(results || []);
                deduped.sort(function (a, b) { return (b.Seeders || 0) - (a.Seeders || 0); });

                logDebug('total', deduped.length, 'unique torrents for', imdb);

                if (!deduped.length && err) {
                    originalGet(params, oncomplete, onerror);
                }
                else {
                    oncomplete({ Results: deduped });
                }
            });
        });
    }

    function fetchSeriesOrMovie(movie, imdb, type, done) {
        if (type !== 'series') return fetchStreams(imdb, type, null, null, done);

        fetchManyStreams(imdb, type, buildSeriesFetches(movie), done);
    }

    function buildSeriesFetches(movie) {
        var fetches = [];
        var seen = {};

        function add(season, episode) {
            var key = (season || 'bulk') + ':' + (episode || 'all');
            if (seen[key] || fetches.length >= MAX_SERIES_ENDPOINTS) return;
            seen[key] = true;
            fetches.push({ season: season, episode: episode });
        }

        add(null, null);

        var seasons = [];
        if (movie && movie.seasons && movie.seasons.forEach) {
            movie.seasons.forEach(function (season) {
                var seasonNumber = parseInt(season && season.season_number, 10);
                var episodeCount = parseInt(season && season.episode_count, 10);
                if (seasonNumber > 0 && episodeCount > 0) {
                    seasons.push({ season: seasonNumber, episodes: episodeCount });
                }
            });
        }

        if (!seasons.length) {
            var last = movie && movie.last_episode_to_air ? movie.last_episode_to_air : {};
            var seasonCount = parseInt(movie && movie.number_of_seasons, 10) || parseInt(last.season_number, 10) || 6;
            if (seasonCount > 12) seasonCount = 12;
            if (seasonCount < 1) seasonCount = 1;

            var totalEpisodes = parseInt(movie && movie.number_of_episodes, 10) || 0;
            var averageEpisodes = totalEpisodes ? Math.ceil(totalEpisodes / seasonCount) : 10;
            if (averageEpisodes < 1) averageEpisodes = 1;
            if (averageEpisodes > 24) averageEpisodes = 24;

            for (var s = 1; s <= seasonCount; s++) {
                var episodes = averageEpisodes;
                if (parseInt(last.season_number, 10) === s && parseInt(last.episode_number, 10) > episodes) {
                    episodes = parseInt(last.episode_number, 10);
                }
                seasons.push({ season: s, episodes: episodes });
            }
        }

        seasons.sort(function (a, b) { return a.season - b.season; });
        seasons.forEach(function (season) { add(season.season, 1); });

        var lastEpisode = movie && movie.last_episode_to_air ? movie.last_episode_to_air : {};
        var lastSeason = parseInt(lastEpisode.season_number, 10);
        var lastNumber = parseInt(lastEpisode.episode_number, 10);
        if (lastSeason > 0 && lastNumber > 0) add(lastSeason, lastNumber);

        seasons.forEach(function (season) {
            for (var e = 2; e <= season.episodes; e++) add(season.season, e);
        });

        logDebug('series fetch endpoints', fetches.length);
        return fetches;
    }

    function fetchManyStreams(imdb, type, fetches, done) {
        if (!fetches.length) return done(null, []);

        var index = 0;
        var active = 0;
        var completed = 0;
        var allResults = [];
        var anyError = null;

        function pump() {
            while (active < SERIES_CONCURRENCY && index < fetches.length) {
                run(fetches[index++]);
            }
        }

        function run(slot) {
            active++;
            fetchStreams(imdb, type, slot.season, slot.episode, function (err, results) {
                if (results && results.length) allResults = allResults.concat(results);
                if (err) anyError = err;

                active--;
                completed++;

                if (completed === fetches.length) done(anyError, allResults);
                else pump();
            });
        }

        pump();
    }

    function dedupByHash(items) {
        var seen = {};
        var out = [];
        items.forEach(function (item) {
            if (!item || !item.hash) return;
            if (seen[item.hash]) return;
            seen[item.hash] = true;
            out.push(item);
        });
        return out;
    }

    function extractInfoHash(item) {
        if (!item) return '';
        var magnet = item.MagnetUri || item.Link || '';
        var m = magnet.match(/btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
        return m ? m[1].toLowerCase() : '';
    }

    function dedupByInfoHash(items) {
        var seen = {};
        var out = [];
        items.forEach(function (item) {
            if (!item) return;
            var key = extractInfoHash(item);
            if (key) {
                if (seen[key]) return;
                seen[key] = true;
            }
            out.push(item);
        });
        return out;
    }

    function registerParserType() {
        if (!Lampa.Params || !Lampa.Params.values) {
            logDebug('Lampa.Params not available, parser type cannot be registered in settings');
            return;
        }

        var bucket = Lampa.Params.values['parser_torrent_type'];
        if (!bucket || typeof bucket !== 'object') {
            logDebug('parser_torrent_type values bucket not found');
            return;
        }

        if (bucket[PARSER_TYPE]) return;

        bucket[PARSER_TYPE] = PLUGIN_TITLE;
        logDebug('registered parser type', PARSER_TYPE, 'in Lampa.Params.values.parser_torrent_type');
    }

    function registerExtraToggle() {
        if (!Lampa.SettingsApi || !Lampa.SettingsApi.addParam) {
            logDebug('Lampa.SettingsApi not available');
            return;
        }

        try {
            Lampa.SettingsApi.addParam({
                component: 'parser',
                param: {
                    name: 'torrentio_as_extra',
                    type: 'trigger',
                    default: false
                },
                field: {
                    name: PLUGIN_TITLE + ': дополнительный парсер',
                    description: 'Объединять результаты Torrentio с выбранным ниже парсером'
                },
                onRender: function (item) {
                    setTimeout(function () {
                        try {
                            var anchor = item.parent().find('.settings-param[data-name="parser_use"]');
                            if (anchor.length) item.insertAfter(anchor);
                        }
                        catch (e) { logDebug('relocate toggle failed:', e && e.message); }
                    }, 0);
                },
                onChange: function () {}
            });
            logDebug('registered toggle torrentio_as_extra in parser settings');
        }
        catch (e) {
            logDebug('addParam torrentio_as_extra error:', e && e.message);
        }
    }

    function hookTemplateForTorrentio() {
        if (!Lampa.Template || typeof Lampa.Template.get !== 'function') {
            logDebug('Lampa.Template not available, cannot hide date/grabs');
            return;
        }
        if (Lampa.Template._torrentio_get_hooked === PLUGIN_VERSION) return;

        var origGet = Lampa.Template._torrentio_orig_get || Lampa.Template.get;
        Lampa.Template._torrentio_orig_get = origGet;
        Lampa.Template._torrentio_get_hooked = PLUGIN_VERSION;

        Lampa.Template.get = function (name, data, plain) {
            var result = origGet.apply(this, arguments);

            if (name === 'torrent' && data && data.source === 'torrentio' && result && typeof result.find === 'function') {
                try {
                    result.find('.torrent-item__date').remove();
                    result.find('.torrent-item__grabs').remove();
                }
                catch (e) {}
            }

            return result;
        };

        logDebug('Lampa.Template.get hooked', PLUGIN_VERSION);
    }

    function isExtraEnabled() {
        if (!Lampa.Storage) return false;
        var v = Lampa.Storage.get('torrentio_as_extra', 'false');
        return v === true || v === 'true';
    }

    function combinedGet(params, oncomplete, onerror) {
        var nativeResults = null;
        var addonResults = null;
        var nativeDone = false;
        var addonDone = false;
        var anySuccess = false;
        var lastError = null;

        function maybeFinalize() {
            if (!nativeDone || !addonDone) return;

            var nativeArr = nativeResults || [];
            var addonArr = addonResults || [];

            var merged = dedupByInfoHash(nativeArr.concat(addonArr));
            merged.sort(function (a, b) { return (b.Seeders || 0) - (a.Seeders || 0); });

            logDebug('combined: native=' + nativeArr.length + ' addon=' + addonArr.length + ' merged=' + merged.length + ' (deduped by infoHash)');

            if (anySuccess || merged.length) {
                oncomplete({ Results: merged });
            }
            else {
                onerror(lastError || '');
            }
        }

        originalGet.call(this, params, function (json) {
            anySuccess = true;
            nativeResults = json && json.Results ? json.Results : [];
            nativeDone = true;
            maybeFinalize();
        }, function (e) {
            lastError = e;
            nativeResults = [];
            nativeDone = true;
            maybeFinalize();
        });

        torrentioGet.call(this, params, function (json) {
            anySuccess = true;
            addonResults = json && json.Results ? json.Results : [];
            addonDone = true;
            maybeFinalize();
        }, function (e) {
            lastError = lastError || e;
            addonResults = [];
            addonDone = true;
            maybeFinalize();
        });
    }

    var originalGet = Lampa.Parser.get;

    if (Lampa.Parser._torrentio_hooked !== PLUGIN_VERSION) {
        if (Lampa.Parser._torrentio_original_get) originalGet = Lampa.Parser._torrentio_original_get;
        Lampa.Parser._torrentio_original_get = originalGet;
        Lampa.Parser._torrentio_hooked = PLUGIN_VERSION;

        Lampa.Parser.get = function (params, oncomplete, onerror) {
            var type = Lampa.Storage && Lampa.Storage.field ? Lampa.Storage.field('parser_torrent_type') : '';

            if (type === PARSER_TYPE) {
                return torrentioGet.call(this, params, oncomplete, onerror);
            }

            if (isExtraEnabled()) {
                return combinedGet.call(this, params, oncomplete, onerror);
            }

            return originalGet.call(this, params, oncomplete, onerror);
        };

        logDebug('Lampa.Parser.get hooked', PLUGIN_VERSION);
    }

    registerParserType();
    registerExtraToggle();
    hookTemplateForTorrentio();
})();
