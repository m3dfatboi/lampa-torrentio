(function () {
    'use strict';

    var PLUGIN_ID = 'torrentio';
    var PLUGIN_TITLE = 'Torrentio';
    var PLUGIN_VERSION = 'v1';

    var TORRENTIO_BASE = 'https://torrentio.strem.fun/providers=rarbg,1337x,thepiratebay,nyaasi,tokyotosho,anidex,rutor,rutracker';

    if (!window.Lampa) return;
    if (!Lampa.Parser || typeof Lampa.Parser.get !== 'function') return;

    if (window.console && window.console.log) {
        try { console.log('[Torrentio]', 'plugin source loaded', PLUGIN_VERSION); } catch (e) {}
    }

    var Lampa = window.Lampa;

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
        return Boolean(movie.name || movie.original_name || movie.number_of_seasons);
    }

    function normalizeImdb(imdb) {
        if (!imdb) return '';
        imdb = (imdb + '').trim();
        if (!/^tt\d+/i.test(imdb)) imdb = 'tt' + imdb.replace(/\D/g, '');
        return /^tt\d+/i.test(imdb) ? imdb : '';
    }

    function loadImdb(movie, type, done) {
        if (movie && movie.imdb_id) return done(normalizeImdb(movie.imdb_id));
        if (!movie || !movie.id || !Lampa.TMDB || !Lampa.TMDB.external_imdb_id) return done('');

        Lampa.TMDB.external_imdb_id({ type: type, id: movie.id }, function (imdb) {
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

    function buildMagnet(stream, name) {
        var hash = (stream.infoHash || '').toLowerCase();
        if (!hash) return '';

        var magnet = 'magnet:?xt=urn:btih:' + hash;
        if (name) magnet += '&dn=' + encodeURIComponent(name);
        if (typeof stream.fileIdx === 'number' && stream.fileIdx >= 0) magnet += '&so=' + stream.fileIdx;

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

    function streamsToResults(streams) {
        if (!streams || !streams.length) return [];

        var seen = {};
        var results = [];

        streams.forEach(function (stream) {
            if (!stream || !stream.infoHash) return;

            var hash = stream.infoHash.toLowerCase();
            if (seen[hash]) return;
            seen[hash] = true;

            var parsed = parseTitle(stream);
            var magnet = buildMagnet(stream, parsed.name);
            if (!magnet) return;

            results.push({
                Title: parsed.name,
                MagnetUri: magnet,
                Link: magnet,
                Size: parsed.size,
                Seeders: parsed.seeds,
                Peers: 0,
                Tracker: parsed.tracker,
                PublishDate: '',
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
        if (type === 'series') {
            return TORRENTIO_BASE + '/stream/series/' + imdb + ':1:1.json';
        }
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
            done(null, streamsToResults(streams));
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

            var fetches = [];

            if (type === 'series') {
                var seasons = movie.number_of_seasons || 1;
                if (seasons > 6) seasons = 6;

                for (var s = 1; s <= seasons; s++) {
                    fetches.push({ season: s, episode: 1 });
                }
            }
            else {
                fetches.push({});
            }

            var pending = fetches.length;
            var allResults = [];
            var anyFatal = null;

            fetches.forEach(function (slot) {
                fetchStreams(imdb, type, slot.season, slot.episode, function (err, results) {
                    if (results && results.length) allResults = allResults.concat(results);
                    if (err) anyFatal = err;

                    if (--pending === 0) {
                        var deduped = dedupByHash(allResults);
                        deduped.sort(function (a, b) { return (b.Seeders || 0) - (a.Seeders || 0); });

                        logDebug('total', deduped.length, 'unique torrents for', imdb);

                        if (!deduped.length && anyFatal) {
                            originalGet(params, oncomplete, onerror);
                        }
                        else {
                            oncomplete({ Results: deduped });
                        }
                    }
                });
            });
        });
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

    var originalGet = Lampa.Parser.get;

    if (!Lampa.Parser._torrentio_hooked) {
        Lampa.Parser._torrentio_hooked = PLUGIN_VERSION;
        Lampa.Parser.get = torrentioGet;
        logDebug('Lampa.Parser.get hooked', PLUGIN_VERSION);
    }
})();
