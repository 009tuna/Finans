(function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—';
  const count = (v) => Number.isSafeInteger(v) && v >= 0 ? String(v) : '—';
  const market = (m) => ({ us: 'ABD', bist: 'BIST', crypto: 'Kripto' }[m] || m);
  const timestamp = (value) => { if (typeof value !== 'string' || !value.trim()) return 'Zaman doğrulanamadı · Europe/Istanbul'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Zaman doğrulanamadı · Europe/Istanbul' : new Intl.DateTimeFormat('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul', timeZoneName: 'short' }).format(date) + ' · Europe/Istanbul'; };
  const reportTimeLabels = (integrity) => [
    ['Fiyat verisi', integrity && integrity.pricesAsOf],
    ['Analiz kesiti', integrity && integrity.analysisAsOf],
    ['Araştırma', integrity && integrity.researchAsOf],
  ].map(([label, value]) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(timestamp(value)) + '</dd></div>').join('');
  const automationStatusText = (status) => ({ idle: 'Beklemede', running: 'Çalışıyor', completed: 'Tamamlandı', failed: 'Başarısız', interrupted: 'Kesildi', unavailable: 'Durum alınamadı' }[status] || 'Durum bilinmiyor');
  function automationStatusSummary(automation) {
    if (!automation || typeof automation !== 'object') return '';
    const status = ['idle', 'running', 'completed', 'failed', 'interrupted', 'unavailable'].includes(automation.status) ? automation.status : 'unavailable';
    const publicationSkipped = status === 'completed' && Array.isArray(automation.stages) && automation.stages.some((stage) => stage && stage.id === 'publication' && stage.status === 'skipped');
    const last = automation.lastSuccessful && automation.lastSuccessful.publishedAt ? ' · Son başarılı yayın: ' + timestamp(automation.lastSuccessful.publishedAt) : '';
    return 'Günlük otomasyon: ' + (publicationSkipped ? 'Tamamlandı · Yeni yayın yapılmadı' : automationStatusText(status)) + last;
  }
  const stageStatusText = (status) => ({ pending: 'Bekliyor', running: 'Çalışıyor', completed: 'Tamamlandı', skipped: 'Atlandı', failed: 'Başarısız' }[status] || 'Durum bilinmiyor');
  function duration(start, finish, now, status) {
    const from = Date.parse(start || '');
    if (!finish && status !== 'running') return 'Süre bilinmiyor';
    const to = finish ? Date.parse(finish) : now;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 'Süre bilinmiyor';
    const seconds = Math.floor((to - from) / 1000);
    return seconds < 60 ? seconds + ' sn' : Math.floor(seconds / 60) + ' dk' + (seconds % 60 ? ' ' + seconds % 60 + ' sn' : '');
  }
  function automationHtml(automation, nowValue) {
    if (!automation || typeof automation !== 'object') return '';
    const stages = Array.isArray(automation.stages) ? automation.stages : [];
    const order = ['data', 'outcomes', 'base', 'research', 'validation', 'publication'];
    const labels = { data: 'Veri', outcomes: 'Sonuçlar', base: 'Temel rapor', research: 'Araştırma', validation: 'Doğrulama', publication: 'Yayın' };
    const now = Number.isFinite(Date.parse(nowValue || '')) ? Date.parse(nowValue) : Date.now();
    const status = ['idle', 'running', 'completed', 'failed', 'interrupted', 'unavailable'].includes(automation.status) ? automation.status : 'unavailable';
    const currentRun = status === 'running' ? '<p class="automation-current" role="status" aria-live="polite">Son deneme: ' + esc(automationStatusText(status)) + (automation.startedAt ? ' · Başladı: ' + esc(timestamp(automation.startedAt)) : '') + '</p>' : '<p class="automation-current">Son deneme: ' + esc(automationStatusText(status)) + (automation.updatedAt ? ' · Güncellendi: ' + esc(timestamp(automation.updatedAt)) : '') + '</p>';
    const stageRows = order.map((id) => stages.find((stage) => stage && stage.id === id)).filter(Boolean).map((stage) => {
      const stageStatus = ['pending', 'running', 'completed', 'skipped', 'failed'].includes(stage.status) ? stage.status : 'pending';
      const interruptedRunning = status === 'interrupted' && stageStatus === 'running';
      const elapsed = interruptedRunning ? 'Süre bilinmiyor' : duration(stage.startedAt, stage.finishedAt, now, stageStatus);
      const stateLabel = interruptedRunning ? 'İlerlemesi bilinmiyor' : stageStatusText(stageStatus);
      return '<li><span><b>' + esc(labels[stage.id]) + '</b><span class="automation-stage-state">' + esc(stateLabel) + '</span></span><span>' + esc(elapsed) + '</span>' + (stage.message ? '<p>' + esc(stage.message) + '</p>' : '') + '</li>';
    }).join('');
    const interrupted = status === 'interrupted' ? '<p class="muted">Çalışma kesildi; son aşamanın tamamlanma durumu doğrulanamıyor.</p>' : '';
    const errorMessages = { unavailable: 'Otomasyon durumu alınamadı.', validation_failed: 'Rapor doğrulaması tamamlanamadı.', generation_failed: 'Rapor oluşturulamadı.', publication_failed: 'Yayın doğrulanamadı. Son doğrulanmış yayın gösteriliyor.', pipeline_failed: 'Otomasyon tamamlanamadı.', model_access: 'Model erişimi reddedildi.' };
    const failure = status === 'failed' ? '<p class="muted">' + (errorMessages[automation.errorCode] || 'İşlem tamamlanamadı.') + '</p>' : '';
    const lastSuccess = automation.lastSuccessful && automation.lastSuccessful.publishedAt
      ? '<p class="automation-last-success">Son başarılı yayın: ' + esc(timestamp(automation.lastSuccessful.publishedAt)) + (automation.lastSuccessful.runId ? ' · Çalışma ' + esc(automation.lastSuccessful.runId) : '') + '</p>'
      : '<p class="automation-last-success">Başarılı yayın zamanı kayıtlı değil.</p>';
    const publicationSkipped = status === 'completed' && stages.some((stage) => stage && stage.id === 'publication' && stage.status === 'skipped');
    const summary = publicationSkipped ? 'Tamamlandı · Yeni yayın yapılmadı' : status === 'idle' && !stages.length ? 'Henüz kayıt yok' : automationStatusText(status);
    const emptyStages = status === 'idle' ? 'Henüz aşama kaydı yok; sonraki günlük çalışmada görünür.' : 'Aşama bilgisi yok.';
    return '<details class="report-automation"><summary>Günlük otomasyon <span class="automation-summary-state">· ' + esc(summary) + '</span></summary><div><p class="automation-summary">' + esc(summary) + (automation.runId ? ' · Çalışma ' + esc(automation.runId) : '') + '</p>' + currentRun + interrupted + failure + lastSuccess + (stageRows ? '<ol>' + stageRows + '</ol>' : '<p class="muted">' + esc(emptyStages) + '</p>') + '</div></details>';
  }
  function researchStatusMessage(integrity) {
    const status = integrity && integrity.researchStatus;
    if (status === 'previous-analysis') return 'Önceki analiz kesitine dayanıyor. Daha yeni fiyatlar eski analiz sinyallerine uygulanmadı.';
    if (status === 'stale') return 'Araştırma eski; yalnızca doğrulanmış rapor verisi okunabilir. Makro sinyaller kullanılmıyor.';
    if (status === 'context-mismatch') return 'Araştırma başka bir rapor bağlamına ait; bu raporda kullanılmıyor.';
    if (status === 'unverified') return 'Araştırma zamanı veya rapor bağı doğrulanamadı; model içeriği kullanılmıyor.';
    if (status === 'missing') return 'Araştırma bulunmuyor. Makro yön sinyali kullanılmıyor.';
    return '';
  }
  const canUseReportOverlay = (integrity) => !!(integrity && integrity.baseStatus === 'current' && integrity.aiStatus === 'current' && integrity.usableOverlay === true);
  function restoreStrippedResearchMetadata(computed, supplied) {
    const result = Object.assign({}, computed || {});
    if (!supplied || typeof supplied !== 'object') return result;
    const researchStatuses = ['current', 'previous-analysis', 'stale', 'unverified', 'missing', 'context-mismatch'];
    if (researchStatuses.includes(supplied.researchStatus)) result.researchStatus = supplied.researchStatus;
    for (const key of ['pricesAsOf', 'analysisAsOf', 'researchAsOf']) {
      if (typeof supplied[key] === 'string' && supplied[key].trim()) result[key] = supplied[key];
    }
    if (['current', 'previous-analysis', 'stale', 'unverified', 'missing', 'context-mismatch'].includes(supplied.aiStatus)) result.aiStatus = supplied.aiStatus;
    // Deliberately preserve only descriptive metadata; computed usability/action gates stay authoritative.
    return result;
  }
  const link = (url, label) => { try { if (!['https:', 'http:'].includes(new URL(url).protocol)) return esc(label); } catch (_) { return esc(label); }
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + '</a>'; };
  function proseHtml(value) {
    const text = String(value == null ? '' : value);
    let html = '', end = 0;
    // Only explicit inline HTTP links are supported; raw HTML and other Markdown stay text.
    for (const match of text.matchAll(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
      html += esc(text.slice(end, match.index)) + link(match[2], match[1]);
      end = match.index + match[0].length;
    }
    return html + esc(text.slice(end));
  }
  function modelContextHtml(integrity, openWorkspace = false) {
    const value = integrity && integrity.researchAsOf;
    const known = typeof value === 'string' && Number.isFinite(Date.parse(value));
    const time = known ? '<time datetime="' + esc(value) + '">' + esc(timestamp(value)) + '</time>' : esc(timestamp(null));
    const previous = integrity && integrity.researchStatus === 'previous-analysis';
    return '<div class="model-context"><span>Model yorumu · Oluşturuldu: ' + time + '</span>' +
      (previous ? '<span>Sonraki kaynak güncellemeleri bu metne işlenmedi.</span>' : '') +
      (openWorkspace ? '<button class="btn btn-secondary" type="button" data-open-model-workspace>Güncel beklentileri aç</button>' : '') + '</div>';
  }
  function researchHtml(r) {
    if (!r) return '';
    const sources = Array.isArray(r.sources) ? r.sources : [];
    const sourceLinks = (ids) => (ids || []).map((id) => sources.find((s) => s.id === id)).filter(Boolean).map((s) => link(s.url, s.title) + ' (' + esc(timestamp(s.publishedAt)) + ')').join(' · ');
    const coverage = Array.isArray(r.coverage) ? r.coverage : [];
    const events = Array.isArray(r.events) ? r.events : [];
    const scenarios = Array.isArray(r.scenarios) ? r.scenarios : [];
    const unresolved = Array.isArray(r.unresolvedQuestions) ? r.unresolvedQuestions : [];
    return '<section class="card research-card"><div class="card-head"><h2>Model araştırması · Gelişmeler</h2><span class="ai-badge">' + esc(r.model || 'Model görüşü') + '</span></div>' +
      '<p class="muted">Kaynaklı model yorumu · ' + esc(timestamp(r.generatedAt)) + ' · Olasılıklar henüz kalibre edilmedi.</p>' +
      '<div class="research-coverage">' + coverage.map((c) => '<div><b>' + esc(market(c.market)) + ' · ' + esc({ available: 'Kaynak var', partial: 'Kısmi kapsam', insufficient_evidence: 'Kanıt yetersiz' }[c.status] || 'Durum bilinmiyor') + '</b><p>' + esc(c.reason) + '</p></div>').join('') + '</div>' +
      events.map((e) => '<article class="research-event"><p class="research-source">' + esc(market(e.market)) + '</p><h3>' + esc(e.title) + '</h3><p>' + esc(e.whatChanged) + '</p><details><summary>Karşı kanıt ve kaynaklar</summary><p><b>Beklentiden farkı:</b> ' + esc(e.expectationGap) + '</p><p><b>Karşı kanıt:</b> ' + esc(e.counterEvidence) + '</p><p class="research-source">' + sourceLinks(e.sourceIds) + '</p></details></article>').join('') +
      (scenarios.length ? '<h3>Piyasa etkileri · koşullu senaryolar</h3>' + scenarios.map((s) => '<article class="research-event"><b>' + esc(market(s.market) + ' ' + s.symbol + ' · ' + s.horizon) + '</b><p><b>Koşul:</b> ' + esc(s.condition) + '</p><p>' + esc(s.impact) + '</p><p><b>Bozulma koşulu:</b> ' + esc(s.invalidation) + '</p><p class="research-source">' + sourceLinks(s.sourceIds) + '</p></article>').join('') : '') +
      (unresolved.length ? '<h3>Veri eksikleri</h3><ul>' + unresolved.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul>' : '') + '</section>';
  }
  function evaluationHtml(data) {
    const s = data.scorecard || { total: 0, resolved: 0, pending: 0, awaitingOutcome: 0, groups: [] };
    return '<div class="card-head"><h2>Tahminler ne kadar isabetli?</h2><span class="card-sub">Olay açıklanmadan önce kaydedilen tahminler</span></div>' +
      '<p>' + count(s.total) + ' tahmin · ' + count(s.resolved) + ' sonuçlandı · ' + count(s.pending) + ' açıklama bekliyor · ' + count(s.awaitingOutcome) + ' gerçekleşen veri bekliyor</p>' +
      '<p class="muted">MAE: ortalama mutlak hata. Brier: konsensüsün aşılması olasılığının hatası; düşük daha iyi. Konsensüs karşılaştırması aynı sonuç kümesini kullanır. Bu ölçümler fiyat getirisi veya kârlılık değildir.</p>' +
      (!s.total ? '<p>Henüz açıklama öncesi kaydedilmiş tahmin yok. Geçmiş olaylardan yapay başarı üretilmez.</p>' : '') +
      (s.groups.length ? '<div class="research-table"><table><thead><tr><th>Piyasa / ölçüm</th><th>Sonuç</th><th>MAE</th><th>Model / konsensüs MAE</th><th>Brier</th><th>Örneklem</th></tr></thead><tbody>' + s.groups.map((g) => '<tr><td>' + esc(market(g.market) + ' · ' + g.metric + ' (' + g.unit + ')') + '</td><td>' + count(g.resolved) + '/' + count(g.forecasts) + '</td><td>' + num(g.mae) + '</td><td>' + num(g.pairedModelMae) + ' / ' + num(g.consensusMae) + ' (n=' + count(g.pairedCount) + ')</td><td>' + num(g.brier) + ' (n=' + count(g.brierCount) + ')</td><td>' + (g.sampleStatus === 'insufficient_sample' ? 'Yetersiz' : 'Yalnız betimsel') + '</td></tr>').join('') + '</tbody></table></div>' : '') +
      (data.forecasts || []).map((f) => {
        const o = (data.outcomes || []).find((x) => x.forecastId === f.id);
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
      if (el && el.isConnected) el.innerHTML = evaluationHtml(data);
    } catch (_) { if (el && el.isConnected) el.innerHTML = '<h2>Tahmin ölçümü</h2><p>Ölçüm günlüğüne erişilemedi. Başarı oranı gösterilemiyor.</p>'; }
  }
  root.FinansResearch = { researchHtml, evaluationHtml, loadEvaluation, reportTimeLabels, automationHtml, automationStatusSummary, researchStatusMessage, timestamp, canUseReportOverlay, restoreStrippedResearchMetadata, proseHtml, modelContextHtml };
  if (typeof module === 'object' && module.exports) module.exports = root.FinansResearch;
})(typeof globalThis !== 'undefined' ? globalThis : this);
