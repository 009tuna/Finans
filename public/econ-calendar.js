// Ekonomik veri takvimi — saf normalleştirme, eşleştirme, sürpriz ve görünüm (UMD: tarayıcı + Node).
// Kaynak ham verisi src/econ-calendar-source.js tarafından çekilir; bu dosya ağ erişimi yapmaz.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansEconCalendar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COUNTRIES = {
    USD: { code: 'US', label: 'ABD', nasdaq: ['United States'] },
    EUR: { code: 'EU', label: 'Euro Bölgesi', nasdaq: ['Euro Zone', 'Germany', 'France', 'Italy', 'Spain'] },
    JPY: { code: 'JP', label: 'Japonya', nasdaq: ['Japan'] },
    CNY: { code: 'CN', label: 'Çin', nasdaq: ['China'] },
    GBP: { code: 'GB', label: 'İngiltere', nasdaq: ['United Kingdom'] },
    TRY: { code: 'TR', label: 'Türkiye', nasdaq: ['Turkey'] },
  };
  // ABD verisinde orta etki de piyasayı oynatır; diğer bölgelerde yalnız yüksek etki gösterilir.
  const INCLUDE = { USD: ['high', 'medium'], EUR: ['high'], JPY: ['high'], CNY: ['high'], TRY: ['high', 'medium'] };

  // Sıra önemli: ilk eşleşen kural kullanılır.
  const TITLE_RULES = [
    [/^core cpi m\/m/i, 'Çekirdek TÜFE (aylık)'], [/^core cpi y\/y/i, 'Çekirdek TÜFE (yıllık)'],
    [/^cpi m\/m/i, 'TÜFE (aylık)'], [/^cpi y\/y/i, 'TÜFE (yıllık)'],
    [/^core ppi m\/m/i, 'Çekirdek ÜFE (aylık)'], [/^ppi m\/m/i, 'ÜFE (aylık)'], [/^core ppi y\/y/i, 'Çekirdek ÜFE (yıllık)'], [/^ppi y\/y/i, 'ÜFE (yıllık)'],
    [/^core pce price index m\/m/i, 'Çekirdek PCE (aylık)'], [/^core pce price index y\/y/i, 'Çekirdek PCE (yıllık)'],
    [/^pce price index/i, 'PCE fiyat endeksi'],
    [/^non-farm employment change/i, 'Tarım dışı istihdam'], [/^adp non-farm employment change/i, 'ADP özel sektör istihdamı'],
    [/^average hourly earnings/i, 'Ortalama saatlik kazanç (aylık)'], [/^unemployment rate/i, 'İşsizlik oranı'],
    [/^unemployment claims/i, 'Haftalık işsizlik başvuruları'], [/^jolts job openings/i, 'JOLTS açık pozisyonlar'],
    [/^core retail sales/i, 'Çekirdek perakende satışlar (aylık)'], [/^retail sales/i, 'Perakende satışlar (aylık)'],
    [/^advance gdp q\/q/i, 'GSYH (öncü, çeyreklik)'], [/^prelim gdp q\/q/i, 'GSYH (ikinci tahmin)'], [/^final gdp q\/q/i, 'GSYH (nihai)'], [/gdp/i, 'GSYH'],
    [/^ism manufacturing pmi/i, 'ISM imalat PMI'], [/^ism services pmi/i, 'ISM hizmet PMI'],
    [/^flash manufacturing pmi/i, 'İmalat PMI (öncü)'], [/^flash services pmi/i, 'Hizmet PMI (öncü)'],
    [/^empire state manufacturing index/i, 'Empire State imalat endeksi'], [/^philly fed manufacturing index/i, 'Philadelphia Fed imalat endeksi'],
    [/^durable goods orders/i, 'Dayanıklı mal siparişleri'], [/^core durable goods orders/i, 'Çekirdek dayanıklı mal siparişleri'],
    [/^industrial production/i, 'Sanayi üretimi'], [/^building permits/i, 'İnşaat izinleri'], [/^housing starts/i, 'Konut başlangıçları'],
    [/^existing home sales/i, 'İkinci el konut satışları'], [/^new home sales/i, 'Yeni konut satışları'],
    [/^prelim uom consumer sentiment/i, 'Michigan tüketici güveni (öncü)'], [/^revised uom consumer sentiment/i, 'Michigan tüketici güveni (nihai)'],
    [/^cb consumer confidence/i, 'Conference Board tüketici güveni'],
    [/^federal funds rate/i, 'Fed faiz kararı'], [/^fomc statement/i, 'FOMC karar metni'], [/^fomc press conference/i, 'Fed basın toplantısı'],
    [/^fomc meeting minutes/i, 'FOMC tutanakları'], [/^main refinancing rate/i, 'ECB faiz kararı'], [/^monetary policy statement/i, 'Para politikası metni'],
    [/^boj policy rate/i, 'BoJ faiz kararı'], [/^crude oil inventories/i, 'Ham petrol stokları'], [/^natural gas storage/i, 'Doğal gaz stokları'],
    [/^trade balance/i, 'Dış ticaret dengesi'],
    [/^core cpi flash estimate y\/y/i, 'Çekirdek TÜFE öncü (yıllık)'], [/^cpi flash estimate y\/y/i, 'TÜFE öncü (yıllık)'],
    [/^german prelim cpi m\/m/i, 'Almanya TÜFE öncü (aylık)'], [/^german ifo business climate/i, 'Almanya Ifo iş iklimi'],
    [/^german zew economic sentiment/i, 'Almanya ZEW beklenti endeksi'], [/^german flash manufacturing pmi/i, 'Almanya imalat PMI (öncü)'],
    [/^german flash services pmi/i, 'Almanya hizmet PMI (öncü)'], [/^tokyo core cpi y\/y/i, 'Tokyo çekirdek TÜFE (yıllık)'],
    [/^non-manufacturing pmi/i, 'Hizmet PMI'], [/^manufacturing pmi/i, 'İmalat PMI'],
    // Nasdaq adlandırması
    [/^nonfarm payrolls$/i, 'Tarım dışı istihdam'], [/^initial jobless claims$/i, 'Haftalık işsizlik başvuruları'],
    [/^michigan consumer sentiment$/i, 'Michigan tüketici güveni'], [/^s&p global manufacturing pmi$/i, 'S&P Global imalat PMI'],
    [/^s&p global services pmi$/i, 'S&P Global hizmet PMI'], [/^fed interest rate decision$/i, 'Fed faiz kararı'],
    [/^ny empire state manufacturing index$/i, 'Empire State imalat endeksi'], [/^philadelphia fed manufacturing index$/i, 'Philadelphia Fed imalat endeksi'],
    [/^pending home sales$/i, 'Bekleyen konut satışları'], [/^ism non-manufacturing pmi$/i, 'ISM hizmet PMI'],
    [/^adp nonfarm employment change$/i, 'ADP özel sektör istihdamı'], [/^cb consumer confidence$/i, 'Conference Board tüketici güveni'],
  ];
  // Nasdaq ABD satırlarında hangi verilerin takvime gireceği ve etkisi (Nasdaq etki derecesi vermez).
  const NASDAQ_US = [
    [/^(core )?cpi$/i, 'high'], [/^(core )?ppi$/i, 'high'], [/^nonfarm payrolls$/i, 'high'], [/^unemployment rate$/i, 'high'],
    [/^(core )?retail sales$/i, 'high'], [/^gdp( growth rate| price index)?$/i, 'high'], [/^(core )?pce price index$/i, 'high'],
    [/^ism (manufacturing|non-manufacturing|services) pmi$/i, 'high'], [/^fed interest rate decision$/i, 'high'],
    [/^average hourly earnings$/i, 'high'], [/^jolts job openings$/i, 'high'],
    [/^initial jobless claims$/i, 'medium'], [/^michigan consumer sentiment$/i, 'medium'], [/^s&p global (manufacturing|services) pmi$/i, 'medium'],
    [/^building permits$/i, 'medium'], [/^housing starts$/i, 'medium'], [/^(existing|new|pending) home sales$/i, 'medium'],
    [/^durable goods orders$/i, 'medium'], [/^cb consumer confidence$/i, 'medium'], [/^adp nonfarm employment change$/i, 'medium'],
    [/^ny empire state manufacturing index$/i, 'medium'], [/^philadelphia fed manufacturing index$/i, 'medium'],
    [/^industrial production$/i, 'medium'], [/^crude oil inventories$/i, 'medium'],
  ];
  const SPEAKERS = [
    [/^fed chairman (\S+) speaks/i, 'Fed Başkanı $1 konuşuyor'], [/^fomc member (\S+) speaks/i, 'FOMC üyesi $1 konuşuyor'],
    [/^ecb president (\S+) speaks/i, 'ECB Başkanı $1 konuşuyor'], [/^boj gov (\S+) speaks/i, 'BoJ Başkanı $1 konuşuyor'],
    [/^boe gov (\S+) speaks/i, 'BoE Başkanı $1 konuşuyor'], [/^(.+) speaks$/i, '$1 konuşuyor'],
  ];

  function titleTr(title) {
    const raw = String(title || '').trim();
    for (const [re, tr] of SPEAKERS) if (re.test(raw)) return raw.replace(re, tr);
    for (const [re, tr] of TITLE_RULES) if (re.test(raw)) return tr || raw;
    return raw;
  }

  // "Yüksek gelirse" yönünün anlamı: hawkish = faiz/dolar yukarı baskısı.
  function categoryOf(title) {
    const t = String(title || '').toLowerCase();
    if (/speaks|testifies|press conference|statement|minutes/.test(t)) return 'speech';
    if (/funds rate|refinancing rate|policy rate|cash rate|bank rate|interest rate/.test(t)) return 'policy-rate';
    if (/cpi|ppi|pce|inflation|hourly earnings|price index|hicp|import prices/.test(t)) return 'inflation';
    if (/unemployment rate|unemployment claims|jobless/.test(t)) return 'labor-weak';
    if (/employment|payroll|jolts|job openings/.test(t)) return 'labor-strong';
    if (/crude oil|natural gas/.test(t)) return 'energy';
    return 'growth';
  }

  const DAY = 86400000;
  function parseFigure(input) {
    if (input == null) return null;
    const text = String(input).replace(/&nbsp;/g, ' ').replace(/,(?=\d{3}(?!\d))/g, '').trim();
    if (!text) return null;
    const m = text.match(/^[<>~]?\s*(-?\d+(?:\.\d+)?)\s*(%|K|M|B|T)?$/i);
    if (!m) return null;
    const value = Number(m[1]);
    if (!Number.isFinite(value)) return null;
    const unit = (m[2] || '').toUpperCase();
    const decimals = (m[1].split('.')[1] || '').length;
    return { text: text, value: value, unit: unit, decimals: decimals };
  }
  const SCALE = { '': 1, '%': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  function sameFigure(a, b) {
    if (!a || !b) return false;
    if ((a.unit === '%') !== (b.unit === '%')) return false;
    return Math.abs(a.value * SCALE[a.unit] - b.value * SCALE[b.unit]) < 1e-9 * Math.max(1, Math.abs(a.value * SCALE[a.unit]));
  }

  function etDate(iso) { return String(iso || '').slice(0, 10); }
  function addDays(ymd, n) { return new Date(Date.parse(ymd + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10); }
  function slug(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  // Forex Factory haftalık takvim satırı → ortak olay modeli. İlgisiz satırlar için null.
  function normalizeForexFactory(row) {
    if (!row || typeof row !== 'object') return null;
    const currency = String(row.country || '').toUpperCase();
    const impact = String(row.impact || '').toLowerCase();
    if (!INCLUDE[currency] || !INCLUDE[currency].includes(impact)) return null;
    const at = Date.parse(row.date);
    if (!Number.isFinite(at)) return null;
    const country = COUNTRIES[currency];
    const title = String(row.title || '').trim();
    const scheduledAt = new Date(at).toISOString();
    return {
      id: country.code + ':' + slug(title) + ':' + scheduledAt.slice(0, 16),
      source: 'forexfactory',
      currency: currency,
      country: country.code,
      countryLabel: country.label,
      title: title,
      titleTr: titleTr(title),
      category: categoryOf(title),
      impact: impact,
      scheduledAt: scheduledAt,
      localDate: etDate(row.date),
      localTime: String(row.date).slice(11, 16),
      forecast: parseFigure(row.forecast),
      previous: parseFigure(row.previous),
      actual: parseFigure(row.actual),
      revisedPrevious: null,
    };
  }

  // New York yerel saatini (yaz/kış saati dahil) UTC ISO'ya çevirir.
  function easternToUtc(ymd, hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const guess = Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), h + 5, m);
    const shown = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' }).format(new Date(guess));
    const [sh, sm] = shown.split(':').map(Number);
    return new Date(guess - (((sh % 24) * 60 + sm) - (h * 60 + m)) * 60000).toISOString();
  }

  // Nasdaq günlük ABD satırları → olay modeli. Nasdaq "date=D" sorgusu New York saatiyle D-1
  // gününün açıklamalarını döndürür. Aynı ad ve saatte iki yüzde satırı varsa küçük önceki değer aylık,
  // büyük olan yıllık ölçümdür; beklentisi olmayan ikinci satır (ör. yıllık perakende) atlanır.
  function normalizeNasdaqDay(rows, queryDate) {
    const eventDate = addDays(queryDate, -1);
    const groups = new Map();
    (rows || []).forEach((row) => {
      const name = String(row && row.eventName || '').trim();
      const time = String(row && row.gmt || '').trim();
      if (!row || row.country !== 'United States' || !/^\d{2}:\d{2}$/.test(time)) return;
      const rule = NASDAQ_US.find(([re]) => re.test(name));
      if (!rule) return;
      const key = name.toLowerCase() + '|' + time;
      if (!groups.has(key)) groups.set(key, { name, time, impact: rule[1], rows: [] });
      groups.get(key).rows.push(row);
    });
    const events = [];
    groups.forEach((group) => {
      let picked = group.rows.map((row) => ({ row, prev: parseFigure(row.previous), cons: parseFigure(row.consensus), actual: parseFigure(row.actual) }));
      if (picked.length > 1) {
        const withCons = picked.filter((p) => p.cons);
        if (withCons.length) picked = withCons;
      }
      const percent = picked.filter((p) => (p.prev || p.cons || {}).unit === '%');
      const labelled = picked.length === 2 && percent.length === 2
        ? percent.slice().sort((a, b) => Math.abs((a.cons || a.prev).value) - Math.abs((b.cons || b.prev).value)).map((p, i) => Object.assign(p, { suffix: i ? ' y/y' : ' m/m' }))
        : picked.slice(0, 1);
      labelled.forEach((p) => {
        const title = group.name + (p.suffix || '');
        const scheduledAt = easternToUtc(eventDate, group.time);
        events.push({
          id: 'US:' + slug(title) + ':' + scheduledAt.slice(0, 16), source: 'nasdaq', currency: 'USD', country: 'US', countryLabel: 'ABD',
          title, titleTr: titleTr(title), category: categoryOf(title), impact: group.impact, scheduledAt,
          localDate: eventDate, localTime: group.time, forecast: p.cons, previous: p.prev, actual: p.actual, revisedPrevious: null,
        });
      });
    });
    return events;
  }

  const ALIASES = [
    [/non farm employment change/, 'nonfarm payrolls'], [/unemployment claims/, 'initial jobless claims'],
    [/uom consumer sentiment/, 'michigan consumer sentiment'], [/philly/, 'philadelphia'],
    [/federal funds rate/, 'fed interest rate decision'], [/cb consumer confidence/, 'cb consumer confidence'],
  ];
  const STOP = new Set(['m', 'y', 'q', 'mom', 'yoy', 'qoq', 'prelim', 'flash', 'final', 'advance', 'revised', 'the', 'of', 's', 'a', 'sa', 'nsa', 'n']);
  function titleTokens(title) {
    let t = String(title || '').toLowerCase().replace(/m\/m|y\/y|q\/q/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
    for (const [re, to] of ALIASES) t = t.replace(re, to);
    return new Set(t.split(' ').filter((w) => w && !STOP.has(w)));
  }
  function jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    a.forEach((w) => { if (b.has(w)) inter++; });
    return inter / (a.size + b.size - inter);
  }

  // Nasdaq günlük satırlarından gerçekleşen değerleri olaylara bağla.
  // rowsByDate: { 'YYYY-MM-DD': [satır] } — Nasdaq sorgu tarihi; olay o gün ya da önceki gün olabilir.
  function attachActuals(events, rowsByDate) {
    const used = new Set();
    const candidates = [];
    events.forEach((event, index) => {
      if (event.actual || !event.forecast && !event.previous) return;
      const countries = (COUNTRIES[event.currency] || {}).nasdaq || [];
      const tokens = titleTokens(event.title);
      [event.localDate, addDays(event.localDate, 1)].forEach((queryDate) => {
        (rowsByDate[queryDate] || []).forEach((row, rowIndex) => {
          if (!countries.includes(row.country)) return;
          const actual = parseFigure(row.actual);
          if (!actual) return;
          const sim = jaccard(tokens, titleTokens(row.eventName));
          if (sim < 0.5) return;
          const prev = parseFigure(row.previous), cons = parseFigure(row.consensus);
          const prevEq = sameFigure(prev, event.previous), consEq = sameFigure(cons, event.forecast);
          if (!prevEq && !consEq) return;
          if (event.forecast && (actual.unit === '%') !== (event.forecast.unit === '%')) return;
          const timeEq = String(row.gmt || '').trim() === event.localTime;
          candidates.push({ index: index, key: queryDate + '#' + rowIndex, score: 4 * sim + 1.5 * prevEq + 1.5 * consEq + 0.5 * timeEq, actual: actual, prev: prev, prevEq: prevEq });
        });
      });
    });
    candidates.sort((a, b) => b.score - a.score);
    const out = events.map((e) => Object.assign({}, e));
    const done = new Set();
    candidates.forEach((c) => {
      if (done.has(c.index) || used.has(c.key)) return;
      done.add(c.index); used.add(c.key);
      out[c.index].actual = c.actual;
      out[c.index].actualSource = 'nasdaq';
      if (!c.prevEq && c.prev) out[c.index].revisedPrevious = c.prev;
    });
    return out;
  }

  // AI çıktısındaki serbest biçimli sayı ("%33,3", "33.3%", "180 bin") → figür.
  function parseLooseFigure(input) {
    if (input == null) return null;
    let t = String(input).trim().replace(/\s+/g, '');
    if (!t) return null;
    if (t[0] === '%') t = t.slice(1) + '%';
    if (/^-?\d+,\d+(%|[KMBT])?$/i.test(t)) t = t.replace(',', '.');
    t = t.replace(/bin$/i, 'K').replace(/(mn|milyon)$/i, 'M').replace(/(mlr|milyar)$/i, 'B');
    return parseFigure(t);
  }

  // AI analist katmanını takvime bağlar: olay analizi kimlikle (kaynak değişmişse ad + zamanla) eşleşir;
  // Türkiye takvimi ayrı olay olarak eklenir.
  function mergeAnalysis(events, research) {
    const list = (events || []).map((e) => Object.assign({}, e));
    const analyses = (research && Array.isArray(research.calendarAnalysis)) ? research.calendarAnalysis : [];
    analyses.forEach((item) => {
      if (!item || !item.eventId || !item.above || !item.below) return;
      let target = list.find((e) => e.id === item.eventId);
      if (!target) {
        // Kimlik: ÜLKE:başlık-slug:YYYY-MM-DDTHH:MM. Kaynak değiştiyse aynı ülke ve dakikada en benzer başlık.
        const id = String(item.eventId), minute = id.slice(-16), country = id.split(':')[0];
        const tokens = titleTokens(id.slice(country.length + 1, -17).replace(/-/g, ' '));
        let best = 0;
        list.forEach((e) => {
          if (e.country !== country || e.scheduledAt.slice(0, 16) !== minute) return;
          const sim = jaccard(tokens, titleTokens(e.title));
          if (sim >= 0.5 && sim > best) { best = sim; target = e; }
        });
      }
      if (target) target.ai = { view: item.view, forecast: item.forecast || '', conviction: item.conviction, scenarios: { above: item.above, below: item.below } };
    });
    const turkey = (research && Array.isArray(research.turkeyCalendar)) ? research.turkeyCalendar : [];
    turkey.forEach((item) => {
      const at = Date.parse(item && item.scheduledAt);
      if (!Number.isFinite(at) || !item.title || !item.above || !item.below) return;
      const scheduledAt = new Date(at).toISOString();
      const istanbul = new Date(at + 3 * 3600000).toISOString();
      list.push({
        id: 'TR:' + slug(item.id), source: 'ai', currency: 'TRY', country: 'TR', countryLabel: 'Türkiye',
        title: item.title, titleTr: item.title, category: /faiz|ppk/i.test(item.title) ? 'policy-rate' : 'other', impact: item.impact === 'high' ? 'high' : 'medium',
        scheduledAt, localDate: istanbul.slice(0, 10), localTime: istanbul.slice(11, 16),
        forecast: parseLooseFigure(item.forecast), previous: parseLooseFigure(item.previous), actual: parseLooseFigure(item.actual), revisedPrevious: null,
        ai: { view: item.view, forecast: '', conviction: item.conviction, scenarios: { above: item.above, below: item.below } },
      });
    });
    return list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }

  // Gerçekleşenin beklentiye göre konumu. Eşitlik, beklentinin yazıldığı hassasiyete göre ölçülür.
  function surpriseOf(event) {
    const a = event && event.actual, f = event && event.forecast;
    if (!a || !f || (a.unit === '%') !== (f.unit === '%')) return null;
    const diff = a.value * SCALE[a.unit] - f.value * SCALE[f.unit];
    const step = Math.pow(10, -Math.max(a.decimals, f.decimals)) * SCALE[f.unit];
    const direction = Math.abs(diff) < step / 2 ? 'inline' : diff > 0 ? 'above' : 'below';
    return { direction: direction, diff: diff / SCALE[f.unit], unit: f.unit, decimals: Math.max(a.decimals, f.decimals) };
  }

  function statusOf(event, nowMs) {
    const at = Date.parse(event.scheduledAt);
    if (event.actual) return 'released';
    if (at > nowMs) return 'upcoming';
    return event.forecast || event.previous ? 'awaiting' : 'past';
  }

  // Kural tabanlı aktarım — AI olaya özel senaryo yazana kadar kullanılan çerçeve.
  const T = {
    US: {
      inflation: {
        above: { us: 'Fed\'in indirim alanı daralır; tahvil faizi ve dolar yükselir. Teknoloji ve yüksek çarpanlı hisseler ilk tepkide baskı görür.', bist: 'Güçlü dolar ve yükselen ABD faizi gelişen piyasalardan çıkışı hızlandırır; USD/TRY yukarı, bankalar ve yabancı payı yüksek hisseler baskılanır.', crypto: 'Daha sıkı likidite beklentisi BTC ve özellikle altcoin\'ler için olumsuz; ilk saatlerde satış baskısı beklenir.' },
        below: { us: 'İndirim beklentisi güçlenir; faiz ve dolar geriler. Endeksler, özellikle Nasdaq, destek bulur.', bist: 'Zayıf dolar ve düşen ABD faizi gelişen piyasalara giriş için olumlu; yabancı alımı ve bankalar öne çıkabilir.', crypto: 'Likidite beklentisi iyileşir; BTC\'de yukarı tepki, risk iştahı altcoin\'lere yayılabilir.' },
      },
      'labor-strong': {
        above: { us: 'Ekonomi güçlü ama indirim beklentisi zayıflar; faizler yukarı. Hisselerde ilk tepki karışık, döngüseller teknolojiden iyi ayrışır.', bist: 'Dolar güçlenirse gelişen piyasalara baskı; küresel büyüme tarafı kısmen dengeler.', crypto: 'Faiz kanalı ağır basar; kısa vadede baskı.' },
        below: { us: 'İndirim beklentisi artar, faizler düşer. Zayıflık sınırlıysa hisseler için olumlu; sert düşüş resesyon kaygısını tetikler.', bist: 'Düşen ABD faizi ve zayıf dolar destekler; resesyon kaygısı büyürse risk iştahı bozulur.', crypto: 'Faiz düşüşü destekler; büyüme korkusu hâkim olursa riskli varlıklarla birlikte satılır.' },
      },
      'labor-weak': {
        above: { us: 'İş gücü piyasası zayıflıyor; indirim beklentisi artar, faiz ve dolar geriler. Resesyon kaygısına dönüşmezse hisseler için olumlu.', bist: 'Zayıf dolar destekler; küresel yavaşlama kaygısı ihracatçılar için sınır.', crypto: 'Likidite beklentisiyle destek; büyüme korkusu baskın olursa tepki tersine döner.' },
        below: { us: 'İş gücü sıkı kalıyor; indirim beklentisi zayıflar, faizler yukarı. Yüksek çarpanlı hisseler baskı görür.', bist: 'Güçlü dolar gelişen piyasalara baskı yapar.', crypto: 'Faiz kanalıyla baskı.' },
      },
      growth: {
        above: { us: 'Büyüme güçlü; kâr beklentisi için olumlu ama faizlerin yüksek kalma riski artar. Döngüsel sektörler öne çıkar.', bist: 'Küresel risk iştahı olumlu; dolar sert güçlenirse etkisi sınırlanır.', crypto: 'Risk iştahını destekler, faiz kanalı etkiyi törpüleyebilir.' },
        below: { us: 'Yavaşlama işareti; faizler gerilerken savunmacı sektörler öne çıkar, döngüseller zayıflar.', bist: 'Düşen ABD faizi olumlu, küresel talep kaygısı ihracatçılar için olumsuz; net etki karışık.', crypto: 'Faiz düşüşü destekler; büyüme korkusu büyürse riskli varlıklarla birlikte satılır.' },
      },
      'policy-rate': {
        above: { us: 'Beklenenden sıkı karar: faiz ve dolar sert yükselir, endekslerde geniş satış.', bist: 'Gelişen piyasalardan çıkış; USD/TRY yukarı, BIST\'te bankalar başta olmak üzere baskı.', crypto: 'Likidite şoku; BTC ve altcoin\'lerde sert satış riski.' },
        below: { us: 'Beklenenden gevşek karar: faiz ve dolar düşer, hisseler yükselir.', bist: 'Gelişen piyasalara giriş; BIST ve TL için olumlu.', crypto: 'Likidite rallisi; BTC öncülüğünde yükseliş.' },
      },
      speech: {
        above: { us: 'Şahin ton (indirime mesafe): faiz ve dolar yukarı, hisselerde baskı.', bist: 'Güçlü dolar gelişen piyasalar için olumsuz.', crypto: 'Likidite beklentisi bozulur; baskı.' },
        below: { us: 'Güvercin ton (indirim sinyali): faiz ve dolar aşağı, hisseler destek bulur.', bist: 'Zayıf dolar ve giriş beklentisiyle olumlu.', crypto: 'Likidite beklentisiyle olumlu.' },
      },
      energy: {
        above: { us: 'Stok artışı petrolü baskılar; enerji hisseleri zayıf, enflasyon beklentisi için olumlu.', bist: 'Ucuzlayan petrol cari açık ve enflasyon için olumlu; havayolları destek bulur, rafineri marjı izlenmeli.', crypto: 'Doğrudan etkisi sınırlı.' },
        below: { us: 'Stok düşüşü petrolü destekler; enerji hisseleri güçlü, enflasyon riski artar.', bist: 'Pahalı petrol cari açık ve enflasyon için olumsuz; havayolları baskı görür.', crypto: 'Doğrudan etkisi sınırlı.' },
      },
    },
    OTHER: {
      inflation: {
        above: { us: 'Dolaylı etki: küresel tahvil faizleri yükselirse ABD\'ye de taşınır.', bist: 'Avrupa sıkılaşırsa ihracat talebi için risk; etkisi kur ve faiz kanalından sınırlı.', crypto: 'Sınırlı; dolar endeksi üzerinden dolaylı.' },
        below: { us: 'Dolaylı etki: küresel faizlerde gevşeme olumlu.', bist: 'Gevşek para politikası beklentisi ihracatçılar için olumlu.', crypto: 'Sınırlı; küresel likidite için hafif olumlu.' },
      },
      growth: {
        above: { us: 'Küresel büyüme için olumlu; sanayi ve emtia hisseleri destek bulur.', bist: 'Dış talep ve emtia fiyatları için olumlu; ihracatçı ve metal hisseleri öne çıkabilir.', crypto: 'Risk iştahı için hafif olumlu.' },
        below: { us: 'Küresel yavaşlama kaygısı; döngüseller zayıflar.', bist: 'Dış talep zayıflar; ihracatçılar ve metal hisseleri baskı görür.', crypto: 'Risk iştahı için hafif olumsuz.' },
      },
      'policy-rate': {
        above: { us: 'Küresel faiz baskısı; dolar karşısında yerel para güçlenir.', bist: 'Avrupa\'da sıkılaşma ihracat talebi için risk.', crypto: 'Küresel likidite için olumsuz.' },
        below: { us: 'Küresel gevşeme risk iştahını destekler.', bist: 'Gevşeme ihracatçılar ve risk iştahı için olumlu.', crypto: 'Küresel likidite için olumlu.' },
      },
      speech: {
        above: { us: 'Şahin ton küresel faizleri yukarı iter.', bist: 'Sıkı Avrupa/Asya politikası ihracat talebi için risk.', crypto: 'Likidite için hafif olumsuz.' },
        below: { us: 'Güvercin ton küresel risk iştahını destekler.', bist: 'Gevşek politika beklentisi olumlu.', crypto: 'Likidite için hafif olumlu.' },
      },
    },
  };
  T.OTHER['labor-strong'] = T.OTHER.growth;
  T.OTHER['labor-weak'] = { above: T.OTHER.growth.below, below: T.OTHER.growth.above };
  T.OTHER.energy = T.US.energy;

  function ruleScenarios(event) {
    const set = (event.country === 'US' ? T.US : T.OTHER)[event.category] || (event.country === 'US' ? T.US.growth : T.OTHER.growth);
    return { above: set.above, below: set.below, source: 'rule' };
  }
  function scenariosFor(event) {
    const ai = event && event.ai && event.ai.scenarios;
    if (ai && ai.above && ai.below) return { above: ai.above, below: ai.below, source: 'ai' };
    return ruleScenarios(event);
  }

  // ---- Görünüm ----
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  const UNIT_TR = { K: ' bin', M: ' mn', B: ' mlr', T: ' trn', '': '' };
  function fmtNumber(value, decimals) {
    return Number(value).toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  function fmtFigure(fig) {
    if (!fig) return '–';
    if (fig.unit === '%') return '%' + fmtNumber(fig.value, fig.decimals);
    return fmtNumber(fig.value, fig.decimals) + UNIT_TR[fig.unit];
  }
  function fmtDiff(s) {
    if (!s) return '';
    const v = fmtNumber(Math.abs(s.diff), s.decimals);
    const sign = s.diff > 0 ? '+' : s.diff < 0 ? '−' : '';
    return sign + (s.unit === '%' ? v + ' puan' : v + UNIT_TR[s.unit]);
  }
  const TZ = 'Europe/Istanbul';
  function dayKey(iso) { return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); }
  function dayLabel(iso, nowMs) {
    const key = dayKey(iso), today = dayKey(new Date(nowMs).toISOString()), tomorrow = dayKey(new Date(nowMs + DAY).toISOString());
    const text = new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
    return key === today ? 'Bugün · ' + text : key === tomorrow ? 'Yarın · ' + text : text;
  }
  function shortWhen(iso) { return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(' ', ' · '); }
  function timeLabel(iso) { return new Intl.DateTimeFormat('tr-TR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); }
  // "2 sa 14 dk sonra" biçimli geri sayım; geçmişse boş.
  function untilLabel(iso, nowMs) {
    const diff = Date.parse(iso) - (nowMs == null ? Date.now() : nowMs);
    if (!Number.isFinite(diff) || diff <= 0) return '';
    const min = Math.round(diff / 60000);
    if (min < 1) return 'birazdan';
    if (min < 60) return min + ' dk sonra';
    const hours = Math.floor(min / 60), rest = min % 60;
    if (hours < 24) return hours + ' sa' + (rest ? ' ' + rest + ' dk' : '') + ' sonra';
    const days = Math.floor(hours / 24), h = hours % 24;
    return days + ' g' + (h ? ' ' + h + ' sa' : '') + ' sonra';
  }
  // Önümüzdeki ilk önemli veri (yüksek etki, yoksa AI'ın analiz ettiği veya ilk veri).
  function nextEvent(events, nowMs) {
    const upcoming = (events || []).filter((e) => Date.parse(e.scheduledAt) > nowMs).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return upcoming.find((e) => e.impact === 'high') || upcoming.find((e) => e.ai && e.ai.view) || upcoming[0] || null;
  }
  const SURPRISE_TR = { above: 'Beklenti üstü', below: 'Beklenti altı', inline: 'Beklentiye paralel' };
  const MARKETS = [['us', 'ABD'], ['bist', 'BIST'], ['crypto', 'Kripto']];

  function scenarioColumn(head, lines, realized) {
    return '<div class="ec-scn' + (realized ? ' is-realized' : '') + '"><h4>' + head + (realized ? ' <span>gerçekleşti</span>' : '') + '</h4><dl>' +
      MARKETS.map(([key, label]) => '<div><dt>' + label + '</dt><dd>' + esc(lines && lines[key] || '–') + '</dd></div>').join('') + '</dl></div>';
  }
  function speechLabels(event) { return event.category === 'speech' ? ['Şahin ton', 'Güvercin ton'] : null; }

  function eventCardHtml(event, nowMs) {
    const status = statusOf(event, nowMs);
    const surprise = surpriseOf(event);
    const scn = scenariosFor(event);
    const realized = surprise && surprise.direction !== 'inline' ? surprise.direction : null;
    const speech = speechLabels(event);
    let h = '<article class="ec-card ec-' + event.impact + ' ec-' + status + '" data-event-id="' + esc(event.id) + '">';
    const countdown = status === 'upcoming' ? untilLabel(event.scheduledAt, nowMs) : '';
    h += '<header><div class="ec-when">' + esc(timeLabel(event.scheduledAt)) + ' · ' + esc(event.countryLabel) + (countdown ? ' <span class="ec-countdown" data-countdown="' + esc(event.scheduledAt) + '">' + esc(countdown) + '</span>' : '') + '</div><h3>' + esc(event.titleTr) + '</h3>' +
      (event.impact === 'high' ? '<span class="ec-impact">Yüksek etki</span>' : '<span class="ec-impact is-medium">Orta etki</span>') + '</header>';
    if (!speech) {
      h += '<dl class="ec-figures"><div><dt>Önceki</dt><dd>' + esc(fmtFigure(event.previous)) + (event.revisedPrevious ? ' <small>rev. ' + esc(fmtFigure(event.revisedPrevious)) + '</small>' : '') + '</dd></div>' +
        '<div><dt>Beklenti</dt><dd>' + esc(fmtFigure(event.forecast)) + '</dd></div>' +
        (event.ai && event.ai.forecast ? '<div class="ec-ai-fig"><dt>AI tahmini</dt><dd>' + esc(parseLooseFigure(event.ai.forecast) ? fmtFigure(parseLooseFigure(event.ai.forecast)) : event.ai.forecast) + '</dd></div>' : '') +
        '<div class="ec-actual"><dt>Gerçekleşen</dt><dd>' + (event.actual ? esc(fmtFigure(event.actual)) + (surprise ? ' <span class="ec-surprise is-' + surprise.direction + '">' + esc(SURPRISE_TR[surprise.direction]) + (surprise.direction !== 'inline' ? ' · ' + esc(fmtDiff(surprise)) : '') + '</span>' : '') : status === 'awaiting' ? 'Bekleniyor' : '–') + '</dd></div></dl>';
    }
    if (event.ai && event.ai.view) h += '<p class="ec-view"><b>AI görüşü' + (event.ai.conviction ? ' · güven ' + esc(event.ai.conviction) : '') + ':</b> ' + esc(event.ai.view) + '</p>';
    if (surprise && surprise.direction === 'inline') h += '<p class="ec-note">Veri beklentiye paralel geldi; fiyat tepkisini alt kalemler ve diğer gelişmeler belirler.</p>';
    const columns = '<div class="ec-scenarios">' + scenarioColumn(speech ? speech[0] : 'Beklenti üstü gelirse', scn.above, realized === 'above') +
      scenarioColumn(speech ? speech[1] : 'Beklenti altı gelirse', scn.below, realized === 'below') + '</div>';
    const note = scn.source === 'rule' ? '<p class="ec-source">Genel aktarım kuralı · olaya özel AI analizi eklendiğinde değişir</p>' : '';
    // Orta etkili verilerde genel kural metni kapalı durur; aynı cümle her kartta tekrar etmesin.
    if (scn.source === 'rule' && event.impact !== 'high' && !realized) h += '<details class="ec-rule"><summary>' + (speech ? 'Şahin / güvercin ton' : 'Beklenti üstü / altı gelirse') + '</summary>' + columns + note + '</details>';
    else h += columns + note;
    return h + '</article>';
  }

  function releasedRowHtml(event) {
    const s = surpriseOf(event);
    return '<tr><td>' + esc(shortWhen(event.scheduledAt)) + '</td><td>' + esc(event.countryLabel) + '</td><td>' + esc(event.titleTr) + '</td><td class="num">' + esc(fmtFigure(event.previous)) + '</td><td class="num">' + esc(fmtFigure(event.forecast)) + '</td><td class="num"><b>' + esc(fmtFigure(event.actual)) + '</b></td><td>' +
      (s ? '<span class="ec-surprise is-' + s.direction + '">' + esc(SURPRISE_TR[s.direction]) + (s.direction !== 'inline' ? ' · ' + esc(fmtDiff(s)) : '') + '</span>' : '–') + '</td></tr>';
  }

  // payload: { events, generatedAt, coverage }  options: { now, pastDays, aheadDays }
  function calendarHtml(payload, options) {
    const opts = options || {};
    const nowMs = opts.now != null ? Date.parse(opts.now) : Date.now();
    const events = ((payload && payload.events) || []).slice().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    const ahead = nowMs + (opts.aheadDays || 7) * DAY, past = nowMs - (opts.pastDays || 7) * DAY;
    const upcoming = events.filter((e) => Date.parse(e.scheduledAt) <= ahead && (statusOf(e, nowMs) === 'upcoming' || statusOf(e, nowMs) === 'awaiting' || Date.parse(e.scheduledAt) > nowMs - 6 * 3600000));
    const shownIds = new Set(upcoming.map((e) => e.id));
    const released = events.filter((e) => !shownIds.has(e.id) && e.actual && Date.parse(e.scheduledAt) >= past).reverse();
    let h = '<div class="econ-calendar">';
    if (!events.length) {
      return h + '<p class="ec-empty">' + (payload && payload.coverage && payload.coverage.status === 'unavailable' ? 'Takvim kaynağına şu an ulaşılamıyor.' : 'Bu dönem için takvimde önemli veri yok.') + '</p></div>';
    }
    // Yüksek etkili veri yoksa orta etkili veriler kart olarak öne çıkar (sakin haftada boş ekran olmasın).
    // AI'ın analiz ettiği veriler de kart olarak gösterilir.
    const featured = (e) => e.impact === 'high' || !!(e.ai && e.ai.view);
    const hasHigh = upcoming.some(featured);
    const highUpcoming = hasHigh ? upcoming.filter(featured) : upcoming.slice(0, 6);
    const mediumUpcoming = hasHigh ? upcoming.filter((e) => !featured(e)) : upcoming.slice(6);
    if (highUpcoming.length) {
      if (!upcoming.some((e) => e.impact === 'high') && !hasHigh) h += '<p class="ec-note">Önümüzdeki ' + (opts.aheadDays || 7) + ' günde yüksek etkili veri yok; orta etkili veriler gösteriliyor.</p>';
      let day = null;
      highUpcoming.forEach((e) => {
        const key = dayKey(e.scheduledAt);
        if (key !== day) { if (day) h += '</div>'; day = key; h += '<div class="ec-day"><h3 class="ec-day-title">' + esc(dayLabel(e.scheduledAt, nowMs)) + '</h3>'; }
        h += eventCardHtml(e, nowMs);
      });
      h += '</div>';
    } else {
      h += '<p class="ec-empty">Önümüzdeki ' + (opts.aheadDays || 7) + ' günde takvimde önemli veri yok.</p>';
    }
    if (mediumUpcoming.length) {
      h += '<details class="ec-more"><summary>Orta etkili ' + mediumUpcoming.length + ' veri daha</summary><table class="ec-table"><thead><tr><th>Zaman</th><th>Ülke</th><th>Veri</th><th class="num">Önceki</th><th class="num">Beklenti</th></tr></thead><tbody>' +
        mediumUpcoming.map((e) => '<tr><td>' + esc(shortWhen(e.scheduledAt)) + '</td><td>' + esc(e.countryLabel) + '</td><td>' + esc(e.titleTr) + '</td><td class="num">' + esc(fmtFigure(e.previous)) + '</td><td class="num">' + esc(fmtFigure(e.forecast)) + '</td></tr>').join('') +
        '</tbody></table></details>';
    }
    if (released.length) {
      h += '<section class="ec-recent"><h3>Son açıklananlar</h3><table class="ec-table"><thead><tr><th>Zaman</th><th>Ülke</th><th>Veri</th><th class="num">Önceki</th><th class="num">Beklenti</th><th class="num">Gerçekleşen</th><th>Sonuç</th></tr></thead><tbody>' +
        released.slice(0, 16).map(releasedRowHtml).join('') + '</tbody></table></section>';
    }
    return h + '</div>';
  }

  return {
    COUNTRIES, titleTr, categoryOf, parseFigure, parseLooseFigure, sameFigure, normalizeForexFactory, normalizeNasdaqDay, easternToUtc, titleTokens, attachActuals, mergeAnalysis,
    surpriseOf, statusOf, untilLabel, nextEvent, dayLabel, timeLabel, ruleScenarios, scenariosFor, fmtFigure, fmtDiff, eventCardHtml, calendarHtml,
  };
});
