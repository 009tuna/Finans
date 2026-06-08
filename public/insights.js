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
    if (a.score == null) return null;
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
    const areas = Object.keys(areaMap).map(function (k) { return [k, areaMap[k]]; }).filter(function (e) { return e[1] != null; });
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
    const t = d.trade || {};
    let plan;
    if (t.available) {
      plan = money(t.entry, currency) + ' civarından al · stop ' + money(t.stop, currency) +
        ' · hedef ' + money(t.target, currency) + ' (Risk/Ödül ' + (t.riskReward || 2) + ':1).' +
        ' Stop altına inerse tez bozulur; pozisyonu hesabın %' + (t.positionRiskPct != null ? t.positionRiskPct : 2) + ' riskiyle sınırla.';
    } else {
      plan = 'İşlem planı için veri yetersiz (' + (t.reason || 'ATR/fiyat eksik') + ').';
    }

    // ---- Karar kalitesi (Katman 2: Güven) ----
    const qBits = [];
    if (d.freshness && d.freshness.label) qBits.push(d.freshness.label);
    if (d.confidence && d.confidence.label) qBits.push(d.confidence.label);
    const STATUS_LABEL = { clean: 'sağlam', caution: 'dikkatli', blocked: 'riskli' };
    const quality = {
      status: d.status || null, // clean | caution | blocked
      statusLabel: d.status ? (STATUS_LABEL[d.status] || d.status) : null,
      score: d.score != null ? d.score : null,
      note: qBits.join(' · ') || 'Karar kalitesi verisi yok',
    };

    // ---- Rejim & uygunluk (raporların ana dersi) ----
    const reg = (asset.ind && asset.ind.regime) || a.regime || null;
    let regimeLabel = null, suitability = null;
    if (reg) {
      regimeLabel = reg.label + (reg.adx != null ? ' · ADX ' + reg.adx : '');
      if (reg.type === 'range') {
        suitability = 'Yatay rejim: kısa-vadede aşırı satımdan tepki (mean-reversion) mantıklı; trend takibi/breakout sermaye eritir.';
      } else if (reg.direction === 'up') {
        suitability = (reg.type === 'strong-trend' ? 'Güçlü yukarı trend' : 'Yukarı trend') + ': trend yönünde işlem/breakout uygun; dip alımına temkinli ol.';
      } else {
        suitability = (reg.type === 'strong-trend' ? 'Güçlü aşağı trend' : 'Aşağı trend') + ': kısa-vade long riskli; tepki beklemek veya nakitte kalmak mantıklı.';
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
   * Backtest sonucunu "ne zaman çalışır / ne zaman bozulur" diliyle açıklar.
   * @param {object} res - runBacktest çıktısı
   * @returns {object} { maxDrawdown, winRate, closedTrades, best, worst, beatBH, headlineTone, worksWhen, breaksWhen, note }
   */
  function explainBacktest(res) {
    if (!res) return null;
    const curve = res.equityCurve || [];
    const trades = res.trades || [];
    const sells = trades.filter(function (t) { return t.type === 'SELL'; });
    const buys = trades.filter(function (t) { return t.type === 'BUY'; });

    // Maksimum düşüş (sermaye eğrisi tepe-dip)
    let peak = -Infinity;
    let maxDD = 0;
    curve.forEach(function (c) {
      if (c.total > peak) peak = c.total;
      const dd = peak > 0 ? ((peak - c.total) / peak) * 100 : 0;
      if (dd > maxDD) maxDD = dd;
    });
    maxDD = Math.round(maxDD * 100) / 100;

    const wins = sells.filter(function (t) { return t.pnlPct > 0; });
    const winRate = sells.length ? Math.round((wins.length / sells.length) * 100) : 0;
    const best = sells.reduce(function (m, t) { return (m == null || t.pnlPct > m.pnlPct) ? t : m; }, null);
    const worst = sells.reduce(function (m, t) { return (m == null || t.pnlPct < m.pnlPct) ? t : m; }, null);
    const beatBH = res.strategyReturn >= res.bhReturn;

    let worksWhen;
    let breaksWhen;
    let headlineTone;

    if (!buys.length) {
      headlineTone = 'warn';
      worksWhen = 'Bu eşiklerde hiç alım sinyali oluşmadı — strateji test edilemedi.';
      breaksWhen = 'Alım eşiği (' + res.buyThreshold + ') bu varlık için fazla seçici. Eşiği düşürüp tekrar deneyin.';
    } else if (beatBH && winRate >= 50) {
      headlineTone = 'pos';
      worksWhen = 'Trend belirgin olduğunda iyi çalıştı: skor eşikleri zamanında sinyal verdi ve al-tut yaklaşımını geçti (%' + winRate + ' isabet).';
      breaksWhen = 'Yatay/testere piyasada sık giriş-çıkış yıpratır. En sert geri çekilme (max düşüş) %' + maxDD + ' — bu büyüklükteki dalgalanmaya hazır ol.';
    } else if (beatBH) {
      headlineTone = 'pos';
      worksWhen = 'Al-tut yaklaşımını geçti ama isabet düşük (%' + winRate + '); kazanç birkaç büyük işlemden geldi.';
      breaksWhen = 'İsabet düşük olduğu için sonuç şansa duyarlı. Max düşüş %' + maxDD + '. Farklı dönemlerde tekrar test edilmeli.';
    } else {
      headlineTone = 'neg';
      worksWhen = 'Bu varlık ve dönemde strateji al-tut’un gerisinde kaldı; erken çıkışlar yukarı hareketin bir kısmını kaçırdı.';
      breaksWhen = 'Güçlü tek-yönlü boğa trendinde skor-eşikli strateji genelde al-tut’u geçemez. Max düşüş %' + maxDD + '.';
    }

    return {
      maxDrawdown: maxDD,
      winRate: winRate,
      closedTrades: sells.length,
      best: best,
      worst: worst,
      beatBH: beatBH,
      headlineTone: headlineTone,
      worksWhen: worksWhen,
      breaksWhen: breaksWhen,
      note: 'Bu bir geçmişe-dönük simülasyondur; gelecek getiriyi garanti etmez. Farklı eşik ve piyasa rejimleriyle tekrar deneyin.',
    };
  }

  /**
   * Yönetici Özeti / Risk Panosu — tüm parçaları (piyasa rejimi, karar kalitesi,
   * çelişkiler, fırsatlar) tek risk seviyesi + sade hüküm + aksiyon listesine indirir.
   * Snapshot'taki HAZIR veriden hesaplar (anında, ek API çağrısı yok).
   */
  function buildExecutiveSummary(snapshot) {
    if (!snapshot) return null;
    const mr = snapshot.marketRegime || {};
    const all = [].concat(snapshot.us || [], snapshot.bist || [], snapshot.crypto || [])
      .filter(function (x) { return x && x.analysis && x.analysis.score != null; });
    if (!all.length && !mr.us && !mr.bist && !mr.crypto) return null;

    const dq = all.map(function (x) { return x.decision && x.decision.score; }).filter(function (v) { return typeof v === 'number'; });
    const avgQuality = dq.length ? Math.round(dq.reduce(function (a, b) { return a + b; }, 0) / dq.length) : null;
    const contradictionCount = all.reduce(function (n, x) { return n + ((x.decision && x.decision.contradictions) ? x.decision.contradictions.length : 0); }, 0);

    const environment = [];
    let riskPoints = 0;
    if (mr.us) {
      if (mr.us.type === 'panic') { riskPoints += 2; environment.push('ABD: panik volatilite'); }
      else if (mr.us.type === 'stress') { riskPoints += 1; environment.push('ABD: yüksek volatilite (stres)'); }
      else if (mr.us.type === 'calm') { environment.push('ABD: düşük volatilite (mean-reversion)'); }
      else environment.push('ABD: normal volatilite');
    }
    if (mr.bist) {
      if (mr.bist.type === 'cash') { riskPoints += 2; environment.push('BIST: 200g altı (nakit rejimi)'); }
      else environment.push('BIST: long rejim aktif');
    }
    if (mr.crypto) {
      if (mr.crypto.type === 'decoupled') environment.push('Kripto: Nasdaq kopuşu (tepki fırsatı)');
      else if (mr.crypto.type === 'coupled') environment.push('Kripto: makroya bağlı');
      else environment.push('Kripto: korelasyon karışık');
    }
    if (avgQuality != null && avgQuality < 60) riskPoints += 2;
    else if (avgQuality != null && avgQuality < 75) riskPoints += 1;
    if (contradictionCount >= 3) riskPoints += 1;

    const riskLevel = riskPoints >= 4 ? { label: 'Yüksek', tone: 'neg' }
      : riskPoints >= 2 ? { label: 'Orta', tone: 'warn' }
      : { label: 'Düşük', tone: 'pos' };

    const best = (snapshot.topPicks || [])[0] || null;

    const regimeActions = [];
    if (mr.bist && mr.bist.type === 'cash') regimeActions.push('BIST 200g ortalama altında — kısa-vade long\'dan kaçın; sadece likit büyüklerde tepki ya da nakit.');
    if (mr.us && (mr.us.type === 'stress' || mr.us.type === 'panic')) regimeActions.push('ABD volatilitesi yüksek — pozisyon küçült; mean-reversion yerine breakout/momentum.');
    else if (mr.us && mr.us.type === 'calm') regimeActions.push('ABD düşük volatilitede — RSI uçları/Bollinger ile mean-reversion uygun, trend takibi zor.');
    if (mr.crypto && mr.crypto.type === 'coupled') regimeActions.push('Kripto Nasdaq ile bağlı — bağımsız kripto sinyaline güvenme, makro risk-on/off izle.');
    else if (mr.crypto && mr.crypto.type === 'decoupled') regimeActions.push('Kripto Nasdaq\'tan koptu — geçici ayrışma; majörlerde tepki/yakınsama izlenebilir.');
    // En fazla 2 rejim aksiyonu + en iyi fırsat + (her zaman) dürüstlük notu.
    const honesty = 'Kısa-vade üç piyasada da maliyet-sonrası çoğu birey için negatif-toplamlı; az ama doğru işlem + sıkı stop.';
    const finalActions = regimeActions.slice(0, 2);
    if (best) finalActions.push('En yüksek puanlı fırsat: ' + best.market + ' ' + best.symbol + ' (' + best.label + ' · ' + best.score + ') — varlığın rejim/maliyet kartını oku.');
    finalActions.push(honesty);

    const headline = 'Piyasa ortamı ' + riskLevel.label.toLowerCase() + ' riskli'
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
