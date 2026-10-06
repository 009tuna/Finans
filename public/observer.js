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
      score: records.buildScorecard(predictions)
    };
  }
  function summary(predictions, available = true) {
    if (!available) return '<div class="observer-summary" role="status">Sinyal defteri güncel olarak okunamadı; kayıt sayıları ve başarı oranı doğrulanamadı.</div>';
    const g = groups(predictions);
    return '<div class="observer-summary"><span><b>' + g.active.length + '</b> aktif sinyal</span><span><b>' + g.history.length + '</b> geçmiş kayıt</span><span>Net kazanç oranı <b>' + (g.score.winRate == null ? 'Henüz ölçülemedi' : num(g.score.winRate) + '%') + '</b> · n=' + g.score.verified + '</span><button type="button" class="btn btn-secondary" data-observer-open>Sinyal defterini aç →</button></div>';
  }
  function dashboard(predictions, sources = [], state = {}, available = true) {
    if (!available) return '<section class="card observer-ledger"><h2>Sinyal defteri okunamadı</h2><p role="status">Son kayıtların güncelliği doğrulanamadı. Boş defter veya %0 başarı sonucu çıkarılmadı.</p><button type="button" class="btn" data-observer-retry>Yeniden oku</button></section>';
    const g = groups(predictions), selected = ['active','history','performance','legacy'].includes(state.tab) ? state.tab : 'active';
    const market = Object.hasOwn(markets, state.market) ? state.market : 'all';
    const tabs = [['active','Aktif sinyaller',g.active.length],['history','Geçmiş sinyaller',g.history.length],['performance','Başarı oranları',g.score.verified],['legacy','Önceki sistem arşivi',g.legacy.length]];
    const nav = '<div class="observer-filters"><div class="observer-tabs" role="group" aria-label="Sinyal kayıtları">' + tabs.map(([key,label,count]) => '<button type="button" data-signal-tab="' + key + '" aria-pressed="' + (key === selected) + '">' + label + ' <span>' + count + '</span></button>').join('') + '</div><label>Piyasa <select data-signal-market><option value="all">Tüm piyasalar</option>' + Object.entries(markets).map(([key,label]) => '<option value="' + key + '"' + (key === market ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></label></div>';
    const inMarket = rows => market === 'all' ? rows : rows.filter(r => r.market === market);
    let content;
    if (selected === 'performance') content = ui.renderPerformance(inMarket(predictions), sources.filter(s => market === 'all' || s.market === market));
    else {
      const rows = inMarket(g[selected]).slice().sort((a,b) => String(b.signalCreatedAt || b.createdAt || '').localeCompare(String(a.signalCreatedAt || a.createdAt || '')));
      const limit = Math.max(20, Number.isInteger(state.limit) ? state.limit : 20);
      const row = r => {
        if (!records.isStructural(r)) return '<li class="observer-archive-row"><b>' + esc(r.symbol) + '</b><span>' + esc(markets[r.market] || r.market) + '</span><span>' + esc(r.outcome === 'open' ? 'Eski açık kayıt' : 'Eski kapanış kaydı') + '</span><time>' + esc(stamp(r.createdAt)) + '</time></li>';
        const classification = records.classifyRecord(r);
        const result = classification.category === 'verified' ? num(r.netResultPct) + '% net' : classification.label;
        return '<li class="observer-signal-row"><details data-signal-id="' + esc(r.id) + '"><summary><span><b>' + esc(r.symbol) + '</b> · ' + esc(markets[r.market] || r.market) + '</span><span>' + esc(result) + '</span><time>' + esc(stamp(r.signalCreatedAt)) + '</time></summary>' + ui.renderPlan(r) + '</details></li>';
      };
      content = (selected === 'legacy' ? '<p class="observer-note">Önceki teknik ve manuel kayıtlar korunur. Yeni yapısal yöntemin başarı oranına katılmaz.</p>' : '') +
        (rows.length ? '<ul class="observer-signal-list">' + rows.slice(0,limit).map(row).join('') + '</ul>' + (rows.length > limit ? '<button type="button" class="btn btn-secondary" data-signal-more>Sonraki 20 kaydı göster (' + (rows.length-limit) + ' kaldı)</button>' : '') : '<div class="observer-empty"><h3>' + (selected === 'active' ? 'Henüz aktif yapısal sinyal yok' : 'Bu görünümde kayıt yok') + '</h3><p>' + (selected === 'active' ? 'Sistem destek, direnç, trend ve maliyet koşulları sağlandığında kaydı otomatik açar. Yüksek teknik puan tek başına işlem başlatmaz.' : 'Kapanan, giriş kaçıran veya süresi dolan yeni yöntem kayıtları burada görünecek.') + '</p></div>');
    }
    const coverage = Object.entries(markets).map(([key,label]) => {
      const rows = sources.filter(s => s.market === key);
      const blocked = rows.some(s => s.calendarStatus !== 'verified');
      return '<li><b>' + label + '</b><span>' + (blocked ? 'Takvim kanıtı eksik · yeni sinyal kapalı' : rows.length ? 'Takvim kanıtı mevcut · kurulum koşulları izleniyor' : 'Tarama kaynak durumu doğrulanamadı') + '</span></li>';
    }).join('');
    return '<section class="card observer-ledger"><header><h2>Otomatik sinyal defteri</h2><p>Sinyal → giriş kanıtı → sanal işlem → doğrulanmış sonuç. Kayıt ve takip otomatik ilerler.</p></header>' + nav + content + '<details class="observer-coverage"><summary>Piyasa kapsamı ve ölçüm kuralları</summary><ul>' + coverage + '</ul><p>Bekleyen, girilmeyen, belirsiz ve kanıtı eksik kayıtlar başarı paydasına girmez. Sanal sonuçlar gerçek portföy getirisi değildir.</p></details></section>';
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
  return {groups, summary, dashboard, rationale, task};
});
