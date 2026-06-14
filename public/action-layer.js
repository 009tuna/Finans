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
    const hasThesis = !!(note && (note.thesis || note.invalidation));
    const topRisk = asset.ind && asset.ind.pos52 != null && asset.ind.pos52 >= 0.9 && asset.ind.macd && asset.ind.macd.histogram < 0;

    if (score < 35 || tone === 'sell') {
      return {
        bucket: 'reject',
        reason: 'Score is weak or sell-toned; this is not a research candidate until the signal repairs.',
        nextWorkflow: 'reject / wait for repair',
      };
    }
    if (score >= 62 && !topRisk && status !== 'blocked') {
      return {
        bucket: 'advance',
        reason: 'Score and decision quality are strong enough for deeper work; still not a final recommendation.',
        nextWorkflow: hasThesis ? 'thesis tracker -> catalyst calendar' : 'thesis tracker -> company tearsheet',
      };
    }
    if (score >= 60 && topRisk) {
      return {
        bucket: 'gated',
        reason: 'Signal is strong but setup is late-cycle or confirmation is incomplete.',
        nextWorkflow: 'valuation / expectations gate',
      };
    }
    if (openPrediction) {
      return {
        bucket: 'watchlist',
        reason: 'Open prediction exists; wait for target, stop, or expiry evidence.',
        nextWorkflow: 'prediction calibration',
      };
    }
    return {
      bucket: 'watchlist',
      reason: hasThesis ? 'Thesis exists but score is not strong enough to advance.' : 'Screen flag only; build a thesis before acting.',
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
        ? buckets.advance.length + ' idea candidate needs deeper work before any trade decision.'
        : 'No immediate research candidate; use watchlist and rejection buckets.',
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
        title: n.headline || n.event || 'Company catalyst',
        date: n.date || n.datetime || null,
        source: n.source || 'company/news',
        timingConfidence: n.date ? 'dated' : 'window',
        decisionPressure: pressureForEvent(n, asset),
        thesisLink: asset && asset.analysis ? 'Current score ' + asset.analysis.score + ' links this event to thesis validation.' : 'No active scored asset link.',
      });
    });

    ((calendar.economic) || []).forEach(function (e) {
      events.push({
        type: 'macro',
        market: 'macro',
        symbol: null,
        title: e.event || e.name || 'Macro event',
        date: e.date || null,
        source: e.source || 'calendar',
        timingConfidence: e.date ? 'dated' : 'window',
        decisionPressure: pressureForEvent(e, null),
        thesisLink: e.importance === 'high' ? 'High-impact macro print can change broad risk appetite.' : 'Macro context item.',
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
          action: 'Set threshold and post-event review note for ' + e.title + '.',
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

  function buildCfoDecisionCockpit(snapshot, journal, reportBase) {
    const rows = [];
    assetsByMarket(snapshot).forEach(function (asset) {
      const score = asset.analysis.score;
      const tone = asset.analysis.tone || 'hold';
      const trade = asset.decision && asset.decision.trade;
      const note = journal && journal.notes ? journal.notes[journalKey(asset)] : null;
      const overlay = getOverlayForAsset(asset, reportBase || {});
      const gaps = overlayGaps(overlay);
      const missing = [];
      if (!note || !note.thesis) missing.push('tez notu yok');
      if (!note || !note.invalidation) missing.push('tez bozulma kosulu yok');
      gaps.forEach(function (g) {
        if (missing.indexOf(g) < 0) missing.push(g);
      });
      if (!trade || trade.available !== true) missing.push('giris/stop/hedef plani eksik');
      if (!snapshot || !snapshot.generatedAt) missing.push('snapshot tarihi eksik');

      let status = 'watch';
      if (score < 35 || tone === 'sell') status = 'blocked';
      else if (score >= 62 && !missing.length) status = 'ready';
      else if (score >= 60 || (overlay && overlay.totalAdjustment < 0)) status = 'gated';

      const bindingReason = status === 'blocked'
        ? (score < 35 ? 'teknik skor karar icin zayif' : 'satis tonu sermaye tahsisini bloke ediyor')
        : missing[0] || 'sinyal izlenebilir, baglayici eksik yok';
      const decisionAsk = status === 'ready'
        ? 'add / hold decision'
        : status === 'gated'
          ? 'wait for proof / underwrite'
          : status === 'blocked'
            ? 'avoid / exit review'
            : 'watchlist';

      rows.push({
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
        retainedExposure: status === 'ready' ? 'technical and thesis exposure can be retained within risk limits' : 'retain only monitoring exposure until evidence closes',
        missingEvidence: missing.slice(0, 4),
        nextWorkflow: status === 'ready'
          ? 'risk budget -> committee memo'
          : status === 'gated'
            ? 'tearsheet / comps / sizing'
            : status === 'blocked'
              ? 'repair signal before capital'
              : 'thesis tracker',
        adjustedScore: overlay && overlay.adjustedScore != null ? overlay.adjustedScore : score,
      });
    });

    const rank = { ready: 0, gated: 1, blocked: 2, watch: 3 };
    rows.sort(function (a, b) {
      const r = (rank[a.status] || 9) - (rank[b.status] || 9);
      if (r !== 0) return r;
      return b.score - a.score;
    });

    const counts = rows.reduce(function (acc, row) {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});
    return {
      summary: 'CFO cockpit: ' + (counts.ready || 0) + ' ready, ' + (counts.gated || 0) + ' gated, ' + (counts.blocked || 0) + ' blocked.',
      counts: counts,
      rows: rows.slice(0, 8),
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
          detail: row.symbol + ' is ' + Math.round(row.weightPct) + '% of portfolio.',
        });
      }
      if (row.score != null && row.score < 40) {
        constraints.push({
          kind: 'weak-holding',
          label: row.symbol,
          detail: row.symbol + ' has weak technical score ' + row.score + '.',
        });
      }
    });
    if (base.cryptoWeightPct > 50) {
      constraints.unshift({
        kind: 'single-market',
        label: 'Crypto concentration',
        detail: 'Crypto is ' + Math.round(base.cryptoWeightPct) + '% of portfolio value.',
      });
    }
    const status = constraints.some(function (x) { return x.kind === 'single-market' || x.kind === 'single-name'; })
      ? 'concentrated'
      : constraints.length ? 'watch' : 'balanced';
    const targetAllocations = base.rows.map(function (row) {
      let maxWeightPct = limits.maxSingleNamePct;
      let action = 'hold';
      let reason = 'position can stay inside normal single-name limit';
      if (row.score != null && row.score < limits.weakScoreThreshold) {
        maxWeightPct = 0;
        action = 'exit';
        reason = 'weak technical score blocks fresh capital';
      } else if (row.score != null && row.score < limits.reviewScoreThreshold) {
        maxWeightPct = Math.min(row.weightPct, 10);
        action = row.weightPct > maxWeightPct ? 'trim' : 'watch';
        reason = 'score is below review threshold; keep exposure small';
      } else if (row.weightPct > limits.maxSingleNamePct) {
        maxWeightPct = limits.maxSingleNamePct;
        action = 'trim';
        reason = 'single-name exposure is above CFO risk budget';
      }
      return {
        market: row.market,
        symbol: row.symbol,
        currentWeightPct: Math.round(row.weightPct * 10) / 10,
        maxWeightPct: Math.round(maxWeightPct * 10) / 10,
        action: action,
        reason: reason,
      };
    });
    const binding = constraints[0] || null;
    return {
      status: status,
      totalUsd: base.totalUsd,
      riskBudget: {
        totalNavUsd: base.totalUsd,
        maxSingleNamePct: limits.maxSingleNamePct,
        maxCryptoPct: limits.maxCryptoPct,
        bindingConstraint: binding ? binding.label + ': ' + binding.detail : 'No binding constraint.',
      },
      constraints: constraints,
      targetAllocations: targetAllocations,
      actions: base.actions,
      monitoringRules: base.actions.map(function (a) {
        return {
          symbol: a.symbol,
          trigger: a.text,
          action: a.kind === 'reduce' || a.kind === 'trim' || a.kind === 'rebalance' ? 'reduce exposure or rebalance' : 'hold with existing thresholds',
        };
      }),
      retainedExposure: status === 'balanced' ? 'Current exposure can be monitored with normal thesis thresholds.' : 'Keep only exposure backed by current thesis and reduce concentration risk first.',
    };
  }

  function buildCompanyTearsheet(asset, snapshot, journal) {
    const note = journal && journal.notes ? journal.notes[journalKey(asset)] : null;
    const decision = asset.decision || {};
    const metrics = [
      { label: 'Price', value: money(asset.price, asset.currency) },
      { label: 'Technical score', value: asset.analysis ? asset.analysis.score + ' / 100' : '-' },
      { label: 'Decision quality', value: decision.score != null ? decision.score + ' / 100' : '-' },
      { label: 'RSI', value: asset.ind && asset.ind.rsi != null ? asset.ind.rsi : '-' },
      { label: 'ATR %', value: asset.ind && asset.ind.atrPct != null ? asset.ind.atrPct + '%' : '-' },
    ];
    const thesis = note && note.thesis ? note.thesis : (asset.analysis && asset.analysis.summary) || 'No thesis note yet.';
    const gaps = [];
    if (!asset.fundamentals && !asset.fund) gaps.push('fundamental financials / estimates not sourced');
    if (!note || !note.invalidation) gaps.push('approved thesis invalidation threshold missing');
    if (!snapshot || !snapshot.generatedAt) gaps.push('snapshot timestamp missing');
    return {
      symbol: asset.symbol,
      market: asset.market,
      name: asset.name || asset.symbol,
      bankerRead: asset.analysis && asset.analysis.score >= 60 ? 'screen-grade positive setup' : 'monitoring-grade setup',
      thesis: thesis,
      metrics: metrics,
      gaps: gaps,
      nextRoute: 'company tearsheet -> comps snapshot -> thesis tracker',
    };
  }

  function buildCompsSnapshot(asset, snapshot) {
    const peers = assetsByMarket(snapshot)
      .filter(function (x) { return x.market === asset.market && x.symbol !== asset.symbol; })
      .sort(function (a, b) { return Math.abs(a.analysis.score - asset.analysis.score) - Math.abs(b.analysis.score - asset.analysis.score); })
      .slice(0, 5);
    const peerScores = peers.map(function (x) { return x.analysis.score; });
    const avgScore = peerScores.length ? Math.round(peerScores.reduce(function (a, b) { return a + b; }, 0) / peerScores.length) : null;
    const diff = avgScore == null ? null : asset.analysis.score - avgScore;
    return {
      target: {
        symbol: asset.symbol,
        score: asset.analysis.score,
        label: asset.analysis.label,
      },
      peerSet: peers.map(function (x) {
        return { symbol: x.symbol, score: x.analysis.score, label: x.analysis.label, market: x.market };
      }),
      peerAverageScore: avgScore,
      readThrough: avgScore == null
        ? 'No peer set available; valuation context is not ready.'
        : 'Target score is ' + (diff >= 0 ? '+' : '') + diff + ' points versus peer average; treat as peer context, not valuation advice.',
      limitations: ['uses technical score as interim peer context', 'requires EV, EBITDA, revenue, FCF and estimate data for real comps valuation'],
    };
  }

  function buildInvestmentCommitteeMemo(asset, snapshot, journal, reportBase) {
    const note = journal && journal.notes ? journal.notes[journalKey(asset)] : null;
    const trade = asset && asset.decision && asset.decision.trade;
    const overlay = getOverlayForAsset(asset, reportBase || {});
    const tear = buildCompanyTearsheet(asset, snapshot, journal || {});
    const comps = buildCompsSnapshot(asset, snapshot || {});
    const gaps = []
      .concat(tear.gaps || [])
      .concat(overlayGaps(overlay));
    if (!note || !note.thesis) gaps.unshift('approved thesis note missing');
    if (!note || !note.invalidation) gaps.unshift('thesis break condition missing');
    if (!trade || trade.available !== true) gaps.unshift('entry / stop / target plan missing');
    if (!snapshot || !snapshot.generatedAt) gaps.unshift('fresh snapshot timestamp missing');

    const score = asset && asset.analysis ? asset.analysis.score : null;
    let verdict = 'screen-grade';
    if (score != null && score < 35) verdict = 'blocked';
    else if (!trade || trade.available !== true || !snapshot || !snapshot.generatedAt) verdict = 'blocked';
    else if (note && note.thesis && note.invalidation && score >= 60 && !overlayGaps(overlay).length) verdict = 'senior-review-ready';

    const decisionAsk = verdict === 'blocked'
      ? 'Do not allocate fresh capital until the blocking item is repaired.'
      : verdict === 'senior-review-ready'
        ? 'Review risk budget and decide whether to add, hold, or trim.'
        : 'Use as a screen-grade memo; close evidence gaps before capital allocation.';

    const whatWeBelieve = [
      (asset.symbol || 'Asset') + ' has technical score ' + (score == null ? '-' : score) + ' and label ' + ((asset.analysis && asset.analysis.label) || '-'),
      'Current thesis: ' + (note && note.thesis ? note.thesis : tear.thesis),
      comps.readThrough,
    ];
    const riskTransmission = [
      note && note.invalidation ? 'Thesis breaks if: ' + note.invalidation : 'Missing invalidation means downside cannot be governed.',
      trade && trade.available ? 'Stop/target plan defines first loss and reward boundary.' : 'No trade plan means sizing cannot be tied to loss budget.',
    ];
    if (overlay && overlay.totalAdjustment < 0) {
      riskTransmission.push('Macro/signal overlay reduces adjusted score by ' + Math.abs(overlay.totalAdjustment) + ' points.');
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
          'run risk budget sizing before any add decision',
          'write or update thesis and invalidation in journal',
          'refresh committee memo after catalyst or score change',
        ],
      },
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
    buildIdeaFunnel: buildIdeaFunnel,
    buildCatalystCalendar: buildCatalystCalendar,
    buildCfoDecisionCockpit: buildCfoDecisionCockpit,
    buildPortfolioRiskPlan: buildPortfolioRiskPlan,
    buildCompanyTearsheet: buildCompanyTearsheet,
    buildCompsSnapshot: buildCompsSnapshot,
    buildInvestmentCommitteeMemo: buildInvestmentCommitteeMemo,
  };
});
