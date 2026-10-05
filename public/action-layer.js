// Action layer: deterministic dashboard action surfaces for browser and Node tests.
(function (root, factory) {
  var evidence = root && root.FinansPredictionEvidence;
  var insights = root && root.FinansInsights;
  if (typeof module === 'object' && module.exports) {
    try { evidence = require('./prediction-evidence'); } catch (_) { evidence = null; }
    try { insights = require('./insights'); } catch (_) { insights = null; }
  }
  if (typeof module === 'object' && module.exports) module.exports = factory(evidence, insights);
  else root.FinansActionLayer = factory(evidence, insights);
})(typeof self !== 'undefined' ? self : this, function (predictionEvidence, insights) {
  'use strict';

  function technicalSignalLabel(value) {
    return insights && insights.technicalSignalLabel ? insights.technicalSignalLabel(value) : 'Ölçülemedi';
  }

  function controlStatusLabel(status) {
    return insights && insights.controlStatusLabel ? insights.controlStatusLabel(status) : 'Kontrol durumu bilinmiyor';
  }

  function hasNoteText(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

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
    if (c && Number.isFinite(c.scoreDelta)) return c.scoreDelta;
    if (c && Number.isFinite(c.previousScore) && asset.analysis && Number.isFinite(asset.analysis.score)) {
      const delta = asset.analysis.score - c.previousScore;
      return Number.isFinite(delta) ? delta : null;
    }
    return null;
  }

  function buildDailyChangeDigest(snapshot) {
    const assets = allAssets(snapshot).filter(function (x) { return Number.isFinite(x.analysis.score); }).map(function (x) {
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
    });
    const comparisonCount = assets.filter(function (x) { return Number.isFinite(x.delta); }).length;
    const unchangedCount = assets.filter(function (x) { return x.delta === 0; }).length;
    const missingComparisonCount = assets.length - comparisonCount;
    const changed = assets.filter(function (x) { return Number.isFinite(x.delta) && x.delta !== 0; });

    const improving = changed.filter(function (x) { return x.delta > 0; }).sort(function (a, b) { return b.delta - a.delta; }).slice(0, 4);
    const weakening = changed.filter(function (x) { return x.delta < 0; }).sort(function (a, b) { return a.delta - b.delta; }).slice(0, 4);
    const leader = weakening[0] || improving[0] || null;
    const headline = leader
      ? (leader.delta < 0
        ? leader.symbol + ' sinyali önceki teknik kayda göre ' + Math.abs(leader.delta) + ' puan zayıfladı; risk değişimini inceleyin.'
        : leader.symbol + ' sinyali önceki teknik kayda göre +' + leader.delta + ' puan güçlendi; hacim ve piyasa rejimini kontrol edin.')
      : comparisonCount
        ? 'Karşılaştırılabilen ' + comparisonCount + ' varlığın teknik puanı önceki kayda göre değişmedi.'
        : 'Karşılaştırılabilir önceki teknik kayıt yok. Sinyal değişimi ölçülemedi.';

    return { headline: headline, improving: improving, weakening: weakening, comparisonCount: comparisonCount, unchangedCount: unchangedCount, changedCount: changed.length, missingComparisonCount: missingComparisonCount, totalCount: assets.length };
  }

  function findAsset(data, market, symbol) {
    const list = data && data[market] ? data[market] : [];
    return list.find(function (x) { return x.symbol === symbol || (market === 'crypto' && x.id === symbol); }) || null;
  }

  function portfolioSourceUnavailable(source) {
    if (!source) return false;
    const status = String(source.status || '').toLowerCase();
    const freshness = source.freshness && String(source.freshness.status || '').toLowerCase();
    return !!(source.__error || source.error || source.stale || source.isStale ||
      ['stale', 'unavailable', 'error', 'failed', 'unknown'].indexOf(status) >= 0 ||
      ['stale', 'unavailable', 'error', 'unknown'].indexOf(freshness) >= 0);
  }

  function buildPortfolioValuation(input) {
    const data = input && input.data;
    const portfolioData = input && input.portfolioData;
    const markets = ['us', 'bist', 'crypto'];
    const portfolioKnown = !!portfolioData && typeof portfolioData === 'object' && markets.some(function (market) { return Array.isArray(portfolioData[market]); });
    const finite = function (value) { return typeof value === 'number' && Number.isFinite(value); };
    const calculated = function (value) { return finite(value) ? value : null; };
    const sum = function (values) {
      if (values.some(function (value) { return value == null; })) return null;
      return calculated(values.reduce(function (total, value) { return total + value; }, 0));
    };
    const fx = data && data.fx;
    const pair = fx && fx.rates && fx.rates['USD/TRY'];
    const quoteTime = pair && pair.quoteTime;
    const datedFx = typeof quoteTime === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(quoteTime) && Number.isFinite(Date.parse(quoteTime));
    // A bare number or caller override cannot replace a dated, identified FX quote.
    const validFx = !!pair && finite(pair.price) && pair.price > 0 && pair.base === 'USD' && pair.quote === 'TRY' && datedFx && !portfolioSourceUnavailable(fx) && !portfolioSourceUnavailable(pair);
    const fxRate = validFx ? pair.price : null;
    const convert = function (value, from, to) {
      if (value == null) return null;
      if (from === to) return value;
      if (fxRate == null) return null;
      return calculated(to === 'USD' ? value / fxRate : value * fxRate);
    };
    const rows = [];
    markets.forEach(function (market) {
      const holdings = portfolioKnown && Array.isArray(portfolioData[market]) ? portfolioData[market] : [];
      holdings.forEach(function (holding) {
        const h = holding || {};
        const list = data && Array.isArray(data[market]) ? data[market] : [];
        const asset = list.find(function (item) { return item && (item.symbol === h.symbol || (market === 'crypto' && item.id === h.symbol)); }) || null;
        const currency = market === 'bist' ? 'TRY' : 'USD';
        const amount = finite(h.amount) && h.amount >= 0 ? h.amount : null;
        const avgPrice = finite(h.avgPrice) && h.avgPrice >= 0 ? h.avgPrice : null;
        const price = asset && finite(asset.price) && asset.price > 0 && !portfolioSourceUnavailable(asset) && !(asset.decision && portfolioSourceUnavailable({ freshness: asset.decision.freshness })) ? asset.price : null;
        const value = amount != null && price != null ? calculated(amount * price) : null;
        const cost = amount != null && avgPrice != null ? calculated(amount * avgPrice) : null;
        const pnl = value != null && cost != null ? calculated(value - cost) : null;
        rows.push({
          market: market,
          symbol: asset ? asset.symbol : h.symbol,
          name: asset ? asset.name || asset.symbol : h.symbol,
          currency: currency,
          amount: amount,
          avgPrice: avgPrice,
          price: price,
          value: value,
          cost: cost,
          pnl: pnl,
          valueLocal: value,
          costLocal: cost,
          pnlLocal: pnl,
          pnlPct: pnl != null && cost > 0 ? calculated(pnl / cost * 100) : null,
          valueUsd: convert(value, currency, 'USD'),
          valueTry: convert(value, currency, 'TRY'),
          costUsd: convert(cost, currency, 'USD'),
          costTry: convert(cost, currency, 'TRY'),
          pnlUsd: convert(pnl, currency, 'USD'),
          pnlTry: convert(pnl, currency, 'TRY'),
          weightPct: null,
          unpriced: value == null,
          score: asset && asset.analysis && finite(asset.analysis.score) ? asset.analysis.score : null,
          label: asset && asset.analysis ? asset.analysis.label : null,
          tone: asset && asset.analysis ? asset.analysis.tone : null,
          asset: asset,
          holding: holding,
        });
      });
    });
    const localTotals = {};
    ['USD', 'TRY'].forEach(function (currency) {
      const localRows = rows.filter(function (row) { return row.currency === currency; });
      localTotals[currency] = {
        value: portfolioKnown ? sum(localRows.map(function (row) { return row.value; })) : null,
        cost: portfolioKnown ? sum(localRows.map(function (row) { return row.cost; })) : null,
        pnl: portfolioKnown ? sum(localRows.map(function (row) { return row.pnl; })) : null,
      };
    });
    const total = function (property) { return portfolioKnown ? sum(rows.map(function (row) { return row[property]; })) : null; };
    const totalsUsd = total('valueUsd');
    const totalsTry = total('valueTry');
    const currencies = ['USD', 'TRY'].filter(function (currency) { return rows.some(function (row) { return row.currency === currency; }); });
    const missingPriceCount = rows.filter(function (row) { return row.unpriced; }).length;
    const missingCostCount = rows.filter(function (row) { return row.cost == null; }).length;
    const missingFx = rows.length > 0 && fxRate == null;
    const weightCurrency = totalsUsd != null ? 'USD' : currencies.length === 1 && totalsTry != null ? 'TRY' : null;
    const weightTotal = weightCurrency === 'USD' ? totalsUsd : weightCurrency === 'TRY' ? totalsTry : null;
    const weightsAvailable = rows.length > 0 && missingPriceCount === 0 && weightTotal != null && weightTotal > 0;
    if (weightsAvailable) rows.forEach(function (row) { row.weightPct = (weightCurrency === 'USD' ? row.valueUsd : row.valueTry) / weightTotal * 100; });
    const marketWeights = { us: null, bist: null, crypto: null };
    if (weightsAvailable) markets.forEach(function (market) { marketWeights[market] = sum(rows.filter(function (row) { return row.market === market; }).map(function (row) { return row.weightPct; })); });
    const status = !portfolioKnown ? 'unavailable' : !rows.length ? 'empty' : missingPriceCount === rows.length ? 'unavailable' : missingPriceCount || missingCostCount || totalsUsd == null || totalsTry == null ? 'partial' : 'complete';
    return {
      rows: rows,
      totalsUsd: totalsUsd,
      totalsTry: totalsTry,
      costUsd: total('costUsd'),
      costTry: total('costTry'),
      pnlUsd: total('pnlUsd'),
      pnlTry: total('pnlTry'),
      localTotals: localTotals,
      fxRate: fxRate,
      fxQuoteTime: validFx ? quoteTime : null,
      missingFx: missingFx,
      missingPriceCount: missingPriceCount,
      missingCostCount: missingCostCount,
      missingPortfolio: !portfolioKnown,
      weightsAvailable: weightsAvailable,
      weightCurrency: weightsAvailable ? weightCurrency : null,
      marketWeights: marketWeights,
      coverage: { totalCount: portfolioKnown ? rows.length : null, pricedCount: portfolioKnown ? rows.length - missingPriceCount : null, costedCount: portfolioKnown ? rows.length - missingCostCount : null, priceRatio: rows.length ? (rows.length - missingPriceCount) / rows.length : null },
      status: status,
    };
  }

  function buildPortfolioActions(input) {
    const valuation = buildPortfolioValuation(input);
    const rows = valuation.rows;

    const actions = [];
    rows.forEach(function (r) {
      if (r.score != null && (r.score < 40 || r.tone === 'sell' || r.tone === 'reduce')) {
        actions.push({
          kind: 'reduce',
          symbol: r.symbol,
          tone: 'neg',
          text: r.symbol + ': teknik puan ' + r.score + ', teknik sinyal ' + technicalSignalLabel(r.label).toLowerCase() + '. Ağırlık ve stop planını yeniden incele.',
        });
      } else if (r.weightPct > 35) {
        actions.push({
          kind: 'trim',
          symbol: r.symbol,
          tone: 'warn',
          text: r.symbol + ': ağırlığı %' + Math.round(r.weightPct) + '. Tek varlık için %35 sınırı aşılıyor.',
        });
      } else if (r.score != null && r.score >= 60 && r.pnlPct != null && r.pnlPct < -5) {
        actions.push({
          kind: 'watch',
          symbol: r.symbol,
          tone: 'pos',
          text: r.symbol + ': maliyete göre zarar %5 üstünde; teknik puan ' + r.score + '. Stop ve tez koşullarını kontrol et.',
        });
      }
    });

    const cryptoWeight = valuation.marketWeights.crypto;
    if (cryptoWeight > 50) {
      actions.unshift({
        kind: 'rebalance',
        symbol: null,
        tone: 'warn',
        text: 'Kripto ağırlığı %' + Math.round(cryptoWeight) + '; %50 sınırı aşılıyor. Piyasa yoğunlaşmasını incele.',
      });
    }

    const riskAvailable = valuation.weightsAvailable && valuation.totalsUsd != null;
    if (!riskAvailable && (rows.length || valuation.missingPortfolio)) {
      actions.unshift({ kind: 'data-gap', symbol: null, tone: 'warn', text: 'Portföyün tam risk hesabı yapılamadı; eksik fiyat veya kur kaynağını doğrula.' });
    }
    if (!actions.length && rows.length && riskAvailable) {
      actions.push({ kind: 'hold', symbol: null, tone: 'pos', text: 'Mevcut yoğunlaşma ve teknik puan kurallarında ek uyarı yok. Stop ve tez koşullarını izle.' });
    }

    return {
      totalUsd: valuation.totalsUsd,
      totalTry: valuation.totalsTry,
      cryptoWeightPct: cryptoWeight,
      rows: rows,
      valuation: valuation,
      riskAvailable: riskAvailable,
      summary: !riskAvailable && (rows.length || valuation.missingPortfolio)
        ? 'Portföyün tam risk hesabı yapılamadı; eksik fiyat veya kur verisi var.'
        : rows.length
          ? 'Portföyde ' + rows.length + ' varlık var; kripto ağırlığı %' + Math.round(cryptoWeight) + '.'
          : 'Portföy boş; aksiyon üretmek için en az bir varlık ekle.',
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
    const tone = asset.analysis.tone || 'hold';
    const trade = activeLongPlan(asset);
    const pos = firstReason(asset, 'pos');
    const neg = firstReason(asset, 'neg');
    const verb = tone === 'strong-buy' || tone === 'buy' ? 'Olumlu teknik görünüm taslağı' : tone === 'hold' ? 'Karışık teknik görünüm taslağı' : 'Zayıf teknik görünüm taslağı';
    const thesis = verb + ': ' + (asset.symbol || '') + ' için ana dayanak ' + (pos || asset.analysis.summary || 'teknik skor') + '.';
    const invalidation = trade && trade.stop != null
      ? 'Teknik planın stop seviyesi ' + money(trade.stop, trade.currency || asset.currency) + '; bu eşik ihlal edilirse görüş yeniden incelenmeli.'
      : 'Aktif teknik giriş planı yok; giriş ve geçersiz kılma eşiği henüz tanımlı değil.';
    const catalysts = [];
    const news = reportBase && reportBase.calendar && reportBase.calendar.companyNews;
    (news || []).forEach(function (n) {
      if (n && n.symbol === asset.symbol && n.headline) catalysts.push(n.headline + (n.source ? ' - ' + n.source : ''));
    });
    if (neg) catalysts.push('Karşı bulgu: ' + neg + '.');
    if (!catalysts.length) catalysts.push('Bu veri kesitinde kaynaklı özel bir gündem kaydı yok.');
    return { thesis: thesis, invalidation: invalidation, catalysts: catalysts.slice(0, 3) };
  }

  function isBuyRecommendation(asset) {
    const a = asset && asset.analysis ? asset.analysis : {};
    return a.tone === 'strong-buy' || a.tone === 'buy' || a.label === 'GUCLU AL' || a.label === 'AL';
  }

  function activeLongPlan(asset) {
    const d = asset && asset.decision ? asset.decision : {};
    if(d.structuralRecord && ['closed','missed-entry','expired-entry'].includes(d.structuralRecord.execution?.state)) return null;
    if (d.activeSignal && d.activeSignal.available) return d.activeSignal;
    if (isBuyRecommendation(asset) && d.trade && d.trade.available) return d.trade;
    return null;
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
      { label: 'Takvim verisi', status: hasForecast ? 'forecast' : (hasActual ? 'actual' : 'empty'), text: hasForecast ? 'Beklenti verileri var; aciklanmayan degerler tahmindir.' : hasActual ? 'Takvimde gerceklesen veriler var.' : 'Ekonomik takvim verisi yok; kapsam dogrulanamadi.' },
      { label: 'Yapay zeka katmani', status: ai ? 'ai' : 'missing', text: ai ? 'Makro/haber yorumu yapay zeka tarafindan yazildi; teknik skor deterministik kalir.' : 'Yapay zeka yorumu yok; rapor sadece kural tabanli.' },
    ];
    return { hasAi: !!ai, items: items };
  }

  function buildAlertRules(asset, context) {
    if (!asset) return [];
    const alerts = [];
    const trade = activeLongPlan(asset);
    if (trade && trade.stop != null) {
      alerts.push({ tone: 'neg', trigger: asset.symbol + ' stop ' + money(trade.stop, asset.currency) + ' altina inerse', action: 'Eşiğin ihlalini fiyat kaynağından doğrula; tezi geçersiz kılan kayıtlı koşulu ve pozisyon riskini yeniden incele.' });
    }
    const rsi = asset.ind && asset.ind.rsi;
    if (rsi != null) {
      if (rsi <= 35) alerts.push({ tone: 'warn', trigger: 'RSI 30-35 bolgesinden yukari donerse', action: 'Momentum değişimini fiyat ve hacimle birlikte incele; tek başına dönüş teyidi sayma.' });
      if (rsi >= 65) alerts.push({ tone: 'warn', trigger: 'RSI 65 ustunde kalir ve fiyat 52H tepesine yaklasirsa', action: 'Tepeye uzaklığı ve mevcut hacmi kontrol et; giriş varsayımını yeniden incele.' });
    }
    const hist = asset.ind && asset.ind.macd && asset.ind.macd.histogram;
    if (hist != null && hist < 0) {
      alerts.push({ tone: 'warn', trigger: 'MACD histogram pozitife donerse', action: 'Momentum değişimini fiyat ve hacimle karşılaştır; teknik görüşü yeniden değerlendir.' });
    }
    const weightPct = context && context.weightPct;
    if (weightPct != null && weightPct > 30) {
      alerts.push({ tone: 'neg', trigger: 'Portfoy agirligi %' + Math.round(weightPct) + ' uzerinde kalirsa', action: 'Hesaplanan ağırlığı risk bütçen ve diğer pozisyonlarla karşılaştır; yoğunlaşma sınırını yeniden değerlendir.' });
    }
    return alerts.slice(0, 4);
  }

  function buildPredictionScorecard(journal) {
    const predictions = (journal && journal.predictions) || [];
    const closedItems = predictions.filter(function (x) { return x.outcome && x.outcome !== 'open'; });
    function knownWin(x) { return x.outcome === 'target-hit' || x.outcome === 'expired-win'; }
    function knownLoss(x) { return x.outcome === 'stop-hit' || x.outcome === 'expired-loss'; }
    const wins = closedItems.filter(function (x) { return x.outcomeEvidence !== 'ambiguous_bar' && knownWin(x); }).length;
    const losses = closedItems.filter(function (x) { return x.outcomeEvidence !== 'ambiguous_bar' && knownLoss(x); }).length;
    const ambiguous = closedItems.filter(function (x) { return x.outcomeEvidence === 'ambiguous_bar'; }).length;
    const decisiveCount = wins + losses;
    const resultValues = closedItems.filter(function (x) { return x.outcomeEvidence !== 'ambiguous_bar' && (knownWin(x) || knownLoss(x)); })
      .map(function (x) { return x.resultPct; }).filter(function (x) { return typeof x === 'number' && isFinite(x); });
    const avgResultPct = resultValues.length
      ? Math.round((resultValues.reduce(function (sum, n) { return sum + n; }, 0) / resultValues.length) * 10) / 10
      : null;
    
    function getSubScorecard(source) {
      const filtered = predictions.filter(function (x) { return (x.source || 'user') === source; });
      const closed = filtered.filter(function (x) { return x.outcome && x.outcome !== 'open'; });
      const w = closed.filter(function (x) { return x.outcomeEvidence !== 'ambiguous_bar' && knownWin(x); }).length;
      const l = closed.filter(function (x) { return x.outcomeEvidence !== 'ambiguous_bar' && knownLoss(x); }).length;
      const ambiguousCount = closed.filter(function (x) { return x.outcomeEvidence === 'ambiguous_bar'; }).length;
      const denominator = w + l;
      return {
        total: filtered.length,
        closed: closed.length,
        wins: w,
        losses: l,
        decisive: denominator,
        ambiguous: ambiguousCount,
        unscored: closed.length - denominator - ambiguousCount,
        winRate: denominator ? Math.round((w / denominator) * 100) : null,
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
        outcomeEvidence: x.outcomeEvidence || null,
        resultPct: x.resultPct,
        resolvedAt: x.resolvedAt ? x.resolvedAt.slice(0, 10) : ''
      };
    });

    return {
      total: predictions.length,
      open: predictions.length - closedItems.length,
      closed: closedItems.length,
      wins: wins,
      losses: losses,
      decisive: decisiveCount,
      ambiguous: ambiguous,
      unscored: closedItems.length - decisiveCount - ambiguous,
      winRate: decisiveCount ? Math.round((wins / decisiveCount) * 100) : null,
      avgResultPct: avgResultPct,
      resultSampleSize: resultValues.length,
      last5Closed: last5Closed,
      bySource: {
        system: getSubScorecard('system'),
        user: getSubScorecard('user')
      }
    };
  }

  // Cohorts are an additive metadata layer. The legacy scorecard above intentionally
  // keeps its historical contract and arithmetic for old reports/tests.
  function buildPredictionCohorts(journal, nowIso) {
    if (!predictionEvidence || typeof predictionEvidence.group !== 'function') {
      return { unavailable:true, groups:[], counts:{}, reasons:{classifier_unavailable:1} };
    }
    const result = predictionEvidence.group((journal && journal.predictions) || [], nowIso);
    result.groups.forEach(function (group) { group.scorecard = buildPredictionScorecard({predictions:group.items}); });
    return result;
  }

  function calculatePosition(capital, riskPct, price, atr) {
    const positiveNumber = function (value) { return typeof value === 'number' && Number.isFinite(value) && value > 0; };
    if (!positiveNumber(capital) || !positiveNumber(riskPct) || riskPct > 100 || !positiveNumber(price) || !positiveNumber(atr)) {
      return { available: false, reason: 'Sermaye, fiyat ve ATR pozitif sayılar; risk oranı %0 üstü ve en fazla %100 olmalıdır' };
    }
    const risk = atr * 1.5;
    if (!positiveNumber(risk) || !(price - risk > 0)) {
      return { available: false, reason: 'ATR mesafesi pozitif bir stop üretmiyor; stop giriş fiyatının altında ve sıfırdan büyük olmalıdır' };
    }
    const digits = Math.min(12, Math.max(2, Math.ceil(-Math.log10(price)) + 2, Math.ceil(-Math.log10(risk)) + 2));
    const entry = Number(price.toFixed(digits));
    const stop = Number((price - risk).toFixed(digits));
    const target = Number((price + risk * 2).toFixed(digits));
    const riskPerUnit = entry - stop;
    if (![entry, stop, target, riskPerUnit].every(positiveNumber) || stop >= entry || target <= entry) {
      return { available: false, reason: 'Fiyat, stop veya ATR mesafesi desteklenen 12 ondalık basamakta geçerli ayrı seviyeler üretmiyor' };
    }
    const riskAmount = capital * (riskPct / 100);
    const maxUnitsByRisk = riskAmount / riskPerUnit;
    const maxUnitsByCapital = capital / entry;
    if (![riskAmount, maxUnitsByRisk, maxUnitsByCapital].every(positiveNumber)) {
      return { available: false, reason: 'Risk bütçesi veya adet sayısal hesaplama sınırını aşıyor' };
    }
    const rawUnits = Math.min(maxUnitsByRisk, maxUnitsByCapital);
    const quantityDecimals = rawUnits >= 1 ? 0 : 8;
    const quantityScale = 10 ** quantityDecimals;
    const constraints = {
      quantityDecimals: quantityDecimals,
      fractionalQuantity: quantityDecimals > 0,
      maxUnitsByRisk: maxUnitsByRisk,
      maxUnitsByCapital: maxUnitsByCapital,
      riskPerUnit: riskPerUnit,
      leverageAllowed: false
    };
    let units = Math.floor(rawUnits * quantityScale) / quantityScale;
    // Kayan nokta çarpımı sınırı aşarsa bir temsil edilebilir adet adımı daha azalt.
    for (let adjustment = 0; adjustment < 4 && (units * entry > capital || units * riskPerUnit > riskAmount); adjustment++) {
      const step = Math.max(1 / quantityScale, units * Number.EPSILON * 2);
      units = Math.max(0, Math.floor((units - step) * quantityScale) / quantityScale);
    }
    const positionAmount = units * entry;
    const actualRiskAmount = units * riskPerUnit;
    if (![units, positionAmount, actualRiskAmount].every(positiveNumber) || positionAmount > capital || actualRiskAmount > riskAmount) {
      return { available: false, reason: 'Bütçe desteklenen en küçük 0,00000001 adedi karşılamıyor veya adet sınırı doğrulanamadı', constraints: constraints };
    }
    return {
      available: true, entry: entry, stop: stop, target: target,
      riskAmount: riskAmount, actualRiskAmount: actualRiskAmount,
      units: units, positionAmount: positionAmount,
      capitalLimited: maxUnitsByCapital < maxUnitsByRisk,
      priceDecimals: digits, constraints: constraints
    };
  }

  function marketName(market) {
    return market === 'us' ? 'ABD' : market === 'bist' ? 'BIST' : market === 'crypto' ? 'Kripto' : String(market || '').toUpperCase();
  }

  function assetsByMarket(snapshot) {
    const out = [];
    ['us', 'bist', 'crypto'].forEach(function (market) {
      ((snapshot && snapshot[market]) || []).forEach(function (asset) {
        if (!asset || !asset.analysis || typeof asset.analysis.score !== 'number') return;
        out.push(Object.assign({ market: market }, asset));
      });
    });
    return out;
  }

  function journalKey(asset) {
    return String(asset && asset.market || '').toLowerCase() + ':' + String(asset && asset.symbol || '').toUpperCase();
  }

  function learningLabel(label) {
    return String(label || '').trim().toUpperCase().replace(/\s+/g, '_');
  }

  function scoreBucket(score) {
    const s = Number(score);
    if (!isFinite(s)) return 'unknown';
    if (s <= 29) return '0-29';
    if (s <= 44) return '30-44';
    if (s <= 59) return '45-59';
    if (s <= 69) return '60-69';
    if (s <= 79) return '70-79';
    return '80-100';
  }

  function learningRuleSpecificity(rule) {
    const scope = rule && rule.scope ? rule.scope : {};
    return (scope.market ? 1 : 0) + (scope.label ? 1 : 0) + (scope.scoreBucket ? 1 : 0);
  }

  function isLearningRuleExpired(rule, nowIso) {
    if (!rule || !rule.expiresAt) return false;
    return new Date(rule.expiresAt).getTime() <= new Date(nowIso || Date.now()).getTime();
  }

  function learningRuleMatchesAsset(rule, asset) {
    if (!rule || !asset || !asset.analysis) return false;
    const scope = rule.scope || {};
    const market = String(asset.market || '').toLowerCase();
    const label = learningLabel(asset.analysis.label);
    const bucket = scoreBucket(asset.analysis.score);
    if (scope.market && String(scope.market).toLowerCase() !== market) return false;
    if (scope.label && learningLabel(scope.label) !== label) return false;
    if (scope.scoreBucket && scope.scoreBucket !== bucket) return false;
    return true;
  }

  function activeLearningRules(reportBase) {
    // There is no validated rule activation workflow in this release.
    return [];
  }

  function buildDecisionLearningPanel(reportBase) {
    const learning = reportBase && reportBase.decisionLearning;
    if (!learning) {
      return {
        empty: true,
        summary: 'Karar ogrenme verisi henuz uretilmedi.',
        metrics: [],
        lessons: [],
        rules: [],
        reviewQueue: [],
      };
    }
    const rules = activeLearningRules(reportBase).slice(0, 4).map(function (rule) {
      const scope = rule.scope || {};
      return {
        id: rule.id,
        scopeLabel: [marketName(scope.market), scope.label, scope.scoreBucket].filter(Boolean).join(' / '),
        adjustment: rule.adjustment,
        confidence: rule.confidence,
        sampleSize: rule.sampleSize,
        winRate: rule.winRate,
        reason: rule.reason,
      };
    });
    const modern = learning.evidenceVersion === 'technical-learning-v2';
    const proposals = modern ? (learning.learningRules || []).filter(function (rule) {
      return rule.activation === 'proposal_only' && rule.validationStatus === 'chronological_validation_required';
    }).map(function(rule) { return Object.assign({}, rule, {scopeLabel:[marketName(rule.scope && rule.scope.market), rule.scope && rule.scope.label, rule.scope && rule.scope.scoreBucket].filter(Boolean).join(' / ')}); }) : [];
    return {
      empty: false,
      summary: modern ? 'Örüntü önerileri ayrı bir ileri dönem örnekleminde doğrulanmadan puanı değiştirmez.' : 'Bu rapor eski öğrenme yöntemini kullanıyor. Çıkarımları arşiv bağlamıdır; etkin kural veya ölçülmüş başarı sayılmaz.',
      metrics: [
        { label: 'İncelenen kayıt', value: Number.isSafeInteger(learning.totalAudits) && learning.totalAudits >= 0 ? learning.totalAudits : 'Doğrulanmadı' },
        { label: 'Ölçüme uygun sistem kaydı', value: modern && Number.isSafeInteger(learning.systemAudits) && learning.systemAudits >= 0 ? learning.systemAudits : 'Doğrulanmadı' },
        { label: 'Örüntü önerisi', value: proposals.length },
        { label: 'Aktif kural', value: 0 },
      ],
      lessons: modern ? (learning.recentLessons || []).slice(0, 4) : [],
      rules: rules,
      reviewQueue: modern ? (learning.reviewQueue || []).slice(0, 4) : [],
      activation: learning.activation || 'proposal_only',
      validationStatus: learning.validationStatus || 'chronological_validation_required',
      proposalRules: proposals.slice(0, 4),
      archivedRules: modern ? [] : (learning.learningRules || []),
      archivedLessons: modern ? learning.archivedLessons || [] : learning.recentLessons || [],
      excludedCount: modern ? (learning.excludedAudits || []).length : learning.totalAudits || 0,
    };
  }

  function buildAssetLearningSnippet(asset, reportBase) {
    const learning = reportBase && reportBase.decisionLearning;
    if (!learning || !asset) return null;
    if (learning.evidenceVersion !== 'technical-learning-v2') return {
      kind:'archive', adjustment:0, sampleSize:null,
      title:'Eski öğrenme raporu', detail:'Bu raporun çıkarımları sürüm ve ölçüm kanıtıyla doğrulanmadı; puanı değiştirmez.'
    };
    const rules = activeLearningRules(reportBase)
      .filter(function (rule) { return learningRuleMatchesAsset(rule, asset); });
    const rule = rules[0] || null;
    if (rule) {
      return {
        kind: 'rule',
        adjustment: rule.adjustment,
        confidence: rule.confidence,
        sampleSize: rule.sampleSize,
        title: rule.adjustment > 0 ? 'Gecmis benzer kararlar destekliyor' : 'Gecmis benzer kararlar temkin istiyor',
        detail: rule.reason,
      };
    }
    const key = journalKey(asset);
    const lesson = (learning.recentLessons || []).find(function (x) {
      return String(x.market || '').toLowerCase() + ':' + String(x.symbol || '').toUpperCase() === key;
    });
    if (!lesson) return null;
    return {
      kind: 'lesson',
      adjustment: 0,
      confidence: lesson.confidence,
      sampleSize: 1,
      title: 'Bu varliktan kayitli ders var',
      detail: lesson.lesson,
    };
  }

  function decisionStatus(asset) {
    return asset && asset.decision && asset.decision.status ? asset.decision.status : 'unknown';
  }

  function hasOpenPrediction(journal, asset) {
    const predictions = (journal && journal.predictions) || [];
    return predictions.some(function (p) {
      return p.outcome === 'open' &&
        String(p.market || '').toLowerCase() === String(asset.market || '').toLowerCase() &&
        String(p.symbol || '').toUpperCase() === String(asset.symbol || '').toUpperCase();
    });
  }

  function classifyIdea(asset, journal) {
    const score = asset.analysis.score;
    const tone = asset.analysis.tone || 'hold';
    const status = decisionStatus(asset);
    const note = journal && journal.notes ? journal.notes[journalKey(asset)] : null;
    const openPrediction = hasOpenPrediction(journal, asset);
    const hasThesis = !!(note && (hasNoteText(note.thesis) || hasNoteText(note.invalidation)));
    const topRisk = asset.ind && asset.ind.pos52 != null && asset.ind.pos52 >= 0.9 && asset.ind.macd && asset.ind.macd.histogram < 0;

    if (score < 35 || tone === 'sell') {
      return {
        bucket: 'reject',
        reason: 'Skor zayif veya satis tonunda; sinyal toparlanmadan arastirma adayi degil.',
        nextWorkflow: 'reject / wait for repair',
      };
    }
    if (score >= 62 && !topRisk && status !== 'blocked') {
      return {
        bucket: 'advance',
        reason: 'Teknik puan ve veri/sinyal kontrolü daha derin araştırmayı destekliyor; araştırmanın tamamlandığını göstermez.',
        nextWorkflow: hasThesis ? 'thesis tracker -> catalyst calendar' : 'thesis tracker -> company tearsheet',
      };
    }
    if (score >= 60 && topRisk) {
      return {
        bucket: 'gated',
        reason: 'Sinyal guclu ama kurulum gec safhada veya teyit eksik.',
        nextWorkflow: 'valuation / expectations gate',
      };
    }
    if (openPrediction) {
      return {
        bucket: 'watchlist',
        reason: 'Acik tahmin var; hedef, stop veya vade kanitini bekle.',
        nextWorkflow: 'prediction calibration',
      };
    }
    return {
      bucket: 'watchlist',
      reason: hasThesis ? 'Tez var ama skor derin arastirmaya gecmek icin yeterince guclu degil.' : 'Sadece tarama sinyali var; islemden once tez kur.',
      nextWorkflow: 'watchlist / thesis draft',
    };
  }

  function buildIdeaFunnel(snapshot, journal) {
    const buckets = { advance: [], watchlist: [], gated: [], unproven: [], reject: [] };
    assetsByMarket(snapshot).forEach(function (asset) {
      const c = classifyIdea(asset, journal || {});
      const row = {
        market: asset.market,
        marketLabel: marketName(asset.market),
        symbol: asset.symbol,
        name: asset.name || asset.symbol,
        score: asset.analysis.score,
        label: asset.analysis.label,
        tone: asset.analysis.tone,
        bucket: c.bucket,
        reason: c.reason,
        nextWorkflow: c.nextWorkflow,
        recommendation: false,
      };
      buckets[c.bucket].push(row);
    });
    Object.keys(buckets).forEach(function (key) {
      buckets[key].sort(function (a, b) { return b.score - a.score; });
    });
    return {
      headline: buckets.advance.length
        ? buckets.advance.length + ' fikir adayi islem kararindan once daha derin calisma istiyor.'
        : 'Hemen arastirilacak aday yok; izleme ve red kovalarini kullan.',
      buckets: buckets,
      counts: Object.keys(buckets).reduce(function (acc, key) {
        acc[key] = buckets[key].length;
        return acc;
      }, {}),
    };
  }

  function assetLookup(snapshot) {
    const map = {};
    assetsByMarket(snapshot).forEach(function (asset) {
      map[String(asset.symbol || '').toUpperCase()] = asset;
      map[String(asset.market || '').toLowerCase() + ':' + String(asset.symbol || '').toUpperCase()] = asset;
    });
    return map;
  }

  function pressureForEvent(event, asset) {
    if (event.importance === 'high') return 'high';
    if (asset && asset.analysis && asset.analysis.score >= 62) return 'high';
    if (asset && asset.analysis && asset.analysis.score >= 45) return 'medium';
    return 'low';
  }

  function buildCatalystCalendar(snapshot, reportBase) {
    const lookup = assetLookup(snapshot);
    const calendar = (reportBase && reportBase.calendar) || {};
    const events = [];

    ((calendar.companyNews) || []).forEach(function (n) {
      const symbol = String(n.symbol || '').toUpperCase();
      const asset = lookup[symbol] || null;
      events.push({
        type: 'company',
        market: asset ? asset.market : null,
        symbol: symbol || null,
        title: n.headline || n.event || 'Sirket katalizoru',
        date: n.date || n.datetime || null,
        source: n.source || 'Sirket haberi',
        timingConfidence: n.date ? 'dated' : 'window',
        decisionPressure: pressureForEvent(n, asset),
        thesisLink: asset && asset.analysis ? 'Guncel skor ' + asset.analysis.score + ' bu olayi tez dogrulamasina bagliyor.' : 'Aktif skorlanmis varlik baglantisi yok.',
      });
    });

    ((calendar.economic) || []).forEach(function (e) {
      events.push({
        type: 'macro',
        market: 'macro',
        symbol: null,
        title: e.event || e.name || 'Makro olay',
        date: e.date || null,
        source: e.source || 'Takvim',
        timingConfidence: e.date ? 'dated' : 'window',
        decisionPressure: pressureForEvent(e, null),
        thesisLink: e.importance === 'high' ? 'Yuksek etkili makro veri genel risk istahini degistirebilir.' : 'Makro baglam maddesi.',
      });
    });

    events.sort(function (a, b) {
      const rank = { high: 3, medium: 2, low: 1 };
      const pr = (rank[b.decisionPressure] || 0) - (rank[a.decisionPressure] || 0);
      if (pr !== 0) return pr;
      return String(a.date || '').localeCompare(String(b.date || ''));
    });

    return {
      events: events,
      prepQueue: events.slice(0, 5).map(function (e) {
        return {
          symbol: e.symbol,
          action: e.title + ' icin esik belirle ve olay sonrasi degerlendirme notu yaz.',
          pressure: e.decisionPressure,
        };
      }),
    };
  }

  function getOverlayForAsset(asset, reportBase) {
    const overlay = reportBase && reportBase.signalOverlay;
    const assets = overlay && overlay.assets ? overlay.assets : {};
    return assets[journalKey(asset)] || null;
  }

  function overlayGaps(overlay) {
    const gapTypes = {
      thesisStatus: true,
      tearsheetCompleteness: true,
      compsValuationGap: true,
      modelAuditGap: true,
      scenarioSensitivity: true,
      predictionCalibration: true,
    };
    return ((overlay && overlay.components) || []).filter(function (c) {
      return (Number(c.adjustment) || 0) < 0 || gapTypes[c.type];
    }).map(function (c) {
      return c.reason || c.type;
    });
  }

  function cockpitSelectionReason(asset, status, trade) {
    const analysis = asset.analysis || {};
    const reasons = (Array.isArray(analysis.reasons) ? analysis.reasons : []).filter(function (reason) {
      return reason && typeof reason.text === 'string' && reason.text.trim();
    });
    const preferred = status === 'blocked' ? 'neg' : status === 'watch' ? 'neutral' : 'pos';
    const selected = reasons.find(function (reason) { return reason.sentiment === preferred; }) || (status === 'blocked' ? null : reasons[0]);
    const counter = selected && selected.sentiment !== 'neg'
      ? reasons.find(function (reason) { return reason.sentiment === 'neg'; })
      : null;
    const compact = function (text, limit) {
      const clean = text.trim().replace(/\s+/g, ' ');
      return clean.length > limit ? clean.slice(0, limit).replace(/\s+\S*$/, '') + '…' : clean;
    };
    let reason;
    if (selected) {
      reason = compact(selected.text, counter ? 130 : 220);
      if (counter) reason += ' · Dikkat: ' + compact(counter.text, 100);
    } else if (typeof analysis.summary === 'string' && analysis.summary.trim()) {
      reason = compact(analysis.summary, 220);
    } else {
      reason = 'Teknik puan ' + analysis.score + '/100';
      if (analysis.tone || (typeof analysis.label === 'string' && analysis.label.trim())) reason += '; teknik sinyal ' + technicalSignalLabel(analysis).toLowerCase();
      reason += '.';
      if (trade) reason += ' Aktif işlem sinyali mevcut.';
    }
    const freshness = asset.decision && asset.decision.freshness;
    const freshnessLabels = { fresh: 'Veri taze', delayed: 'Veri gecikmeli', stale: 'Veri eski', unknown: 'Veri zamanı doğrulanmadı' };
    if (freshness && freshnessLabels[freshness.status]) reason += ' · ' + freshnessLabels[freshness.status];
    return reason;
  }

  function cockpitNextAction(asset, status, trade, note, snapshot) {
    const decision = asset.decision || {};
    const freshness = decision.freshness || {};
    if (freshness.status === 'stale' || freshness.status === 'delayed') return 'Fiyat kaydının zamanını ve kaynağını incele; yeni bir fiyat geldiğinde teknik sinyali yeniden kontrol et.';
    if (freshness.status === 'unknown' || !snapshot || !snapshot.generatedAt) return 'Önce fiyatın zamanını doğrula; teknik sinyali yeniden kontrol et.';
    if (decision.status === 'blocked') return 'Veri ve sinyal kontrolündeki uyarıları incele; teknik planın dayandığı veriyi doğrula.';
    if (status === 'blocked') return 'Teknik sinyal zayıf; pozisyonun varsa çıkış koşullarını incele.';
    if (status === 'ready') return 'Giriş, stop ve hedefi portföy risk limitlerinle birlikte kontrol et.';
    const research = asset.market === 'crypto' ? 'Protokol, likidite ve arzı araştır' : 'Şirketi, kârı ve nakit akışını araştır';
    if (status === 'watch') return research + '; teknik sinyali izlemeye devam et.';
    if (!trade) return 'Aktif giriş/stop/hedef sinyalini bekle; ' + research.toLowerCase() + '.';
    if (!note || !hasNoteText(note.thesis) || !hasNoteText(note.invalidation)) return research + '; tezini ve tezi geçersiz kılan koşulu tamamla.';
    return research + '; eksik kanıtları tamamla.';
  }

  function cockpitSourceGate(asset) {
    if (typeof asset.price !== 'number' || !Number.isFinite(asset.price) || asset.price <= 0 || portfolioSourceUnavailable(asset)) return 'Geçerli fiyat kaydı yok.';
    const freshness = asset.decision && asset.decision.freshness;
    const status = freshness && freshness.status;
    if (status === 'stale') return 'Fiyat verisi eski.';
    if (status === 'delayed') return 'Fiyat verisi gecikmeli.';
    if (status !== 'fresh') return 'Fiyatın güncelliği doğrulanmadı.';
    return null;
  }

  /** Direct each candidate to its actual next unresolved task, keeping saved facts separate from UI visits. */
  function buildCandidateTask(row) {
    const candidate = row || {};
    let task;
    if (candidate.sourceGate || candidate.snapshotTimeMissing) {
      task = { kind: 'price', label: 'Fiyat zamanını incele', panel: 'overview', target: 'freshness', field: null,
        reason: candidate.sourceGate || 'Veri kesitinin zamanı doğrulanmadı.' };
    } else if (candidate.controlBlocked) {
      task = { kind: 'control', label: 'Kontrol uyarılarını incele', panel: 'overview', target: 'control', field: null,
        reason: 'Veri ve sinyal kontrolü teknik planı engelliyor.' };
    } else if (candidate.status === 'blocked') {
      task = { kind: 'technical', label: 'Karşı sinyali incele', panel: 'technical', target: 'evidence', field: null,
        reason: candidate.bindingReason || 'Teknik sinyal yeni pozisyon incelemesi için zayıf.' };
    } else if (candidate.hasThesis === false) {
      task = { kind: 'thesis', label: 'Tez notunu yaz', panel: 'notes', target: 'thesis', field: 'thesis',
        reason: 'Bu varlık için kaydedilmiş bir tez notu yok.' };
    } else if (candidate.hasInvalidation === false) {
      task = { kind: 'invalidation', label: 'Geçersiz kılma koşulunu ekle', panel: 'notes', target: 'invalidation', field: 'invalidation',
        reason: 'Tezi geçersiz kılan koşul henüz kaydedilmedi.' };
    } else if (candidate.hasActivePlan === false) {
      task = { kind: 'technical', label: 'Teknik planı incele', panel: 'technical', target: 'trade', field: null,
        reason: 'Aktif giriş, stop ve hedef planı yok.' };
    } else if ((candidate.researchGaps || []).length) {
      task = { kind: 'research', label: 'Araştırma kanıtını incele', panel: 'research', target: 'evidence', field: null,
        reason: candidate.researchGaps[0] };
    } else if (candidate.status === 'ready') {
      task = { kind: 'risk', label: 'Pozisyon riskini incele', panel: 'overview', target: 'risk', field: null,
        reason: 'Tez ve teknik plan kayıtlı; pozisyon boyutu ayrı bir kontroldür.' };
    } else {
      task = { kind: 'research', label: 'Araştırma kaynaklarını incele', panel: 'research', target: 'evidence', field: null,
        reason: 'Teknik puan ve notlar araştırmanın tamamlandığını göstermez.' };
    }
    return Object.assign(task, { market: candidate.market || null, symbol: candidate.symbol || null });
  }

  function buildCfoDecisionCockpit(snapshot, journal, reportBase) {
    const rows = [];
    assetsByMarket(snapshot).forEach(function (asset) {
      const score = asset.analysis.score;
      const tone = asset.analysis.tone || 'hold';
      const trade = activeLongPlan(asset);
      const note = journal && journal.notes ? journal.notes[journalKey(asset)] : null;
      const overlay = getOverlayForAsset(asset, reportBase || {});
      const gaps = overlayGaps(overlay);
      const missing = [];
      const hasThesis = !!note && hasNoteText(note.thesis);
      const hasInvalidation = !!note && hasNoteText(note.invalidation);
      if (!hasThesis) missing.push('tez notu yok');
      if (!hasInvalidation) missing.push('tezi geçersiz kılan koşul yok');
      gaps.forEach(function (g) {
        if (missing.indexOf(g) < 0) missing.push(g);
      });
      if (!trade) missing.push('aktif giriş/stop/hedef sinyali eksik');
      if (!snapshot || !snapshot.generatedAt) missing.push('veri tarihi eksik');
      const sourceGate = cockpitSourceGate(asset);
      const decisionBlocked = asset.decision && asset.decision.status === 'blocked';
      const gatingReason = decisionBlocked ? 'Veri ve sinyal kontrolü teknik planı engelliyor.' : sourceGate;
      if (sourceGate) missing.unshift(sourceGate);
      if (decisionBlocked) missing.unshift('Veri ve sinyal kontrolü teknik planı engelliyor.');

      let status = 'watch';
      if (score < 35 || tone === 'sell' || decisionBlocked) status = 'blocked';
      else if (score >= 62 && !missing.length) status = 'ready';
      else if (score >= 60 || (overlay && overlay.totalAdjustment < 0)) status = 'gated';

      const bindingReason = decisionBlocked ? 'Veri ve sinyal kontrolü teknik planı engelliyor.' : status === 'blocked'
        ? (score < 35 ? 'teknik puan yeni pozisyon incelemesi için zayıf' : 'teknik sinyal olumsuz')
        : missing[0] || 'sinyal izlenebilir, bağlayıcı eksik yok';
      const decisionAsk = status === 'ready'
        ? 'ekle / tut kararı'
        : status === 'gated'
          ? 'kanıt bekle / değerle'
          : status === 'blocked'
            ? 'uzak dur / çıkışı incele'
            : 'izleme listesi';

      const row = {
        market: asset.market,
        marketLabel: marketName(asset.market),
        symbol: asset.symbol,
        name: asset.name || asset.symbol,
        score: score,
        label: asset.analysis.label,
        tone: tone,
        status: status,
        decisionAsk: decisionAsk,
        bindingReason: bindingReason,
        gatingReason: gatingReason,
        selectionReason: cockpitSelectionReason(asset, status, trade),
        evidenceGaps: missing.slice(),
        nextAction: sourceGate && !(asset.decision && ['stale', 'delayed'].indexOf(asset.decision.freshness && asset.decision.freshness.status) >= 0) ? 'Önce fiyat ve zamanını doğrula; teknik sinyali yeniden kontrol et.' : cockpitNextAction(asset, status, trade, note, snapshot),
        retainedExposure: status === 'ready' ? 'teknik ve tez bazlı pozisyon risk limitleri içinde korunabilir' : 'kanıt tamamlanana kadar sadece izleme pozisyonu korunur',
        missingEvidence: missing.slice(0, 4),
        nextWorkflow: status === 'ready'
          ? 'risk bütçesi → karar notu'
          : status === 'gated'
            ? (asset.market === 'crypto' ? 'protokol / likidite / arz / pozisyon boyutu' : 'şirket / kâr / nakit akışı / pozisyon boyutu')
            : status === 'blocked'
              ? 'sermaye ayırmadan önce sinyali onar'
              : 'tez takibi',
        adjustedScore: overlay && overlay.adjustedScore != null ? overlay.adjustedScore : score,
        hasMacroOverlay: !!overlay,
        macroEffectAvailable: !!overlay && Number.isFinite(overlay.adjustedScore) && overlay.adjustedScore >= 0 && overlay.adjustedScore <= 100 && Number.isFinite(overlay.totalAdjustment),
        sourceGate: sourceGate,
        snapshotTimeMissing: !snapshot || !snapshot.generatedAt,
        controlBlocked: !!decisionBlocked,
        hasThesis: hasThesis,
        hasInvalidation: hasInvalidation,
        hasActivePlan: !!trade,
        researchGaps: gaps.slice(),
      };
      row.task = buildCandidateTask(row);
      rows.push(row);
    });

    const rank = { ready: 0, gated: 1, watch: 2, blocked: 3 };
    rows.sort(function (a, b) {
      const ar = Object.prototype.hasOwnProperty.call(rank, a.status) ? rank[a.status] : 9;
      const br = Object.prototype.hasOwnProperty.call(rank, b.status) ? rank[b.status] : 9;
      const r = ar - br;
      if (r !== 0) return r;
      return b.score - a.score;
    });

    const counts = rows.reduce(function (acc, row) {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    // Build market queues from the complete ranking before limiting the legacy list.
    const marketGroups = ['us', 'bist', 'crypto'].map(function (market) {
      const marketRows = rows.filter(function (row) { return row.market === market; });
      const marketCounts = marketRows.reduce(function (acc, row) {
        acc[row.status] += 1;
        return acc;
      }, { ready: 0, gated: 0, watch: 0, blocked: 0 });
      return {
        market: market,
        marketLabel: marketName(market),
        total: marketRows.length,
        counts: marketCounts,
        rows: marketRows.slice(0, 3),
        empty: marketRows.length === 0,
      };
    });
    return {
      summary: rows.length
        ? (counts.ready || 0) + ' adayın tez ve teknik planı kayıtlı, ' + (counts.gated || 0) + ' aday kanıt bekliyor, ' + (counts.watch || 0) + ' aday izleniyor, ' + (counts.blocked || 0) + ' aday teknik kontrolde engelleniyor.'
        : 'Karar oluşturmak için piyasa verisi bekleniyor.',
      counts: counts,
      rows: rows.slice(0, 8),
      marketGroups: marketGroups,
      empty: rows.length === 0,
    };
  }

  function buildPortfolioRiskPlan(input) {
    const base = buildPortfolioActions(input || {});
    const limits = {
      maxSingleNamePct: 35,
      maxCryptoPct: 50,
      weakScoreThreshold: 40,
      reviewScoreThreshold: 55,
    };
    const constraints = [];
    base.rows.forEach(function (row) {
      if (row.weightPct > 35) {
        constraints.push({
          kind: 'single-name',
          label: row.symbol,
          detail: row.symbol + ' portföyün %' + Math.round(row.weightPct) + ' ağırlığında.',
        });
      }
      if (row.score != null && row.score < 40) {
        constraints.push({
          kind: 'weak-holding',
          label: row.symbol,
          detail: row.symbol + ' için teknik puan: ' + row.score + '; 40 puan eşiğinin altında.',
        });
      }
    });
    if (base.cryptoWeightPct > 50) {
      constraints.unshift({
        kind: 'single-market',
        label: 'Kripto yoğunlaşması',
        detail: 'Kripto, portföy değerinin %' + Math.round(base.cryptoWeightPct) + ' seviyesinde.',
      });
    }
    const constraintStatus = constraints.some(function (x) { return x.kind === 'single-market' || x.kind === 'single-name'; })
      ? 'concentrated'
      : constraints.length ? 'watch' : 'balanced';
    const status = base.valuation.status === 'empty' ? 'empty' : !base.riskAvailable ? 'incomplete' : constraintStatus;
    const targetAllocations = base.rows.map(function (row) {
      let maxWeightPct = row.weightPct == null ? null : limits.maxSingleNamePct;
      let action = row.weightPct == null ? 'unavailable' : 'hold';
      let reason = row.weightPct == null ? 'Ağırlık hesaplanamadı; fiyat ve kur kaynağını doğrula.' : 'pozisyon normal tek-varlik limiti icinde kalabilir';
      if (row.score != null && row.score < limits.weakScoreThreshold) {
        maxWeightPct = 0;
        action = 'exit';
        reason = 'zayif teknik skor yeni sermayeyi bloke ediyor';
      } else if (row.score != null && row.score < limits.reviewScoreThreshold && row.weightPct != null) {
        maxWeightPct = Math.min(row.weightPct, 10);
        action = row.weightPct > maxWeightPct ? 'trim' : 'watch';
        reason = 'skor inceleme esiginin altinda; agirligi kucuk tut';
      } else if (row.weightPct > limits.maxSingleNamePct) {
        maxWeightPct = limits.maxSingleNamePct;
        action = 'trim';
        reason = 'tek-varlik agirligi risk butcesinin ustunde';
      }
      return {
        market: row.market,
        symbol: row.symbol,
        currentWeightPct: row.weightPct == null ? null : Math.round(row.weightPct * 10) / 10,
        maxWeightPct: maxWeightPct == null ? null : Math.round(maxWeightPct * 10) / 10,
        action: action,
        reason: reason,
      };
    });
    const binding = constraints[0] || null;
    return {
      status: status,
      constraintStatus: base.riskAvailable ? constraintStatus : null,
      riskAvailable: base.riskAvailable,
      valuation: base.valuation,
      totalUsd: base.totalUsd,
      totalTry: base.totalTry,
      riskBudget: {
        totalNavUsd: base.totalUsd,
        maxSingleNamePct: limits.maxSingleNamePct,
        maxCryptoPct: limits.maxCryptoPct,
        bindingConstraint: !base.riskAvailable && status !== 'empty' ? 'Tam risk hesabı yapılamadı; eksik fiyat veya kur kaynağı var.' : binding ? binding.label + ': ' + binding.detail : 'Mevcut kurallarda bağlayıcı kısıt yok.',
      },
      constraints: constraints,
      targetAllocations: targetAllocations,
      actions: base.actions,
      monitoringRules: base.actions.map(function (a) {
        return {
          symbol: a.symbol,
          trigger: a.text,
          action: a.kind === 'data-gap' || a.kind === 'unavailable' ? 'Fiyat ve kur kaynağını doğrula; tam risk hesabını yeniden yap.' : a.kind === 'reduce' || a.kind === 'trim' || a.kind === 'rebalance' ? 'Ağırlığı azaltma veya dengeleme planını incele.' : 'Mevcut izleme eşiklerini kontrol et.',
        };
      }),
      retainedExposure: status === 'incomplete' ? 'Portföyün tam riski hesaplanamadı; yerel tutarlar ve mevcut teknik uyarılar ayrı gösteriliyor.' : status === 'empty' ? 'Kayıtlı pozisyon yok.' : status === 'balanced' ? 'Hesaplanan ağırlıklar mevcut sınırlar içinde. Bu kontrol stop ve tez incelemesini tamamlamaz.' : 'Aşağıdaki kısıtları pozisyon büyüklüğü, stop ve tez koşullarıyla birlikte incele.',
    };
  }

  function buildCompanyTearsheet(asset, snapshot, journal) {
    const note = journal && journal.notes ? journal.notes[journalKey(asset)] : null;
    const decision = asset.decision || {};
    const metrics = [
      { label: 'Fiyat', value: money(asset.price, asset.currency) },
      { label: 'Teknik puan', value: asset.analysis ? asset.analysis.score + ' / 100' : '-' },
      { label: 'Veri ve sinyal kontrolü', value: decision.score != null ? decision.score + ' / 100' : '-' },
      { label: 'RSI', value: asset.ind && asset.ind.rsi != null ? asset.ind.rsi : '-' },
      { label: 'ATR %', value: asset.ind && asset.ind.atrPct != null ? asset.ind.atrPct + '%' : '-' },
    ];
    const thesis = note && hasNoteText(note.thesis) ? note.thesis : (asset.analysis && asset.analysis.summary) || 'Henüz tez notu yok.';
    const gaps = [];
    if (asset.market === 'crypto') gaps.push('Protokol, likidite ve arz araştırması bu teknik veri paketinde yok.');
    else if (!asset.fundamentals && !asset.fund) gaps.push('Kaynaklı temel finansallar ve finansal tahmin verisi eksik.');
    if (!note || !hasNoteText(note.invalidation)) gaps.push('Tezi geçersiz kılan kayıtlı koşul eksik.');
    if (!snapshot || !snapshot.generatedAt) gaps.push('Veri kesitinin zamanı eksik.');
    return {
      symbol: asset.symbol,
      market: asset.market,
      name: asset.name || asset.symbol,
      bankerRead: asset.analysis && asset.analysis.score >= 60 ? 'Teknik görünüm olumlu' : 'Teknik görünüm izleniyor',
      thesis: thesis,
      metrics: metrics,
      gaps: gaps,
      nextRoute: 'Özet → teknik puan benzerleri → tez takibi',
    };
  }

  function buildCompsSnapshot(asset, snapshot) {
    const validScore = function (value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100; };
    const targetScore = asset && asset.analysis && validScore(asset.analysis.score) ? asset.analysis.score : null;
    const peers = assetsByMarket(snapshot)
      .filter(function (x) { return targetScore != null && x.market === asset.market && x.symbol !== asset.symbol && x.analysis && validScore(x.analysis.score) && !x.__error; })
      .sort(function (a, b) { return Math.abs(a.analysis.score - targetScore) - Math.abs(b.analysis.score - targetScore); })
      .slice(0, 5);
    const peerScores = peers.map(function (x) { return x.analysis.score; });
    const avgScore = peerScores.length ? Math.round(peerScores.reduce(function (a, b) { return a + b; }, 0) / peerScores.length) : null;
    const diff = avgScore == null ? null : targetScore - avgScore;
    return {
      target: {
        symbol: asset.symbol,
        score: targetScore,
        label: asset.analysis && asset.analysis.label,
      },
      peerSet: peers.map(function (x) {
        return { symbol: x.symbol, score: x.analysis.score, label: x.analysis.label, market: x.market };
      }),
      peerAverageScore: avgScore,
      readThrough: avgScore == null
        ? 'Aynı piyasada geçerli teknik puanla karşılaştırılabilecek kayıt yok.'
        : 'Teknik puanı yakın ' + peers.length + ' varlığın ortalaması ' + avgScore + '/100; hedef bu ortalamadan ' + (diff >= 0 ? '+' : '') + diff + ' puan ayrılıyor.',
      limitations: ['Benzerlik yalnız teknik puana göre seçildi; sektör veya iş modeli eşleşmesi yapılmadı.', asset.market === 'crypto' ? 'Protokol değeri, likidite ve arz karşılaştırması için ayrıca kaynaklı araştırma gerekir.' : 'Şirket değerlemesi için kaynaklı finansallar, sermaye yapısı ve aynı sektörden emsaller gerekir.'],
    };
  }

  function buildInvestmentCommitteeMemo(asset, snapshot, journal, reportBase) {
    const note = journal && journal.notes ? journal.notes[journalKey(asset)] : null;
    const trade = activeLongPlan(asset);
    const overlay = getOverlayForAsset(asset, reportBase || {});
    const tear = buildCompanyTearsheet(asset, snapshot, journal || {});
    const comps = buildCompsSnapshot(asset, snapshot || {});
    const gaps = []
      .concat(tear.gaps || [])
      .concat(overlayGaps(overlay));
    const sourceGate = cockpitSourceGate(asset);
    if (!note || !hasNoteText(note.thesis)) gaps.unshift('Kayıtlı tez notu eksik.');
    if (!trade) gaps.unshift('Aktif giriş, stop ve hedef planı eksik.');
    if (!snapshot || !snapshot.generatedAt) gaps.unshift('Veri kesitinin zamanı eksik.');
    if (sourceGate) gaps.unshift(sourceGate);

    const score = asset && asset.analysis ? asset.analysis.score : null;
    let verdict = 'screen-grade';
    if (sourceGate || (asset.decision && asset.decision.status === 'blocked') || score == null || !Number.isFinite(score) || score < 35 || score > 100) verdict = 'blocked';
    else if (!trade || !snapshot || !snapshot.generatedAt) verdict = 'blocked';
    else if (note && hasNoteText(note.thesis) && hasNoteText(note.invalidation) && score >= 60 && !overlayGaps(overlay).length) verdict = 'senior-review-ready';

    const decisionAsk = verdict === 'blocked'
      ? 'Önce fiyat kaydını ve aktif teknik planı doğrula.'
      : verdict === 'senior-review-ready'
        ? 'Tez ve teknik plan kayıtlı. Pozisyon boyutunu risk bütçesiyle birlikte incele; temel araştırma eksikleri aşağıda.'
        : 'Bu teknik tarama notunu ilerletmeden önce tez ve kanıt eksiklerini tamamla.';

    const whatWeBelieve = [
      (asset.symbol || 'Varlık') + ' teknik puanı ' + (score == null ? '-' : score) + '/100; teknik sinyal ' + technicalSignalLabel(asset).toLowerCase(),
      (note && hasNoteText(note.thesis) ? 'Kayıtlı tez: ' + note.thesis : 'Teknik özet: ' + tear.thesis),
      comps.readThrough,
    ];
    const riskTransmission = [
      note && hasNoteText(note.invalidation) ? 'Tezi geçersiz kılan kayıtlı koşul: ' + note.invalidation : 'Kişisel tezi geçersiz kılan koşul henüz kaydedilmedi.',
      trade ? 'Stop ve hedef teknik plana ait eşiklerdir; gerçekleşen işlem fiyatını garanti etmez.' : 'Aktif giriş planı olmadığı için stop mesafesine göre boyutlama yapılamıyor.',
    ];
    if (overlay && overlay.totalAdjustment < 0) {
      riskTransmission.push('Makro etkisi ayarlanmış puanı ' + Math.abs(overlay.totalAdjustment) + ' puan azaltıyor.');
    }

    return {
      symbol: asset.symbol,
      market: asset.market,
      verdict: verdict,
      decisionAsk: decisionAsk,
      snapshot: {
        price: money(asset.price, asset.currency),
        score: score,
        adjustedScore: overlay && overlay.adjustedScore != null ? overlay.adjustedScore : score,
        label: asset.analysis && asset.analysis.label,
      },
      sections: {
        whatWeBelieve: whatWeBelieve,
        evidenceGaps: gaps.slice(0, 6),
        riskTransmission: riskTransmission,
        nextActions: [
          'Pozisyon boyutunu risk bütçesiyle hesapla.',
          'Tezi ve tezi geçersiz kılan koşulu kaydet veya güncelle.',
          'Gündem veya teknik puan değiştiğinde görüşü yeniden incele.',
        ],
      },
    };
  }

  return {
    technicalSignalLabel: technicalSignalLabel,
    controlStatusLabel: controlStatusLabel,
    buildCandidateTask: buildCandidateTask,
    buildDailyChangeDigest: buildDailyChangeDigest,
    buildPortfolioValuation: buildPortfolioValuation,
    buildPortfolioActions: buildPortfolioActions,
    buildAssetThesis: buildAssetThesis,
    buildReportTrust: buildReportTrust,
    buildAlertRules: buildAlertRules,
    buildPredictionScorecard: buildPredictionScorecard,
    buildPredictionCohorts: buildPredictionCohorts,
    calculatePosition: calculatePosition,
    buildIdeaFunnel: buildIdeaFunnel,
    buildCatalystCalendar: buildCatalystCalendar,
    buildCfoDecisionCockpit: buildCfoDecisionCockpit,
    buildPortfolioRiskPlan: buildPortfolioRiskPlan,
    buildDecisionLearningPanel: buildDecisionLearningPanel,
    buildAssetLearningSnippet: buildAssetLearningSnippet,
    buildCompanyTearsheet: buildCompanyTearsheet,
    buildCompsSnapshot: buildCompsSnapshot,
    buildInvestmentCommitteeMemo: buildInvestmentCommitteeMemo,
  };
});
