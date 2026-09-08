(function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—';
  const market = (m) => ({ us: 'ABD', bist: 'BIST', crypto: 'Kripto' }[m] || m);
  const link = (url, label) => { try { if (!['https:', 'http:'].includes(new URL(url).protocol)) return esc(label); } catch (_) { return esc(label); }
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>'; };
  function researchHtml(r) {
    if (!r) return '';
    const sourceLinks = (ids) => ids.map((id) => r.sources.find((s) => s.id === id)).filter(Boolean).map((s) => link(s.url, s.title) + (s.publishedAt ? ' (' + esc(s.publishedAt) + ')' : ' (yayın zamanı doğrulanamadı)')).join(' · ');
    return '<section class="card research-card"><div class="card-head"><h2>Astra araştırması</h2><span class="ai-badge">' + esc(r.model) + '</span></div>' +
      '<p class="muted">Kaynaklı model yorumu · ' + esc(r.generatedAt) + ' · Olasılıklar henüz kalibre edilmedi.</p>' +
      '<div class="research-coverage">' + r.coverage.map((c) => '<div><b>' + esc(market(c.market)) + ' · ' + esc({ available: 'Kaynak var', partial: 'Kısmi kapsam', insufficient_evidence: 'Kanıt yetersiz' }[c.status]) + '</b><p>' + esc(c.reason) + '</p></div>').join('') + '</div>' +
      r.events.map((e) => '<article class="research-event"><h3>' + esc(e.title) + '</h3><p>' + esc(e.whatChanged) + '</p><p><b>Beklentiden farkı:</b> ' + esc(e.expectationGap) + '</p><p><b>Karşı kanıt:</b> ' + esc(e.counterEvidence) + '</p><p class="research-source">' + sourceLinks(e.sourceIds) + '</p></article>').join('') +
      (r.scenarios.length ? '<h3>Koşullu piyasa senaryoları</h3>' + r.scenarios.map((s) => '<article class="research-event"><b>' + esc(market(s.market) + ' ' + s.symbol + ' · ' + s.horizon) + '</b><p><b>Koşul:</b> ' + esc(s.condition) + '</p><p>' + esc(s.impact) + '</p><p><b>Bozulma koşulu:</b> ' + esc(s.invalidation) + '</p><p class="research-source">' + sourceLinks(s.sourceIds) + '</p></article>').join('') : '') +
      (r.unresolvedQuestions.length ? '<h3>Açık veri eksikleri</h3><ul>' + r.unresolvedQuestions.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul>' : '') + '</section>';
  }
  function evaluationHtml(data) {
    const s = data.scorecard;
    return '<div class="card-head"><h2>Tahminler ne kadar isabetli?</h2><span class="card-sub">Olay açıklanmadan önce kaydedilen tahminler</span></div>' +
      '<p>' + s.total + ' tahmin · ' + s.resolved + ' sonuçlandı · ' + s.pending + ' açıklama bekliyor · ' + s.awaitingOutcome + ' gerçekleşen veri bekliyor</p>' +
      '<p class="muted">MAE: ortalama mutlak hata. Brier: konsensüsün aşılması olasılığının hatası; düşük daha iyi. Konsensüs karşılaştırması aynı sonuç kümesini kullanır. Bu ölçümler fiyat getirisi veya kârlılık değildir.</p>' +
      (!s.total ? '<p>Henüz açıklama öncesi kaydedilmiş tahmin yok. Geçmiş olaylardan yapay başarı üretilmez.</p>' : '') +
      (s.groups.length ? '<div class="research-table"><table><thead><tr><th>Piyasa / ölçüm</th><th>Sonuç</th><th>MAE</th><th>Model / konsensüs MAE</th><th>Brier</th><th>Örneklem</th></tr></thead><tbody>' + s.groups.map((g) => '<tr><td>' + esc(market(g.market) + ' · ' + g.metric + ' (' + g.unit + ')') + '</td><td>' + g.resolved + '/' + g.forecasts + '</td><td>' + num(g.mae) + '</td><td>' + num(g.pairedModelMae) + ' / ' + num(g.consensusMae) + ' (n=' + g.pairedCount + ')</td><td>' + num(g.brier) + ' (n=' + g.brierCount + ')</td><td>' + (g.sampleStatus === 'insufficient_sample' ? 'Yetersiz' : 'Yalnız betimsel') + '</td></tr>').join('') + '</tbody></table></div>' : '') +
      data.forecasts.map((f) => {
        const o = data.outcomes.find((x) => x.forecastId === f.id);
        return '<details class="research-event"><summary>' + esc(market(f.market) + ' ' + f.symbol + ' · ' + f.metric + ' · ' + f.period) + ' — ' + (o ? 'Sonuçlandı' : 'Bekliyor') + '</summary><p>Tahmin: ' + num(f.pointEstimate) + ' ' + esc(f.unit) + ' · Konsensüs: ' + num(f.consensus) + ' · P(gerçekleşen &gt; konsensüs): ' + (f.probabilityAboveConsensus === null ? '—' : num(f.probabilityAboveConsensus * 100) + '% (öznel)') + '</p><p>Kayıt: ' + esc(f.recordedAt) + ' · Açıklama: ' + esc(f.scheduledAt) + '</p><p>' + esc(f.rationale) + '</p>' +
          (o ? '<p>Gerçekleşen: ' + num(o.value) + ' · ' + link(o.sourceUrl, 'Sonuç kaynağı') + ' · ' + (o.verification === 'provider-first-observed' ? 'Sağlayıcıda ilk gördüğümüz değer; ilk açıklama sürümü garanti edilmez.' : 'İnsan tarafından kontrol edildi.') + '</p>' : '<p>' + link(f.resolution.sourceUrl, 'Gerçekleşenin izleneceği kaynak') + '</p>') +
          '<p class="research-source">' + (f.sourceEvidence || []).map((x) => link(x.url, x.title)).join(' · ') + '</p></details>';
      }).join('');
  }
  async function loadEvaluation(el) {
    try {
      const response = await fetch('/api/research', { cache: 'no-store' });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      el.innerHTML = evaluationHtml(data);
    } catch (_) { el.innerHTML = '<h2>Tahmin ölçümü</h2><p>Ölçüm günlüğüne erişilemedi. Başarı oranı gösterilemiyor.</p>'; }
  }
  root.FinansResearch = { researchHtml, evaluationHtml, loadEvaluation };
})(typeof globalThis !== 'undefined' ? globalThis : this);
