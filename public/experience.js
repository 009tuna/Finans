// Small, truthful interaction helpers. No financial model or stored evidence is changed here.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansExperience = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const exactTime = (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  const num = (value, digits = 2) => finite(value) ? value.toLocaleString('tr-TR', { maximumFractionDigits: digits }) : 'Doğrulanamadı';
  function dateLabel(value, compact = false) {
    if (!exactTime(value)) return 'Zaman doğrulanamadı';
    return new Intl.DateTimeFormat('tr-TR', compact
      ? { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short' }
      : { timeZone: 'Europe/Istanbul', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }

  const HELP = {
    rsi: {
      title: 'RSI ne anlatır?', guide: 'rsi',
      measures: 'Son fiyat değişimlerinin göreli gücünü 0–100 arasında ölçer.',
      limits: '30 altı veya 70 üstü değer, fiyatın döneceğini garanti etmez. Güçlü trend bu bölgelerde sürebilir.',
      example: 'Örnek: RSI 28, yaygın aşırı satım eşiğinin altındadır. Trend, hacim ve fiyat zamanı ayrıca incelenir.'
    },
    consensus: {
      title: 'Konsensüs farkı ne anlatır?', guide: 'consensus',
      measures: 'Aynı ölçüm, dönem ve birimde model görüşünün kaydedilmiş piyasa beklentisinden farkını gösterir.',
      limits: 'Fiyatın hangi yönde gideceğini söylemez. Konsensüs kaynağı doğrulanamadığında fark hesaplanamaz.',
      example: 'Örnek: Model %0,3, konsensüs %0,2 ise fark +0,1 yüzde puandır; gerçekleşen sonuç ayrıca beklenir.'
    },
    control: {
      title: 'Kontrol puanı neyi ölçer?', guide: 'control',
      measures: 'Mevcut fiyat zamanını, sinyal kararlılığını ve gösterge çelişkilerini birlikte kontrol eder.',
      limits: 'Kazanç olasılığı veya araştırmanın tamamlandığı anlamına gelmez. Yüksek puanla birlikte gecikmeli fiyat uyarısı bulunabilir.',
      example: 'Örnek: 90/100 kontrol puanı varken fiyat gecikmeli olabilir. Araştırma hazırlığı ve tez notu ayrı işlerdir.'
    }
  };
  function contextHelpHtml(topic, options = {}) {
    const help = HELP[topic];
    if (!help) return '';
    const observed = finite(options.value) ? '<p class="muted-note">Bu kayıttaki değer: ' + esc(num(options.value)) + (topic === 'control' ? '/100' : '') + '.</p>' : '';
    return '<details class="context-help"><summary>' + esc(help.title) + '</summary><div class="context-help-content">' + observed +
      '<dl><div><dt>Neyi ölçer?</dt><dd>' + esc(help.measures) + '</dd></div><div><dt>Neyi söylemez?</dt><dd>' + esc(help.limits) +
      '</dd></div><div><dt>Örnek üzerinde düşün</dt><dd>' + esc(help.example) + '</dd></div></dl>' +
      '<button type="button" class="btn small" data-learning-topic="' + esc(help.guide) + '">Rehberde incele</button></div></details>';
  }

  function historyTraceHtml(points, options = {}) {
    if (!Array.isArray(points)) return '';
    const cutoff = options.asOf == null ? Infinity : exactTime(options.asOf) ? Date.parse(options.asOf) : NaN;
    if (Number.isNaN(cutoff)) return '';
    const byTime = new Map();
    points.forEach((point) => {
      if (!point || !exactTime(point.at) || !finite(point.score) || point.score < 0 || point.score > 100) return;
      const at = Date.parse(point.at);
      if (at > cutoff) return;
      const existing = byTime.get(at);
      // A conflicting score at one timestamp cannot supply either end of a trace.
      if (existing && existing.score !== point.score) byTime.set(at, { conflict: true });
      else if (!existing) byTime.set(at, { at: point.at, time: at, score: point.score });
    });
    const valid = Array.from(byTime.values()).filter((point) => !point.conflict).sort((a, b) => a.time - b.time);
    const rows = valid.slice(-30);
    if (rows.length < 2) return '';
    const first = rows[0], last = rows[rows.length - 1], width = 140, height = 40, margin = 3;
    const coordinates = rows.map((point) => {
      const x = margin + (point.time - first.time) / (last.time - first.time) * (width - margin * 2);
      const y = height - margin - (point.score / 100) * (height - margin * 2);
      return [x.toFixed(2), y.toFixed(2)];
    });
    const label = options.label || 'Teknik puan geçmişi';
    const caption = dateLabel(first.at, true) + ' → ' + dateLabel(last.at, true) + ' · ' + num(first.score) + ' → ' + num(last.score) + '/100';
    const description = label + ': ' + rows.length + ' kayıt, ' + caption + '. Dikey ölçek 0–100. Kayıt zamanları Türkiye saatindedir.';
    const chart = '<svg viewBox="0 0 ' + width + ' ' + height + '" width="140" height="40" role="img" aria-label="' + esc(description) + '">' +
      '<title>' + esc(label) + '</title><desc>' + esc(description) + '</desc><path d="M3 37 H137" fill="none" stroke="currentColor" opacity="0.2"/>' +
      '<polyline points="' + coordinates.map((point) => point.join(',')).join(' ') + '" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle cx="' + coordinates.at(-1)[0] + '" cy="' + coordinates.at(-1)[1] + '" r="2" fill="currentColor"/></svg>';
    if (options.compact) return '<span class="technical-trace technical-trace-compact">' + chart + '<span class="trace-caption">' + esc(caption) + '</span></span>';
    return '<figure class="technical-trace">' + chart + '<figcaption>' + esc(caption) + '</figcaption><details class="trace-data"><summary>' + (valid.length > rows.length ? 'Son 30 kaydedilen puan' : 'Kaydedilen puanlar') + '</summary>' +
      '<table><caption>' + esc(label) + ' · Türkiye saati</caption><thead><tr><th scope="col">Kayıt zamanı</th><th scope="col">Puan /100</th></tr></thead><tbody>' +
      rows.map((point) => '<tr><td><time datetime="' + esc(point.at) + '">' + esc(dateLabel(point.at)) + '</time></td><td>' + esc(num(point.score)) + '</td></tr>').join('') +
      '</tbody></table></details></figure>';
  }

  const MEASURE_LABELS = {
    us_nonfarm_payroll_change: 'ABD tarım dışı istihdam', us_cpi_headline_mom: 'ABD TÜFE · aylık', us_cpi_headline_yoy: 'ABD TÜFE · yıllık',
    us_cpi_core_mom: 'ABD çekirdek TÜFE · aylık', us_cpi_core_yoy: 'ABD çekirdek TÜFE · yıllık',
    us_cpi_headline_mom_sa: 'ABD TÜFE · manşet / aylık · mevsim etkisinden arındırılmış',
    us_cpi_core_mom_sa: 'ABD TÜFE · çekirdek / aylık · mevsim etkisinden arındırılmış',
    us_cpi_headline_yoy_nsa: 'ABD TÜFE · manşet / yıllık · mevsim etkisinden arındırılmamış',
    us_cpi_core_yoy_nsa: 'ABD TÜFE · çekirdek / yıllık · mevsim etkisinden arındırılmamış',
    tr_cpi_mom: 'Türkiye TÜFE · aylık', tr_cpi_yoy: 'Türkiye TÜFE · yıllık',
    tr_cpi_headline_mom: 'Türkiye TÜFE · manşet / aylık', tr_cpi_headline_yoy: 'Türkiye TÜFE · manşet / yıllık',
    tr_ppi_mom: 'Türkiye üretici fiyatları · aylık', tr_ppi_yoy: 'Türkiye üretici fiyatları · yıllık',
    tr_policy_rate: 'TCMB politika faizi', tcmb_policy_rate: 'TCMB politika faizi'
  };
  function buildDailyBrief(input = {}) {
    const snapshot = input.snapshot || {}, digest = input.digest, cockpit = input.cockpit, research = input.research || {};
    const now = input.now || new Date().toISOString(), nowMs = exactTime(now) ? Date.parse(now) : NaN;
    const change = digest && finite(digest.comparisonCount) && digest.comparisonCount > 0 && typeof digest.headline === 'string'
      ? digest.headline + ' Karşılaştırma: ' + digest.comparisonCount + '/' + (finite(digest.totalCount) ? digest.totalCount : digest.comparisonCount) + ' varlık.'
      : 'Karşılaştırılabilir önceki teknik kayıt doğrulanamadı; değişim ölçülemedi.';
    const lines = [{ label: 'Bugün değişen', text: change }];
    const calendars = [snapshot.macro, research.independent && research.independent.macro].filter(Boolean);
    const scheduled = [];
    calendars.forEach((calendar) => {
      [calendar].concat(Object.values(calendar.families || {})).forEach((family) => {
        if (!family || ['unavailable', 'failed', 'error', 'stale'].includes(family.status) || ['unavailable', 'failed', 'error', 'stale'].includes(family.sourceStatus && family.sourceStatus.status)) return;
        if (family.nextEvent) scheduled.push(family.nextEvent);
      });
    });
    scheduled.push(...(Array.isArray(input.events) ? input.events : []), ...(Array.isArray(research.forecasts) ? research.forecasts : []), ...(Array.isArray(research.forecastAbstentions) ? research.forecastAbstentions : []));
    const next = scheduled.filter((event) => event && exactTime(event.scheduledAt) && Date.parse(event.scheduledAt) > nowMs && !event.scheduleConflict && !['unavailable', 'schedule_conflict', 'failed', 'error', 'stale'].includes(event.status) && (event.metric || event.title))
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
    const title = next && typeof next.title === 'string' && next.title.trim() && !/^[a-z0-9]+(?:_[a-z0-9]+)+$/i.test(next.title.trim()) ? next.title.trim() : null;
    lines.push(next ? { label: 'Sıradaki açıklama', text: (MEASURE_LABELS[next.metric] || title || 'Ölçüm açıklaması') + (next.period ? ' · ' + next.period + ' dönemi' : '') + ' · ' + dateLabel(next.scheduledAt) + ' (Türkiye saati).', scheduledAt: next.scheduledAt }
      : { label: 'Sıradaki açıklama', text: 'Gelecek açıklama zamanı bu kayıtta doğrulanamadı.' });
    const rows = cockpit && Array.isArray(cockpit.rows) ? cockpit.rows : [];
    const task = rows.find((row) => row && ((Array.isArray(row.evidenceGaps) && row.evidenceGaps.length) || (Array.isArray(row.missingEvidence) && row.missingEvidence.length)) && row.market && row.symbol);
    lines.push(task ? { label: 'Açık kontrol', text: task.symbol + ' · ' + ((task.task && task.task.label) || task.nextAction || (task.evidenceGaps || task.missingEvidence)[0]), market: task.market, symbol: task.symbol, task: task.task || null }
      : { label: 'Açık kontrol', text: cockpit && Array.isArray(cockpit.rows) ? 'Aday listesinde kayıtlı eksik iş görünmüyor; kapsamı aday ayrıntısında kontrol edin.' : 'Adayların eksik işleri henüz hesaplanmadı.' });
    return { lines: lines.slice(0, 3), generatedAt: exactTime(snapshot.generatedAt) ? snapshot.generatedAt : null };
  }
  function dailyBriefHtml(brief) {
    const lines = brief && Array.isArray(brief.lines) ? brief.lines.slice(0, 3) : [];
    if (!lines.length) return '';
    return '<section class="daily-work-brief" aria-label="Bugünün çalışma özeti"><h3>Bugünün çalışma özeti</h3><dl>' +
      lines.map((line) => '<div><dt>' + esc(line.label) + '</dt><dd>' + esc(line.text) +
        (line.market && line.symbol ? ' <button type="button" class="btn small" data-brief-market="' + esc(line.market) + '" data-brief-symbol="' + esc(line.symbol) + '">İlgili işi aç</button>' : '') + '</dd></div>').join('') + '</dl></section>';
  }

  function canonical(value, seen = new Set()) {
    if (value == null) return 'null';
    if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : JSON.stringify(String(value));
    if (typeof value !== 'object' || seen.has(value)) throw new Error('Revision data must be serializable');
    seen.add(value);
    const result = Array.isArray(value) ? '[' + value.map((item) => canonical(item, seen)).join(',') + ']'
      : '{' + Object.keys(value).sort().filter((key) => typeof value[key] !== 'undefined').map((key) => JSON.stringify(key) + ':' + canonical(value[key], seen)).join(',') + '}';
    seen.delete(value);
    return result;
  }
  function revisionKey(value) {
    if (value == null) return null;
    let serialized;
    try { serialized = canonical(value); } catch (_) { return null; }
    let first = 2166136261, second = 5381;
    for (let index = 0; index < serialized.length; index++) {
      first = Math.imul(first ^ serialized.charCodeAt(index), 16777619);
      second = Math.imul(second, 33) ^ serialized.charCodeAt(index);
    }
    return 'v1-' + (first >>> 0).toString(36) + '-' + (second >>> 0).toString(36) + '-' + serialized.length;
  }
  const identifier = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 512;
  const sectionId = (value) => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_:-]{0,127}$/.test(value);
  function createProgressStore(storage, options = {}) {
    const key = options.key || 'finans-experience-v1';
    const clock = options.now || (() => new Date().toISOString());
    let memory = { resumes: {}, reviews: {} }, persistent = !!storage, memoryOnly = false;
    function read() {
      if (storage && !memoryOnly) {
        try {
          const saved = JSON.parse(storage.getItem(key) || 'null');
          if (saved && typeof saved === 'object' && saved.version === 1) {
            memory = { resumes: saved.resumes && typeof saved.resumes === 'object' ? saved.resumes : {}, reviews: saved.reviews && typeof saved.reviews === 'object' ? saved.reviews : {} };
          } else memory = { resumes: {}, reviews: {} };
        } catch (_) { persistent = false; memoryOnly = true; }
      }
      return memory;
    }
    function write() {
      for (const field of ['resumes', 'reviews']) {
        const entries = Object.entries(memory[field]).sort((a, b) => String(b[1].at || '').localeCompare(String(a[1].at || ''))).slice(0, 80);
        memory[field] = Object.fromEntries(entries);
      }
      if (storage) {
        try { storage.setItem(key, JSON.stringify({ version: 1, ...memory })); persistent = true; }
        catch (_) { persistent = false; memoryOnly = true; }
      }
      return persistent;
    }
    const recordKey = (value) => '$' + value;
    return {
      saveResume(reportId, revision, section, label) {
        if (!identifier(reportId) || !identifier(revision) || !sectionId(section)) return null;
        read();
        const record = { reportId, revision, section, label: typeof label === 'string' ? label.slice(0, 200) : section, at: clock() };
        memory.resumes[recordKey(reportId)] = record;
        return { ...record, persistent: write() };
      },
      getResume(reportId, revision) {
        if (!identifier(reportId) || !identifier(revision)) return null;
        const record = read().resumes[recordKey(reportId)];
        return record && record.reportId === reportId && record.revision === revision && sectionId(record.section) && typeof record.label === 'string' && exactTime(record.at) ? { ...record, persistent } : null;
      },
      setReviewed(assetKey, revision, reviewed) {
        if (!identifier(assetKey) || !identifier(revision) || typeof reviewed !== 'boolean') return null;
        read();
        const record = { assetKey, revision, reviewed, at: clock() };
        memory.reviews[recordKey(assetKey)] = record;
        return { ...record, persistent: write() };
      },
      getReview(assetKey, revision) {
        if (!identifier(assetKey) || !identifier(revision)) return { reviewed: false, changed: false, persistent };
        const record = read().reviews[recordKey(assetKey)];
        if (!record || record.assetKey !== assetKey || typeof record.reviewed !== 'boolean' || !exactTime(record.at)) return { reviewed: false, changed: false, persistent };
        return { reviewed: record.revision === revision && record.reviewed, changed: record.revision !== revision, at: record.at, persistent };
      },
      clearResume(reportId) {
        read(); delete memory.resumes[recordKey(reportId)]; return write();
      }
    };
  }
  function reviewHtml(assetKey, revision, status = false) {
    if (!identifier(assetKey) || !identifier(revision)) return '';
    const reviewed = typeof status === 'object' ? status.reviewed === true : status === true;
    const changed = typeof status === 'object' && status.changed;
    return '<div class="review-progress"><label class="review-control"><input type="checkbox" data-review-asset="' + esc(assetKey) + '" data-review-revision="' + esc(revision) + '"' + (reviewed ? ' checked' : '') +
      '><span>Bu veri kesitini inceledim</span></label><p class="muted-note" role="status" aria-live="polite" data-review-status>' + (changed ? 'Veri kesiti değişti; önceki inceleme bu kayıt için tamamlanmış sayılmadı.' : reviewed ? 'İnceleme tercihiniz kaydedildi. Bu işaret, tez veya kaynak kontrolünü tamamlamaz.' : 'İsteğe bağlı yerel inceleme işareti. Tez, kaynak veya işlem kaydı oluşturmaz.') + '</p></div>';
  }
  function resumeHtml(record) {
    if (!record || !sectionId(record.section) || typeof record.label !== 'string') return '';
    return '<p class="reading-resume"><span>' + (record.persistent === false ? 'Bu oturumda seçilen bölüm: ' : 'Son seçtiğiniz bölüm: ') + esc(record.label) + '</span> <button type="button" class="btn small" data-resume-section="' + esc(record.section) + '">Buradan devam et</button></p>';
  }

  function positionComparisonHtml(input, calculatePosition, options = {}) {
    if (!input || typeof calculatePosition !== 'function') return '';
    const mode = options.mode === 'atr' ? 'atr' : 'risk';
    const alternative = { ...input };
    if (mode === 'risk') alternative.riskPct = options.alternativeRiskPct == null ? input.riskPct / 2 : options.alternativeRiskPct;
    else alternative.atr = input.atr * 2;
    const base = calculatePosition(input.capital, input.riskPct, input.price, input.atr);
    const other = calculatePosition(alternative.capital, alternative.riskPct, alternative.price, alternative.atr);
    const currency = typeof input.currency === 'string' && input.currency.trim() ? input.currency.trim() : 'aynı para birimi';
    const amount = (value) => num(value, finite(value) && value !== 0 ? Math.min(12, Math.max(2, Math.ceil(-Math.log10(Math.abs(value))) + 2)) : 2) + ' ' + currency;
    const result = (label, assumptions, value) => '<div class="position-assumption"><h4>' + label + '</h4><p>Risk bütçesi %' + esc(num(assumptions.riskPct, 4)) + ' · ATR ' + esc(amount(assumptions.atr)) + '</p>' +
      (value && value.available ? '<dl><div><dt>Adet</dt><dd>' + esc(num(value.units, value.constraints && value.constraints.quantityDecimals || 0)) + '</dd></div>' +
        '<div><dt>Stop seviyesi</dt><dd>' + esc(num(value.stop, value.priceDecimals || 2)) + ' ' + esc(currency) + '</dd></div><div><dt>Pozisyon tutarı</dt><dd>' + esc(amount(value.positionAmount)) + '</dd></div>' +
        '<div><dt>Stop varsayımındaki zarar</dt><dd>' + esc(amount(value.actualRiskAmount)) + '</dd></div></dl>' + (value.capitalLimited ? '<p class="muted-note">Adet mevcut sermayeyle sınırlandı.</p>' : '')
        : '<p class="muted-note">Hesaplanamadı: ' + esc(value && value.reason || 'Girdiler doğrulanamadı.') + '</p>') + '</div>';
    return '<details class="position-comparison"><summary>İki varsayımı karşılaştır</summary>' + (input.example === true ? '<p class="muted-note">Öğretici TL örneği uygulanıyor; değerler bir varlığa veya güncel fiyata ait değildir.</p>' : '') + '<p>Mevcut hesap girdilerini A ve B olarak karşılaştırın. Sermaye, fiyat ve ATR aynı para biriminde olmalıdır: ' + esc(currency) + '.</p>' +
      '<label>B varsayımı <select data-calc-assumption aria-label="Karşılaştırılacak B varsayımı"><option value="risk"' + (mode === 'risk' ? ' selected' : '') + '>' + (options.alternativeRiskPct == null ? 'Risk bütçesini yarıya indir' : 'Risk bütçesini %' + esc(num(options.alternativeRiskPct, 4)) + ' olarak dene') + '</option><option value="atr"' + (mode === 'atr' ? ' selected' : '') + '>ATR varsayımını iki katına çıkar</option></select></label>' +
      '<div class="position-comparison-results">' + result('A · mevcut girdiler', input, base) + result('B · değiştirilen varsayım', alternative, other) + '</div>' +
      '<p class="position-comparison-limit muted-note">1,5 ATR stop ve 2R hedef, bu hesaplayıcının varsayımlarıdır. Komisyon, alış-satış makası ve fiyat kayması dahil değildir; stop fiyatında gerçekleşme garantisi yoktur. Kesirli adet varsa işlem altyapınızın lot adımına göre aşağı yuvarlayın.</p>' +
      '<button type="button" class="btn small" data-calc-example>Etiketli TL örneğini dene</button><p class="muted-note">Öğretici örnek: 100.000 TL sermaye, %1 risk, 100 TL fiyat, 2 TL ATR. Örnek bir varlığa veya güncel fiyata ait değildir.</p></details>';
  }

  const candidateAnimations = new Set();
  function cancelCandidateMotion() {
    candidateAnimations.forEach((animation) => animation.cancel());
    candidateAnimations.clear();
  }
  function revealCandidateCards(container, options = {}) {
    cancelCandidateMotion();
    if (options.reducedMotion || !container || typeof container.querySelectorAll !== 'function') return 0;
    let count = 0;
    Array.from(container.querySelectorAll('.candidate-card')).slice(0, 12).forEach((card, index) => {
      if (typeof card.animate !== 'function') return;
      const animation = card.animate([{ opacity: 0.78, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], {
        duration: 180, delay: (index % 3) * 20, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'none'
      });
      animation.id = 'finans-candidate-reveal';
      candidateAnimations.add(animation);
      const release = () => candidateAnimations.delete(animation);
      if (typeof animation.addEventListener === 'function') { animation.addEventListener('finish', release, { once: true }); animation.addEventListener('cancel', release, { once: true }); }
      count += 1;
    });
    return count;
  }

  return { contextHelpHtml, historyTraceHtml, buildDailyBrief, dailyBriefHtml, revisionKey, createProgressStore, reviewHtml, resumeHtml, positionComparisonHtml, revealCandidateCards, cancelCandidateMotion };
});
