(function (root) {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('tr-TR', { maximumFractionDigits: 4 }) : '—';
  const count = (v) => Number.isSafeInteger(v) && v >= 0 ? String(v) : '—';
  function outcomeVerificationText(outcome) {
    if (outcome.verification === 'provider-first-observed') return 'Sağlayıcıda ilk gördüğümüz değer; ilk açıklama sürümü garanti edilmez.';
    if (outcome.verification === 'human-reviewed') return 'İnsan tarafından kontrol edildi.';
    if (outcome.verification === 'bls-official-first-release') return outcome.vintage === 'first_release'
      ? 'Resmî BLS ilk açıklama kaydı.' : 'BLS kaynak etiketi var; ilk açıklama sürümü doğrulanamadı.';
    return 'Doğrulama yöntemi kayıtlı değil.';
  }
  const market = (m) => ({ us: 'ABD', bist: 'BIST', crypto: 'Kripto' }[m] || m);
  const timestamp = (value) => { if (typeof value !== 'string' || !value.trim()) return 'Zaman doğrulanamadı · Europe/Istanbul'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Zaman doğrulanamadı · Europe/Istanbul' : new Intl.DateTimeFormat('tr-TR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul', timeZoneName: 'short' }).format(date) + ' · Europe/Istanbul'; };
  const reportTimeLabels = (integrity) => [
    ['Fiyat verisi', integrity && integrity.pricesAsOf],
    ['Analiz kesiti', integrity && integrity.analysisAsOf],
    ['Araştırma', integrity && integrity.researchAsOf],
  ].map(([label, value]) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(timestamp(value)) + '</dd></div>').join('');
  function sourcePublicationText(value) {
    if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Date.parse(value))) return 'Yayın zamanı bilinmiyor';
    return 'Yayın: ' + new Intl.DateTimeFormat('tr-TR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(value));
  }
  function reportIntegrityHtml({ integrity = {}, hasResearch = false, partial = false, loadError = false } = {}) {
    const sameSnapshot = integrity.baseStatus === 'current';
    const message = !hasResearch || integrity.researchStatus !== 'current'
      ? researchStatusMessage(integrity) || 'Bu rapor kesiti için okunabilir araştırma yok; model yorumları gizlendi.'
      : sameSnapshot ? 'Fiyat ve analiz aynı veri kesitine ait.' : 'Puanlar raporun veri kesitine ait; güncel fiyatlarla farklı olabilir.';
    return '<section class="report-integrity" aria-label="Rapor veri durumu"><strong>' +
      (sameSnapshot ? 'Rapor ve fiyat verisi eşleşiyor' : 'Rapor güncel fiyat verisiyle eşleşmiyor') + '</strong>' +
      '<p class="report-integrity-context">' + esc(message) + '</p>' +
      (partial ? '<p class="report-integrity-warning">Veri kapsamı eksik. Kaynak durumlarını Takvim bölümünde kontrol edin.</p>' : '') +
      (loadError ? '<p class="report-load-error" role="status">Rapor yenilenemedi; son başarılı rapor gösteriliyor.</p>' : '') +
      '<details class="report-integrity-details"><summary>Veri zamanları ve eşleşme ayrıntıları</summary>' +
      '<dl class="report-time-labels">' + reportTimeLabels(integrity) + '</dl>' +
      '<p>Fiyat ve analiz farklı zamanlarda üretilebilir; her içerik kendi kesitiyle etiketlenir.</p>' +
      (!sameSnapshot ? '<p>Aşağıdaki puanlar raporun veri kesitine aittir; güncel piyasa tablosundan farklı olabilir.</p>' : '') +
      '</details></section>';
  }
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
    return '<div class="model-context"><span class="model-context-meta">Model yorumu · Oluşturuldu: ' + time + '</span>' +
      (previous ? '<span class="model-context-note">Sonraki kaynak güncellemeleri bu metne işlenmedi.</span>' : '') +
      (openWorkspace ? '<span class="model-context-actions"><button class="btn btn-secondary" type="button" data-open-model-workspace>Güncel beklentileri aç</button></span>' : '') + '</div>';
  }
  const EXPECTATION_LABELS = {
    us_nonfarm_payroll_change: 'Tarım dışı istihdam',
    us_cpi_headline_mom_sa: 'TÜFE · manşet / aylık',
    us_cpi_core_mom_sa: 'TÜFE · çekirdek / aylık',
    us_cpi_headline_yoy_nsa: 'TÜFE · manşet / yıllık',
    us_cpi_core_yoy_nsa: 'TÜFE · çekirdek / yıllık',
  };
  const measurementLabel = (metric) => EXPECTATION_LABELS[metric] || metric || 'Ölçüm belirtilmemiş';
  const unitLabel = (unit) => ({ thousand_jobs: 'bin kişi', percent: '%', 'USD/share': '$ / hisse' }[unit] || unit || 'Birim belirtilmemiş');
  const errorUnitLabel = (unit) => unit === 'percent' ? 'yüzde puan' : unitLabel(unit);
  function expectationValue(value, unit) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Yok';
    return num(value) + ({ thousand_jobs: ' bin kişi', percent: '%', 'USD/share': ' $ / hisse' }[unit] || ' ' + String(unit || ''));
  }
  const exactExpectationTime = (value) => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  const expectationKey = (f) => [f.market, f.metric, f.unit, f.period, Date.parse(f.scheduledAt)].join('|');
  function storedSourceShape(source) {
    if (!source || typeof source.id !== 'string' || !source.id.trim() || typeof source.title !== 'string' || !source.title.trim()
      || typeof source.evidence !== 'string' || !source.evidence.trim() || !['primary', 'secondary'].includes(source.kind)
      || typeof source.url !== 'string') return false;
    let url;
    try { url = new URL(source.url); } catch (_) { return false; }
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }
  function storedDisplayOpinion(f) {
    const cutoff = f.knowledgeCutoff || f.createdAt || f.recordedAt;
    const consensusSource = (f.sourceEvidence || []).find(source => source && source.id === f.consensusSourceId);
    const consensusBacked = storedSourceShape(consensusSource) && exactExpectationTime(consensusSource.publishedAt)
      && Date.parse(consensusSource.publishedAt) <= Date.parse(cutoff);
    // Consensus is independently sourced; invalid comparison evidence must not
    // erase a valid model opinion or borrow evidence from a later report.
    return Number.isFinite(f.consensus) && !consensusBacked
      ? { ...f, consensus: null, consensusSourceId: '', probabilityAboveConsensus: null } : { ...f };
  }
  function storedOpinionBeforeCutoff(f, asOf) {
    if (!f || !Number.isFinite(f.pointEstimate) || !exactExpectationTime(asOf) || !exactExpectationTime(f.scheduledAt)) return false;
    const recorded = f.createdAt || f.recordedAt, cutoff = f.knowledgeCutoff || recorded;
    if (!exactExpectationTime(recorded) || !exactExpectationTime(cutoff)
      || Date.parse(cutoff) > Date.parse(recorded) || Date.parse(recorded) >= Date.parse(f.scheduledAt)
      || Date.parse(recorded) > Date.parse(asOf)
      || ['createdAt', 'recordedAt', 'knowledgeCutoff'].some(key => f[key] != null && (!exactExpectationTime(f[key])
        || Date.parse(f[key]) > Date.parse(asOf) || Date.parse(f[key]) >= Date.parse(f.scheduledAt)))
      || (f.createdAt && f.recordedAt && Date.parse(f.createdAt) > Date.parse(f.recordedAt))) return false;
    const evidence = Array.isArray(f.sourceEvidence) ? f.sourceEvidence : [];
    const ids = Array.isArray(f.sourceIds) ? f.sourceIds : [];
    if (!ids.length || new Set(ids).size !== ids.length || new Set(evidence.map(source => source && source.id)).size !== evidence.length) return false;
    const byId = new Map(evidence.filter(Boolean).map(source => [source.id, source]));
    let datedEvidence = false;
    const scheduleMetric = f.metric === 'us_nonfarm_payroll_change' ? 'empsit' : /^us_cpi_/.test(f.metric || '') ? 'cpi' : null;
    return ids.every(id => {
      const source = byId.get(id);
      if (!storedSourceShape(source)) return false;
      if (exactExpectationTime(source.publishedAt) && Date.parse(source.publishedAt) <= Date.parse(cutoff)) {
        datedEvidence = true; return true;
      }
      // An untimed official calendar can prove timing, never the number itself.
      if (source.publishedAt !== null || source.kind !== 'primary' || !scheduleMetric) return false;
      if (source.url === 'https://www.bls.gov/schedule/news_release/' + scheduleMetric + '.htm') return true;
      const month = new Date(f.scheduledAt).toISOString().slice(0, 7).replace('-', '/');
      return source.url === 'https://www.bls.gov/schedule/' + month + '_sched.htm';
    }) && datedEvidence;
  }
  function storedExpectations(macro, asOf) {
    if (!macro || !exactExpectationTime(asOf)) return [];
    const sources = [macro, macro.families && macro.families.us_cpi].filter(Boolean);
    const items = sources.flatMap((family) => (family.modelForecasts || []).concat(family.modelForecastReviews || []));
    const eligible = items.filter(f => storedOpinionBeforeCutoff(f, asOf))
      .sort((a, b) => Date.parse(a.createdAt || a.recordedAt) - Date.parse(b.createdAt || b.recordedAt));
    const groups = new Map();
    eligible.forEach((f) => {
      const key = expectationKey(f), previous = groups.get(key);
      groups.set(key, { ...storedDisplayOpinion(f), retained: true, originalPointEstimate: previous ? previous.originalPointEstimate : f.pointEstimate });
    });
    return Array.from(groups.values());
  }
  function expectationsHtml(research, { compact = false, now = new Date().toISOString(), storedOpinions = [] } = {}) {
    const r = research || {};
    const cutoff = exactExpectationTime(r.generatedAt) ? Date.parse(r.generatedAt) : NaN;
    const nowMs = Date.parse(now);
    const sourceMap = new Map((r.sources || []).map((source) => [source.id, source]));
    // Render only views recorded before release. A post-release number is never a forecast.
    const beforeRelease = (f) => Number.isFinite(cutoff) && exactExpectationTime(f.scheduledAt) && Date.parse(f.scheduledAt) > cutoff
      && ['createdAt', 'recordedAt'].every((key) => !f[key] || exactExpectationTime(f[key]) && Date.parse(f[key]) <= cutoff);
    const forecasts = (r.forecasts || []).filter((f) => Number.isFinite(f.pointEstimate) && beforeRelease(f));
    const analysisCutoff = exactExpectationTime(r.analysisAsOf) ? Date.parse(r.analysisAsOf) : cutoff;
    const historicalContext = (f) => Number.isFinite(analysisCutoff) && Number.isFinite(cutoff) && analysisCutoff <= cutoff && exactExpectationTime(f.scheduledAt) && Date.parse(f.scheduledAt) > analysisCutoff;
    const abstentions = (r.forecastAbstentions || []).filter(historicalContext);
    const reassessments = (Array.isArray(r.expectationReassessments) ? r.expectationReassessments : []).filter((item) => historicalContext(item) && ['unchanged', 'updated', 'abstained'].includes(item.status));
    const known = new Set(forecasts.concat(abstentions).map(expectationKey));
    storedOpinions.forEach((f) => {
      if (storedOpinionBeforeCutoff(f, r.generatedAt) && !known.has(expectationKey(f))) { forecasts.push({ ...storedDisplayOpinion(f), retained: true }); known.add(expectationKey(f)); }
    });
    const ordered = forecasts.map((f) => ({ ...f, available: true })).concat(abstentions.map((f) => ({ ...f, available: false })))
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt) || String(a.metric).localeCompare(String(b.metric)));
    const sameDay = (date) => Number.isFinite(Date.parse(date)) && Number.isFinite(nowMs) && new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(date)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date(nowMs));
    const rows = compact ? ordered.filter((f) => Date.parse(f.scheduledAt) > nowMs || sameDay(f.scheduledAt)).slice(0, 2) : ordered;
    const calendarNotes = (Array.isArray(r.expectationCoverage) ? r.expectationCoverage : []).filter((item) => item && item.scope === 'independent_calendar' && ['unavailable', 'no_upcoming_release', 'schedule_conflict'].includes(item.status));
    const coverageHtml = calendarNotes.length ? '<div class="expectation-coverage" role="status">' + calendarNotes.map((item) => '<p><b>' + esc(item.family === 'us_cpi' ? 'TÜFE takvimi' : item.family === 'us_nonfarm_payroll_change' ? 'İstihdam takvimi' : 'Veri takvimi') + ':</b> ' + esc(item.reason) + ' <small>Kontrol: ' + esc(timestamp(item.checkedAt)) + '</small></p>').join('') + '</div>' : '';
    const rowHtml = (f) => {
      const passed = Number.isFinite(nowMs) && Date.parse(f.scheduledAt) <= nowMs;
      const name = EXPECTATION_LABELS[f.metric] || [market(f.market), f.symbol, f.metric].filter(Boolean).join(' · ');
      const consensusKnown = typeof f.consensus === 'number' && Number.isFinite(f.consensus);
      const difference = consensusKnown ? f.pointEstimate - f.consensus : null;
      const differenceText = difference == null ? 'Konsensüs yok' : (difference > 0 ? '+' : '') + (f.unit === 'percent' ? num(difference) + ' yüzde puan' : expectationValue(difference, f.unit));
      const rowSources = f.retained ? new Map((f.sourceEvidence || []).map((source) => [source.id, source])) : sourceMap;
      const consensusSource = rowSources.get(f.consensusSourceId);
      const sources = (f.sourceIds || []).map((id) => rowSources.get(id)).filter(Boolean).map((s) => link(s.url, s.title)).join(' · ');
      const review = reassessments.find((item) => expectationKey(item) === expectationKey(f));
      const reviewSources = review ? (review.sourceIds || []).map((id) => sourceMap.get(id)).filter(Boolean).map((s) => link(s.url, s.title)).join(' · ') : '';
      const reviewLabel = review && { unchanged: 'Kayıtlı görüş yeniden incelendi ve korundu', updated: 'Model görüşü yeniden incelendi ve güncellendi', abstained: 'Yeni sayısal görüş üretmekten kaçınıldı' }[review.status];
      return '<article class="expectation-entry' + (!f.available ? ' expectation-abstention' : '') + '">' +
        '<div class="expectation-event"><h3>' + esc(name) + '</h3><span>' + esc(f.period) + ' dönemi · ' + esc(timestamp(f.scheduledAt)) + '</span>' +
        (f.retained ? '<span>Kayıtlı görüş · ' + esc(timestamp(f.knowledgeCutoff || f.recordedAt)) + (f.originalPointEstimate !== f.pointEstimate ? ' · İlk kilitli tahmin: ' + esc(expectationValue(f.originalPointEstimate, f.unit)) : ' · İlk kilitli tahmin') + '</span>' : '') +
        (review ? '<span class="expectation-review">' + esc(reviewLabel) + ' · ' + esc(timestamp(r.generatedAt)) + '</span>' : '') +
        (passed ? '<span class="expectation-passed">Açıklama saati geçti · bu satır raporun eski görüşüdür.</span>' : '') + '</div>' +
        (f.available ? '<dl class="expectation-numbers"><div><dt>Model görüşü</dt><dd>' + esc(expectationValue(f.pointEstimate, f.unit)) + '</dd></div><div><dt>Piyasa konsensüsü</dt><dd>' + esc(expectationValue(f.consensus, f.unit)) + '</dd></div><div><dt>Konsensüsten farkı</dt><dd>' + esc(differenceText) + '</dd></div></dl>' : '<p class="expectation-missing"><b>Tahmin üretilemedi.</b> ' + esc(f.reason) + '</p>') +
        '<details class="expectation-reason"><summary>' + (f.available ? 'Gerekçe ve kaynaklar' : 'Eksik kanıt') + '</summary>' +
        (f.available ? '<p>' + esc(f.rationale) + '</p>' : '<ul>' + (f.missingEvidence || []).map((item) => '<li>' + esc(item) + '</li>').join('') + '</ul>') +
        (review ? '<p><b>Yeniden değerlendirme:</b> ' + esc(review.reason) + '</p>' + (reviewSources ? '<p class="research-source">Değerlendirme kaynakları: ' + reviewSources + '</p>' : '') : '') +
        (consensusKnown ? '<p class="research-source">Konsensüs kaynağı: ' + (consensusSource ? link(consensusSource.url, consensusSource.title) : 'Bu kesitte kaynak kaydı yok') + '</p>' : '') +
        (sources ? '<p class="research-source">' + sources + '</p>' : '') + '</details></article>';
    };
    return '<section class="expectation-ledger' + (compact ? ' is-compact' : '') + '" aria-label="Raporun model veri beklentileri"><header class="expectation-head"><div><h2>Veri açıklanmadan önce</h2><p>' + (Number.isFinite(cutoff) ? 'Rapor görüşü · ' + esc(timestamp(r.generatedAt)) : 'Kaynaklı model raporu bekleniyor') + '</p></div>' +
      (compact ? '<button class="expectation-workspace-link" type="button" data-open-expectation-report>Raporu oku <span aria-hidden="true">→</span></button>' : '<span class="ai-badge">Model beklentileri</span>') + '</header>' +
      (rows.length ? rows.map(rowHtml).join('') : '<p class="expectation-empty">' + (compact && ordered.length ? 'Rapor kesitindeki açıklamaların zamanı geçti. Kayıtlı görüşleri tüm beklentiler bölümünde inceleyin.' : 'Bu raporda açıklama öncesi sayısal model görüşü yok. Kayıtlı ilk tahminleri tüm beklentiler bölümünde inceleyin.') + '</p>') + coverageHtml +
      (!compact && rows.length ? '<p class="expectation-footnote">Bu değerler raporun bilgi kesitine kadar kaydedilmiş model görüşleridir. Güncel görüş ve ilk kilitli tahmin ayrı tutulur; performans ilk tahmine göre ölçülür.</p><button class="btn btn-secondary" type="button" data-open-model-workspace>İlk tahmini ve güncel görüşü karşılaştır</button>' : '') + '</section>';
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
      '<p class="muted">' + (r.sourceVerification === 'model-cited-web-research'
        ? 'Kaynaklar model tarafından seçildi. Piyasa etkileri model görüşüdür; kaynak atfı bağımsız içerik doğrulaması anlamına gelmez.'
        : r.sourceVerification === 'synthetic-acceptance-only' ? 'Sentetik kabul içeriği; gerçek araştırma değildir.' : 'Kaynak doğrulama yöntemi kayıtlı değil.') + '</p>' +
      '<div class="research-coverage">' + coverage.map((c) => '<div><b>' + esc(market(c.market)) + ' · ' + esc({ available: 'Kaynak var', partial: 'Kısmi kapsam', insufficient_evidence: 'Kanıt yetersiz' }[c.status] || 'Durum bilinmiyor') + '</b><p>' + esc(c.reason) + '</p></div>').join('') + '</div>' +
      events.map((e) => '<article class="research-event"><p class="research-source">' + esc(market(e.market)) + '</p><h3>' + esc(e.title) + '</h3><p>' + esc(e.whatChanged) + '</p><details><summary>Karşı kanıt ve kaynaklar</summary><p><b>Beklentiden farkı:</b> ' + esc(e.expectationGap) + '</p><p><b>Karşı kanıt:</b> ' + esc(e.counterEvidence) + '</p><p class="research-source">' + sourceLinks(e.sourceIds) + '</p></details></article>').join('') +
      (scenarios.length ? '<h3>Piyasa etkileri · koşullu senaryolar</h3>' + scenarios.map((s) => '<article class="research-event"><b>' + esc(market(s.market) + ' ' + s.symbol + ' · ' + s.horizon) + '</b><p><b>Koşul:</b> ' + esc(s.condition) + '</p><p>' + esc(s.impact) + '</p><p><b>Bozulma koşulu:</b> ' + esc(s.invalidation) + '</p><p class="research-source">' + sourceLinks(s.sourceIds) + '</p></article>').join('') : '') +
      (unresolved.length ? '<h3>Veri eksikleri</h3><ul>' + unresolved.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul>' : '') + '</section>';
  }
  function evaluationHtml(data) {
    const s = data && data.scorecard || {};
    const recordsKnown = Array.isArray(data && data.forecasts);
    const forecasts = recordsKnown ? data.forecasts : [];
    const outcomes = Array.isArray(data && data.outcomes) ? data.outcomes : [];
    const groups = Array.isArray(s.groups) ? s.groups : [];
    const measurementKnown = Number.isSafeInteger(s.total) && s.total >= 0;
    return '<div class="card-head"><h2>Tahminler ne kadar isabetli?</h2><span class="card-sub">Olay açıklanmadan önce kaydedilen tahminler</span></div>' +
      '<p>' + (recordsKnown ? count(forecasts.length) + ' tahmin kaydı gösteriliyor.' : 'Gösterilen kayıt sayısı bilinmiyor.') + '</p>' +
      '<p>' + (measurementKnown ? 'Ölçüm kapsamı: ' + count(s.total) + ' tahmin · ' + count(s.resolved) + ' sonuçlandı · ' + count(s.pending) + ' açıklama bekliyor · ' + count(s.awaitingOutcome) + ' gerçekleşen veri bekliyor'
        : 'Ölçüm kapsamı: Veri yok. Gösterilen kayıtlardan örneklem veya başarı sonucu çıkarılamaz.') + '</p>' +
      '<p class="muted">MAE: ortalama mutlak hata. Brier: konsensüsün aşılması olasılığının hatası; düşük daha iyi. Konsensüs karşılaştırması aynı sonuç kümesini kullanır. Bu ölçümler fiyat getirisi veya kârlılık değildir.</p>' +
      (s.total === 0 && recordsKnown && !forecasts.length ? '<p>Henüz açıklama öncesi kaydedilmiş tahmin yok. Geçmiş olaylardan yapay başarı üretilmez.</p>' : '') +
      (groups.length ? '<div class="research-table"><table><thead><tr><th>Piyasa / ölçüm</th><th>Sonuçlanan / toplam</th><th>MAE</th><th>Model / konsensüs MAE</th><th>Brier</th><th>Örneklem</th></tr></thead><tbody>' + groups.map((g) => '<tr><td>' + esc(market(g.market) + ' · ' + measurementLabel(g.metric) + ' (' + errorUnitLabel(g.unit) + ')') + '</td><td>' + count(g.resolved) + '/' + count(g.forecasts) + '</td><td>' + num(g.mae) + '</td><td>' + num(g.pairedModelMae) + ' / ' + num(g.consensusMae) + ' (n=' + count(g.pairedCount) + ')</td><td>' + num(g.brier) + ' (n=' + count(g.brierCount) + ')</td><td>' + (g.sampleStatus === 'insufficient_sample' ? 'Yetersiz' : 'Yalnız betimsel') + '</td></tr>').join('') + '</tbody></table></div>' : '') +
      forecasts.map((f) => {
        const o = outcomes.find((x) => x.forecastId === f.id);
        const probability = Number.isFinite(f.probabilityAboveConsensus) && f.probabilityAboveConsensus >= 0 && f.probabilityAboveConsensus <= 1
          ? num(f.probabilityAboveConsensus * 100) + '% (öznel)' : '—';
        return '<details class="research-event"><summary>' + esc(market(f.market) + (f.symbol ? ' ' + f.symbol : '') + ' · ' + measurementLabel(f.metric) + ' · ' + f.period) + ' — ' + (o ? 'Sonuçlandı' : 'Bekliyor') + '</summary><p>Tahmin: ' + num(f.pointEstimate) + ' ' + esc(unitLabel(f.unit)) + ' · Konsensüs: ' + num(f.consensus) + ' ' + esc(unitLabel(f.unit)) + ' · Konsensüsün üzerinde gerçekleşme olasılığı: ' + probability + '</p><p>Kayıt: ' + esc(timestamp(f.recordedAt)) + ' · Açıklama: ' + esc(timestamp(f.scheduledAt)) + '</p><p>' + esc(f.rationale) + '</p>' +
          (o ? '<p>Gerçekleşen: ' + num(o.value) + ' ' + esc(unitLabel(f.unit)) + ' · ' + link(o.sourceUrl, 'Sonuç kaynağı') + ' · ' + outcomeVerificationText(o) + '</p>' : '<p>' + link(f.resolution.sourceUrl, 'Gerçekleşenin izleneceği kaynak') + '</p>') +
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
  root.FinansResearch = { researchHtml, expectationsHtml, storedExpectations, evaluationHtml, loadEvaluation, reportTimeLabels, reportIntegrityHtml, sourcePublicationText, automationHtml, automationStatusSummary, researchStatusMessage, timestamp, canUseReportOverlay, restoreStrippedResearchMetadata, proseHtml, modelContextHtml };
  if (typeof module === 'object' && module.exports) module.exports = root.FinansResearch;
})(typeof globalThis !== 'undefined' ? globalThis : this);
