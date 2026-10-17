// AI analistinin piyasa görüşleri (ABD / BIST / Kripto) — saf görünüm, tarayıcı + Node (UMD).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansAnalystViews = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MARKETS = [['us', 'ABD'], ['bist', 'BIST'], ['crypto', 'Kripto']];
  const STANCE = { olumlu: 'Olumlu', 'nötr': 'Nötr', olumsuz: 'Olumsuz' };
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  // Güven düzeyi üç noktalı ölçekle: düşük ●○○, orta ●●○, yüksek ●●●.
  function dots(level) {
    const n = { 'düşük': 1, orta: 2, 'yüksek': 3 }[level] || 0;
    return '<span class="av-dots" aria-label="Güven ' + esc(level) + '">' + [1, 2, 3].map((i) => '<i' + (i <= n ? ' class="on"' : '') + '></i>').join('') + '</span><span class="av-dots-label">güven ' + esc(level) + '</span>';
  }
  function list(items) {
    return Array.isArray(items) && items.length ? '<ul>' + items.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
  }
  // views: research.marketViews; commentary: eski çalışmalar için düz yorum yedeği.
  function marketViewsHtml(views, commentary, options) {
    const opts = options || {};
    const rows = MARKETS.map(([key, label]) => {
      const v = views && views[key];
      if (v && STANCE[v.stance]) {
        return '<article class="av-market av-' + esc(v.stance === 'nötr' ? 'notr' : v.stance) + '"><header><h3>' + label + '</h3><span class="av-stance">' + esc(STANCE[v.stance]) + '</span><span class="av-conviction" title="Güven: ' + esc(v.conviction) + '">' + dots(v.conviction) + '</span></header>' +
          '<p class="av-thesis">' + esc(v.thesis) + '</p>' +
          (opts.compact ? '' : (v.drivers && v.drivers.length ? '<div class="av-list"><h4>Destekleyenler</h4>' + list(v.drivers) + '</div>' : '') +
            (v.risks && v.risks.length ? '<div class="av-list"><h4>Görüşü bozacaklar</h4>' + list(v.risks) + '</div>' : '')) +
          (v.watch ? '<p class="av-watch"><b>İzle:</b> ' + esc(v.watch) + '</p>' : '') + '</article>';
      }
      const text = commentary && commentary[key];
      return text ? '<article class="av-market"><header><h3>' + label + '</h3></header><p class="av-thesis">' + esc(text) + '</p></article>' : '';
    }).filter(Boolean);
    return rows.length ? '<div class="analyst-views' + (opts.compact ? ' is-compact' : '') + '">' + rows.join('') + '</div>' : '';
  }
  return { marketViewsHtml };
});
