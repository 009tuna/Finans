// Sinyal paneli (trend-signals-v2) — saf görünüm, tarayıcı + Node (UMD).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansTrendSignals = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MARKETS = { us: 'ABD', bist: 'BIST', crypto: 'Kripto' };
  const SETUP = { breakout: 'Kırılım', pullback: 'Geri çekilme' };
  const EXIT = { target: 'Hedef', stop: 'Stop', trend: 'Trend bozuldu', time: 'Süre doldu' };
  const CURRENCY = { us: '$', bist: '₺', crypto: '$' };
  const PROTECTION = { healthy: 'Sağlıklı', mixed: 'Karışık', weak: 'Zayıf', unknown: 'Veri yok' };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function price(value, market) {
    if (!Number.isFinite(value)) return '–';
    const abs = Math.abs(value), digits = abs >= 1000 ? 0 : abs >= 10 ? 2 : abs >= 1 ? 3 : 6;
    return (CURRENCY[market] || '') + value.toLocaleString('tr-TR', { minimumFractionDigits: Math.min(digits, 2), maximumFractionDigits: digits });
  }
  function r(value) { return Number.isFinite(value) ? (value > 0 ? '+' : value < 0 ? '−' : '') + Math.abs(value).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + 'R' : '–'; }
  function pct(value, digits) { return Number.isFinite(value) ? (value < 0 ? '−' : '') + '%' + Math.abs(value * 100).toLocaleString('tr-TR', { maximumFractionDigits: digits == null ? 1 : digits }) : '–'; }
  function signedPct(value) { return Number.isFinite(value) ? (value > 0 ? '+' : '') + pct(value) : '–'; }
  function date(value) { return value ? value.slice(8, 10) + '.' + value.slice(5, 7) : '–'; }
  function evidence(e) {
    if (!e || e.status === 'untested') return '<span class="ts-evidence is-untested">Test edilmedi</span>';
    const detail = 'PF ' + (e.profitFactor == null ? '–' : e.profitFactor.toLocaleString('tr-TR')) + ' · isabet %' + Math.round((e.winRate || 0) * 100) + ' · ' + e.trades + ' işlem';
    return '<span class="ts-evidence is-' + esc(e.status) + '">' + (e.status === 'proven' ? 'Geçmişte çalıştı' : 'Zayıf geçmiş') + '<small>' + esc(detail) + '</small></span>';
  }
  function weight(sizing) {
    if (!sizing || !Number.isFinite(sizing.weight)) return '–';
    return pct(sizing.weight, 0) + '<small>stop %' + (sizing.stopPct * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' uzakta' + (sizing.capped ? ' · üst sınır' : '') + '</small>';
  }
  // Eski (v1) biçimdeki görünümde short ve geri çekilme kayıtları işlem listelerine karışmasın.
  const isTrade = (record) => record && record.direction === 'long' && record.setup === 'breakout';
  const inMarket = (filter) => (record) => filter === 'all' || record.market === filter;
  function table(head, rows) {
    return '<div class="ts-table-wrap"><table class="ts-table"><thead><tr>' + head.map((h) => '<th' + (h.num ? ' class="num"' : '') + '>' + esc(h.label || h) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  const asset = (rec) => '<td><b>' + esc(rec.symbol) + '</b><small>' + esc(MARKETS[rec.market] || rec.market) + '</small></td>';

  function dashboardHtml(view, state) {
    const filter = (state && state.market) || 'all';
    if (!view) return '<section class="trend-signals"><h2>Sinyaller</h2><p class="ts-empty">Sinyal verisi henüz üretilmedi; bir sonraki veri yenilemesinde oluşur.</p></section>';
    const pick = (list) => (list || []).filter(inMarket(filter));
    const pickTrades = (list) => pick(list).filter(isTrade);
    const rules = view.rules || {};
    let h = '<section class="trend-signals"><header class="ts-head"><div><h2>Sinyaller</h2><p>İşlem sinyali yalnız trend yönündeki 55 günlük kırılım (long). Giriş ertesi seans açılışı · stop 2×ATR · hedef 2R · en fazla 40 seans. Önerilen ağırlık, stop olursa sermayenin %' +
      esc(((rules.riskPerTrade || 0.01) * 100).toLocaleString('tr-TR')) + "'ini kaybettirecek büyüklüktür (tek pozisyon en fazla %" + esc(Math.round((rules.maxWeight || 0.2) * 100)) + ', aynı anda en fazla ' + esc(rules.maxPositions || 8) + ' pozisyon). Düşüş yönündeki tetikler işlem değil, uzak dur / çık uyarısıdır.</p></div>' +
      '<div class="ts-filter" role="group" aria-label="Piyasa">' + [['all', 'Tümü']].concat(Object.entries(MARKETS)).map(([key, label]) => '<button type="button" data-ts-market="' + key + '" aria-pressed="' + (filter === key) + '">' + label + '</button>').join('') + '</div></header>';
    if (!view.persisted) h += '<p class="ts-note">Sanal işlem defteri bu yenilemede kaydedilemedi; günün sinyalleri gösteriliyor.</p>';

    // Koruma katmanı
    const prot = view.protection || {};
    const protRows = Object.entries(MARKETS).filter(([m]) => filter === 'all' || filter === m).map(([m, label]) => {
      const p = prot[m] || {};
      const share = Number.isFinite(p.share) ? Math.round(p.share * 100) : 0;
      return '<div class="ts-prot is-' + esc(p.state || 'unknown') + '"><b>' + label + '</b><span>' + esc(PROTECTION[p.state] || 'Veri yok') + '</span><div class="ts-meter" role="img" aria-label="%' + share + '"><i style="width:' + share + '%"></i><em style="left:40%"></em><em style="left:60%"></em></div><small>' + (p.total ? p.above + ' / ' + p.total + ' varlık 200 günlük ortalamanın üstünde' : 'Veri yok') + '</small></div>';
    });
    h += '<section class="ts-block"><h3>Trend koruma katmanı</h3><div class="ts-prot-grid">' + protRows.join('') + '</div><p class="ts-note">200 günlük ortalamanın altındaki varlıkta pozisyon taşımak yerine nakitte beklemek, 10 yıllık testte en büyük düşüşü al-ve-tut\'a göre kabaca yarıya indirdi.</p></section>';

    const fresh = pickTrades(view.newSignals);
    h += '<section class="ts-block"><h3>Yeni long sinyalleri <span>son 3 gün · ' + fresh.length + '</span></h3>' + (fresh.length ? table(['Varlık', 'Sinyal', { label: 'Kapanış', num: true }, { label: 'Stop', num: true }, { label: 'Hedef', num: true }, { label: 'Önerilen ağırlık', num: true }, 'Geçmiş testi'],
      fresh.map((x) => '<tr>' + asset(x) + '<td>Kırılım<small>' + esc(date(x.signalDate)) + (x.status === 'open' ? ' · girildi ' + esc(date(x.entryDate)) : ' · giriş ertesi açılış') + '</small></td><td class="num">' + price(x.signalClose, x.market) + '</td><td class="num">' + price(x.status === 'open' ? x.stop : x.indicativePlan && x.indicativePlan.stop, x.market) + '</td><td class="num">' + price(x.status === 'open' ? x.target : x.indicativePlan && x.indicativePlan.target, x.market) + '</td><td class="num">' + weight(x.sizing) + '</td><td>' + evidence(x.evidence) + '</td></tr>'))
      : '<p class="ts-empty">Son 3 günde yeni long kırılımı yok. Kurallar sinyal üretmek için gevşetilmez.</p>') + '</section>';

    const open = pickTrades(view.open);
    const exposure = view.exposure || {};
    h += '<section class="ts-block"><h3>Açık işlemler <span>' + open.length + (filter === 'all' && exposure.openPositions ? ' · toplam ağırlık ' + pct(exposure.weight, 0) : '') + '</span></h3>' + (open.length ? table(['Varlık', 'Giriş', { label: 'Stop', num: true }, { label: 'Hedef', num: true }, { label: 'Son', num: true }, { label: 'Ağırlık', num: true }, { label: 'Anlık', num: true }],
      open.map((x) => '<tr>' + asset(x) + '<td>' + price(x.entry, x.market) + '<small>' + esc(date(x.entryDate)) + '</small></td><td class="num">' + price(x.stop, x.market) + '</td><td class="num">' + price(x.target, x.market) + '</td><td class="num">' + price(x.lastClose, x.market) + '</td><td class="num">' + (x.sizing ? pct(x.sizing.weight, 0) : '–') + '</td><td class="num ' + (x.unrealizedR > 0 ? 'is-up' : x.unrealizedR < 0 ? 'is-down' : '') + '">' + r(x.unrealizedR) + '</td></tr>'))
      : '<p class="ts-empty">Açık işlem yok.</p>') + '</section>';

    const pending = pickTrades(view.pending).filter((x) => !(view.newSignals || []).some((n) => n.id === x.id));
    if (pending.length) h += '<p class="ts-note">' + pending.length + ' sinyal girişi bekliyor (ertesi seans açılışı).</p>';

    const avoid = pick(view.avoid);
    h += '<section class="ts-block"><h3>Uzak dur / çık <span>son 3 gün · ' + avoid.length + '</span></h3>' + (avoid.length
      ? '<p class="ts-list">' + avoid.map((x) => '<b>' + esc(x.symbol) + '</b> <small>' + esc(MARKETS[x.market]) + ' · ' + esc(date(x.signalDate)) + ' · ' + esc(x.setup === 'breakout' ? '55 günlük dip kırıldı' : 'düşüş trendinde tepki satışı') + '</small>').join(' · ') + '</p><p class="ts-note">Bu varlıkları elinde tutuyorsan çıkışı değerlendir; yeni alım yapma. Short işlem önerisi değildir: 10 yıllık testte short\'lar her piyasada sonucu kötüleştirdi.</p>'
      : '<p class="ts-empty">Son 3 günde yeni düşüş tetiği yok.</p>') + '</section>';

    const watch = pick(view.watch);
    if (watch.length) h += '<section class="ts-block"><h3>İzlemede <span>trend içi geri çekilme · işlem açılmaz</span></h3><p class="ts-list">' + watch.map((x) => '<b>' + esc(x.symbol) + '</b> <small>' + esc(MARKETS[x.market]) + '</small>').join(' · ') + '</p></section>';

    const closed = pickTrades(view.closed);
    const live = view.live || {};
    const liveKeys = Object.keys(MARKETS).filter((k) => live[k] && live[k].trades && (filter === 'all' || filter === k));
    h += '<section class="ts-block"><h3>Kapanan işlemler <span>' + closed.length + '</span></h3>' +
      (liveKeys.length ? '<p class="ts-stats">' + liveKeys.map((k) => { const s = live[k]; return esc(MARKETS[k]) + ': ' + s.trades + ' işlem · isabet %' + Math.round(s.winRate * 100) + ' · toplam ' + r(s.totalR); }).join(' &nbsp;|&nbsp; ') + '</p>' : '') +
      (closed.length ? table(['Varlık', 'Giriş → çıkış', 'Sebep', { label: 'Sonuç', num: true }],
        closed.map((x) => '<tr>' + asset(x) + '<td>' + price(x.entry, x.market) + ' → ' + price(x.exit, x.market) + '<small>' + esc(date(x.entryDate)) + ' → ' + esc(date(x.exitDate)) + '</small></td><td>' + esc(EXIT[x.exitReason] || x.exitReason) + '</td><td class="num ' + (x.r > 0 ? 'is-up' : 'is-down') + '">' + r(x.r) + '<small>' + signedPct(x.returnPct) + '</small></td></tr>'))
        : '<p class="ts-empty">Henüz kapanan canlı işlem yok; ilk sonuçlar birkaç hafta içinde oluşur.</p>') + '</section>';

    if (view.backtest && view.backtest.summary) {
      const rows = Object.entries(MARKETS).filter(([m]) => filter === 'all' || filter === m).map(([m, label]) => {
        const s = view.backtest.summary[m];
        if (!s || !s.trades) return '';
        return '<tr><td><b>' + label + '</b></td><td class="num">' + s.trades + '</td><td class="num">%' + Math.round(s.winRate * 100) + '</td><td class="num ' + (s.avgR > 0 ? 'is-up' : 'is-down') + '">' + r(s.avgR) + '</td><td class="num">' + (s.profitFactor == null ? '–' : s.profitFactor.toLocaleString('tr-TR')) + '</td><td class="num">' + r(-s.maxDrawdownR) + '</td></tr>';
      }).filter(Boolean);
      const period = view.backtest.period || {};
      h += '<details class="ts-block ts-backtest"><summary>Geçmiş testi · long kırılım · ' + esc(String(period.from || '').slice(0, 7)) + ' – ' + esc(String(period.to || '').slice(0, 7)) + ' · ' + esc(view.backtest.assets || '') + ' varlık</summary>' +
        table(['Piyasa', { label: 'İşlem', num: true }, { label: 'İsabet', num: true }, { label: 'Ort. sonuç', num: true }, { label: 'Kâr faktörü', num: true }, { label: 'En büyük düşüş', num: true }], rows) +
        '<p class="ts-note">Aynı kurallar, maliyet dahil. Strateji seçiminin gerekçesi: docs/research-audit/2026-10-17-strateji-karsilastirma.md. Geçmiş sonuç gelecek getiriyi garanti etmez.</p></details>';
    }
    return h + '</section>';
  }

  function summaryHtml(view) {
    if (!view) return '';
    const fresh = (view.newSignals || []).filter(isTrade), open = (view.open || []).filter(isTrade), avoid = view.avoid || [], live = (view.live && view.live.all) || {};
    return '<div class="ts-summary"><span><b>' + fresh.length + '</b> yeni long sinyali</span><span><b>' + open.length + '</b> açık işlem</span><span><b>' + avoid.length + '</b> uzak dur / çık</span>' +
      '<span>Kapanan: ' + (live.trades ? '<b>' + live.trades + '</b> işlem · ' + r(live.totalR) : 'henüz yok') + '</span><button type="button" class="btn btn-secondary" data-observer-open>Sinyallere git</button></div>';
  }
  return { dashboardHtml, summaryHtml };
});
