// İnsancıl "Karar Özeti" üreticileri — saf, bağımsız, hem tarayıcıda hem Node testinde çalışır (UMD).
// Amaç: derin analiz çıktısını (skor/alt-skor/gerekçe/işlem planı, backtest sonucu) sade dile çevirmek.
// app.js yardımcılarına BAĞIMLI DEĞİLDİR (test edilebilirlik için kendi mini formatçıları var).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansInsights = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pct(v) {
    if (v == null || isNaN(v)) return '–';
    const r = Math.round(v * 100) / 100;
    return (r > 0 ? '+' : '') + r + '%';
  }
  function money(v, currency) {
    if (v == null || isNaN(v)) return '–';
    const sym = currency === 'TRY' ? '₺' : currency === 'USD' ? '$' : '';
    const abs = Math.abs(v);
    const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
    return sym + Number(v).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  // Uzun teknik gerekçeyi kısa bir öbeğe indir (ilk tireden/parantezden önce).
  function shorten(text) {
    if (!text) return '';
    return String(text).split(' — ')[0].split(' (')[0].trim();
  }

  // ---- VERDICT (tone → sade başlık öbeği) ----
  const VERDICT_PHRASE = {
    'strong-buy': 'Güçlü alım sinyali',
    'buy': 'Alım sinyali',
    'hold': 'Bekle / izle',
    'reduce': 'Azaltma sinyali',
    'sell': 'Satış sinyali',
  };

  // Round-trip işlem maliyeti (oran) — src/costs.js ile SENKRON tutulmalı.
  const COST_RT = { us: 0.001, bist: 0.004, crypto: 0.002 };

  /**
   * Bir varlık için katmanlı insancıl karar özeti üretir.
   * @param {object} asset - snapshot içindeki varlık ({ analysis, decision, ... })
   * @returns {object|null} { verdict, tone, headline, pros[], cons[], plan, quality } veya veri yoksa null
   */
  function explainDecision(asset) {
    if (!asset) return null;
    const a = asset.analysis || {};
    if (typeof a.score !== 'number' || !Number.isFinite(a.score) || a.score < 0 || a.score > 100) return null;
    const d = asset.decision || {};
    const reasons = a.reasons || [];
    const sub = a.sub || {};
    const currency = asset.currency;

    const pros = reasons.filter(function (r) { return r.sentiment === 'pos'; }).map(function (r) { return r.text; });
    const consRaw = reasons.filter(function (r) { return r.sentiment === 'neg'; }).map(function (r) { return r.text; });

    // Çelişkileri (decision.contradictions) en önemli uyarı olarak öne al
    const contradictions = (d.contradictions || []).map(function (c) { return c.label + ': ' + c.detail; });
    const cons = contradictions.concat(consRaw);

    // Alt-skorlardan en güçlü / en zayıf alanı bul
    const areaMap = { Momentum: sub.momentum, Trend: sub.trend, Hacim: sub.hacim, Volatilite: sub.volatilite };
    if (sub.temel != null) areaMap['Temel/Analist'] = sub.temel;
    const areas = Object.keys(areaMap).map(function (k) { return [k, areaMap[k]]; }).filter(function (e) { return typeof e[1] === 'number' && Number.isFinite(e[1]) && e[1] >= 0 && e[1] <= 100; });
    areas.sort(function (x, y) { return y[1] - x[1]; });
    const strongest = areas[0];
    const weakest = areas[areas.length - 1];

    // ---- Başlık (Katman 1: Sonuç) ----
    const verdict = a.label;
    const phrase = VERDICT_PHRASE[a.tone] || a.label;
    let headline;
    const strongTxt = strongest ? strongest[0].toLowerCase() + ' güçlü (' + strongest[1] + '/100)' : null;
    const weakTxt = weakest ? weakest[0].toLowerCase() + ' zayıf (' + weakest[1] + '/100)' : null;

    if (a.tone === 'strong-buy' || a.tone === 'buy') {
      headline = phrase + ' — ' + (strongTxt || 'teknik görünüm olumlu') + '.';
      if (cons.length) headline += ' Ancak ' + (weakTxt ? weakTxt + '; ' : '') + 'temkinli yaklaş.';
    } else if (a.tone === 'hold') {
      headline = phrase + ' — sinyaller karışık' + (strongest && weakest ? ' (' + strongest[0].toLowerCase() + ' iyi, ' + weakest[0].toLowerCase() + ' zayıf)' : '') + '; net yön yok.';
    } else {
      headline = phrase + ' — ' + (weakTxt || 'genel görünüm zayıf') + '.';
    }

    // ---- İşlem planı (Katman 2: Aksiyon) ----
    const t = (d.activeSignal && d.activeSignal.available) ? d.activeSignal : (d.trade || {});
    let plan;
    if (t.available) {
      plan = 'Model giriş seviyesi ' + money(t.entry, currency) + ' · stop ' + money(t.stop, currency) +
        ' · hedef ' + money(t.target, currency) + ' (Risk/Ödül ' + (t.riskReward || 2) + ':1).' +
        ' Hesapta kullanılan risk bütçesi %' + (t.positionRiskPct != null ? t.positionRiskPct : 2) + '; emir gerçekleşmesi ve fiyat kayması ayrıca değerlendirilir.';
    } else {
      plan = 'İşlem planı için veri yetersiz (' + (t.reason || 'ATR/fiyat eksik') + ').';
    }

    // ---- Karar kalitesi (Katman 2: Güven) ----
    if (t.predictionId) {
      plan = 'Aktif sistem sinyali ' + money(t.entry, currency) + ' girişinden izleniyor; stop ' + money(t.stop, currency) + ', hedef ' + money(t.target, currency) + '. ' + (typeof t.resultPct === 'number' && Number.isFinite(t.resultPct) ? 'Son ölçülen fiyat değişimi ' + pct(t.resultPct) + '.' : 'Son fiyat değişimi hesaplanamadı.');
    }
    const qBits = [];
    if (d.freshness && d.freshness.label) qBits.push(d.freshness.label);
    if (d.confidence && d.confidence.label) qBits.push(d.confidence.label);
    const STATUS_LABEL = { clean: 'sağlam', caution: 'dikkatli', blocked: 'riskli' };
    const quality = {
      status: d.status || null, // clean | caution | blocked
      statusLabel: d.status ? (STATUS_LABEL[d.status] || d.status) : null,
      score: typeof d.score === 'number' && Number.isFinite(d.score) && d.score >= 0 && d.score <= 100 ? d.score : null,
      note: qBits.join(' · ') || 'Karar kalitesi verisi yok',
    };

    // ---- Rejim & uygunluk (raporların ana dersi) ----
    const reg = (asset.ind && asset.ind.regime) || a.regime || null;
    let regimeLabel = null, suitability = null;
    if (reg) {
      regimeLabel = reg.label + (reg.adx != null ? ' · ADX ' + reg.adx : '');
      if (reg.type === 'range') {
        suitability = 'Yatay rejim: göstergeler bu dönemde belirgin yön saptamıyor. Bir eşik geçişi tek başına tepki ya da kırılma beklentisi oluşturmaz.';
      } else if (reg.direction === 'up') {
        suitability = (reg.type === 'strong-trend' ? 'Güçlü yukarı trend' : 'Yukarı trend') + ': fiyatın geçmiş hareketi trend yönünde. Yeni giriş için bu gözlemle birlikte fiyat tarihini, stop mesafesini ve karşı kanıtı incele.';
      } else if (reg.direction === 'down') {
        suitability = (reg.type === 'strong-trend' ? 'Güçlü aşağı trend' : 'Aşağı trend') + ': fiyatın geçmiş yönü aşağı. Aşırı satım, dönüşün başladığını göstermez.';
      } else {
        suitability = 'Rejimin yön bilgisi eksik; strateji uyumu değerlendirilemiyor.';
      }
    }

    // ---- Maliyet kapısı: hedef hareket ≥ 2× round-trip maliyet mi? ----
    let costGate = null, costCon = null;
    if (t.available && t.entry && t.target) {
      const rewardPct = ((t.target - t.entry) / t.entry) * 100;
      const mkt = String(asset.market || '').toLowerCase();
      const rt = (COST_RT[mkt] != null ? COST_RT[mkt] : 0.002) * 100;
      const ratio = rt ? rewardPct / rt : null;
      costGate = {
        rewardPct: Math.round(rewardPct * 100) / 100,
        costPct: Math.round(rt * 1000) / 1000,
        ratio: ratio != null ? Math.round(ratio * 100) / 100 : null,
        pass: ratio != null ? ratio >= 2 : null,
      };
      if (costGate.pass === false) {
        costCon = 'Maliyet kapısı: hedef %' + costGate.rewardPct + ', işlem maliyeti %' + costGate.costPct + '; 2 katın altında, kısa-vadede önerilmez';
      }
    }

    const finalCons = (costCon ? [costCon] : []).concat(cons);

    return {
      verdict: verdict,
      tone: a.tone,
      headline: headline,
      regime: regimeLabel,
      suitability: suitability,
      costGate: costGate,
      pros: pros.slice(0, 3).map(shorten),
      cons: finalCons.slice(0, 2).map(shorten),
      plan: plan,
      quality: quality,
    };
  }

  /**
   * Strateji testinin ölçülmüş net sonuçlarını ve örneklem sınırlarını açıklar.
   * @param {object} res - runBacktest çıktısı
   * @returns {object} { maxDrawdown, winRate, closedTrades, best, worst, beatBH, headlineTone, worksWhen, breaksWhen, note }
   */
  function explainBacktest(res) {
    if (!res) return null;
    const finite = function (n) { return typeof n === 'number' && Number.isFinite(n); };
    const curve = Array.isArray(res.equityCurve) ? res.equityCurve : [];
    const trades = Array.isArray(res.trades) ? res.trades : [];
    const sells = trades.filter(function (t) { return t.type === 'SELL'; });
    const buys = trades.filter(function (t) { return t.type === 'BUY'; });

    // Maksimum düşüş (sermaye eğrisi tepe-dip)
    let peak = finite(res.initialCapital) && res.initialCapital > 0 ? res.initialCapital : -Infinity;
    let maxDD = curve.length && curve.every(function (c) { return c && finite(c.total) && c.total >= 0; }) ? 0 : null;
    curve.forEach(function (c) {
      if (maxDD == null) return;
      if (c.total > peak) peak = c.total;
      const dd = peak > 0 ? ((peak - c.total) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    });
    if (maxDD != null) maxDD = Math.round(maxDD * 100) / 100;

    const measured = sells.filter(function (t) { return finite(t.netPnlPct); });
    const wins = measured.filter(function (t) { return t.netPnlPct > 0; });
    const winRate = measured.length ? Math.round((wins.length / measured.length) * 100) : null;
    const best = measured.reduce(function (m, t) { return (m == null || t.netPnlPct > m.netPnlPct) ? t : m; }, null);
    const worst = measured.reduce(function (m, t) { return (m == null || t.netPnlPct < m.netPnlPct) ? t : m; }, null);
    const difference = finite(res.strategyReturn) && finite(res.bhReturn) ? res.strategyReturn - res.bhReturn : null;
    const beatBH = difference == null ? null : difference > 0;

    let worksWhen;
    let breaksWhen;
    let headlineTone;

    if (!buys.length) {
      headlineTone = 'warn';
      worksWhen = 'Bu eşiklerde hiç alım sinyali oluşmadı — strateji test edilemedi.';
      breaksWhen = 'Bu dönem ve eşikler işlem üretmedi. Bu gözlem, eşiklerin değiştirilmesi gerektiğini ya da başka bir dönemde başarılı olacağını göstermez.';
    } else {
      headlineTone = difference == null ? 'warn' : difference > 0 ? 'pos' : difference < 0 ? 'neg' : 'warn';
      worksWhen = measured.length ? measured.length + ' kapanan işlemin ' + wins.length + ' tanesi alış ve satış maliyetleri sonrasında pozitif sonuçlandı (%' + winRate + ').' : 'Kapanan işlemlerde net getiri verisi yok; kârlı işlem oranı hesaplanamadı.';
      if (measured.length < sells.length) worksWhen += ' ' + (sells.length - measured.length) + ' işlemin net sonucu eksik.';
      if (difference != null) worksWhen += difference === 0 ? ' Strateji ve maliyet hariç al-tut getirisi eşit.' : ' Net strateji, maliyet hariç al-tut fiyat getirisinin ' + Math.abs(Math.round(difference * 100) / 100) + ' yüzde puan ' + (difference > 0 ? 'üzerinde' : 'altında') + '.';
      breaksWhen = (maxDD != null ? 'Bu sermaye eğrisinde en büyük tepe-dip düşüşü %' + maxDD + '. ' : 'Sermaye eğrisi eksik; en büyük düşüş hesaplanamadı. ') + 'Bu test, hangi piyasa rejiminde çalışacağını veya gelecekteki başarı oranını belirlemez.';
    }

    return {
      maxDrawdown: maxDD,
      winRate: winRate,
      closedTrades: sells.length,
      measuredClosedTrades: measured.length,
      unknownClosedTrades: sells.length - measured.length,
      best: best,
      worst: worst,
      beatBH: beatBH,
      headlineTone: headlineTone,
      worksWhen: worksWhen,
      breaksWhen: breaksWhen,
      note: 'Net strateji tahmini işlem maliyetlerini içerir; al-tut karşılaştırması fiyat değişimidir ve maliyet içermez. Eşiklerin bu döneme göre seçilmesi sonucu iyimserleştirebilir.',
    };
  }

  /**
   * Yönetici Özeti / Risk Panosu — tüm parçaları (piyasa rejimi, karar kalitesi,
   * çelişkiler, fırsatlar) tek risk seviyesi + sade hüküm + aksiyon listesine indirir.
   * Snapshot'taki HAZIR veriden hesaplar (anında, ek API çağrısı yok).
   */
  function buildExecutiveSummary(snapshot, evidence) {
    if (!snapshot) return null;
    const mr = snapshot.marketRegime || {};
    const all = [].concat(snapshot.us || [], snapshot.bist || [], snapshot.crypto || [])
      .filter(function (x) { return x && !x.__error && x.analysis && typeof x.analysis.score === 'number' && Number.isFinite(x.analysis.score) && x.analysis.score >= 0 && x.analysis.score <= 100; });
    if (!all.length && !mr.us && !mr.bist && !mr.crypto) return null;

    const dq = all.map(function (x) { return x.decision && x.decision.score; }).filter(function (v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100; });
    const avgQuality = dq.length ? Math.round(dq.reduce(function (a, b) { return a + b; }, 0) / dq.length) : null;
    const contradictionCount = all.reduce(function (n, x) { return n + ((x.decision && x.decision.contradictions) ? x.decision.contradictions.length : 0); }, 0);

    const environment = [];
    let riskPoints = 0;
    if (mr.us) {
      if (mr.us.type === 'panic') { riskPoints += 2; environment.push('ABD: panik volatilite'); }
      else if (mr.us.type === 'stress') { riskPoints += 1; environment.push('ABD: yüksek volatilite (stres)'); }
      else if (mr.us.type === 'calm') { environment.push('ABD: düşük volatilite'); }
      else environment.push('ABD: normal volatilite');
    }
    if (mr.bist) {
      if (mr.bist.type === 'cash') { riskPoints += 2; environment.push('BIST: 200g altı (nakit rejimi)'); }
      else environment.push('BIST: 200g ortalama üstü');
    }
    if (mr.crypto) {
      if (mr.crypto.type === 'decoupled') environment.push('Kripto: Nasdaq ile düşük ilişki');
      else if (mr.crypto.type === 'coupled') environment.push('Kripto: makroya bağlı');
      else environment.push('Kripto: korelasyon karışık');
    }
    if (avgQuality != null && avgQuality < 60) riskPoints += 2;
    else if (avgQuality != null && avgQuality < 75) riskPoints += 1;
    if (contradictionCount >= 3) riskPoints += 1;

    const riskLevel = riskPoints >= 4 ? { label: 'Yüksek', tone: 'neg' }
      : riskPoints >= 2 ? { label: 'Orta', tone: 'warn' }
      : !evidence || !evidence.macroAvailable || (snapshot.errors || []).length || !mr.us || !mr.bist || !mr.crypto
        ? { label: 'Belirsiz', tone: 'warn' } : { label: 'Düşük', tone: 'pos' };

    const best = (snapshot.topPicks || []).filter(function (x) { return x && !x.__error && typeof x.score === 'number' && Number.isFinite(x.score) && x.score >= 0 && x.score <= 100; }).sort(function (a, b) { return b.score - a.score; })[0] || null;

    const regimeActions = [];
    if (mr.bist && mr.bist.type === 'cash') regimeActions.push('BIST 200g ortalama altında. Adayın trend gerekçesini ve karşı kanıtını birlikte incele.');
    if (mr.us && (mr.us.type === 'stress' || mr.us.type === 'panic')) regimeActions.push('ABD volatilitesi yüksek. Pozisyon hesabında stop mesafesini ve sermaye sınırını kontrol et.');
    else if (mr.us && mr.us.type === 'calm') regimeActions.push('ABD volatilitesi düşük. Bu gözlem tek başına bir stratejinin üstünlüğünü göstermez.');
    if (mr.crypto && mr.crypto.type === 'coupled') regimeActions.push('Kripto ve Nasdaq birlikte hareket ediyor. İkisindeki pozisyonları bağımsız risk sayma.');
    else if (mr.crypto && mr.crypto.type === 'decoupled') regimeActions.push('Kripto ile Nasdaq arasındaki ilişki düşük. Bu, tepki veya yakınsama beklentisi için yeterli kanıt değildir.');
    const honesty = 'Teknik puan başarı olasılığı değildir. Fiyat tarihini, kaynak kapsamını ve işlem maliyetini adayın kanıtlarıyla birlikte kontrol et.';
    const finalActions = regimeActions.slice(0, 2);
    if (best) finalActions.push('Teknik puanı en yüksek aday: ' + best.market + ' ' + best.symbol + ' (' + best.score + '/100). Gerekçe ve kanıt eksiklerini aday kartından incele.');
    finalActions.push(honesty);

    const headline = (riskLevel.label === 'Belirsiz' ? 'Makro veya veri kapsamı eksik; toplam risk düşük olarak sınıflandırılamıyor' : 'Piyasa ortamı ' + riskLevel.label.toLowerCase() + ' riskli')
      + (avgQuality != null ? ' · ortalama karar kalitesi ' + avgQuality + '/100' : '')
      + (environment.length ? '. ' + environment.slice(0, 3).join(' · ') + '.' : '.');

    return {
      riskLevel: riskLevel,
      avgQuality: avgQuality,
      contradictionCount: contradictionCount,
      environment: environment,
      headline: headline,
      actions: finalActions,
    };
  }

  return { explainDecision: explainDecision, explainBacktest: explainBacktest, buildExecutiveSummary: buildExecutiveSummary };
});
