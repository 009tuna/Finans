// Long / short sinyal paneli (trend-signals-v1) — saf görünüm, tarayıcı + Node (UMD).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansTrendSignals = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MARKETS = { us: 'ABD', bist: 'BIST', crypto: 'Kripto' };
  const SETUP = { breakout: 'Kırılım', pullback: 'Geri çekilme' };
  const EXIT = { target: 'Hedef', stop: 'Stop', trend: 'Trend bozuldu', time: 'Süre doldu' };
  const CURRENCY = { us: '$', bist: '₺', crypto: '$' };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function price(value, market) {
    if (!Number.isFinite(value)) return '–';
    const abs = Math.abs(value), digits = abs >= 1000 ? 0 : abs >= 10 ? 2 : abs >= 1 ? 3 : 6;
    return (CURRENCY[market] || '') + value.toLocaleString('tr-TR', { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits });
  }
  function r(value) { return Number.isFinite(value) ? (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + 'R' : '–'; }
  function pct(value) { return Number.isFinite(value) ? (value > 0 ? '+' : value < 0 ? '−' : '') + '%' + Math.abs(value * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '–'; }
  function date(value) { return value ? value.slice(8, 10) + '.' + value.slice(5, 7) : '–'; }
  function side(record) {
    const label = record.action === 'reduce' ? 'Azalt / çık' : record.direction === 'long' ? 'Long' : 'Short';
    return '<span class="ts-side ts-' + esc(record.action === 'reduce' ? 'reduce' : record.direction) + '">' + label + '</span>';
  }
  function evidence(e) {
    if (!e || e.status === 'untested') return '<span class="ts-evidence is-untested">Test edilmedi</span>';
    const detail = 'PF ' + (e.profitFactor == null ? '–' : e.profitFactor.toLocaleString('tr-TR')) + ' · isabet %' + Math.round((e.winRate || 0) * 100) + ' · ' + e.trades + ' işlem';
    return '<span class="ts-evidence is-' + esc(e.status) + '" title="' + esc(detail) + '">' + (e.status === 'proven' ? 'Geçmişte çalıştı' : 'Zayıf geçmiş · izleme') + '<small>' + esc(detail) + '</small></span>';
  }
  const inMarket = (filter) => (record) => filter === 'all' || record.market === filter;
  function table(head, rows) {
    return '<div class="ts-table-wrap"><table class="ts-table"><thead><tr>' + head.map((h) => '<th' + (h.num ? ' class="num"' : '') + '>' + esc(h.label || h) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  const asset = (rec) => '<td><b>' + esc(rec.symbol) + '</b><small>' + esc(MARKETS[rec.market] || rec.market) + '</small></td>';

  function dashboardHtml(view, state) {
    const filter = (state && state.market) || 'all';
    if (!view) return '<section class="trend-signals"><h2>Long / short sinyalleri</h2><p class="ts-empty">Sinyal verisi henüz üretilmedi; bir sonraki veri yenilemesinde oluşur.</p></section>';
    const pick = (list) => (list || []).filter(inMarket(filter));
    let h = '<section class="trend-signals"><header class="ts-head"><div><h2>Long / short sinyalleri</h2><p>Trend yönünde 55 günlük kırılım veya trend içi geri çekilme. Giriş ertesi seans açılışı · stop 2×ATR · hedef 2R · en fazla 40 seans. Short: ABD, kripto ve VİOP vadelisi olan ' + esc(view.futuresUniverse ? view.futuresUniverse.count : '') + ' BIST payı; diğer BIST paylarında azalt / çık uyarısı.</p></div>' +
      '<div class="ts-filter" role="group" aria-label="Piyasa">' + [['all', 'Tümü']].concat(Object.entries(MARKETS)).map(([key, label]) => '<button type="button" data-ts-market="' + key + '" aria-pressed="' + (filter === key) + '">' + label + '</button>').join('') + '</div></header>';
    if (!view.persisted) h += '<p class="ts-note">Sanal işlem defteri bu yenilemede kaydedilemedi; günün sinyalleri gösteriliyor.</p>';

    const fresh = pick(view.newSignals);
    h += '<section class="ts-block"><h3>Yeni sinyaller <span>son 3 gün · ' + fresh.length + '</span></h3>' + (fresh.length ? table(['Varlık', 'Yön', 'Kurulum', { label: 'Sinyal kapanışı', num: true }, { label: 'Stop', num: true }, { label: 'Hedef', num: true }, 'Geçmiş testi'],
      fresh.map((x) => '<tr>' + asset(x) + '<td>' + side(x) + '</td><td>' + esc(SETUP[x.setup] || x.setup) + '<small>' + esc(date(x.signalDate)) + (x.status === 'open' ? ' · girildi ' + esc(date(x.entryDate)) : ' · giriş ertesi açılış') + '</small></td><td class="num">' + price(x.signalClose, x.market) + '</td><td class="num">' + price(x.status === 'open' ? x.stop : x.indicativePlan && x.indicativePlan.stop, x.market) + '</td><td class="num">' + price(x.status === 'open' ? x.target : x.indicativePlan && x.indicativePlan.target, x.market) + '</td><td>' + evidence(x.evidence) + '</td></tr>'))
      : '<p class="ts-empty">Son 3 günde yeni sinyal yok. Kurallar sinyal üretmek için gevşetilmez.</p>') + '</section>';

    const open = pick(view.open);
    h += '<section class="ts-block"><h3>Açık işlemler <span>' + open.length + '</span></h3>' + (open.length ? table(['Varlık', 'Yön', 'Giriş', { label: 'Stop', num: true }, { label: 'Hedef', num: true }, { label: 'Son', num: true }, { label: 'Anlık', num: true }],
      open.map((x) => '<tr>' + asset(x) + '<td>' + side(x) + '</td><td>' + price(x.entry, x.market) + '<small>' + esc(date(x.entryDate)) + ' · ' + esc(SETUP[x.setup] || x.setup) + '</small></td><td class="num">' + price(x.stop, x.market) + '</td><td class="num">' + price(x.target, x.market) + '</td><td class="num">' + price(x.lastClose, x.market) + '</td><td class="num ' + (x.unrealizedR > 0 ? 'is-up' : x.unrealizedR < 0 ? 'is-down' : '') + '">' + r(x.unrealizedR) + '</td></tr>'))
      : '<p class="ts-empty">Açık işlem yok.</p>') + '</section>';

    const pending = pick(view.pending).filter((x) => !(view.newSignals || []).some((n) => n.id === x.id));
    if (pending.length) h += '<p class="ts-note">' + pending.length + ' sinyal girişi bekliyor (ertesi seans açılışı).</p>';

    const advisories = pick(view.advisories);
    if (advisories.length) h += '<section class="ts-block"><h3>Azalt / çık uyarıları <span>BIST · vadelisi olmayan paylar</span></h3><p class="ts-list">' +
      advisories.map((x) => '<b>' + esc(x.symbol) + '</b> ' + esc(date(x.signalDate)) + ' · ' + esc(SETUP[x.setup] || x.setup)).join(' · ') + '</p></section>';

    const closed = pick(view.closed);
    const live = view.live || {};
    const liveKeys = Object.keys(live).filter((k) => k !== 'all' && live[k].trades && (filter === 'all' || k.startsWith(filter + ':')));
    h += '<section class="ts-block"><h3>Kapanan işlemler <span>' + closed.length + '</span></h3>' +
      (liveKeys.length ? '<p class="ts-stats">' + liveKeys.map((k) => { const s = live[k]; const [m, d] = k.split(':'); return esc(MARKETS[m]) + ' ' + (d === 'long' ? 'long' : 'short') + ': ' + s.trades + ' işlem · isabet %' + Math.round(s.winRate * 100) + ' · toplam ' + r(s.totalR); }).join(' &nbsp;|&nbsp; ') + '</p>' : '') +
      (closed.length ? table(['Varlık', 'Yön', 'Giriş → çıkış', 'Sebep', { label: 'Sonuç', num: true }],
        closed.map((x) => '<tr>' + asset(x) + '<td>' + side(x) + '</td><td>' + price(x.entry, x.market) + ' → ' + price(x.exit, x.market) + '<small>' + esc(date(x.entryDate)) + ' → ' + esc(date(x.exitDate)) + '</small></td><td>' + esc(EXIT[x.exitReason] || x.exitReason) + '</td><td class="num ' + (x.r > 0 ? 'is-up' : 'is-down') + '">' + r(x.r) + '<small>' + pct(x.returnPct) + '</small></td></tr>'))
        : '<p class="ts-empty">Henüz kapanan canlı işlem yok; ilk sonuçlar birkaç hafta içinde oluşur.</p>') + '</section>';

    if (view.backtest && view.backtest.summary) {
      const rows = [];
      for (const [m, label] of Object.entries(MARKETS)) for (const d of ['long', 'short']) {
        if (filter !== 'all' && filter !== m) continue;
        const s = view.backtest.summary[m + ':' + d];
        if (!s || !s.trades) continue;
        rows.push('<tr><td><b>' + label + '</b></td><td>' + side({ direction: d }) + '</td><td class="num">' + s.trades + '</td><td class="num">%' + Math.round(s.winRate * 100) + '</td><td class="num ' + (s.avgR > 0 ? 'is-up' : 'is-down') + '">' + r(s.avgR) + '</td><td class="num">' + (s.profitFactor == null ? '–' : s.profitFactor.toLocaleString('tr-TR')) + '</td><td class="num">' + r(-s.maxDrawdownR) + '</td></tr>');
      }
      const period = view.backtest.period || {};
      h += '<details class="ts-block ts-backtest"><summary>Geçmiş testi · ' + esc(date(period.from)) + '.' + esc(String(period.from || '').slice(0, 4)) + ' – ' + esc(date(period.to)) + '.' + esc(String(period.to || '').slice(0, 4)) + ' · ' + esc(view.backtest.assets || '') + ' varlık</summary>' +
        table(['Piyasa', 'Yön', { label: 'İşlem', num: true }, { label: 'İsabet', num: true }, { label: 'Ort. sonuç', num: true }, { label: 'Kâr faktörü', num: true }, { label: 'En büyük düşüş', num: true }], rows) +
        '<p class="ts-note">Aynı kurallar, maliyet dahil. Geçmiş sonuç gelecek getiriyi garanti etmez; kâr faktörü 1,2 altındaki kurulumlar "zayıf geçmiş · izleme" olarak işaretlenir.</p></details>';
    }
    return h + '</section>';
  }

  function summaryHtml(view) {
    if (!view) return '';
    const fresh = view.newSignals || [], open = view.open || [], live = (view.live && view.live.all) || {};
    const longs = fresh.filter((x) => x.direction === 'long').length, shorts = fresh.length - longs;
    return '<div class="ts-summary"><span><b>' + fresh.length + '</b> yeni sinyal' + (fresh.length ? ' (' + longs + ' long, ' + shorts + ' short)' : '') + '</span><span><b>' + open.length + '</b> açık işlem</span>' +
      '<span>Kapanan: ' + (live.trades ? '<b>' + live.trades + '</b> işlem · ' + r(live.totalR) : 'henüz yok') + '</span><button type="button" class="btn btn-secondary" data-observer-open>Sinyallere git →</button></div>';
  }
  return { dashboardHtml, summaryHtml };
});
