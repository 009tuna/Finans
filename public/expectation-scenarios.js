(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExpectationScenarios = factory();
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const metrics = new Set(['us_nonfarm_payroll_change','us_cpi_headline_mom_sa','us_cpi_core_mom_sa','us_cpi_headline_yoy_nsa','us_cpi_core_yoy_nsa']);
  const value = (v, unit) => Number.isFinite(v) ? v.toLocaleString('tr-TR',{maximumFractionDigits:4}) + (unit === 'percent' ? '%' : ' bin kişi') : 'Doğrulanamadı';
  function effect(metric, direction) {
    if (direction === 0) return 'Bu ölçümde sürpriz yok. Fiyat tepkisini diğer açıklamalar, önceki fiyatlama ve piyasa konumlanması belirleyebilir.';
    if (metric === 'us_nonfarm_payroll_change') return direction > 0
      ? 'İstihdam beklenenden güçlü olursa faiz indirimi beklentisi zayıflayabilir. Tahvil faizleri ve dolar güçlenirse ABD hisseleri ve kripto üzerinde baskı oluşabilir; büyüme beklentisinin iyileşmesi bu etkiyi dengeleyebilir.'
      : 'İstihdam beklenenden zayıf olursa faiz indirimi beklentisi güçlenebilir. Faizlerin gerilemesi ABD hisseleri ve kriptoyu destekleyebilir; belirgin büyüme kaygısı bu desteği tersine çevirebilir.';
    return direction > 0
      ? 'Enflasyon beklenenden yüksek olursa faizlerin yüksek kalacağı beklentisi güçlenebilir. Dolar ve tahvil faizleri yükselirse ABD hisseleri ve kripto üzerinde baskı oluşabilir.'
      : 'Enflasyon beklenenden düşük olursa faiz indirimi beklentisi güçlenebilir. Dolar ve tahvil faizleri gerilerse ABD hisseleri ve kripto destek bulabilir; zayıf talep işareti varsa tepki değişebilir.';
  }
  function build(event) {
    if (!event || !metrics.has(event.metric)) return null;
    const model = event.available !== false && Number.isFinite(event.pointEstimate) ? event.pointEstimate : null;
    const consensus = Number.isFinite(event.consensus) ? event.consensus : null;
    const direction = model != null && consensus != null ? Math.sign(model-consensus) : null;
    const unknown = 'Bu açıklama için kaynaklı piyasa beklentisi doğrulanamadı. Model değeriyle piyasa sürprizi karşılaştırılamaz.';
    return {rows:[
      {key:'model', label:'Modelin beklediği gibi gelirse', condition:model == null ? 'Sayısal model görüşü yok' : 'Veri = ' + value(model,event.unit), text:model == null ? 'Model bir sayı üretmedi; model sonucu senaryosu hesaplanamaz.' : direction == null ? unknown : effect(event.metric,direction)},
      {key:'consensus', label:'Piyasanın beklediği gibi gelirse', condition:consensus == null ? 'Piyasa beklentisi doğrulanamadı' : 'Veri = ' + value(consensus,event.unit), text:consensus == null ? unknown : effect(event.metric,0)},
      {key:'above', label:'Beklentinin üzerinde gelirse', condition:consensus == null ? 'Genel koşul · sayısal beklenti eşiği doğrulanamadı' : 'Veri > ' + value(consensus,event.unit), text:effect(event.metric,1)},
      {key:'below', label:'Beklentinin altında gelirse', condition:consensus == null ? 'Genel koşul · sayısal beklenti eşiği doğrulanamadı' : 'Veri < ' + value(consensus,event.unit), text:effect(event.metric,-1)}
    ], model, consensus, direction};
  }
  function html(event, {historical = false, scenarios = [], sources = new Map()} = {}) {
    const s = build(event);
    if (!s) return '';
    const safe = url => { try { const u = new URL(url); return ['https:','http:'].includes(u.protocol) && !u.username && !u.password; } catch (_) { return false; } };
    const opinions = scenarios.filter(row => row && row.eventId === event.eventId && row.condition && row.impact && row.invalidation && row.horizon && (row.sourceIds || []).some(id => safe(sources.get(id)?.url)));
    const modelNotes = opinions.length ? '<details class="expectation-model-scenarios"><summary>Modelin bu açıklamaya özel kaynaklı senaryoları (' + opinions.length + ')</summary>' + opinions.map(row => '<div class="expectation-scenario-row"><div><b>' + esc(row.condition) + '</b><span>' + esc(({us:'ABD',crypto:'Kripto',bist:'BIST'}[row.market] || row.market) + ' · ' + row.horizon) + '</span></div><div><p>' + esc(row.impact) + '</p><p>Karşı koşul: ' + esc(row.invalidation) + '</p><p>' + (row.sourceIds || []).map(id => sources.get(id)).filter(source => safe(source?.url)).map(source => '<a href="' + esc(source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(source.title) + '</a>').join(' · ') + '</p></div></div>').join('') + '</details>' : '<p class="observer-note">Bu raporda aynı açıklamaya bağlı, olay özelinde kaynaklı model senaryosu yok. Yukarıdaki etkiler genel koşullu yorumlardır.</p>';
    return '<section class="expectation-scenarios" aria-label="Beklentiye göre piyasa senaryoları"><h4>' + (historical ? 'Bu kayıt anındaki koşullu senaryolar' : 'Veri nasıl gelirse ne değişebilir?') + '</h4><div class="expectation-scenario-list">' + s.rows.map(row => '<div class="expectation-scenario-row" data-scenario="' + row.key + '"><div><b>' + esc(row.label) + '</b><span>' + esc(row.condition) + '</span></div><p>' + esc(row.text) + '</p></div>').join('') + '</div>' + modelNotes + '<details><summary>Etkinin teyidi ve bu senaryoların dayanağı</summary><p>Bu metinler koşullu ekonomik yorum kurallarıdır; modelin sayısal tahmini ve ölçülmüş fiyat tepkisi ayrı kayıtlardır. Etki, açıklamadan sonraki dolar ve ABD tahvil faizi hareketiyle teyit edilmelidir. İstihdamda ücretler, işsizlik ve revizyonlar; enflasyonda çekirdek/aylık bileşenler ana rakamı değiştirebilir. BIST için küresel etkinin yanında kur, TCMB ve yerel haberler belirleyicidir. Kesin yön veya başarı olasılığı üretilmez.</p><p><a href="https://www.federalreserve.gov/monetarypolicy/monetary-policy-what-are-its-goals-how-does-it-work.htm" target="_blank" rel="noopener noreferrer">Fed: faiz ve finansal koşulların aktarım mekanizması</a></p></details></section>';
  }
  return {build, html};
});
