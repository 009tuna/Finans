(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./structural-records'), require('./structural-ui'));
  else root.FinansObserver = factory(root.StructuralRecords, root.StructuralUI);
})(typeof globalThis === 'undefined' ? this : globalThis, function (records, ui) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const markets = {bist:'BIST', us:'ABD', crypto:'Kripto'};
  const terminal = new Set(['closed', 'missed-entry', 'expired-entry']);
  const num = value => Number.isFinite(value) ? value.toLocaleString('tr-TR', {maximumFractionDigits:2}) : '—';
  const stamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('tr-TR', {timeZone:'Europe/Istanbul', dateStyle:'short', timeStyle:'short'}) + ' TSİ' : 'Zaman doğrulanamadı';
  function groups(predictions = []) {
    const modern = predictions.filter(records.isStructural);
    return {
      active: modern.filter(r => !terminal.has(r.execution?.state)),
      history: modern.filter(r => terminal.has(r.execution?.state)),
      legacy: predictions.filter(r => !records.isStructural(r)),
      legacyActive: predictions.filter(r => !records.isStructural(r) && r.outcome === 'open'),
      score: records.buildScorecard(predictions)
    };
  }
  function diagnostics(snapshot, sources = []) {
    return Object.entries(markets).map(([market,label]) => {
      const assets = Array.isArray(snapshot?.[market]) ? snapshot[market] : null;
      const observations = assets ? assets.map(a => ({...a.decision?.structural, symbol:a.symbol})) : sources.filter(s => s.market === market);
      const calendarBlocked = observations.filter(o => o.calendarStatus !== 'verified').length;
      const reasons = observations.reduce((out,o) => { for (const reason of new Set(o.reasons || [])) out[reason] = (out[reason] || 0) + 1; return out; }, {});
      const buys = assets?.filter(a => ['AL','GUCLU AL','GÜÇLÜ AL'].includes(a.analysis?.label)) || null;
      return {market,label,total:observations.length,calendarBlocked,reasons,buys};
    });
  }
  function diagnosticsHtml(snapshot, sources, market = 'all') {
    return '<section class="observer-diagnostics" aria-label="Sinyal üretiminin durumu">' + diagnostics(snapshot,sources).filter(row => market === 'all' || row.market === market).map(row => {
      const status = !row.total ? 'Tarama verisi okunamadı' : row.calendarBlocked === row.total ? 'Yeni kayıt kapalı' : row.calendarBlocked ? 'Tarama kısmen kapalı' : 'Seans kanıtı mevcut';
      const details = !row.total ? 'Veri eksikliği, sinyal yokluğu olarak yorumlanamaz.' : row.calendarBlocked ? row.calendarBlocked + '/' + row.total + ' varlıkta seans takvimi doğrulanamadı.' : 'Destek, trend, giriş ve maliyet koşulları ayrı değerlendiriliyor.';
      const reasons = Object.entries(row.reasons).filter(([key]) => key !== 'calendar-unverified').sort((a,b) => b[1]-a[1]).slice(0,2).map(([reason,count]) => count + ' varlık: ' + ui.reasonLabel(reason)).join(' ');
      return '<div><h3>' + row.label + '<span>' + esc(status) + '</span></h3><p>' + esc(details) + '</p>' + (row.buys ? '<p><b>' + row.buys.length + '</b> teknik AL / GÜÇLÜ AL adayı · işlem kaydı değildir.</p>' : '') + (reasons ? '<p class="muted">' + esc(reasons) + '</p>' : '') + '</div>';
    }).join('') + '</section>';
  }
  function summary(predictions, available = true, snapshot = null) {
    if (!available) return '<div class="observer-summary" role="status">Sinyal defteri güncel olarak okunamadı; kayıt sayıları ve başarı oranı doğrulanamadı.</div>';
    const g = groups(predictions);
    const scan = diagnostics(snapshot), known = scan.every(row => row.buys !== null);
    return '<div class="observer-summary"><span><b>' + g.active.length + '</b> aktif yapısal sinyal</span><span><b>' + g.legacyActive.length + '</b> önceki açık kayıt</span>' + (known ? '<span><b>' + scan.reduce((n,row) => n+row.buys.length,0) + '</b> teknik AL adayı</span>' : '') + '<span>Net kazanç oranı <b>' + (g.score.winRate == null ? 'Henüz ölçülemedi' : num(g.score.winRate) + '%') + '</b> · n=' + g.score.verified + '</span><button type="button" class="btn btn-secondary" data-observer-open>Sinyal defterini aç →</button></div>';
  }
  function dashboard(predictions, sources = [], state = {}, available = true, snapshot = null) {
    if (!available) return '<section class="card observer-ledger"><h2>Sinyal defteri okunamadı</h2><p role="status">Son kayıtların güncelliği doğrulanamadı. Boş defter veya %0 başarı sonucu çıkarılmadı.</p><button type="button" class="btn" data-observer-retry>Yeniden oku</button></section>';
    const g = groups(predictions);
    const market = Object.hasOwn(markets, state.market) ? state.market : 'all';
    const scan = diagnostics(snapshot), technical = scan.flatMap(row => row.buys || []), technicalKnown = scan.every(row => row.buys !== null);
    const selected = ['active','technical','legacyActive','history','performance','legacy'].includes(state.tab) ? state.tab : g.active.length ? 'active' : technical.length ? 'technical' : g.legacyActive.length ? 'legacyActive' : 'active';
    const tabs = [['active','Yapısal işlemler',g.active.length],['technical','Teknik adaylar',technicalKnown ? technical.length : '—'],['legacyActive','Önceki açık kayıtlar',g.legacyActive.length],['history','Geçmiş sinyaller',g.history.length],['performance','Başarı oranları',g.score.verified],['legacy','Tüm eski kayıtlar',g.legacy.length]];
    const nav = '<div class="observer-filters"><div class="observer-tabs" role="group" aria-label="Sinyal kayıtları">' + tabs.map(([key,label,count]) => '<button type="button" data-signal-tab="' + key + '" aria-pressed="' + (key === selected) + '">' + label + ' <span>' + count + '</span></button>').join('') + '</div><label>Piyasa <select data-signal-market><option value="all">Tüm piyasalar</option>' + Object.entries(markets).map(([key,label]) => '<option value="' + key + '"' + (key === market ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label></div>';
    const inMarket = rows => market === 'all' ? rows : rows.filter(r => r.market === market);
    let content;
    if (selected === 'performance') content = ui.renderPerformance(inMarket(predictions), sources.filter(s => market === 'all' || s.market === market));
    else if (selected === 'technical') {
      const rows = inMarket(technical).slice().sort((a,b) => (b.analysis?.score || 0)-(a.analysis?.score || 0));
      const limit = Math.max(20, Number.isInteger(state.limit) ? state.limit : 20);
      const incomplete = scan.filter(row => market === 'all' || row.market === market).some(row => row.buys === null);
      content = '<p class="observer-note">Bunlar mevcut teknik puan adaylarıdır. Otomatik işlem planı ve doğrulanmış giriş anlamına gelmez; her varlıkta eksik koşul ayrıca gösterilir.</p>' + (incomplete ? '<p role="status">Piyasa verisi eksik; toplam aday sayısı doğrulanamadı. Okunabilen adaylar aşağıda gösterilir.</p>' : '') + (rows.length ? '<ul class="observer-signal-list">' + rows.slice(0,limit).map(a => '<li><button type="button" class="observer-candidate" data-observer-market="' + esc(a.market) + '" data-observer-symbol="' + esc(a.symbol) + '"><span><b>' + esc(a.symbol) + '</b><small>' + esc(a.name || '') + '</small></span><span>' + esc(a.analysis.label) + ' · ' + esc(num(a.analysis.score)) + '/100</span><span>' + esc(ui.reasonLabel(a.decision?.structural?.reasons?.[0] || 'no-structural-trigger')) + '</span></button></li>').join('') + '</ul>' + (rows.length > limit ? '<button type="button" class="btn btn-secondary" data-signal-more>Sonraki 20 adayı göster</button>' : '') : incomplete ? '' : '<p>Bu piyasada teknik AL / GÜÇLÜ AL adayı yok.</p>');
    }
    else {
      const rows = inMarket(g[selected]).slice().sort((a,b) => String(b.signalCreatedAt || b.createdAt || '').localeCompare(String(a.signalCreatedAt || a.createdAt || '')));
      const limit = Math.max(20, Number.isInteger(state.limit) ? state.limit : 20);
      const row = r => {
        if (!records.isStructural(r)) return '<li class="observer-signal-row"><details data-signal-id="' + esc(r.id) + '"><summary><span><b>' + esc(r.symbol) + '</b> · ' + esc(markets[r.market] || r.market) + '</span><span>' + esc(r.outcome === 'open' ? 'Eski açık kayıt' : 'Eski kapanış kaydı') + '</span><time>' + esc(stamp(r.createdAt)) + '</time></summary><p class="observer-note">İlk kayıttaki seviyeler: giriş ' + esc(num(r.entry)) + ' · stop ' + esc(num(r.stop)) + ' · hedef ' + esc(num(r.target)) + '. Para birimi: ' + esc(r.currency || 'kayıtta belirtilmemiş') + '. Önceki yöntem; yeni yöntemin başarı hesabına katılmaz.</p></details></li>';
        const classification = records.classifyRecord(r);
        const result = classification.category === 'verified' ? num(r.netResultPct) + '% net' : classification.label;
        return '<li class="observer-signal-row"><details data-signal-id="' + esc(r.id) + '"><summary><span><b>' + esc(r.symbol) + '</b> · ' + esc(markets[r.market] || r.market) + '</span><span>' + esc(result) + '</span><time>' + esc(stamp(r.signalCreatedAt)) + '</time></summary>' + ui.renderPlan(r) + '</details></li>';
      };
      content = (selected === 'legacy' || selected === 'legacyActive' ? '<p class="observer-note">Önceki teknik ve manuel kayıtlar korunur. Yeni yapısal yöntemin başarı oranına katılmaz.</p>' : '') +
        (rows.length ? '<ul class="observer-signal-list">' + rows.slice(0,limit).map(row).join('') + '</ul>' + (rows.length > limit ? '<button type="button" class="btn btn-secondary" data-signal-more>Sonraki 20 kaydı göster (' + (rows.length-limit) + ' kaldı)</button>' : '') : '<div class="observer-empty"><h3>' + (selected === 'active' ? 'Henüz aktif yapısal sinyal yok' : 'Bu görünümde kayıt yok') + '</h3><p>' + (selected === 'active' ? 'Sistem destek, direnç, trend ve maliyet koşulları sağlandığında kaydı otomatik açar. Yüksek teknik puan tek başına işlem başlatmaz.' : 'Kapanan, giriş kaçıran veya süresi dolan yeni yöntem kayıtları burada görünecek.') + '</p></div>');
    }
    const coverage = Object.entries(markets).map(([key,label]) => {
      const rows = sources.filter(s => s.market === key);
      const blocked = rows.some(s => s.calendarStatus !== 'verified');
      return '<li><b>' + label + '</b><span>' + (blocked ? 'Takvim kanıtı eksik · yeni sinyal kapalı' : rows.length ? 'Takvim kanıtı mevcut · kurulum koşulları izleniyor' : 'Tarama kaynak durumu doğrulanamadı') + '</span></li>';
    }).join('');
    return '<section class="card observer-ledger"><header><h2>Sinyaller ve adaylar</h2><p>Teknik aday, kayıtlı işlem ve ölçülmüş sonuç ayrı gösterilir. Eksik seans veya fiyat kanıtı yeni işlem kaydını durdurur.</p></header>' + diagnosticsHtml(snapshot,sources,market) + nav + content + '<details class="observer-coverage"><summary>Piyasa kapsamı ve ölçüm kuralları</summary><ul>' + coverage + '</ul><p>Bekleyen, girilmeyen, belirsiz ve kanıtı eksik kayıtlar başarı paydasına girmez. Sanal sonuçlar gerçek portföy getirisi değildir.</p></details></section>';
  }
  function rationale(asset, predictions = []) {
    const record = records.selectActiveRecord(predictions, asset.market, asset.symbol);
    if (records.isStructural(record)) return '<div data-task-target="thesis"><h4>Sistemin kayıtlı gerekçesi</h4><p>' + esc(record.plan.setup === 'B' ? 'Hacimli kırılımın ardından yeniden test koşulları karşılandı.' : 'Yükselen trendde teyitli desteğe geri çekilme koşulları karşılandı.') + ' Vade: ' + record.plan.horizonDays + ' gün. Karar anındaki plan korunur.</p>' + ui.renderPlan(record) + '</div>';
    return '<div data-task-target="thesis"><h4>Sistemin izleme gerekçesi</h4>' + (record ? '<p>Önceki teknik yöntemden açık kayıt var; takibi sürüyor. Bu kayıt yeni yapısal yöntemin işlemi veya başarı kanıtı değildir. Aynı varlıkta açık kayıt varken yeni işlem kaydı açılmaz.</p>' : '') + ui.renderWatch(asset.decision?.structural) + '<p>Yeni yöntemle kayıtlı bir işlem gerekçesi yok. Teknik puan: ' + esc(num(asset.analysis?.score)) + '/100; bu değer başarı olasılığı değildir. Koşullar tamamlandığında plan ve gerekçe sistem tarafından kaydedilir.</p></div>';
  }
  function task(asset, predictions = []) {
    const r = records.selectActiveRecord(predictions, asset.market, asset.symbol);
    if (r && !records.isStructural(r)) return {panel:'notes',target:'thesis',field:null,label:'Önceki kayıt takipte',reason:'Eski açık kayıt kapanmadan aynı varlıkta yeni işlem kaydı açılmaz.'};
    return {panel:'notes', target:'thesis', field:null, label:records.isStructural(r) ? records.classifyRecord(r).label : 'Kurulum izleniyor', reason:records.isStructural(r) ? 'Sabit plan ve işlem kanıtı otomatik takip ediliyor.' : ui.reasonLabel(asset.decision?.structural?.reasons?.[0] || 'no-structural-trigger')};
  }
  return {groups, diagnostics, summary, dashboard, rationale, task};
});
