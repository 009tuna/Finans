// Action layer: deterministic dashboard action surfaces for browser and Node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansActionLayer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function pct(v) {
    if (v == null || isNaN(v)) return '-';
    const n = Math.round(v * 10) / 10;
    return (n > 0 ? '+' : '') + n + '%';
  }

  function money(v, currency) {
    if (v == null || isNaN(v)) return '-';
    const sym = currency === 'TRY' ? 'TL ' : currency === 'USD' || !currency ? '$' : currency + ' ';
    const abs = Math.abs(v);
    const digits = abs >= 100 ? 0 : abs >= 1 ? 2 : 4;
    return sym + Number(v).toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function allAssets(snapshot) {
    if (!snapshot) return [];
    return []
      .concat(snapshot.us || [])
      .concat(snapshot.bist || [])
      .concat(snapshot.crypto || [])
      .filter(function (x) { return x && x.analysis && typeof x.analysis.score === 'number'; });
  }

  function scoreDelta(asset) {
    const c = asset && asset.decision && asset.decision.confidence;
    if (c && typeof c.scoreDelta === 'number') return c.scoreDelta;
    if (c && typeof c.previousScore === 'number' && asset.analysis && typeof asset.analysis.score === 'number') {
      return asset.analysis.score - c.previousScore;
    }
    return null;
  }

  function buildDailyChangeDigest(snapshot) {
    const assets = allAssets(snapshot).map(function (x) {
      return {
        market: x.market,
        symbol: x.symbol,
        name: x.name || x.symbol,
        score: x.analysis.score,
        label: x.analysis.label,
        tone: x.analysis.tone,
        changePct: x.changePct,
        delta: scoreDelta(x),
      };
    }).filter(function (x) { return typeof x.delta === 'number' && x.delta !== 0; });

    const improving = assets.filter(function (x) { return x.delta > 0; }).sort(function (a, b) { return b.delta - a.delta; }).slice(0, 4);
    const weakening = assets.filter(function (x) { return x.delta < 0; }).sort(function (a, b) { return a.delta - b.delta; }).slice(0, 4);
    const leader = weakening[0] || improving[0] || null;
    const headline = leader
      ? (leader.delta < 0
        ? leader.symbol + ' sinyali ' + Math.abs(leader.delta) + ' puan zayifladi; bugun once risk degisimlerini oku.'
        : leader.symbol + ' sinyali +' + leader.delta + ' puan guclendi; teyit icin hacim ve rejimi kontrol et.')
      : 'Skor degisimleri sakin; ana karar katmani mevcut sinyalleri izliyor.';

    return { headline: headline, improving: improving, weakening: weakening };
  }

  function findAsset(data, market, symbol) {
    const list = data && data[market] ? data[market] : [];
    return list.find(function (x) { return x.symbol === symbol || (market === 'crypto' && x.id === symbol); }) || null;
  }

  function buildPortfolioActions(input) {
    const data = input && input.data;
    const portfolioData = input && input.portfolioData;
    const usdtry = (input && input.usdtry) || (data && data.fx && data.fx.usdtry) || 1;
    const rows = [];
    const totals = { us: 0, bist: 0, crypto: 0, allUsd: 0 };

    ['us', 'bist', 'crypto'].forEach(function (market) {
      const holdings = (portfolioData && portfolioData[market]) || [];
      holdings.forEach(function (h) {
        const asset = findAsset(data, market, h.symbol);
        if (!asset) return;
        const currency = market === 'bist' ? 'TRY' : 'USD';
        const valueLocal = (h.amount || 0) * (asset.price || 0);
        const valueUsd = currency === 'TRY' ? valueLocal / usdtry : valueLocal;
        const costLocal = (h.amount || 0) * (h.avgPrice || 0);
        const pnlPct = costLocal > 0 ? ((valueLocal - costLocal) / costLocal) * 100 : 0;
        totals[market] += valueUsd;
        totals.allUsd += valueUsd;
        rows.push({
          market: market,
          symbol: asset.symbol,
          name: asset.name || asset.symbol,
          valueUsd: valueUsd,
          weightPct: 0,
          pnlPct: pnlPct,
          score: asset.analysis ? asset.analysis.score : null,
          label: asset.analysis ? asset.analysis.label : null,
          tone: asset.analysis ? asset.analysis.tone : null,
          asset: asset,
        });
      });
    });

    rows.forEach(function (r) { r.weightPct = totals.allUsd > 0 ? (r.valueUsd / totals.allUsd) * 100 : 0; });

    const actions = [];
    rows.forEach(function (r) {
      if (r.score != null && (r.score < 40 || r.tone === 'sell' || r.tone === 'reduce')) {
        actions.push({
          kind: 'reduce',
          symbol: r.symbol,
          tone: 'neg',
          text: r.symbol + ': teknik skor ' + r.score + ' ve onerisi ' + r.label + '; pozisyonu azalt veya yeni ekleme yapma.',
        });
      } else if (r.weightPct > 35) {
        actions.push({
          kind: 'trim',
          symbol: r.symbol,
          tone: 'warn',
          text: r.symbol + ': portfoy agirligi %' + Math.round(r.weightPct) + '; tek varlik riski yuksek.',
        });
      } else if (r.score != null && r.score >= 60 && r.pnlPct < -5) {
        actions.push({
          kind: 'watch',
          symbol: r.symbol,
          tone: 'pos',
          text: r.symbol + ': zarar var ama skor guclu; panik satis yerine stop/tez kontrolu yap.',
        });
      }
    });

    const cryptoWeight = totals.allUsd > 0 ? (totals.crypto / totals.allUsd) * 100 : 0;
    if (cryptoWeight > 50) {
      actions.unshift({
        kind: 'rebalance',
        symbol: null,
        tone: 'warn',
        text: 'Kripto agirligi %' + Math.round(cryptoWeight) + '; portfoy soku dogrudan tek risk faktorune bagli.',
      });
    }

    if (!actions.length && rows.length) {
      actions.push({ kind: 'hold', symbol: null, tone: 'pos', text: 'Portfoyde acil aksiyon yok; mevcut stop ve veri takibi yeterli.' });
    }

    return {
      totalUsd: totals.allUsd,
      cryptoWeightPct: cryptoWeight,
      rows: rows,
      summary: rows.length
        ? 'Portfoyde ' + rows.length + ' varlik var; kripto ağırlığı %' + Math.round(cryptoWeight) + '.'
        : 'Portfoy bos; aksiyon uretmek icin en az bir varlik ekle.',
      actions: actions.slice(0, 5),
    };
  }

  function firstReason(asset, sentiment) {
    const reasons = (asset && asset.analysis && asset.analysis.reasons) || [];
    const r = reasons.find(function (x) { return x.sentiment === sentiment; });
    return r ? String(r.text).split(' — ')[0] : null;
  }

  function buildAssetThesis(asset, reportBase) {
    if (!asset || !asset.analysis) return null;
    const label = asset.analysis.label || 'IZLE';
    const tone = asset.analysis.tone || 'hold';
    const trade = asset.decision && asset.decision.trade;
    const pos = firstReason(asset, 'pos');
    const neg = firstReason(asset, 'neg');
    const verb = tone === 'strong-buy' || tone === 'buy' ? 'Alim tezi' : tone === 'hold' ? 'Bekle tezi' : 'Risk azaltma tezi';
    const thesis = verb + ': ' + (asset.symbol || '') + ' icin ana dayanak ' + (pos || asset.analysis.summary || 'teknik skor') + '.';
    const invalidation = trade && trade.available && trade.stop != null
      ? 'Tez ' + money(trade.stop, asset.currency) + ' stop altinda bozulur; bu seviyenin altinda karar tekrar okunmali.'
      : 'Tez bozulma seviyesi icin ATR/fiyat verisi eksik; teknik skor dususu ana sinyal kabul edilmeli.';
    const catalysts = [];
    const news = reportBase && reportBase.calendar && reportBase.calendar.companyNews;
    (news || []).forEach(function (n) {
      if (n && n.symbol === asset.symbol && n.headline) catalysts.push(n.headline + (n.source ? ' - ' + n.source : ''));
    });
    if (!catalysts.length && neg) catalysts.push('Negatif teyit: ' + neg + '.');
    if (!catalysts.length) catalysts.push('Yaklasan ozel katalizor yok; fiyat/hacim teyidi izlenmeli.');
    return { thesis: thesis, invalidation: invalidation, catalysts: catalysts.slice(0, 3) };
  }

  function buildReportTrust(base, ai) {
    if (!base) return null;
    const dataAsOf = base.dataAsOf || {};
    const econ = (base.calendar && base.calendar.economic) || [];
    const hasActual = econ.some(function (e) { return e.actual != null; });
    const hasForecast = econ.some(function (e) { return e.estimate != null && e.actual == null; });
    const items = [
      { label: 'Teknik veri', status: 'deterministic', text: 'Kural tabanli skorlar ve indikatörler; rapor tarihi ' + (base.date || '-') + '.' },
      { label: 'Piyasa kapanislari', status: 'timestamp', text: ['ABD ' + (dataAsOf.usAsOf || '-'), 'BIST ' + (dataAsOf.bistAsOf || '-'), 'Kripto ' + (dataAsOf.cryptoAsOf || '-')].join(' · ') },
      { label: 'Takvim verisi', status: hasForecast ? 'forecast' : (hasActual ? 'actual' : 'empty'), text: hasForecast ? 'Beklenti verileri var; aciklanmayan degerler tahmindir.' : 'Takvimde gerceklesen veri agirlikli.' },
      { label: 'AI katmanı', status: ai ? 'ai' : 'missing', text: ai ? 'Makro/haber yorumu AI tarafindan yazildi; teknik skor deterministik kalir.' : 'AI yorumu yok; rapor sadece kural tabanli.' },
    ];
    return { hasAi: !!ai, items: items };
  }

  function buildAlertRules(asset, context) {
    if (!asset) return [];
    const alerts = [];
    const trade = asset.decision && asset.decision.trade;
    if (trade && trade.available && trade.stop != null) {
      alerts.push({ tone: 'neg', trigger: asset.symbol + ' stop ' + money(trade.stop, asset.currency) + ' altina inerse', action: 'Tez bozuldu; pozisyonu azalt veya kapat.' });
    }
    const rsi = asset.ind && asset.ind.rsi;
    if (rsi != null) {
      if (rsi <= 35) alerts.push({ tone: 'warn', trigger: 'RSI 30-35 bolgesinden yukari donerse', action: 'Tepki alimi icin hacim teyidi ara.' });
      if (rsi >= 65) alerts.push({ tone: 'warn', trigger: 'RSI 65 ustunde kalir ve fiyat 52H tepesine yaklasirsa', action: 'Yeni girisi kovalamak yerine geri cekilme bekle.' });
    }
    const hist = asset.ind && asset.ind.macd && asset.ind.macd.histogram;
    if (hist != null && hist < 0) {
      alerts.push({ tone: 'warn', trigger: 'MACD histogram pozitife donerse', action: 'Zayiflayan momentum tezi yeniden degerlendir.' });
    }
    const weightPct = context && context.weightPct;
    if (weightPct != null && weightPct > 30) {
      alerts.push({ tone: 'neg', trigger: 'Portfoy agirligi %' + Math.round(weightPct) + ' uzerinde kalirsa', action: 'Tek varlik riskini azalt.' });
    }
    return alerts.slice(0, 4);
  }

  function buildPredictionScorecard(journal) {
    const predictions = (journal && journal.predictions) || [];
    const closedItems = predictions.filter(function (x) { return x.outcome && x.outcome !== 'open'; });
    const wins = closedItems.filter(function (x) { return x.outcome === 'target-hit' || x.outcome === 'expired-win'; }).length;
    
    let avgResultPct = 0;
    if (closedItems.length > 0) {
      let totalPct = 0;
      closedItems.forEach(function (x) { totalPct += (x.resultPct || 0); });
      avgResultPct = Math.round((totalPct / closedItems.length) * 10) / 10;
    }
    
    function getSubScorecard(source) {
      const filtered = predictions.filter(function (x) { return (x.source || 'user') === source; });
      const closed = filtered.filter(function (x) { return x.outcome && x.outcome !== 'open'; });
      const w = closed.filter(function (x) { return x.outcome === 'target-hit' || x.outcome === 'expired-win'; }).length;
      return {
        total: filtered.length,
        closed: closed.length,
        wins: w,
        winRate: closed.length ? Math.round((w / closed.length) * 100) : 0,
      };
    }

    // Last 5 closed predictions
    const last5Closed = closedItems.slice().sort(function (a, b) {
      const ad = a.resolvedAt || '';
      const bd = b.resolvedAt || '';
      return ad < bd ? 1 : (ad > bd ? -1 : 0);
    }).slice(0, 5).map(function (x) {
      return {
        symbol: x.symbol,
        market: x.market,
        outcome: x.outcome,
        resultPct: x.resultPct,
        resolvedAt: x.resolvedAt ? x.resolvedAt.slice(0, 10) : ''
      };
    });

    return {
      total: predictions.length,
      open: predictions.length - closedItems.length,
      closed: closedItems.length,
      wins: wins,
      losses: closedItems.length - wins,
      winRate: closedItems.length ? Math.round((wins / closedItems.length) * 100) : 0,
      avgResultPct: avgResultPct,
      last5Closed: last5Closed,
      bySource: {
        system: getSubScorecard('system'),
        user: getSubScorecard('user')
      }
    };
  }

  function calculatePosition(capital, riskPct, price, atr) {
    price = parseFloat(price);
    atr = parseFloat(atr);
    capital = parseFloat(capital) || 100000;
    riskPct = parseFloat(riskPct) || 2;

    if (isNaN(price) || isNaN(atr) || price <= 0 || atr <= 0) {
      return { available: false, reason: 'Fiyat veya ATR geçersiz' };
    }

    const digits = price >= 1000 ? 0 : price >= 1 ? 2 : 4;
    const risk = atr * 1.5;
    const entry = Math.round(price * 10 ** digits) / 10 ** digits;
    const stop = Math.round((price - risk) * 10 ** digits) / 10 ** digits;
    const target = Math.round((price + risk * 2) * 10 ** digits) / 10 ** digits;

    const riskAmount = capital * (riskPct / 100);
    const rawUnits = risk > 0 ? riskAmount / risk : null;
    const units = rawUnits == null ? null : rawUnits >= 1 ? Math.floor(rawUnits) : Math.round(rawUnits * 10000) / 10000;

    const positionAmount = units != null ? Math.round((units * entry) * 100) / 100 : 0;

    return {
      available: true,
      entry: entry,
      stop: stop,
      target: target,
      riskAmount: riskAmount,
      units: units,
      positionAmount: positionAmount
    };
  }

  return {
    buildDailyChangeDigest: buildDailyChangeDigest,
    buildPortfolioActions: buildPortfolioActions,
    buildAssetThesis: buildAssetThesis,
    buildReportTrust: buildReportTrust,
    buildAlertRules: buildAlertRules,
    buildPredictionScorecard: buildPredictionScorecard,
    calculatePosition: calculatePosition,
  };
});
