// Dashboard istemcisi — sidebar görünümleri, indikatör detayları, Emil-kalibre mikro etkileşimler.
'use strict';

let DATA = null;
let activeView = 'overview';
let sortBy = 'score';
let allocChart = null;
let scoreChart = null;
let moversChart = null;
let portAllocChart = null;
let backtestChart = null;
let mcChart = null;
let portfolioData = null;
let activeDetailCharts = {};
let assetDeskChart = null;
let assetDeskResize = null;
let assetDeskState = {
  market: null,
  symbol: null,
  mode: 'candles',
  interval: null,
  showSMA: localStorage.getItem('finans-show-sma') === 'true'
};
let booted = false;

const $ = (s) => document.querySelector(s);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- Biçimlendirme ---------- */
function fmtNum(n, d = 2) {
  if (n == null || isNaN(n)) return '–';
  return Number(n).toLocaleString('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function fmtPrice(n, cur) {
  if (n == null || isNaN(n)) return '–';
  const sym = cur === 'TRY' ? '₺' : cur === 'USD' || !cur ? '$' : cur + ' ';
  const d = n >= 1000 ? 0 : n >= 1 ? 2 : 4;
  return sym + fmtNum(n, d);
}
function fmtPct(n) {
  if (n == null || isNaN(n)) return '–';
  return (n >= 0 ? '+' : '') + fmtNum(n, 2) + '%';
}
function fmtCap(n) {
  if (!n) return '–';
  if (n >= 1e12) return '$' + fmtNum(n / 1e12, 2) + ' Tn';
  if (n >= 1e9) return '$' + fmtNum(n / 1e9, 1) + ' Mr';
  if (n >= 1e6) return '$' + fmtNum(n / 1e6, 1) + ' Mn';
  return '$' + fmtNum(n, 0);
}
function toneColor(t) {
  return { 'strong-buy': '#28d793', buy: '#4382ff', hold: '#eab308', reduce: '#f97316', sell: '#ef4444' }[t] || '#7d8590';
}
function decisionTone(d) {
  return d && d.status ? d.status : 'unknown';
}
function decisionLabel(d) {
  if (!d) return 'Karar yok';
  if (d.status === 'clean') return 'Temiz';
  if (d.status === 'caution') return 'Dikkat';
  if (d.status === 'blocked') return 'Riskli';
  return 'Belirsiz';
}
function findPickAsset(p) {
  const market = p.market === 'ABD' ? 'us' : p.market === 'BIST' ? 'bist' : 'crypto';
  const list = DATA && DATA[market] ? DATA[market] : [];
  return list.find((x) => x.symbol === p.symbol);
}
function decisionMini(d) {
  if (!d) return '';
  return '<span class="decision-mini decision-' + decisionTone(d) + '" title="Karar kalitesi: ' + decisionLabel(d) + '">' + d.score + '</span>';
}

const TR_DAYS = ['Pazar', 'Pazartesi', 'Sali', 'Carsamba', 'Persembe', 'Cuma', 'Cumartesi'];
const TR_MONTHS = ['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function relTime(iso) {
  if (!iso) return 'bilinmiyor';
  const d = new Date(iso);
  const mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1.5) return 'az once';
  if (mins < 60) return Math.round(mins) + ' dk once';
  if (mins < 600) return (mins / 60).toFixed(1).replace('.0', '') + ' saat once';
  return d.getDate() + ' ' + TR_MONTHS[d.getMonth()] + ' ' + TR_DAYS[d.getDay()] + ' kapanisi';
}
function marketStatus(market) {
  const now = new Date();
  const day = now.getUTCDay();
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const weekend = day === 0 || day === 6;
  if (market === 'crypto') return { open: true, label: 'Canli · 7/24 acik' };
  if (weekend) return { open: false, label: 'Hafta sonu — piyasa kapali' };
  if (market === 'us') {
    const open = mins >= 13 * 60 + 30 && mins < 20 * 60;
    return { open, label: open ? 'Acik — ABD seansi' : 'Kapali — seans disi' };
  }
  const open = mins >= 7 * 60 && mins < 15 * 60;
  return { open, label: open ? 'Acik — BIST seansi' : 'Kapali — seans disi' };
}

// Emil: easeOutCubic ile sayı saymaca (count-up)
function countUp(el, target, { decimals = 0, dur = 650 } = {}) {
  if (reduceMotion) { el.textContent = target.toFixed(decimals); return; }
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(decimals);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------- Veri yükleme ---------- */
async function loadPortfolio() {
  try {
    const res = await fetch('/api/portfolio');
    portfolioData = await res.json();
  } catch (e) {
    portfolioData = { us: [], bist: [], crypto: [] };
  }
}

async function load() {
  try {
    const res = await fetch('/api/data', { cache: 'no-store' });
    DATA = await res.json();
    if (DATA && DATA.empty) {
      $('#updated').innerHTML = '<span class="fresh stale"><span class="dot"></span>Ilk veri cekiliyor…</span>';
      return silentRefresh();
    }
    await loadPortfolio();
    updateFreshness();
    renderView();
    if (!booted) { booted = true; maybeAutoRefresh(); }
  } catch (e) {
    $('#updated').textContent = 'Sunucuya baglanilamadi, tekrar deneniyor…';
    setTimeout(load, 1500);
  }
}
/* ---------- Yönetici parolası (yazma işlemleri için) ---------- */
function adminHeaders(base) {
  const h = Object.assign({}, base || {});
  const s = localStorage.getItem('adminSecret');
  if (s) h['x-admin-secret'] = s;
  return h;
}
// Yazma uçlarına ADMIN_SECRET ekler; 401'de parolayı sorar (silent değilse) ve bir kez yeniden dener.
async function authedFetch(url, opts, cfg) {
  opts = opts || {};
  const allowPrompt = !(cfg && cfg.silent);
  let res = await fetch(url, Object.assign({}, opts, { headers: adminHeaders(opts.headers) }));
  if (res.status === 401 && allowPrompt) {
    const entered = prompt('Bu işlem için yönetici parolası gerekli (Vercel ADMIN_SECRET):');
    if (entered) {
      localStorage.setItem('adminSecret', entered);
      res = await fetch(url, Object.assign({}, opts, { headers: adminHeaders(opts.headers) }));
    }
  }
  return res;
}

async function refresh() {
  const btn = $('#refreshBtn');
  btn.disabled = true; btn.classList.add('loading');
  try {
    const res = await authedFetch('/api/refresh', { method: 'POST' });
    if (res.status === 401) { alert('Yenileme için doğru yönetici parolası gerekli.'); return; }
    const fresh = await res.json();
    if (fresh && !fresh.empty) { DATA = fresh; updateFreshness(); renderView(); }
  } catch (e) { /* sessiz */ }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
}
async function silentRefresh() {
  try {
    // Arka plan tazelemesi: parola sorma, 401 ise sessizce geç (GitHub Actions zaten günlük tazeler).
    const res = await authedFetch('/api/refresh', { method: 'POST' }, { silent: true });
    if (!res.ok) return;
    const fresh = await res.json();
    if (fresh && !fresh.empty) { DATA = fresh; updateFreshness(); renderView(); }
  } catch (e) { /* sessiz */ }
}
function maybeAutoRefresh() {
  const ageMin = (Date.now() - new Date(DATA.generatedAt).getTime()) / 60000;
  if (ageMin > 15) silentRefresh();
}
function updateFreshness() {
  const ageMin = (Date.now() - new Date(DATA.generatedAt).getTime()) / 60000;
  const cls = ageMin < 15 ? '' : 'stale';
  $('#updated').innerHTML = '<span class="fresh ' + cls + '"><span class="dot"></span>Veri: ' + relTime(DATA.generatedAt) + '</span>';
}

/* ---------- Görünüm yönetimi ---------- */
const VIEW_META = {
  overview: ['Genel Bakış', 'Tüm pazarların özeti ve öne çıkan fırsatlar', 'view-overview'],
  us: ['🇺🇸 ABD Hisseleri', '12 hisse · teknik analiz + analist konsensüsü', 'view-market'],
  bist: ['🇹🇷 BIST 20', 'En büyük 20 şirket · teknik analiz', 'view-market'],
  crypto: ['₿ Kripto', '12 coin · teknik momentum analizi', 'view-market'],
  portfolio: ['💼 Portföyüm', 'Maliyet, kâr/zarar ve portföy sağlık analizi', 'view-portfolio'],
  screener: ['🔍 Teknik Tarayıcı', 'Kritik indikatör sinyalleri ve alarmlar', 'view-screener'],
  backtest: ['📈 Strateji Backtest', 'Geçmiş fiyat verileriyle teknik puan stratejisi testi', 'view-backtest'],
  forecast: ['🔮 Finansal Projeksiyon', 'Olasılıksal portföy simülasyonu, stres testleri ve DCF analizleri', 'view-forecast'],
  report: ['📰 Günlük Rapor', 'Her sabah 09:00 otomatik rapor', 'view-report'],
  literacy: ['📚 Finansal Okuryazarlık', 'İndikatör ve risk rehberi', 'view-literacy'],
};
function setView(view) {
  activeView = view;
  document.querySelectorAll('.navitem').forEach((n) => n.classList.toggle('active', n.dataset.view === view));
  const meta = VIEW_META[view];
  
  const titleEl = $('#viewTitle');
  const subEl = $('#viewSub');
  if (titleEl) titleEl.textContent = meta[0];
  if (subEl) subEl.textContent = meta[1];

  const targetViewId = meta[2];
  const targetViewEl = document.getElementById(targetViewId);
  const allViews = document.querySelectorAll('.view');

  if (window.gsap && !reduceMotion) {
    let visibleViewEl = null;
    allViews.forEach(v => {
      if (!v.hidden) visibleViewEl = v;
    });

    const runReveal = () => {
      allViews.forEach((v) => {
        const on = v.id === targetViewId;
        v.hidden = !on;
        v.classList.toggle('active', on);
      });

      renderView();

      gsap.killTweensOf(targetViewEl);
      gsap.fromTo(targetViewEl, 
        { opacity: 0, y: 15 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }
      );
    };

    if (visibleViewEl && visibleViewEl !== targetViewEl) {
      gsap.to(visibleViewEl, {
        opacity: 0,
        y: -10,
        duration: 0.2,
        ease: 'power2.in',
        onComplete: runReveal
      });
    } else {
      runReveal();
    }
  } else {
    allViews.forEach((v) => {
      const on = v.id === targetViewId;
      v.hidden = !on;
      v.classList.toggle('active', on);
    });
    const tv = document.getElementById(targetViewId);
    if (tv && !reduceMotion) { 
      tv.classList.remove('active'); 
      void tv.offsetWidth; 
      tv.classList.add('active'); 
    }
    renderView();
  }
}
function renderView() {
  if (!DATA || DATA.empty) return;
  if (activeView === 'overview') {
    renderExecSummary(); renderKpis(); renderPicks(); renderAlloc(); renderMovers(); renderFxWidget(); renderMarketRegime();
    triggerRevealAnimations($('#view-overview'));
  }
  else if (activeView === 'us' || activeView === 'bist' || activeView === 'crypto') {
    $('#marketChartTitle').textContent = VIEW_META[activeView][0] + ' — Yatırım Puanları';
    const list = currentList();
    const selected = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
    renderMarketStatus(); renderAssetDesk(selected); renderScoreChart(); renderTable(); renderErrors();
    triggerRevealAnimations($('#view-market'));
  } else if (activeView === 'report') {
    renderReport();
  } else if (activeView === 'portfolio') {
    renderPortfolioView();
  } else if (activeView === 'screener') {
    renderScreenerView();
  } else if (activeView === 'backtest') {
    renderBacktestView();
  } else if (activeView === 'forecast') {
    renderForecastView();
  }
}

/* ---------- Günlük Rapor ---------- */
async function renderReport() {
  const el = $('#reportContent');
  let data = null;
  try { data = await (await fetch('/api/report', { cache: 'no-store' })).json(); } catch (e) { data = null; }
  const base = data && data.base;
  const ai = data && data.ai;
  if (!base) {
    el.innerHTML = '<div class="card reveal"><div class="rep-empty">Henüz rapor üretilmedi.<br>Her sabah 09:00\'da otomatik oluşturulur — ya da elle: <code>node src/report.js</code></div></div>';
    return;
  }
  const s = base.sentiment;
  const sc = s.label === 'Pozitif' ? 'sent-pos' : s.label === 'Nötr' ? 'sent-neu' : 'sent-cau';
  const aiBadge = ai ? '<span class="ai-badge">✦ AI · canlı makro yorum</span>' : '';

  let h = '';
  // Başlık
  h += '<div class="card reveal"><div class="report-head"><div>' +
    '<h2>📰 Günlük Piyasa Raporu</h2><div class="report-date">' + base.date + ' · ' + s.total + ' varlık · ' + s.buys + ' AL sinyali · ' + s.gainers + ' yükselen</div></div>' +
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + aiBadge + '<span class="sent-pill ' + sc + '">' + s.label + ' · ' + s.avg + '/100</span></div></div></div>';

  // AI makro + haber
  if (ai && ai.macroSummary) {
    h += '<div class="card reveal"><div class="card-head"><h2>🌍 Makro & Dünya Durumu</h2><span class="ai-badge">✦ AI</span></div>' +
      '<p class="rep-macro">' + esc(ai.macroSummary) + '</p>';
    if (Array.isArray(ai.worldNews) && ai.worldNews.length) {
      h += '<div class="rep-section"><h3>Öne çıkan gelişmeler</h3>' +
        ai.worldNews.map((n) => {
          const imp = (n.impact || '').toLowerCase();
          // "olumsuz" da "olum" içerir — önce olumsuz/negatifi kontrol et
          const cls = imp.includes('olums') || imp.includes('neg') ? 'imp-neg' : imp.includes('oluml') || imp.includes('pos') ? 'imp-pos' : 'imp-neutral';
          const lbl = cls === 'imp-neg' ? 'olumsuz' : cls === 'imp-pos' ? 'olumlu' : 'nötr';
          return '<div class="news-item"><span class="news-impact ' + cls + '">' + lbl + '</span><span>' + esc(n.title || '') + '</span></div>';
        }).join('') + '</div>';
    }
    h += '</div>';
  }

  // Bu hafta: katalizör takvimi + CFO senaryo analizi
  h += weeklyHtml(base, ai);

  // Fırsatlar
  if (base.opportunities && base.opportunities.length) {
    h += '<div class="card reveal"><div class="card-head"><h2>⭐ Bugünün Fırsatları</h2><span class="card-sub">en yüksek teknik puan</span></div>' +
      base.opportunities.map((o, i) =>
        '<div class="opp-row"><span class="rank">' + (i + 1) + '</span><div class="opp-meta"><div class="psym">' + o.symbol + ' <span class="pmkt">· ' + o.market + '</span></div><div class="opp-sum">' + esc(o.summary || '') + '</div></div><span class="badge tone-buy">' + o.label + ' · ' + o.score + '</span></div>'
      ).join('') + '</div>';
  }

  // Teknik sinyaller
  const sig = base.signals || {};
  const sigGroup = (title, arr, cls) => (arr && arr.length) ? '<div class="rep-section"><h3>' + title + '</h3><div class="chips">' + arr.map((t) => '<span class="chip">' + esc(t) + '</span>').join('') + '</div></div>' : '';
  const anySig = ['overbought', 'oversold', 'goldenCross', 'deathCross', 'volumeSpike', 'strongMomentum'].some((k) => sig[k] && sig[k].length);
  if (anySig) {
    h += '<div class="card reveal"><div class="card-head"><h2>📡 Teknik Sinyaller</h2></div>' +
      sigGroup('💪 Güçlü momentum (MACD↑)', sig.strongMomentum) +
      sigGroup('🔥 Hacim patlaması', sig.volumeSpike) +
      sigGroup('✨ Altın kesişim', sig.goldenCross) +
      sigGroup('🔴 Aşırı alım (RSI≥70)', sig.overbought) +
      sigGroup('🟡 Aşırı satım (RSI≤30)', sig.oversold) +
      sigGroup('💀 Ölüm kesişimi', sig.deathCross) +
      '</div>';
  }

  // AI pazar yorumu
  if (ai && ai.commentary) {
    const c = ai.commentary;
    h += '<div class="card reveal"><div class="card-head"><h2>🗒️ Pazar Yorumu</h2><span class="ai-badge">✦ AI</span></div><div class="commentary">' +
      (c.us ? '<div class="comm"><h4>🇺🇸 ABD</h4><p>' + esc(c.us) + '</p></div>' : '') +
      (c.bist ? '<div class="comm"><h4>🇹🇷 BIST</h4><p>' + esc(c.bist) + '</p></div>' : '') +
      (c.crypto ? '<div class="comm"><h4>₿ Kripto</h4><p>' + esc(c.crypto) + '</p></div>' : '') +
      '</div></div>';
  }

  // Riskler
  if (base.risks && base.risks.length) {
    h += '<div class="card reveal"><div class="card-head"><h2>⚠️ Dikkat / Riskler</h2></div><div class="chips">' +
      base.risks.map((r) => '<span class="chip"><b>' + r.market + ' ' + r.symbol + '</b> — ' + esc(r.reason) + '</span>').join('') + '</div></div>';
  }

  // AI günün odağı + okuryazarlık ipucu
  if (ai && (ai.todayFocus || ai.literacyTip)) {
    h += '<div class="card reveal">';
    if (ai.todayFocus) h += '<div class="card-head"><h2>🎯 Bugün Neye Dikkat?</h2><span class="ai-badge">✦ AI</span></div><p class="rep-macro">' + esc(ai.todayFocus) + '</p>';
    if (ai.literacyTip) h += '<div class="tip-card" style="margin-top:14px"><h4>📚 ' + esc(ai.literacyTip.title || 'Günün dersi') + '</h4><p>' + esc(ai.literacyTip.body || '') + '</p></div>';
    h += '</div>';
  }

  h += '<div class="card reveal"><p class="muted">Üretim: ' + (ai ? 'kural-tabanlı teknik + AI makro/haber katmanı' : 'kural-tabanlı teknik (AI katmanı bekleniyor)') + ' · ' + relTime(base.generatedAt) + '. <b>Yatırım tavsiyesi değildir.</b></p></div>';

  el.innerHTML = h;
  triggerRevealAnimations(el);
}
function esc(t) { return String(t == null ? '' : t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function flag(c) { return { US: '🇺🇸', CN: '🇨🇳', JP: '🇯🇵', DE: '🇩🇪', GB: '🇬🇧', EU: '🇪🇺', EA: '🇪🇺', TR: '🇹🇷', FR: '🇫🇷' }[c] || c; }

// Bu haftanın katalizör takvimi + CFO senaryo analizi (base = deterministik, ai = yorum)
function weeklyHtml(base, ai) {
  const cal = base.calendar || {};
  const wo = (ai && ai.weeklyOutlook) || null;
  const econ = cal.economic || [];
  const earn = cal.earnings || [];
  const news = cal.companyNews || [];
  if (!wo && !econ.length && !earn.length && !news.length) return '';

  let h = '<div class="card reveal"><div class="card-head"><h2>📅 Bu Hafta: Veri &amp; Katalizör Takvimi</h2>' + (wo ? '<span class="ai-badge">✦ AI · CFO senaryo</span>' : '') + '</div>';

  if (wo && wo.cfoSummary) h += '<div class="tip-card" style="margin-bottom:16px"><h4>🧠 CFO Bakışı — Haftanın Sentezi</h4><p>' + esc(wo.cfoSummary) + '</p></div>';

  // Senaryo kartları
  if (wo && Array.isArray(wo.events) && wo.events.length) {
    h += '<div class="rep-section"><h3>Veri beklentileri & senaryo analizi</h3><div class="scenarios">';
    wo.events.forEach((ev) => {
      h += '<div class="scenario"><div class="sc-head"><span class="sc-event">' + esc(ev.event || '') + (ev.importance === 'high' ? ' <span class="news-impact imp-neg">yüksek etki</span>' : '') + '</span><span class="sc-date">' + esc(ev.date || '') + '</span></div>' +
        (ev.consensus ? '<div class="sc-row"><span class="sc-lbl">Beklenti</span><span>' + esc(ev.consensus) + '</span></div>' : '') +
        (ev.myCall ? '<div class="sc-row"><span class="sc-lbl sc-my">Öngörüm</span><span>' + esc(ev.myCall) + '</span></div>' : '') +
        (ev.reasoning ? '<div class="sc-reason">' + esc(ev.reasoning) + '</div>' : '') +
        '<div class="sc-scen">' +
        (ev.ifLower ? '<div class="sc-low"><b>↓ Düşük gelirse:</b> ' + esc(ev.ifLower) + '</div>' : '') +
        (ev.ifHigher ? '<div class="sc-high"><b>↑ Yüksek gelirse:</b> ' + esc(ev.ifHigher) + '</div>' : '') +
        '</div>' +
        (Array.isArray(ev.affected) && ev.affected.length ? '<div class="sc-affected">Etkilenen: ' + ev.affected.map((a) => '<span class="chip">' + esc(a) + '</span>').join(' ') + '</div>' : '') +
        '</div>';
    });
    h += '</div></div>';
  }

  // Ham ekonomik takvim (gün gün)
  if (econ.length) {
    h += '<div class="rep-section"><h3>Ekonomik takvim · ' + esc(cal.weekFrom || '') + ' → ' + esc(cal.weekTo || '') + '</h3><div class="cal-list">';
    const byDate = {};
    econ.forEach((e) => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    Object.keys(byDate).sort().forEach((d) => {
      h += '<div class="cal-day"><div class="cal-date">' + d + '</div>';
      byDate[d].slice(0, 8).forEach((e) => {
        h += '<div class="cal-ev"><span class="cal-flag">' + flag(e.country) + '</span><span class="cal-name">' + esc(e.event) + '</span>' +
          '<span class="cal-num">bekl. ' + (e.estimate != null ? esc(String(e.estimate)) : '–') + ' · önc. ' + (e.prev != null ? esc(String(e.prev)) : '–') + '</span>' +
          (e.impact === 'high' ? '<span class="news-impact imp-neg">yüksek</span>' : '') + '</div>';
      });
      h += '</div>';
    });
    h += '</div></div>';
  }

  // Bilanço takvimi
  if (earn.length) {
    const wlEarn = earn.filter((e) => e.watch);
    h += '<div class="rep-section"><h3>Bilanço takvimi</h3>';
    if (wlEarn.length) h += '<p class="muted" style="margin:0 0 8px">⭐ Takip listenizden: ' + wlEarn.map((e) => '<b>' + esc(e.symbol) + '</b> (' + esc(e.date) + ')').join(', ') + '</p>';
    else h += '<p class="muted" style="margin:0 0 8px">Bu hafta takip listenizden bilanço açıklayan yok.</p>';
    if (wo && wo.earningsFocus) h += '<p class="rep-macro" style="font-size:13px;margin-bottom:10px">' + esc(wo.earningsFocus) + '</p>';
    h += '<div class="chips">' + earn.slice(0, 14).map((e) => '<span class="chip' + (e.watch ? ' chip-watch' : '') + '">' + esc(e.symbol) + ' · ' + esc(e.date) + (e.epsEstimate != null ? ' · EPS ' + esc(String(e.epsEstimate)) : '') + '</span>').join('') + '</div></div>';
  }

  // Şirket haber akışı
  if (news.length) {
    h += '<div class="rep-section"><h3>Şirket haber akışı</h3>' + news.map((n) => '<div class="news-item"><span class="news-impact imp-neutral">' + esc(n.symbol) + '</span><span>' + esc(n.headline || '') + (n.source ? ' <span class="muted">— ' + esc(n.source) + '</span>' : '') + '</span></div>').join('') + '</div>';
  }

  if (wo && wo.positioning) h += '<div class="tip-card" style="margin-top:14px"><h4>🎯 Pozisyon Disiplini (CFO)</h4><p>' + esc(wo.positioning) + '</p></div>';

  h += '</div>';
  return h;
}

/* ---------- Yardımcılar ---------- */
function allScored() {
  const tag = (arr, m) => (arr || []).filter((x) => x.analysis && x.analysis.score != null).map((x) => ({ market: m, ...x }));
  return [...tag(DATA.us, 'ABD'), ...tag(DATA.bist, 'BIST'), ...tag(DATA.crypto, 'Kripto')];
}
function currentList() {
  const map = { us: DATA.us, bist: DATA.bist, crypto: DATA.crypto };
  let list = (map[activeView] || []).filter((x) => x.analysis && x.analysis.score != null);
  return list.slice().sort((a, b) => {
    if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
    if (sortBy === 'changePct') return (b.changePct || -999) - (a.changePct || -999);
    if (sortBy === 'rsi') return ((b.ind && b.ind.rsi) || -999) - ((a.ind && a.ind.rsi) || -999);
    return b.analysis.score - a.analysis.score;
  });
}

/* ---------- Genel bakış ---------- */
function renderKpis() {
  const all = allScored();
  const avg = all.length ? Math.round(all.reduce((a, x) => a + x.analysis.score, 0) / all.length) : 0;
  const buys = all.filter((x) => x.analysis.tone === 'strong-buy' || x.analysis.tone === 'buy').length;
  const gainers = all.filter((x) => typeof x.changePct === 'number' && x.changePct > 0).length;
  const sentiment = avg >= 60 ? 'Pozitif 🟢' : avg >= 45 ? 'Nötr 🟡' : 'Temkinli 🔴';
  const c = DATA.counts || {};
  const cards = [
    { label: 'Takip Edilen Varlık', num: all.length, sub: (c.us || 0) + ' ABD · ' + (c.bist || 0) + ' BIST · ' + (c.crypto || 0) + ' kripto' },
    { label: 'Ortalama Teknik Puan', num: avg, sub: '100 üzerinden' },
    { label: 'Genel Piyasa Hissi', text: sentiment, sub: 'ortalama puana göre' },
    { label: 'AL / GÜÇLÜ AL Sinyali', num: buys, sub: 'varlık önerilen' },
    { label: 'Bugün Yükselen', num: gainers, suf: ' / ' + all.length, sub: 'pozitif günlük değişim' },
  ];
  $('#kpis').innerHTML = cards
    .map((k) =>
      '<div class="kpi"><div class="label">' + k.label + '</div><div class="value">' +
      (k.text != null ? k.text : '<span class="cv" data-count="' + k.num + '">0</span>' + (k.suf || '')) +
      '<small>' + k.sub + '</small></div></div>'
    )
    .join('');
  document.querySelectorAll('#kpis .cv').forEach((el) => countUp(el, +el.dataset.count));
}

function renderPicks() {
  const picks = DATA.topPicks || [];
  $('#topPicks').innerHTML =
    picks
      .map((p, i) => {
        const source = findPickAsset(p);
        const mini = source ? decisionMini(source.decision) : '';
        return '<div class="pick"><div class="rank">' + (i + 1) + '</div>' +
        '<div class="pmeta"><div class="psym">' + p.symbol + ' <span class="pmkt">· ' + p.market + '</span></div>' +
        '<div class="pname">' + (p.name || '') + ' — ' + fmtPrice(p.price, p.currency) + '</div></div>' +
        mini + '<span class="badge tone-' + p.tone + '">' + p.label + ' · ' + p.score + '</span></div>';
      })
      .join('') || '<p class="muted">Henüz veri yok.</p>';
}

/* ---------- Yönetici Özeti / Risk Panosu ---------- */
function renderExecSummary() {
  const el = $('#execSummary');
  if (!el) return;
  if (!window.FinansInsights || !window.FinansInsights.buildExecutiveSummary) { el.innerHTML = ''; return; }
  const s = window.FinansInsights.buildExecutiveSummary(DATA);
  if (!s) { el.innerHTML = ''; return; }
  const tone = s.riskLevel.tone;
  el.innerHTML = '<div class="card reveal exec-card exec-' + tone + '">' +
    '<div class="exec-head"><h2>🧠 Yönetici Özeti</h2>' +
      '<span class="exec-risk er-' + tone + '">Risk: ' + esc(s.riskLevel.label) + '</span></div>' +
    '<p class="exec-headline">' + esc(s.headline) + '</p>' +
    '<ol class="exec-actions">' + s.actions.map((a) => '<li>' + esc(a) + '</li>').join('') + '</ol>' +
  '</div>';
}

/* ---------- Piyasa Rejimi (piyasa-seviye) ---------- */
function renderMarketRegime() {
  const el = $('#marketRegime');
  if (!el) return;
  const mr = DATA && DATA.marketRegime;
  if (!mr) { el.innerHTML = '<p class="muted">Piyasa rejimi verisi henüz yok (sonraki güncellemede gelir).</p>'; return; }
  const TONE = { calm: 'pos', normal: '', stress: 'warn', panic: 'neg', 'long-ok': 'pos', cash: 'neg', coupled: '', decoupled: 'pos', mixed: '' };
  const tile = (flag, name, r) => {
    if (!r) return '<div class="regime-tile"><div class="rt-head"><span class="rt-mkt">' + flag + ' ' + name + '</span></div><p class="rt-advice muted">Veri yok</p></div>';
    const t = TONE[r.type] || '';
    return '<div class="regime-tile rt-' + t + '">' +
      '<div class="rt-head"><span class="rt-mkt">' + flag + ' ' + name + '</span><span class="rt-badge rt-' + t + '">' + esc(r.label) + '</span></div>' +
      '<div class="rt-metric">' + esc(r.metric) + ': <b>' + r.value + '</b></div>' +
      '<p class="rt-advice">' + esc(r.advice) + '</p>' +
    '</div>';
  };
  el.innerHTML = tile('🇺🇸', 'ABD', mr.us) + tile('₿', 'Kripto', mr.crypto) + tile('🇹🇷', 'BIST', mr.bist);
}

function renderAlloc() {
  const alloc = (DATA.allocation || []).filter((a) => a.weight > 0);
  if (allocChart) allocChart.destroy();
  if (!window.Chart || !alloc.length) return;
  allocChart = new Chart($('#allocChart'), {
    type: 'doughnut',
    data: { labels: alloc.map((a) => a.label), datasets: [{ data: alloc.map((a) => a.weight), backgroundColor: ['#1e222b', '#2d323f', '#525866', '#7f8798', '#b5bac9', '#f1f3f6'], borderColor: '#12151b', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: reduceMotion ? 0 : 700 }, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: '#7d8590', boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } } }, tooltip: { callbacks: { label: (x) => x.label + ': %' + x.raw } } } },
  });
}

function renderMovers() {
  const all = allScored().slice().sort((a, b) => b.analysis.score - a.analysis.score).slice(0, 12);
  if (moversChart) moversChart.destroy();
  if (!window.Chart || !all.length) return;
  moversChart = new Chart($('#moversChart'), {
    type: 'bar',
    data: { labels: all.map((x) => x.symbol), datasets: [{ data: all.map((x) => x.analysis.score), backgroundColor: all.map((x, i) => i === 0 ? '#f1f3f6' : '#2d323f'), hoverBackgroundColor: '#525866', borderRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: reduceMotion ? 0 : 750, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => { const a = all[x.dataIndex]; return a.market + ' · puan ' + x.raw + ' — ' + a.analysis.label; } } } },
      scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255, 255, 255, 0.02)' }, ticks: { color: '#7d8590', font: { family: 'Plus Jakarta Sans' } } }, x: { grid: { display: false }, ticks: { color: '#f1f3f6', font: { size: 11, family: 'Plus Jakarta Sans' } } } },
    },
  });
}

/* ---------- Döviz Kurları Widget ---------- */
function renderFxWidget() {
  const container = $('#fxWidget');
  if (!container) return;

  const fx = DATA && DATA.fx;
  if (!fx || !fx.rates || Object.keys(fx.rates).length === 0) {
    container.innerHTML = '<p class="muted" style="padding:12px;">Döviz kuru verisi henüz yok.</p>';
    return;
  }

  const pairs = ['USD/TRY', 'EUR/TRY', 'GBP/TRY', 'EUR/USD'];
  const html = pairs.map(label => {
    const r = fx.rates[label];
    if (!r) return '';
    const chg = r.changePct;
    const chgCls = chg == null ? '' : chg >= 0 ? 'pos' : 'neg';
    const chgStr = chg == null ? '–' : (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
    const spark = r.closes && r.closes.length >= 2 ? sparkFx(r.closes) : '';
    const age = r.quoteTime ? relTime(r.quoteTime) : '';
    return `
      <div class="fx-card">
        <div class="fx-pair">${label}</div>
        <div class="fx-rate">${r.price != null ? r.price.toFixed(4) : '–'}</div>
        <div class="fx-chg ${chgCls}">${chgStr}</div>
        ${spark}
        ${age ? `<div class="fx-age">${age}</div>` : ''}
      </div>`;
  }).join('');

  container.innerHTML = html || '<p class="muted">Kur verisi yükleniyor...</p>';
}

function sparkFx(closes) {
  if (!closes || closes.length < 2) return '';
  const w = 120, h = 32, pad = 2;
  const min = Math.min(...closes), max = Math.max(...closes), rng = max - min || 1;
  const pts = closes.map((v, i) =>
    (pad + (i / (closes.length - 1)) * (w - 2 * pad)).toFixed(1) + ',' +
    (h - pad - ((v - min) / rng) * (h - 2 * pad)).toFixed(1)
  ).join(' ');
  const col = closes[closes.length - 1] >= closes[0] ? '#28d793' : '#ef4444';
  return `<svg class="fx-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.5"/></svg>`;
}

function renderMarketStatus() {
  const m = DATA.market || {};
  const asOf = { us: m.usAsOf, bist: m.bistAsOf, crypto: m.cryptoAsOf }[activeView];
  const name = { us: 'ABD piyasası', bist: 'BIST', crypto: 'Kripto piyasası' }[activeView];
  const st = marketStatus(activeView);
  const box = $('#marketStatus');
  box.className = 'mstatus reveal ' + (st.open ? 'open' : 'closed');
  box.innerHTML = '<span class="dot"></span><b>' + name + ':</b> ' + st.label + '<span class="asof">Gösterilen fiyatlar: ' + relTime(asOf) + '</span>';
}

function renderScoreChart() {
  const list = currentList();
  if (scoreChart) scoreChart.destroy();
  if (!window.Chart || !list.length) return;
  scoreChart = new Chart($('#scoreChart'), {
    type: 'bar',
    data: { labels: list.map((x) => x.symbol), datasets: [{ data: list.map((x) => x.analysis.score), backgroundColor: list.map((x, i) => i === 0 ? '#f1f3f6' : '#2d323f'), hoverBackgroundColor: '#525866', borderRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: reduceMotion ? 0 : 700, easing: 'easeOutQuart' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => 'Puan ' + x.raw + ' — ' + list[x.dataIndex].analysis.label } } },
      scales: { y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255, 255, 255, 0.02)' }, ticks: { color: '#7d8590', font: { family: 'Plus Jakarta Sans' } } }, x: { grid: { display: false }, ticks: { color: '#f1f3f6', font: { size: 11, family: 'Plus Jakarta Sans' } } } },
    },
  });
}

function deskDefaultInterval(market) {
  return market === 'crypto' ? '1h' : '1d';
}
function deskIntervals(market) {
  return market === 'crypto'
    ? [['1m', '1 dk'], ['5m', '5 dk'], ['15m', '15 dk'], ['1h', '1 saat'], ['4h', '4 saat'], ['1d', '1 gün']]
    : [['5m', '5 dk'], ['15m', '15 dk'], ['1h', '1 saat'], ['1d', '1 gün']];
}
function syncDeskControls(market, interval) {
  const sel = $('#deskIntervalSel');
  if (!sel) return;
  const opts = deskIntervals(market);
  sel.innerHTML = opts.map(([v, label]) => '<option value="' + v + '">' + label + '</option>').join('');
  sel.value = opts.some(([v]) => v === interval) ? interval : deskDefaultInterval(market);
  document.querySelectorAll('[data-desk-mode]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.deskMode === assetDeskState.mode);
  });
  updateSmaButtonVisual();
}
function destroyAssetDeskChart() {
  if (assetDeskResize) {
    assetDeskResize.disconnect();
    assetDeskResize = null;
  }
  if (assetDeskChart && typeof assetDeskChart.remove === 'function') {
    assetDeskChart.remove();
  }
  assetDeskChart = null;
}
function addLwSeries(chart, name, options) {
  const lw = window.LightweightCharts || {};
  if (chart.addSeries && lw[name]) return chart.addSeries(lw[name], options);
  if (name === 'CandlestickSeries' && chart.addCandlestickSeries) return chart.addCandlestickSeries(options);
  if (name === 'LineSeries' && chart.addLineSeries) return chart.addLineSeries(options);
  if (name === 'HistogramSeries' && chart.addHistogramSeries) return chart.addHistogramSeries(options);
  return null;
}
function addTradePriceLines(series, asset) {
  const trade = asset && asset.decision && asset.decision.trade;
  if (!series || !series.createPriceLine || !trade || !trade.available) return;
  [
    ['Giriş', trade.entry, '#4382ff'],
    ['Stop', trade.stop, '#ef4444'],
    ['Hedef', trade.target, '#28d793'],
  ].forEach(([title, price, color]) => {
    if (price == null || isNaN(price)) return;
    series.createPriceLine({
      price,
      color,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title,
    });
  });
}
// Indicator calculations for Chart Desk overlay
function calculateSMA(bars, period) {
  const smaData = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    const close = bars[i].close;
    sum += close;
    if (i >= period - 1) {
      if (i >= period) {
        const prevClose = bars[i - period].close;
        sum -= prevClose;
      }
      smaData.push({ time: bars[i].time, value: sum / period });
    }
  }
  return smaData;
}

function calculateEMA(closes, period) {
  if (!closes || closes.length < period) return [];
  const k = 2 / (period + 1);
  const out = new Array(closes.length).fill(null);
  let prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < closes.length; i++) {
    prev = closes[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function calculateRSI(closes, period = 14) {
  if (!closes || closes.length < period + 1) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateMACD(closes, fast = 12, slow = 26, signal = 9) {
  if (!closes || closes.length < slow + signal) return null;
  const ef = calculateEMA(closes, fast);
  const es = calculateEMA(closes, slow);
  const macdLine = [];
  for (let i = 0; i < closes.length; i++) {
    if (ef[i] != null && es[i] != null) {
      macdLine.push(ef[i] - es[i]);
    }
  }
  const sigSeries = calculateEMA(macdLine, signal);
  const macdNow = macdLine[macdLine.length - 1];
  const sigNow = sigSeries[sigSeries.length - 1];
  return {
    macd: macdNow,
    signal: sigNow,
    histogram: (macdNow != null && sigNow != null) ? macdNow - sigNow : null
  };
}

function updateSmaButtonVisual() {
  const btn = $('#deskSmaToggleBtn');
  const txt = $('#deskSmaStatusText');
  if (!btn || !txt) return;
  
  if (assetDeskState.showSMA) {
    btn.dataset.active = 'true';
    txt.textContent = 'AÇIK';
    txt.style.color = '#28d793';
    btn.style.borderColor = 'var(--text)';
  } else {
    btn.dataset.active = 'false';
    txt.textContent = 'KAPALI';
    txt.style.color = 'var(--muted)';
    btn.style.borderColor = 'var(--border)';
  }
}

function drawAssetDeskChart(payload, asset) {
  const container = $('#assetChart');
  const note = $('#assetChartNote');
  if (!container || !note) return;
  destroyAssetDeskChart();
  container.innerHTML = '';
  if (!window.LightweightCharts) {
    container.innerHTML = '<div class="chart-loading">Lightweight Charts yüklenemedi.</div>';
    return;
  }
  const bars = (payload && payload.bars) || [];
  if (!bars.length) {
    container.innerHTML = '<div class="chart-loading">Grafik için yeterli veri yok.</div>';
    return;
  }
  const lw = window.LightweightCharts;
  const chart = lw.createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight || 360,
    layout: {
      background: { type: lw.ColorType ? lw.ColorType.Solid : 'solid', color: '#0f1115' },
      textColor: '#7d8590',
      fontFamily: 'Plus Jakarta Sans',
    },
    grid: {
      vertLines: { color: 'rgba(255, 255, 255, 0.02)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.02)' },
    },
    rightPriceScale: { borderColor: 'rgba(255,255,255,.04)' },
    timeScale: { borderColor: 'rgba(255,255,255,.04)', timeVisible: assetDeskState.interval !== '1d' },
    crosshair: { mode: 0 },
  });
  const volumeData = bars.map((b) => ({
    time: b.time,
    value: b.volume || 0,
    color: b.close >= b.open ? 'rgba(241, 243, 246, 0.15)' : 'rgba(82, 88, 102, 0.15)',
  }));
  const vol = addLwSeries(chart, 'HistogramSeries', {
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    color: 'rgba(125, 133, 144, 0.15)',
  });
  if (vol) {
    vol.setData(volumeData);
    if (chart.priceScale) {
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    }
  }

  const mainOptions = assetDeskState.mode === 'line'
    ? { color: '#f1f3f6', lineWidth: 1.8, priceLineVisible: false }
    : {
        upColor: '#f1f3f6',
        downColor: '#1c1f26',
        borderVisible: true,
        borderUpColor: '#f1f3f6',
        borderDownColor: '#2d323f',
        wickUpColor: '#7f8798',
        wickDownColor: '#7f8798',
      };
  const main = addLwSeries(chart, assetDeskState.mode === 'line' ? 'LineSeries' : 'CandlestickSeries', mainOptions);
  if (!main) {
    container.innerHTML = '<div class="chart-loading">Grafik serisi oluşturulamadı.</div>';
    return;
  }
  main.setData(assetDeskState.mode === 'line'
    ? bars.map((b) => ({ time: b.time, value: b.close }))
    : bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
  
  addTradePriceLines(main, asset);

  // Teknik indikatörleri hesapla ve paneli güncelle
  const closes = bars.map(b => b.close);
  const rsiVal = calculateRSI(closes, 14);
  const macdVal = calculateMACD(closes, 12, 26, 9);
  const sma20Data = calculateSMA(bars, 20);
  const sma50Data = calculateSMA(bars, 50);

  const currentSma20 = sma20Data.length ? sma20Data[sma20Data.length - 1].value : null;
  const currentSma50 = sma50Data.length ? sma50Data[sma50Data.length - 1].value : null;

  const rsiEl = $('#ind-rsi-val');
  const macdEl = $('#ind-macd-val');
  const sma20El = $('#ind-sma20-val');
  const sma50El = $('#ind-sma50-val');
  const panelEl = $('#desk-indicators-panel');

  if (panelEl) {
    panelEl.style.opacity = '1';
  }

  if (rsiEl) {
    if (rsiVal != null) {
      rsiEl.textContent = rsiVal.toFixed(1);
      if (rsiVal >= 70) rsiEl.style.color = '#ef4444';
      else if (rsiVal <= 30) rsiEl.style.color = '#28d793';
      else rsiEl.style.color = 'var(--text)';
    } else {
      rsiEl.textContent = '–';
      rsiEl.style.color = 'var(--text)';
    }
  }

  if (macdEl) {
    if (macdVal && macdVal.macd != null) {
      macdEl.textContent = `${macdVal.macd.toFixed(2)} / ${macdVal.signal.toFixed(2)}`;
      if (macdVal.histogram > 0) macdEl.style.color = '#28d793';
      else if (macdVal.histogram < 0) macdEl.style.color = '#ef4444';
      else macdEl.style.color = 'var(--text)';
    } else {
      macdEl.textContent = '–';
      macdEl.style.color = 'var(--text)';
    }
  }

  if (sma20El) {
    sma20El.textContent = currentSma20 != null ? fmtPrice(currentSma20, payload.currency) : '–';
  }
  if (sma50El) {
    sma50El.textContent = currentSma50 != null ? fmtPrice(currentSma50, payload.currency) : '–';
  }

  // Eğer SMA çizgileri aktifse çizdir
  if (assetDeskState.showSMA) {
    const sma20Series = addLwSeries(chart, 'LineSeries', {
      color: '#4382ff',
      lineWidth: 1.2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    if (sma20Series) {
      sma20Series.setData(sma20Data);
    }

    const sma50Series = addLwSeries(chart, 'LineSeries', {
      color: '#ff9f43',
      lineWidth: 1.2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    if (sma50Series) {
      sma50Series.setData(sma50Data);
    }
  }

  chart.timeScale().fitContent();
  assetDeskResize = new ResizeObserver(() => {
    chart.applyOptions({ width: container.clientWidth, height: container.clientHeight || 360 });
  });
  assetDeskResize.observe(container);
  assetDeskChart = chart;
  const last = bars[bars.length - 1];
  note.innerHTML = '<span>' + payload.source.toUpperCase() + ' · ' + payload.sourceSymbol + ' · ' + payload.interval + '</span>' +
    '<span>Son kapanış: <b>' + fmtPrice(last.close, payload.currency) + '</b></span>';
}
async function renderAssetDesk(asset) {
  const title = $('#deskTitle');
  const meta = $('#deskMeta');
  const chartBox = $('#assetChart');
  const note = $('#assetChartNote');
  if (!title || !meta || !chartBox || !note) return;
  if (!asset) {
    title.textContent = 'Varlık Grafiği';
    meta.textContent = 'Bu pazarda grafik için sembol yok';
    note.textContent = '';
    chartBox.innerHTML = '<div class="chart-loading">Sembol bekleniyor.</div>';
    destroyAssetDeskChart();
    return;
  }
  const market = asset.market || activeView;
  if (assetDeskState.market !== market) {
    assetDeskState.interval = deskDefaultInterval(market);
  }
  assetDeskState.market = market;
  assetDeskState.symbol = asset.symbol;
  assetDeskState.interval = assetDeskState.interval || deskDefaultInterval(market);
  syncDeskControls(market, assetDeskState.interval);
  title.textContent = asset.symbol + ' · ' + (asset.analysis ? asset.analysis.label : 'Grafik');
  meta.textContent = (asset.name || asset.symbol) + ' · ' + fmtPrice(asset.price, asset.currency) + ' · ' + fmtPct(asset.changePct);
  chartBox.innerHTML = '<div class="chart-loading">Grafik yükleniyor...</div>';
  note.textContent = '';
  try {
    const qs = new URLSearchParams({
      market,
      symbol: asset.symbol,
      interval: assetDeskState.interval,
    });
    if (market === 'crypto') qs.set('limit', '500');
    else qs.set('range', assetDeskState.interval === '1d' ? '1y' : '5d');
    const res = await fetch('/api/chart?' + qs.toString(), { cache: 'no-store' });
    const payload = await res.json();
    if (!res.ok || payload.error) throw new Error(payload.error || 'Chart hatası');
    if (assetDeskState.symbol !== asset.symbol || assetDeskState.market !== market) return;
    drawAssetDeskChart(payload, asset);
  } catch (e) {
    destroyAssetDeskChart();
    chartBox.innerHTML = '<div class="chart-loading">Grafik alınamadı.</div>';
    note.textContent = (e && e.message) || 'Bilinmeyen hata';
  }
}

/* ---------- Tablo + detay ---------- */
function rsiColor(rsi) {
  if (rsi == null) return 'var(--muted)';
  if (rsi >= 70) return 'var(--red)';
  if (rsi <= 30) return 'var(--yellow)';
  if (rsi >= 50) return 'var(--green)';
  return '#f1f3f6';
}
function macdCell(ind) {
  const m = ind && ind.macd;
  if (!m || m.histogram == null) return '<span style="color:var(--muted)">–</span>';
  const rising = m.prevHistogram != null && m.histogram > m.prevHistogram;
  let sym, color;
  if (m.histogram > 0 && rising) { sym = '▲▲'; color = 'var(--green)'; }
  else if (m.histogram > 0) { sym = '▲'; color = 'var(--accent)'; }
  else if (rising) { sym = '▽'; color = 'var(--yellow)'; }
  else { sym = '▼'; color = 'var(--red)'; }
  return '<span style="color:' + color + '" title="hist ' + m.histogram + '">' + sym + '</span>';
}
function sparkline(spark) {
  if (!spark || spark.length < 2) return '';
  const w = 140, h = 38, pad = 2;
  const min = Math.min(...spark), max = Math.max(...spark), rng = max - min || 1;
  const pts = spark.map((v, i) => (pad + (i / (spark.length - 1)) * (w - 2 * pad)).toFixed(1) + ',' + (h - pad - ((v - min) / rng) * (h - 2 * pad)).toFixed(1)).join(' ');
  const col = spark[spark.length - 1] >= spark[0] ? '#28d793' : '#ef4444';
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><polyline class="spark-path" pathLength="1" points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="1.6"/></svg>';
}
function subBars(sub) {
  const items = [['Momentum', sub.momentum], ['Trend', sub.trend], ['Hacim', sub.hacim], ['Volatilite', sub.volatilite]];
  if (sub.temel != null) items.push(['Temel/Analist', sub.temel]);
  return '<div class="subscores">' + items.map(([k, v]) => {
    const col = v >= 60 ? '#28d793' : v >= 45 ? '#eab308' : '#ef4444';
    return '<div class="subrow"><span class="sublbl">' + k + '</span><span class="subbar"><i style="width:' + (v || 0) + '%;background:' + col + '"></i></span><span class="subval">' + (v == null ? '–' : v) + '</span></div>';
  }).join('') + '</div>';
}
function kv(label, val) { return val == null || val === '' ? '' : '<div class="kv"><span>' + label + '</span><b>' + val + '</b></div>'; }
function indGrid(x) {
  const i = x.ind || {}, m = i.macd || {}, bb = i.bollinger || {};
  const rows = [];
  rows.push(kv('RSI(14)', i.rsi));
  rows.push(kv('MACD / sinyal / hist', m.macd != null ? m.macd + ' / ' + m.signal + ' / ' + m.histogram : null));
  rows.push(kv('SMA 20/50/200', [i.sma20, i.sma50, i.sma200].filter((v) => v != null).join(' / ')));
  rows.push(kv('EMA 12/26', [i.ema12, i.ema26].filter((v) => v != null).join(' / ')));
  rows.push(kv('Bollinger Alt/Orta/Üst', bb.lower != null ? bb.lower + ' / ' + bb.middle + ' / ' + bb.upper : null));
  rows.push(kv('Bollinger %B / genişlik', bb.pctB != null ? bb.pctB + ' / %' + bb.bandwidth : null));
  rows.push(kv('ATR / ATR%', i.atr != null ? i.atr + ' / %' + i.atrPct : null));
  rows.push(kv('Yıllık volatilite', i.volatility != null ? '%' + i.volatility : null));
  rows.push(kv('Getiri 1h/1a/3a', [i.ret1w, i.ret1m, i.ret3m].map((v) => (v == null ? '–' : '%' + v)).join(' / ')));
  rows.push(kv('Getiri 6a/1y', [i.ret6m, i.ret1y].map((v) => (v == null ? '–' : '%' + v)).join(' / ')));
  rows.push(kv('52H bant konumu', i.pos52 != null ? '%' + Math.round(i.pos52 * 100) : null));
  rows.push(kv('52H düşük – yüksek', i.low52 != null ? i.low52 + ' – ' + i.high52 : null));
  rows.push(kv('Hacim / 20g ort.', i.volSpike != null ? '%' + Math.round(i.volSpike * 100) : null));
  rows.push(kv('OBV (hacim akışı)', i.obv ? (i.obv.rising ? 'yükseliyor ▲' : 'düşüyor ▼') : null));
  if (x.market === 'us') {
    rows.push(kv('F/K oranı', x.pe != null ? Math.round(x.pe * 10) / 10 : null));
    rows.push(kv('Beta', x.beta != null ? Math.round(x.beta * 100) / 100 : null));
    rows.push(kv('Piyasa değeri', x.marketCap ? fmtCap(x.marketCap) : null));
    rows.push(kv('Sektör', x.industry || null));
  }
  if (x.market === 'crypto') {
    rows.push(kv('Piyasa değeri', x.marketCap ? fmtCap(x.marketCap) : null));
    rows.push(kv('Piyasa değeri sırası', x.rank != null ? '#' + x.rank : null));
    rows.push(kv("ATH'den uzaklık", x.athChangePct != null ? '%' + Math.round(x.athChangePct) : null));
    rows.push(kv('7g / 30g getiri', [x.change7d, x.change30d].map((v) => (v == null ? '–' : '%' + Math.round(v * 10) / 10)).join(' / ')));
  }
  return '<div class="indgrid">' + rows.join('') + '</div>';
}
function reasonList(reasons) {
  return '<ul class="reasons">' + reasons.map((r) => '<li class="r-' + r.sentiment + '">' + r.text + '</li>').join('') + '</ul>';
}
function freshnessText(f) {
  if (!f) return 'Bilinmiyor';
  const age = f.ageHours == null ? '' : ' · ' + f.ageHours + 's';
  return f.label + age;
}
function confidenceText(c) {
  if (!c) return 'Bilinmiyor';
  const delta = c.scoreDelta == null ? '' : ' · ' + (c.scoreDelta > 0 ? '+' : '') + c.scoreDelta + ' puan';
  return c.label + delta;
}
function decisionPanel(x) {
  const d = x.decision;
  if (!d) return '';
  const trade = d.trade || {};
  const contradictions = d.contradictions || [];
  const tradeHtml = trade.available
    ? '<div class="trade-grid">' +
      '<div class="trade-cell"><span>Giris</span><b>' + fmtPrice(trade.entry, x.currency) + '</b></div>' +
      '<div class="trade-cell"><span>Stop</span><b>' + fmtPrice(trade.stop, x.currency) + '</b></div>' +
      '<div class="trade-cell"><span>Hedef</span><b>' + fmtPrice(trade.target, x.currency) + '</b></div>' +
      '<div class="trade-cell"><span>Risk/Odul</span><b>' + trade.riskReward + ':1</b></div>' +
      '<div class="trade-cell"><span>100k icin adet</span><b>' + (trade.unitsPer100k == null ? '–' : trade.unitsPer100k) + '</b></div>' +
      '<div class="trade-cell"><span>Hesap riski</span><b>%' + trade.positionRiskPct + '</b></div>' +
      '</div>'
    : '<p class="decision-muted">' + esc(trade.reason || 'Islem plani icin veri eksik') + '</p>';
  const contradictionHtml = contradictions.length
    ? '<div class="decision-alerts">' + contradictions.map((c) => '<div class="decision-alert"><b>' + esc(c.label) + '</b><span>' + esc(c.detail) + '</span></div>').join('') + '</div>'
    : '<p class="decision-muted">Belirgin skor celiskisi yok.</p>';

  return '<div class="decision-panel">' +
    '<div class="decision-head"><h4>Karar Kalitesi</h4><span class="decision-score decision-' + decisionTone(d) + '">' + decisionLabel(d) + ' · ' + d.score + '</span></div>' +
    '<div class="decision-grid">' +
    '<div><span>Tazelik</span><b>' + freshnessText(d.freshness) + '</b></div>' +
    '<div><span>Stabilite</span><b>' + confidenceText(d.confidence) + '</b></div>' +
    '<div><span>Celiski</span><b>' + (contradictions.length ? contradictions.length + ' uyari' : 'Temiz') + '</b></div>' +
    '</div>' +
    '<div class="decision-split"><div><h4>Islem Plani</h4>' + tradeHtml + '</div><div><h4>Uyarilar</h4>' + contradictionHtml + '</div></div>' +
    '</div>';
}

// İnsancıl "Karar Özeti" kartı (Katman 1: Sonuç → Katman 2: Neden + Plan).
// Saf mantık public/insights.js'te; burada yalnızca HTML'e dökülür.
function decisionInsightCard(x) {
  if (!window.FinansInsights) return '';
  const ins = window.FinansInsights.explainDecision(x);
  if (!ins) return '';
  const li = (arr) => '<ul>' + arr.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>';
  const prosHtml = ins.pros.length ? li(ins.pros) : '<p class="ins-empty">Belirgin olumlu sinyal yok</p>';
  const consHtml = ins.cons.length ? li(ins.cons) : '<p class="ins-empty">Belirgin risk yok</p>';
  const q = ins.quality;
  const qTone = q.status === 'clean' ? 'pos' : q.status === 'caution' ? 'warn' : q.status === 'blocked' ? 'neg' : 'muted';
  const regimeHtml = ins.regime ? '<span class="ins-regime">📊 ' + esc(ins.regime) + '</span>' : '';
  const cg = ins.costGate;
  const costHtml = cg && cg.ratio != null
    ? '<span class="ins-cost ' + (cg.pass ? 'ok' : 'bad') + '">' + (cg.pass ? '✓' : '✗') + ' Maliyet: hedef %' + cg.rewardPct + ' vs %' + cg.costPct + ' (×' + cg.ratio + ')</span>'
    : '';
  const metaHtml = (regimeHtml || costHtml) ? '<div class="insight-meta">' + regimeHtml + costHtml + '</div>' : '';
  const suitHtml = ins.suitability ? '<p class="insight-suit">' + esc(ins.suitability) + '</p>' : '';
  return '<div class="insight-card itone-' + esc(ins.tone) + '">' +
    '<div class="insight-head">' +
      '<span class="badge tone-' + esc(ins.tone) + '">' + esc(ins.verdict) + '</span>' +
      '<span class="insight-quality q-' + qTone + '">Karar kalitesi ' + (q.score != null ? q.score : '–') + (q.statusLabel ? ' · ' + esc(q.statusLabel) : '') + '</span>' +
    '</div>' +
    metaHtml +
    '<p class="insight-headline">' + esc(ins.headline) + '</p>' +
    suitHtml +
    '<div class="insight-cols">' +
      '<div class="insight-col"><span class="ins-kicker pos">✓ Lehte</span>' + prosHtml + '</div>' +
      '<div class="insight-col"><span class="ins-kicker neg">⚠ Dikkat</span>' + consHtml + '</div>' +
    '</div>' +
    '<p class="insight-plan"><b>Plan:</b> ' + esc(ins.plan) + '</p>' +
    '<p class="insight-qnote">' + esc(q.note) + '</p>' +
  '</div>';
}

function drawDetailChart(idx, asset) {
  const canvasId = 'detail-chart-' + idx;
  const canvas = document.getElementById(canvasId);
  if (!canvas || !window.Chart) return;
  
  if (activeDetailCharts[idx]) {
    activeDetailCharts[idx].destroy();
  }
  
  const spark = asset.ind && asset.ind.spark ? asset.ind.spark : [];
  if (!spark.length) return;
  
  const labels = spark.map((_, i) => `Gün ${i + 1}`);
  const color = spark[spark.length - 1] >= spark[0] ? '#28d793' : '#ef4444';
  
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 110);
  gradient.addColorStop(0, spark[spark.length - 1] >= spark[0] ? 'rgba(40, 215, 147, 0.12)' : 'rgba(239, 68, 68, 0.12)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
 
  activeDetailCharts[idx] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: spark,
        borderColor: color,
        backgroundColor: gradient,
        borderWidth: 1.8,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        fill: true,
        tension: 0.15
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduceMotion ? 0 : 350 },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          mode: 'index',
          intersect: false,
          callbacks: {
            label: (context) => fmtPrice(context.raw, asset.currency)
          }
        }
      },
      scales: {
        y: {
          display: true,
          position: 'right',
          grid: { color: 'rgba(30, 34, 43, 0.3)' },
          ticks: { color: '#7d8590', font: { size: 9, family: 'Plus Jakarta Sans' }, maxTicksLimit: 3 }
        },
        x: {
          display: false
        }
      }
    }
  });
}

function renderTable() {
  const list = currentList();
  
  // Bellek sızıntılarını önlemek için eski detay grafiklerini temizle
  Object.values(activeDetailCharts).forEach(chart => chart.destroy());
  activeDetailCharts = {};
  
  let html = '<table><thead><tr><th>Sembol</th><th>Fiyat</th><th>Gün %</th><th>RSI</th><th>MACD</th><th>50g %</th><th>Vol</th><th>Puan</th><th>Öneri</th></tr></thead><tbody>';
  list.forEach((x, idx) => {
    const a = x.analysis, i = x.ind || {}, s = i.signals || {};
    const chCls = (x.changePct || 0) >= 0 ? 'pos' : 'neg';
    const dist = s.distSma50;
    html +=
      '<tr class="row" data-i="' + idx + '">' +
      '<td><span class="sym">' + x.symbol + '</span><div class="coname">' + (x.name || '') + '</div></td>' +
      '<td>' + fmtPrice(x.price, x.currency) + '</td>' +
      '<td class="' + chCls + '">' + fmtPct(x.changePct) + '</td>' +
      '<td style="color:' + rsiColor(i.rsi) + ';font-weight:600">' + (i.rsi != null ? i.rsi : '–') + '</td>' +
      '<td>' + macdCell(i) + '</td>' +
      '<td class="' + ((dist || 0) >= 0 ? 'pos' : 'neg') + '">' + (dist != null ? fmtPct(dist) : '–') + '</td>' +
      '<td>' + (i.atrPct != null ? '%' + i.atrPct : '–') + '</td>' +
      '<td><span class="scorecell"><span class="scorebar"><i style="width:' + a.score + '%;background:' + toneColor(a.tone) + '"></i></span>' + a.score + '</span></td>' +
      '<td><span class="badge tone-' + a.tone + '">' + a.label + '</span></td>' +
      '</tr>' +
      '<tr class="detail" id="detail-' + idx + '" hidden><td colspan="9"><div class="detailwrap">' +
      decisionInsightCard(x) +
      '<div class="dtop"><div class="dsummary">' + a.summary + '</div><div class="detail-chart-box"><canvas id="detail-chart-' + idx + '"></canvas></div></div>' +
      subBars(a.sub) + decisionPanel(x) + indGrid(x) + reasonList(a.reasons) +
      '</div></td></tr>';
  });
  html += '</tbody></table>';
  $('#tableWrap').innerHTML = list.length ? html : '<p class="muted">Bu pazarda veri bulunamadı.</p>';
  document.querySelectorAll('#tableWrap tr.row').forEach((tr) => {
    tr.addEventListener('click', () => {
      const idx = tr.dataset.i;
      const d = $('#detail-' + idx);
      if (!d) return;
      const isHidden = d.hidden;
      d.hidden = !isHidden;
      renderAssetDesk(list[idx]);
      if (isHidden) {
        drawDetailChart(idx, list[idx]);
      }
    });
  });
}

function renderErrors() {
  const box = $('#errorsBox');
  const errs = DATA.errors || [];
  if (!errs.length) { box.hidden = true; return; }
  box.hidden = false;
  $('#errorsList').innerHTML = errs.map((e) => '<li>' + e + '</li>').join('');
}

/* ---------- Portföy Görünümü ---------- */
let portInitialized = false;

async function renderPortfolioView() {
  if (!portfolioData) return;
  const pKpis = $('#portfolio-kpis');
  const pTableBody = $('#portfolio-table-body');
  const USDTRY = (DATA.fx && DATA.fx.usdtry) ? DATA.fx.usdtry : 38.0; // Anlık kur (DATA.fx.usdtry)
  
  let totalValueUSD = 0;
  let totalValueTRY = 0;
  let totalPnLUSD = 0;
  let totalPnLTRY = 0;
  let totalCostUSD = 0;
  
  const usHoldings = portfolioData.us || [];
  const bistHoldings = portfolioData.bist || [];
  const cryptoHoldings = portfolioData.crypto || [];
  const tableRows = [];
  
  const findAssetData = (sym, market) => {
    const list = DATA[market] || [];
    return list.find(x => x.symbol === sym || (market === 'crypto' && x.id === sym));
  };
  
  const processAsset = (h, market, cur) => {
    const asset = findAssetData(h.symbol, market);
    if (!asset) return;
    const price = asset.price || 0;
    const value = h.amount * price;
    const cost = h.amount * h.avgPrice;
    const pnl = value - cost;
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
    const score = asset.analysis ? asset.analysis.score : '–';
    const rec = asset.analysis ? asset.analysis.label : '–';
    const tone = asset.analysis ? asset.analysis.tone : 'hold';
    
    const activeSigs = [];
    if (asset.ind) {
      if (asset.ind.rsi >= 70) activeSigs.push('Aşırı Alım');
      if (asset.ind.rsi <= 30) activeSigs.push('Aşırı Satım');
      if (asset.ind.signals) {
        if (asset.ind.signals.goldenCross) activeSigs.push('Golden Cross ✨');
        if (asset.ind.signals.deathCross) activeSigs.push('Death Cross 💀');
      }
    }
    const sigStr = activeSigs.length ? activeSigs.join(', ') : '–';
    
    if (cur === 'USD') {
      totalValueUSD += value;
      totalPnLUSD += pnl;
      totalCostUSD += cost;
    } else {
      totalValueTRY += value;
      totalPnLTRY += pnl;
    }
    
    tableRows.push({
      symbol: asset.symbol,
      name: asset.name || asset.symbol,
      amount: h.amount,
      avgPrice: h.avgPrice,
      price,
      value,
      pnl,
      pnlPct,
      score,
      rec,
      tone,
      sigStr,
      market,
      currency: cur
    });
  };
  
  usHoldings.forEach(h => processAsset(h, 'us', 'USD'));
  cryptoHoldings.forEach(h => processAsset(h, 'crypto', 'USD'));
  bistHoldings.forEach(h => processAsset(h, 'bist', 'TRY'));
  
  const finalValueUSD = totalValueUSD + (totalValueTRY / USDTRY);
  const finalValueTRY = (totalValueUSD * USDTRY) + totalValueTRY;
  const finalPnLUSD = totalPnLUSD + (totalPnLTRY / USDTRY);
  const finalPnLTRY = (totalPnLUSD * USDTRY) + totalPnLTRY;
  const finalCostUSD = finalValueUSD - finalPnLUSD;
  const finalPnLPercent = finalCostUSD > 0 ? (finalPnLUSD / finalCostUSD) * 100 : 0;
  
  let riskLabel = 'Dengeli 🟢';
  let riskCls = 'sent-pos';
  
  let cryptoVal = 0;
  cryptoHoldings.forEach(h => {
    const asset = findAssetData(h.symbol, 'crypto');
    if (asset) cryptoVal += h.amount * (asset.price || 0);
  });
  const cryptoWeightPct = finalValueUSD > 0 ? (cryptoVal / finalValueUSD) * 100 : 0;
  
  if (cryptoWeightPct > 50) {
    riskLabel = 'Yüksek Volatilite ⚠️';
    riskCls = 'sent-cau';
  } else if (cryptoWeightPct > 25) {
    riskLabel = 'Orta Risk 🟡';
    riskCls = 'sent-neu';
  }
  
  pKpis.innerHTML = `
    <div class="kpi">
      <div class="label">Portföy Büyüklüğü (TL)</div>
      <div class="value">${fmtPrice(finalValueTRY, 'TRY')}<small>Anlık kur: 1 USD = ${USDTRY.toFixed(2)} TL</small></div>
    </div>
    <div class="kpi">
      <div class="label">Portföy Büyüklüğü (USD)</div>
      <div class="value">${fmtPrice(finalValueUSD, 'USD')}<small>Toplam varlık değeri</small></div>
    </div>
    <div class="kpi">
      <div class="label">Net Kâr / Zarar</div>
      <div class="value ${finalPnLUSD >= 0 ? 'pos' : 'neg'}">${fmtPrice(finalPnLUSD, 'USD')} (${fmtPct(finalPnLPercent)})<small>Maliyete göre değişim</small></div>
    </div>
    <div class="kpi">
      <div class="label">Risk Profili</div>
      <div class="value"><span class="sent-pill ${riskCls}" style="font-size: 14px; padding: 4px 10px; font-weight:700;">${riskLabel}</span><small>Kripto ağırlığı: %${Math.round(cryptoWeightPct)}</small></div>
    </div>
  `;
  
  if (!tableRows.length) {
    pTableBody.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;padding:24px;">Portföyünüzde henüz varlık yok. Sağdaki formu kullanarak ekleyebilirsiniz.</td></tr>';
  } else {
    pTableBody.innerHTML = tableRows.map((r) => {
      const pnlCls = r.pnl >= 0 ? 'pos' : 'neg';
      return `
        <tr>
          <td><span class="sym">${r.symbol}</span><div class="coname">${r.name}</div></td>
          <td>${fmtNum(r.amount, r.market === 'crypto' ? 4 : 2)}</td>
          <td>${fmtPrice(r.avgPrice, r.currency)}</td>
          <td>${fmtPrice(r.price, r.currency)}</td>
          <td><b>${fmtPrice(r.value, r.currency)}</b></td>
          <td class="${pnlCls}"><b>${fmtPrice(r.pnl, r.currency)} (${fmtPct(r.pnlPct)})</b></td>
          <td>${r.score}</td>
          <td><span class="badge tone-${r.tone}">${r.rec}</span></td>
          <td>${r.sigStr === '–' ? '<span class="muted">–</span>' : `<span style="color:var(--orange); font-weight:600">${r.sigStr}</span>`}</td>
          <td><button class="btn" style="background:var(--red-soft);color:#ff6b73;border:1px solid rgba(234,57,67,.3);padding:4px 8px;border-radius:6px;font-size:11px;box-shadow:none;" onclick="deletePortfolioAsset('${r.market}', '${r.symbol}')">Sil</button></td>
        </tr>
      `;
    }).join('');
  }
  
  renderPortfolioChart(totalValueUSD - cryptoVal, cryptoVal, totalValueTRY / USDTRY);
  
  if (!portInitialized) {
    portInitialized = true;
    $('#port-market-sel').addEventListener('change', () => {
      const m = $('#port-market-sel').value;
      const list = DATA[m] || [];
      $('#port-symbol-sel').innerHTML = list.map(x => `<option value="${x.symbol}">${x.symbol} (${x.name || ''})</option>`).join('');
    });
    
    $('#portfolio-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const m = $('#port-market-sel').value;
      const sym = $('#port-symbol-sel').value;
      const amt = parseFloat($('#port-amount-input').value);
      const prc = parseFloat($('#port-price-input').value);
      
      const holdings = portfolioData[m] || [];
      const existing = holdings.find(h => h.symbol === sym);
      if (existing) {
        existing.amount = amt;
        existing.avgPrice = prc;
      } else {
        holdings.push({ symbol: sym, amount: amt, avgPrice: prc });
      }
      portfolioData[m] = holdings;
      
      await savePortfolio();
      renderPortfolioView();
      
      $('#port-amount-input').value = '';
      $('#port-price-input').value = '';
    });
  }

  // Her render işleminde sembol listesini doldur
  const m = $('#port-market-sel').value;
  const list = DATA[m] || [];
  $('#port-symbol-sel').innerHTML = list.map(x => `<option value="${x.symbol}">${x.symbol} (${x.name || ''})</option>`).join('');
  triggerRevealAnimations($('#view-portfolio'));
}

async function savePortfolio() {
  try {
    const res = await authedFetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(portfolioData)
    });
    if (!res.ok) {
      alert(res.status === 401
        ? 'Portföy kaydedilemedi: yönetici parolası hatalı veya eksik.'
        : 'Portföy kaydedilemedi (sunucu hatası).');
    }
  } catch (e) {
    console.error('Portföy kaydedilemedi:', e);
  }
}

async function deletePortfolioAsset(market, symbol) {
  if (!confirm(`${symbol} varlığını portföyden silmek istediğinize emin misiniz?`)) return;
  const list = portfolioData[market] || [];
  portfolioData[market] = list.filter(h => h.symbol !== symbol);
  await savePortfolio();
  renderPortfolioView();
}
window.deletePortfolioAsset = deletePortfolioAsset;

function renderPortfolioChart(usVal, cryptoVal, bistVal) {
  if (portAllocChart) portAllocChart.destroy();
  const canvas = $('#portAllocChart');
  if (!canvas || !window.Chart) return;
  
  const total = usVal + cryptoVal + bistVal;
  if (total === 0) return;
  
  const data = [
    { label: 'ABD Hisseleri', val: Math.round((usVal / total) * 100) },
    { label: 'Kripto Paralar', val: Math.round((cryptoVal / total) * 100) },
    { label: 'BIST Varlıkları', val: Math.round((bistVal / total) * 100) }
  ].filter(x => x.val > 0);
  
  portAllocChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.map(x => x.label),
      datasets: [{
        data: data.map(x => x.val),
        backgroundColor: ['#2d323f', '#7f8798', '#f1f3f6'],
        borderColor: '#12151b',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduceMotion ? 0 : 500 },
      cutout: '62%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#7d8590', boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } }
        },
        tooltip: {
          callbacks: { label: (x) => x.label + ': %' + x.raw }
        }
      }
    }
  });
}

/* ---------- Teknik Tarayıcı Görünümü ---------- */
function renderScreenerView() {
  const oversoldList = $('#screen-oversold');
  const overboughtList = $('#screen-overbought');
  const volumeList = $('#screen-volume');
  const bearishList = $('#screen-bearish');
  const contradicList = $('#screen-contradic');
  
  oversoldList.innerHTML = '';
  overboughtList.innerHTML = '';
  volumeList.innerHTML = '';
  bearishList.innerHTML = '';
  contradicList.innerHTML = '';
  
  const allAssets = []
    .concat((DATA.us || []).map(x => ({ marketName: 'ABD', ...x })))
    .concat((DATA.bist || []).map(x => ({ marketName: 'BIST', ...x })))
    .concat((DATA.crypto || []).map(x => ({ marketName: 'Kripto', ...x })));
    
  let countOversold = 0, countOverbought = 0, countVolume = 0, countBearish = 0, countContradic = 0;
  
  allAssets.forEach(x => {
    if (!x.analysis || x.analysis.score == null) return;
    const ind = x.ind || {};
    const sig = ind.signals || {};
    const score = x.analysis.score;
    
    const liHtml = (trigger) => `
      <li class="screener-item" onclick="navigateToAsset('${x.market}', '${x.symbol}')">
        <div class="sc-item-meta">
          <span class="sc-item-sym">${x.symbol}</span>
          <span class="sc-item-market">${x.marketName} · Puan: ${score}</span>
        </div>
        <span class="sc-item-trigger">${trigger}</span>
      </li>
    `;
    
    if (ind.rsi <= 35 || (ind.bollinger && ind.bollinger.pctB <= 0)) {
      countOversold++;
      const reason = ind.rsi <= 35 ? `RSI: ${ind.rsi}` : `Alt Bant (%B ${ind.bollinger.pctB})`;
      oversoldList.innerHTML += liHtml(reason);
    }
    
    if (ind.rsi >= 68 || (ind.bollinger && ind.bollinger.pctB >= 1)) {
      countOverbought++;
      const reason = ind.rsi >= 68 ? `RSI: ${ind.rsi}` : `Üst Bant (%B ${ind.bollinger.pctB})`;
      overboughtList.innerHTML += liHtml(reason);
    }
    
    if (ind.volSpike >= 1.5 && ind.rsi > 50) {
      countVolume++;
      volumeList.innerHTML += liHtml(`Hacim: ${Math.round(ind.volSpike * 100)}%`);
    }
    
    if (sig.deathCross || (ind.rsi <= 30 && score <= 30)) {
      countBearish++;
      const reason = sig.deathCross ? 'Death Cross' : `RSI: ${ind.rsi}`;
      bearishList.innerHTML += liHtml(reason);
    }
    
    const dec = x.decision || {};
    const contras = dec.contradictions || [];
    if (contras.length > 0) {
      countContradic++;
      const warnings = contras.map(c => c.label).join(', ');
      contradicList.innerHTML += `
        <li class="screener-item flex-item-contra" onclick="navigateToAsset('${x.market}', '${x.symbol}')">
          <div class="sc-item-meta">
            <span class="sc-item-sym">${x.symbol} <span class="pmkt">· ${x.marketName}</span></span>
            <span class="sc-item-market" style="color:#ff6b73; font-weight:600;">${warnings}</span>
          </div>
          <span class="sc-item-trigger">Puan: ${score}</span>
        </li>
      `;
    }
  });
  
  if (!countOversold) oversoldList.innerHTML = '<li class="screener-empty">Sinyal yok</li>';
  if (!countOverbought) overboughtList.innerHTML = '<li class="screener-empty">Sinyal yok</li>';
  if (!countVolume) volumeList.innerHTML = '<li class="screener-empty">Sinyal yok</li>';
  if (!countBearish) bearishList.innerHTML = '<li class="screener-empty">Sinyal yok</li>';
  if (!countContradic) contradicList.innerHTML = '<li class="screener-empty" style="width:100%;text-align:center;">Sinyal yok</li>';
  triggerRevealAnimations($('#view-screener'));
}

function navigateToAsset(market, symbol) {
  setView(market);
  const list = DATA && DATA[market] ? DATA[market] : [];
  const asset = list.find((x) => x.symbol === symbol || (market === 'crypto' && x.id === symbol));
  if (asset) setTimeout(() => renderAssetDesk(asset), 0);
}
window.navigateToAsset = navigateToAsset;

/* ---------- Backtest Görünümü ---------- */
let btInitialized = false;

function renderBacktestView() {
  const assetSel = $('#bt-asset-sel');
  if (!btInitialized) {
    btInitialized = true;
    
    const allOptions = [];
    const addOptions = (list, market, label) => {
      list.forEach(x => {
        allOptions.push(`<option value="${market}:${x.symbol}">${label}: ${x.symbol} (${x.name || ''})</option>`);
      });
    };
    addOptions(DATA.us || [], 'us', 'ABD');
    addOptions(DATA.bist || [], 'bist', 'BIST');
    (DATA.crypto || []).forEach(x => {
      allOptions.push(`<option value="crypto:${x.symbol}">Kripto: ${x.symbol.toUpperCase()} (${x.name})</option>`);
    });
    
    assetSel.innerHTML = allOptions.join('');
    
    $('#backtest-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const runBtn = $('#bt-run-btn');
      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="btn-ic">↻</span> Simüle Ediliyor...';
      runBtn.classList.add('loading');
      
      const assetVal = assetSel.value.split(':');
      const market = assetVal[0];
      const symbol = assetVal[1];
      const buyThreshold = parseInt($('#bt-buy-input').value);
      const sellThreshold = parseInt($('#bt-sell-input').value);
      const stopLoss = parseFloat($('#bt-sl-input').value) || null;
      const takeProfit = parseFloat($('#bt-tp-input').value) || null;
      
      try {
        const res = await fetch('/api/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, market, buyThreshold, sellThreshold, stopLoss, takeProfit })
        });
        const result = await res.json();
        
        if (result.error) {
          alert('Backtest Hatası: ' + result.error);
          return;
        }
        
        displayBacktestResults(result);
      } catch (err) {
        alert('Sunucu hatası oluştu');
      } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = '<span class="btn-ic">▶</span> Backtest Çalıştır';
        runBtn.classList.remove('loading');
      }
    });
  }
}

function displayBacktestResults(res) {
  const container = $('#backtest-results-container');
  container.hidden = false;
  renderBacktestStory(res);
  
  const pKpis = $('#backtest-kpis');
  const retCls = res.strategyReturn >= 0 ? 'pos' : 'neg';
  const bhCls = res.bhReturn >= 0 ? 'pos' : 'neg';
  const currencySym = res.currency === 'TRY' ? '₺' : '$';
  
  pKpis.innerHTML = `
    <div class="kpi">
      <div class="label">Başlangıç Sermayesi</div>
      <div class="value">${currencySym}${fmtNum(res.initialCapital, 0)}</div>
    </div>
    <div class="kpi">
      <div class="label">Strateji Bakiye (Bitiş)</div>
      <div class="value">${currencySym}${fmtNum(res.finalCapital, 2)}</div>
    </div>
    <div class="kpi">
      <div class="label">Strateji Getirisi</div>
      <div class="value ${retCls}">${fmtPct(res.strategyReturn)}<small>Toplam ${res.trades.filter(t => t.type === 'SELL').length} işlem</small></div>
    </div>
    <div class="kpi">
      <div class="label">Al-Tut Getirisi (Buy & Hold)</div>
      <div class="value ${bhCls}">${fmtPct(res.bhReturn)}<small>Pasif yatırım getirisi</small></div>
    </div>
  `;
  
  const tableBody = $('#backtest-trades-body');
  if (!res.trades || !res.trades.length) {
    tableBody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px;">Simülasyon süresince hiç işlem gerçekleşmedi.</td></tr>';
  } else {
    tableBody.innerHTML = res.trades.map(t => {
      const pnlHtml = t.type === 'BUY' ? '–' : `<span class="${t.pnlPct >= 0 ? 'pos' : 'neg'}">${fmtPct(t.pnlPct)}</span>`;
      const reasonHtml = t.reason ? t.reason : 'Alım Sinyali (Skor)';
      return `
        <tr>
          <td>Gün ${t.day}</td>
          <td><span class="badge ${t.type === 'BUY' ? 'tone-buy' : 'tone-sell'}">${t.type}</span></td>
          <td>${currencySym}${fmtNum(t.price, 2)}</td>
          <td>${pnlHtml}</td>
          <td>${reasonHtml}</td>
          <td><b>${currencySym}${fmtNum(t.capitalAfter || t.capitalBefore, 2)}</b></td>
        </tr>
      `;
    }).join('');
  }
  
  drawBacktestChart(res);
  triggerRevealAnimations(container);
}

function renderBacktestStory(res) {
  const story = $('#backtest-story');
  if (!story) return;
  const sells = (res.trades || []).filter((t) => t.type === 'SELL');
  const buys = (res.trades || []).filter((t) => t.type === 'BUY');
  const wins = sells.filter((t) => t.pnlPct > 0).length;
  const winRate = sells.length ? Math.round((wins / sells.length) * 100) : 0;
  const diff = Math.round((res.strategyReturn - res.bhReturn) * 100) / 100;
  const diffText = diff >= 0
    ? 'Strateji al-tut yaklaşımını ' + fmtPct(diff) + ' geçti.'
    : 'Strateji al-tut yaklaşımının ' + fmtPct(Math.abs(diff)) + ' gerisinde kaldı.';
  const resultTone = res.strategyReturn >= 0 ? 'pos' : 'neg';
  const diffTone = diff >= 0 ? 'pos' : 'neg';
  const tradeText = sells.length
    ? sells.length + ' kapanan işlem, yaklaşık %' + winRate + ' isabet.'
    : 'Bu eşiklerde kapanan işlem oluşmadı.';
  const riskText = [
    res.stopLoss ? 'Stop: %' + res.stopLoss : 'Stop kapalı',
    res.takeProfit ? 'Kar al: %' + res.takeProfit : 'Kar al kapalı',
  ].join(' · ');
  story.innerHTML =
    '<div class="bt-story-card">' +
      '<span class="bt-kicker">Ne test edildi?</span>' +
      '<b>' + esc(res.symbol) + ' için skor eşiği stratejisi</b>' +
      '<p>Skor ' + res.buyThreshold + ' ve üstüne çıktığında alım, ' + res.sellThreshold + ' ve altına indiğinde çıkış denendi. ' + esc(riskText) + '.</p>' +
    '</div>' +
    '<div class="bt-story-card">' +
      '<span class="bt-kicker">Sonuç</span>' +
      '<b class="' + resultTone + '">' + fmtPct(res.strategyReturn) + ' strateji getirisi</b>' +
      '<p>' + esc(tradeText) + ' Başlangıç 10.000, bitiş ' + fmtPrice(res.finalCapital, res.currency) + '.</p>' +
    '</div>' +
    '<div class="bt-story-card">' +
      '<span class="bt-kicker">Karşılaştırma</span>' +
      '<b class="' + diffTone + '">' + esc(diffText) + '</b>' +
      '<p>Bu sonuç tek başına al/sat kuralı değildir; farklı eşikler ve piyasa rejimleriyle tekrar denenmeli.</p>' +
    '</div>';
  // Derinlik: "ne zaman çalışır / ne zaman bozulur" + max düşüş (public/insights.js)
  const ins = window.FinansInsights ? window.FinansInsights.explainBacktest(res) : null;
  if (ins) {
    story.innerHTML +=
      '<div class="bt-story-card"><span class="bt-kicker">Ne zaman çalışır?</span>' +
        '<b class="' + (ins.headlineTone === 'neg' ? 'neg' : ins.headlineTone === 'warn' ? '' : 'pos') + '">İsabet %' + ins.winRate + ' · ' + ins.closedTrades + ' kapanan işlem</b>' +
        '<p>' + esc(ins.worksWhen) + '</p></div>' +
      '<div class="bt-story-card warn"><span class="bt-kicker">Ne zaman bozulur?</span>' +
        '<b>Max düşüş %' + ins.maxDrawdown + '</b>' +
        '<p>' + esc(ins.breaksWhen) + '</p></div>';
  } else if (!buys.length) {
    story.innerHTML += '<div class="bt-story-card warn"><span class="bt-kicker">Okuma notu</span><b>Alım sinyali yok</b><p>Eşikler bu varlık için fazla seçici olabilir. Alım eşiğini düşürüp tekrar deneyin.</p></div>';
  }
  // Risk-ayarlı metrikler + yarı-dönem tutarlılığı (dürüstlük)
  if (res.sharpe != null || res.firstHalfReturn != null) {
    const consistent = (res.firstHalfReturn != null && res.secondHalfReturn != null)
      ? ((res.firstHalfReturn > 0) === (res.secondHalfReturn > 0))
      : null;
    const consText = consistent == null ? 'tek dönem değerlendirildi'
      : consistent ? 'her iki yarıda da aynı yönde — daha güvenilir'
      : 'yalnızca bir yarıda çalıştı — şansa/rejime duyarlı, dikkat';
    story.innerHTML +=
      '<div class="bt-story-card"><span class="bt-kicker">Risk-ayarlı</span>' +
        '<b class="' + (res.sharpe != null && res.sharpe > 0 ? 'pos' : 'neg') + '">Sharpe ' + (res.sharpe != null ? res.sharpe : '–') + ' · Sortino ' + (res.sortino != null ? res.sortino : '–') + '</b>' +
        '<p>Yarı-dönem: 1.yarı ' + (res.firstHalfReturn != null ? fmtPct(res.firstHalfReturn) : '–') + ' / 2.yarı ' + (res.secondHalfReturn != null ? fmtPct(res.secondHalfReturn) : '–') + ' — ' + consText + '.</p></div>';
  }
}

function drawBacktestChart(res) {
  if (backtestChart) backtestChart.destroy();
  const canvas = $('#backtestChart');
  if (!canvas || !window.Chart) return;
  
  const curve = res.equityCurve || [];
  const labels = curve.map(c => `Gün ${c.day}`);
  const strategyData = curve.map(c => c.total);
  const initialPrice = curve[0] ? curve[0].price : 1;
  const bhData = curve.map(c => (c.price / initialPrice) * res.initialCapital);
  
  backtestChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Strateji Getirisi',
          data: strategyData,
          borderColor: '#f1f3f6',
          backgroundColor: 'rgba(241, 243, 246, 0.02)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.1
        },
        {
          label: 'Al-Tut Getirisi (Normalleştirilmiş)',
          data: bhData,
          borderColor: '#525866',
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduceMotion ? 0 : 500 },
      plugins: {
        legend: { labels: { color: '#7d8590', font: { family: 'Plus Jakarta Sans' } } }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.02)' },
          ticks: { color: '#7d8590', font: { family: 'Plus Jakarta Sans' } }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#f1f3f6', font: { size: 10, family: 'Plus Jakarta Sans' }, maxTicksLimit: 12 }
        }
      }
    }
  });
}

let forecastInitialized = false;

function renderForecastView() {
  if (!forecastInitialized) {
    forecastInitialized = true;
    initForecastEventListeners();
  }
  
  // DCF Select doldur (sadece hisseler: us ve bist)
  const dcfSel = $('#dcf-asset-sel');
  if (dcfSel) {
    const opts = [];
    const addOpts = (list, market, pfx) => {
      list.forEach(x => {
        if (!x.__error) {
          opts.push(`<option value="${market}:${x.symbol}">${pfx}: ${x.symbol} (${x.name || ''})</option>`);
        }
      });
    };
    addOpts(DATA.us || [], 'us', 'ABD');
    addOpts(DATA.bist || [], 'bist', 'BIST');
    dcfSel.innerHTML = opts.join('') || '<option value="">Hisse senedi yok</option>';
  }

  // Stres testlerini yukle
  loadStressScenarios();

  // Korelasyon matrisini yukle
  loadCorrelationMatrix();
  
  // Ilk DCF yuklemesi
  if (dcfSel && dcfSel.value) {
    loadDCFDefaults();
  }
}

async function loadStressScenarios() {
  const tbody = $('#stress-table-body');
  try {
    const res = await fetch('/api/forecast/scenarios');
    const result = await res.json();
    if (result.error) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">Hata: ${result.error}</td></tr>`;
      return;
    }

    const scenarios = result.scenarios || {};
    let h = '';
    
    Object.keys(scenarios).forEach(key => {
      const sc = scenarios[key];
      const signCls = sc.pnlUSD >= 0 ? 'pos' : 'neg';
      const pctSignCls = sc.pctChange >= 0 ? 'pos' : 'neg';
      
      let shockStr = `ABD: %${sc.shocks.find(s=>s.market==='us')?.shockPct || 0} · ` +
                     `BIST: %${sc.shocks.find(s=>s.market==='bist')?.shockPct || 0} · ` +
                     `Kripto: %${sc.shocks.find(s=>s.market==='crypto')?.shockPct || 0}`;

      h += `
        <tr>
          <td><b>${esc(sc.name)}</b></td>
          <td style="font-size:12px; white-space:normal; max-width:220px; line-height:1.4; color:var(--muted);">${esc(sc.desc)}</td>
          <td style="font-size:12px; color:var(--muted-2);">${shockStr}</td>
          <td><b>$${fmtNum(sc.oldUSD, 0)}</b> <span style="font-size:11px; color:var(--muted-2);">(${fmtNum(sc.oldTRY, 0)} ₺)</span></td>
          <td><b>$${fmtNum(sc.newUSD, 0)}</b> <span style="font-size:11px; color:var(--muted-2);">(${fmtNum(sc.newTRY, 0)} ₺)</span></td>
          <td><b class="${signCls}">${sc.pnlUSD >= 0 ? '+' : ''}$${fmtNum(sc.pnlUSD, 0)}</b> <span style="font-size:11px; color:var(--muted-2);">(${fmtNum(sc.pnlTRY, 0)} ₺)</span></td>
          <td><b class="${pctSignCls}">${fmtPct(sc.pctChange)}</b></td>
        </tr>
      `;
    });
    
    tbody.innerHTML = h || '<tr><td colspan="7" class="muted" style="text-align:center;">Senaryo sonucu üretilemedi.</td></tr>';
    
    // Animate table rows entry
    if (window.gsap && !reduceMotion) {
      const rows = tbody.querySelectorAll('tr');
      if (rows.length > 0) {
        gsap.fromTo(rows,
          { opacity: 0, x: -15 },
          { opacity: 1, x: 0, duration: 0.4, stagger: 0.04, ease: 'power2.out' }
        );
      }
    }
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:16px;">Veri bağlantı hatası.</td></tr>`;
  }
}

async function loadCorrelationMatrix() {
  const loadingDiv = $('#correlation-loading');
  const container = $('#correlation-heatmap-container');
  if (!loadingDiv || !container) return;

  const corrAssets = [];
  const addCorrAssets = (list, market) => {
    (list || []).forEach(p => {
      const source = DATA[market].find(x => x.symbol === p.symbol);
      corrAssets.push({
        symbol: p.symbol,
        market,
        amount: p.amount,
        price: source ? source.price : p.avgPrice
      });
    });
  };
  
  if (portfolioData) {
    addCorrAssets(portfolioData.us || [], 'us');
    addCorrAssets(portfolioData.bist || [], 'bist');
    addCorrAssets(portfolioData.crypto || [], 'crypto');
  }

  if (corrAssets.length <= 1) {
    loadingDiv.textContent = 'Korelasyon matrisi çizmek için portföyünüzde en az 2 farklı varlık bulunmalıdır.';
    loadingDiv.style.display = 'block';
    container.style.display = 'none';
    return;
  }

  try {
    loadingDiv.textContent = 'Tarihsel veriler hizalanıyor ve matris hesaplanıyor...';
    loadingDiv.style.display = 'block';
    container.style.display = 'none';

    const res = await fetch('/api/forecast/correlation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets: corrAssets })
    });
    const result = await res.json();
    if (result.error) {
      loadingDiv.textContent = 'Korelasyon hesaplama hatası: ' + result.error;
      return;
    }

    const { symbols, matrix } = result;
    if (!symbols || !symbols.length || !matrix || !matrix.length) {
      loadingDiv.textContent = 'Korelasyon verisi hesaplanamadı.';
      return;
    }

    loadingDiv.style.display = 'none';
    container.style.display = 'flex';

    // Heatmap table oluştur
    let h = '<table style="border-collapse: collapse; width: auto; margin: 0 auto;"><thead><tr><th></th>';
    symbols.forEach(s => {
      h += `<th style="text-align: center; padding: 12px; font-size: 12.5px; font-weight: 700; color: var(--muted); border: 1px solid var(--border);">${esc(s)}</th>`;
    });
    h += '</tr></thead><tbody>';

    matrix.forEach((row, rIdx) => {
      const rowSymbol = symbols[rIdx];
      h += `<tr><td style="font-weight: 700; font-size: 12.5px; padding: 12px; text-align: left; color: var(--text); border: 1px solid var(--border); background: var(--bg-2); min-width: 80px;">${esc(rowSymbol)}</td>`;
      row.forEach((val, cIdx) => {
        const colSymbol = symbols[cIdx];
        let bgStyle = '';
        let textStyle = 'color: var(--text);';
        
        if (rIdx === cIdx) {
          bgStyle = 'background-color: oklch(25% 0.02 250); font-weight: 700;';
        } else if (val > 0) {
          const intensity = Math.round(val * 100) / 100;
          bgStyle = `background-color: oklch(62% 0.16 250 / ${intensity * 0.45});`;
        } else if (val < 0) {
          const intensity = Math.abs(Math.round(val * 100) / 100);
          bgStyle = `background-color: oklch(64% 0.18 25 / ${intensity * 0.35});`;
        } else {
          bgStyle = 'background-color: var(--bg-2);';
        }

        h += `
          <td class="corr-cell" 
              data-row="${esc(rowSymbol)}" 
              data-col="${esc(colSymbol)}" 
              data-val="${val}"
              style="${bgStyle} ${textStyle} font-size: 13px; text-align: center; width: 64px; height: 50px; cursor: pointer; transition: all 150ms var(--ease-out); border: 1px solid var(--border); font-family: monospace;">
            ${val.toFixed(2)}
          </td>
        `;
      });
      h += '</tr>';
    });
    h += '</tbody></table>';

    container.innerHTML = h;

    // Hücre hover olayları
    const cells = container.querySelectorAll('.corr-cell');
    if (window.gsap && !reduceMotion) {
      gsap.fromTo(cells, 
        { scale: 0, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.45, stagger: { grid: [matrix.length, symbols.length], from: "center", amount: 0.4 }, ease: "back.out(1.5)" }
      );
    }
    cells.forEach(cell => {
      cell.addEventListener('mouseenter', (e) => {
        // Hover style: outline glow
        e.target.style.outline = '2px solid var(--text)';
        e.target.style.zIndex = '10';
        e.target.style.position = 'relative';
        
        const row = e.target.dataset.row;
        const col = e.target.dataset.col;
        const val = parseFloat(e.target.dataset.val);
        
        let desc = '';
        if (row === col) {
          desc = `<b>${esc(row)}</b> kendisiyle tam korelasyona sahiptir (1.00).`;
        } else {
          let strength = '';
          const absVal = Math.abs(val);
          if (absVal >= 0.7) strength = 'Güçlü';
          else if (absVal >= 0.4) strength = 'Orta Düzey';
          else if (absVal >= 0.1) strength = 'Zayıf';
          else strength = 'Neredeyse İlişkisiz';

          const direction = val > 0 ? 'pozitif yönlü' : (val < 0 ? 'negatif yönlü' : 'yönü bulunmayan');
          desc = `<b>${esc(row)}</b> ve <b>${esc(col)}</b> arasında <b>${strength} ${direction}</b> ilişki bulunmaktadır (korelasyon katsayısı: <b>${val.toFixed(2)}</b>).`;
        }
        
        $('#correlation-info-text').innerHTML = desc;
      });

      cell.addEventListener('mouseleave', (e) => {
        e.target.style.outline = 'none';
        e.target.style.zIndex = '1';
        e.target.style.position = 'static';
        $('#correlation-info-text').innerHTML = 'İlişkileri incelemek için hücrelerin üzerine gelin.';
      });
    });

  } catch (err) {
    loadingDiv.textContent = 'Bağlantı hatası: Korelasyon verileri çekilemedi.';
  }
}

function initForecastEventListeners() {
  // Monte Carlo Formu
  const mcForm = $('#mc-form');
  if (mcForm) {
    mcForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const runBtn = $('#mc-run-btn');
      runBtn.disabled = true;
      runBtn.innerHTML = '<span class="btn-ic">🔮</span> Projeksiyon Çiziliyor...';
      runBtn.classList.add('loading');

      const horizon = parseInt($('#mc-horizon-sel').value, 10);
      const monthlySaving = parseFloat($('#mc-saving-input').value) || 0;

      const mcAssets = [];
      const addMcAssets = (list, market) => {
        list.forEach(p => {
          const source = DATA[market].find(x => x.symbol === p.symbol);
          mcAssets.push({
            symbol: p.symbol,
            market,
            amount: p.amount,
            price: source ? source.price : p.avgPrice
          });
        });
      };
      
      if (portfolioData) {
        addMcAssets(portfolioData.us || [], 'us');
        addMcAssets(portfolioData.bist || [], 'bist');
        addMcAssets(portfolioData.crypto || [], 'crypto');
      }

      if (!mcAssets.length) {
        alert('Simülasyon başlatmak için önce Portföyüm sekmesinden portföyünüze en az 1 varlık eklemelisiniz.');
        runBtn.disabled = false;
        runBtn.innerHTML = '<span class="btn-ic">🔮</span> Simülasyonu Başlat';
        runBtn.classList.remove('loading');
        return;
      }

      try {
        const res = await fetch('/api/forecast/montecarlo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: mcAssets, horizon, monthlySaving })
        });
        const result = await res.json();
        
        if (result.error) {
          alert('Simülasyon Hatası: ' + result.error);
          return;
        }

        displayMCResults(result);
      } catch (err) {
        alert('Sunucuyla bağlantı hatası oluştu.');
      } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = '<span class="btn-ic">🔮</span> Simülasyonu Başlat';
        runBtn.classList.remove('loading');
      }
    });
  }

  // DCF Asset change
  const dcfSel = $('#dcf-asset-sel');
  if (dcfSel) {
    dcfSel.addEventListener('change', loadDCFDefaults);
  }

  // Model Type Selection change
  const modelSel = $('#valuation-model-type-sel');
  if (modelSel) {
    modelSel.addEventListener('change', () => {
      const model = modelSel.value;
      
      // Hide all input groups first, then show active one
      $('#dcf-inputs-group').style.display = model === 'dcf' ? 'flex' : 'none';
      $('#graham-inputs-group').style.display = model === 'graham' ? 'flex' : 'none';
      $('#ddm-inputs-group').style.display = model === 'ddm' ? 'flex' : 'none';
      
      // Toggle projection table and detail rows
      $('#dcf-table-container').style.display = model === 'dcf' ? 'block' : 'none';
      $('#dcf-ev-detail-row').style.display = model === 'dcf' ? 'flex' : 'none';
      $('#dcf-eq-detail-row').style.display = model === 'dcf' ? 'flex' : 'none';
      $('#dcf-ttm-detail-row').style.display = model === 'dcf' ? 'flex' : 'none';
      
      const assumptionsTitle = $('#valuation-assumptions-title');
      if (assumptionsTitle) {
        if (model === 'dcf') assumptionsTitle.textContent = 'DCF Model Varsayımları';
        else if (model === 'graham') assumptionsTitle.textContent = 'Graham Formülü Varsayımları';
        else assumptionsTitle.textContent = 'DDM Model Varsayımları';
      }
      
      runDCFCalculation();
    });
  }

  // DCF Sliders & Inputs
  const dcfSliders = [
    'growth-1-5', 'growth-6-10', 'ebit-margin', 'wacc', 'terminal-growth'
  ];
  dcfSliders.forEach(id => {
    const el = $('#dcf-' + id);
    if (el) {
      el.addEventListener('input', (e) => {
        const lbl = $('#lbl-' + id);
        if (lbl) {
          lbl.textContent = (id === 'wacc' || id === 'terminal-growth') ? `%${parseFloat(e.target.value).toFixed(1)}` : `%${e.target.value}`;
        }
        runDCFCalculation();
      });
    }
  });

  const dcfInputs = ['tax-rate', 'net-debt', 'revenue', 'shares'];
  dcfInputs.forEach(id => {
    const el = $('#dcf-' + id);
    if (el) {
      el.addEventListener('change', runDCFCalculation);
      el.addEventListener('keyup', runDCFCalculation);
    }
  });

  // Graham inputs & slider
  const grahamGrowthInput = $('#graham-growth');
  if (grahamGrowthInput) {
    grahamGrowthInput.addEventListener('input', (e) => {
      $('#lbl-graham-growth').textContent = `%${parseFloat(e.target.value).toFixed(1)}`;
      runDCFCalculation();
    });
  }
  ['graham-eps', 'graham-aaa-yield'].forEach(id => {
    const el = $('#' + id);
    if (el) {
      el.addEventListener('change', runDCFCalculation);
      el.addEventListener('keyup', runDCFCalculation);
    }
  });

  // DDM inputs & sliders
  const ddmGrowthInput = $('#ddm-growth');
  if (ddmGrowthInput) {
    ddmGrowthInput.addEventListener('input', (e) => {
      $('#lbl-ddm-growth').textContent = `%${parseFloat(e.target.value).toFixed(1)}`;
      runDCFCalculation();
    });
  }
  const ddmWaccInput = $('#ddm-wacc');
  if (ddmWaccInput) {
    ddmWaccInput.addEventListener('input', (e) => {
      $('#lbl-ddm-wacc').textContent = `%${parseFloat(e.target.value).toFixed(1)}`;
      runDCFCalculation();
    });
  }
  const ddmDivInput = $('#ddm-dividend');
  if (ddmDivInput) {
    ddmDivInput.addEventListener('change', runDCFCalculation);
    ddmDivInput.addEventListener('keyup', runDCFCalculation);
  }

  // Defaults button
  const defaultsBtn = $('#dcf-load-defaults-btn');
  if (defaultsBtn) {
    defaultsBtn.addEventListener('click', loadDCFDefaults);
  }
}

function displayMCResults(res) {
  const container = $('#mc-results-container');
  container.hidden = false;
  
  if (window.gsap && !reduceMotion) {
    gsap.killTweensOf(container);
    gsap.fromTo(container, 
      { opacity: 0, scale: 0.94, y: 15 },
      { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: 'back.out(1.6)', clearProps: 'transform' }
    );
    const kpis = container.querySelectorAll('.kpi');
    if (kpis.length > 0) {
      gsap.killTweensOf(kpis);
      gsap.fromTo(kpis,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.05, ease: 'power2.out' }
      );
    }
  } else {
    container.classList.remove('slide-down-spring');
    void container.offsetWidth; // trigger reflow
    container.classList.add('slide-down-spring');
  }
  
  const n = res.horizon;
  const pFinal = res.percentiles.pessimistic[n];
  const mFinal = res.percentiles.median[n];
  const oFinal = res.percentiles.optimistic[n];

  // countUp count-up!
  countUp($('#mc-kpi-init'), res.initialValue, { decimals: 0 });
  countUp($('#mc-kpi-median'), mFinal, { decimals: 0 });
  countUp($('#mc-kpi-pessimistic'), pFinal, { decimals: 0 });
  countUp($('#mc-kpi-optimistic'), oFinal, { decimals: 0 });
  countUp($('#mc-kpi-ret'), res.annualizedReturn, { decimals: 1 });
  countUp($('#mc-kpi-vol'), res.annualizedVol, { decimals: 1 });

  drawMCChart(res);
}

function drawMCChart(res) {
  if (mcChart) mcChart.destroy();
  const canvas = $('#mcChart');
  if (!canvas || !window.Chart) return;

  const n = res.horizon;
  const labels = Array.from({ length: n + 1 }, (_, i) => `Gün ${i}`);
  
  mcChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Optimistik (%90 Olasılık Üst Sınır)',
          data: res.percentiles.optimistic,
          borderColor: '#f1f3f6',
          backgroundColor: 'transparent',
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0.1
        },
        {
          label: 'Medyan (%50 Beklenen Gidişat)',
          data: res.percentiles.median,
          borderColor: '#7f8798',
          backgroundColor: 'rgba(127, 135, 152, 0.03)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: true
        },
        {
          label: 'Pessimistik (%10 Olasılık Alt Sınır)',
          data: res.percentiles.pessimistic,
          borderColor: '#2d323f',
          borderDash: [4, 4],
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: reduceMotion ? 0 : 500 },
      plugins: {
        legend: { labels: { color: '#7d8590', font: { family: 'Plus Jakarta Sans' } } }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.02)' },
          ticks: { color: '#7d8590', font: { family: 'Plus Jakarta Sans' }, callback: (value) => '$' + fmtNum(value, 0) }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#f1f3f6', font: { size: 10, family: 'Plus Jakarta Sans' }, maxTicksLimit: 12 }
        }
      }
    }
  });
}

function loadDCFDefaults() {
  const dcfSel = $('#dcf-asset-sel');
  if (!dcfSel || !dcfSel.value) return;

  const parts = dcfSel.value.split(':');
  const market = parts[0];
  const symbol = parts[1];
  
  const list = DATA[market] || [];
  const stock = list.find(x => x.symbol === symbol);
  if (!stock) return;

  const price = stock.price || 100;
  const marketCap = stock.marketCap || (price * 1000000);
  const shares = marketCap / price;

  let revenue = marketCap / 4;
  let pe = stock.pe || null;
  if (pe && pe > 0) {
    const netIncome = marketCap / pe;
    revenue = netIncome / 0.15;
  }

  const defaults = {
    us: { wacc: 9.0, growth1_5: 10, growth6_10: 5, ebit: 25, tax: 21, netDebt: 0 },
    bist: { wacc: 16.0, growth1_5: 25, growth6_10: 12, ebit: 15, tax: 25, netDebt: 0 }
  };
  
  const def = defaults[market] || defaults.us;

  // DCF Defaults Set
  $('#dcf-growth-1-5').value = def.growth1_5;
  $('#lbl-growth-1-5').textContent = `%${def.growth1_5}`;

  $('#dcf-growth-6-10').value = def.growth6_10;
  $('#lbl-growth-6-10').textContent = `%${def.growth6_10}`;

  $('#dcf-ebit-margin').value = def.ebit;
  $('#lbl-ebit-margin').textContent = `%${def.ebit}`;

  $('#dcf-wacc').value = def.wacc;
  $('#lbl-wacc').textContent = `%${def.wacc.toFixed(1)}`;

  $('#dcf-terminal-growth').value = 2.5;
  $('#lbl-terminal-growth').textContent = `%2.5`;

  $('#dcf-tax-rate').value = def.tax;
  $('#dcf-net-debt').value = def.netDebt;
  $('#dcf-revenue').value = Math.round(revenue);
  $('#dcf-shares').value = Math.round(shares);

  // Graham Defaults Set
  const calculatedEps = stock.pe ? (stock.price / stock.pe) : (stock.price * 0.06);
  $('#graham-eps').value = calculatedEps.toFixed(2);
  const grahamGrowth = market === 'bist' ? 15 : 8;
  $('#graham-growth').value = grahamGrowth;
  $('#lbl-graham-growth').textContent = `%${grahamGrowth}`;
  $('#graham-aaa-yield').value = market === 'bist' ? 18.0 : 4.5;

  // DDM Defaults Set
  const calculatedDividend = stock.price * 0.025;
  $('#ddm-dividend').value = calculatedDividend.toFixed(2);
  const ddmGrowth = market === 'bist' ? 8.0 : 4.5;
  $('#ddm-growth').value = ddmGrowth;
  $('#lbl-ddm-growth').textContent = `%${ddmGrowth.toFixed(1)}`;
  
  const ddmWacc = market === 'bist' ? 16.0 : 9.5;
  $('#ddm-wacc').value = ddmWacc;
  $('#lbl-ddm-wacc').textContent = `%${ddmWacc.toFixed(1)}`;

  runDCFCalculation();
}

async function runDCFCalculation() {
  const dcfSel = $('#dcf-asset-sel');
  if (!dcfSel || !dcfSel.value) return;

  const parts = dcfSel.value.split(':');
  const market = parts[0];
  const symbol = parts[1];
  
  const list = DATA[market] || [];
  const stock = list.find(x => x.symbol === symbol);
  if (!stock) return;

  const currencySym = stock.currency === 'TRY' ? '₺' : '$';
  const modelType = $('#valuation-model-type-sel')?.value || 'dcf';
  
  let params = {
    modelType,
    currentPrice: parseFloat(stock.price)
  };

  if (modelType === 'dcf') {
    params.revenue = parseFloat($('#dcf-revenue').value) || 0;
    params.sharesOutstanding = parseFloat($('#dcf-shares').value) || 1;
    params.revenueGrowthY1Y5 = parseFloat($('#dcf-growth-1-5').value);
    params.revenueGrowthY6Y10 = parseFloat($('#dcf-growth-6-10').value);
    params.ebitMargin = parseFloat($('#dcf-ebit-margin').value);
    params.taxRate = parseFloat($('#dcf-tax-rate').value) || 0;
    params.wacc = parseFloat($('#dcf-wacc').value);
    params.terminalGrowthRate = parseFloat($('#dcf-terminal-growth').value);
    params.netDebt = parseFloat($('#dcf-net-debt').value) || 0;
  } else if (modelType === 'graham') {
    params.eps = parseFloat($('#graham-eps').value) || 0;
    params.growthRate = parseFloat($('#graham-growth').value);
    params.aaaBondYield = parseFloat($('#graham-aaa-yield').value) || 4.5;
  } else if (modelType === 'ddm') {
    params.recentDividend = parseFloat($('#ddm-dividend').value) || 0;
    params.dividendGrowthRate = parseFloat($('#ddm-growth').value);
    params.wacc = parseFloat($('#ddm-wacc').value);
  }

  try {
    const res = await fetch('/api/forecast/dcf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    const result = await res.json();
    if (result.error) {
      $('#dcf-fair-val-num').textContent = 'Hata';
      $('#dcf-margin-safety-badge').className = 'badge tone-sell';
      return;
    }

    // Currency symbols sync
    $('#dcf-currency-sym').textContent = currencySym;
    $('#dcf-ev-cur').textContent = currencySym;
    $('#dcf-eq-cur').textContent = currencySym;
    $('#dcf-ttm-cur').textContent = currencySym;

    // Trigger the spring pop animation
    const fairValBox = $('#dcf-fair-value-box');
    if (fairValBox) {
      fairValBox.classList.remove('val-pop');
      void fairValBox.offsetWidth; // trigger reflow
      fairValBox.classList.add('val-pop');
    }

    // countUp count-up!
    countUp($('#dcf-fair-val-num'), result.fairValue, { decimals: 2 });
    countUp($('#dcf-safety-num'), result.marginOfSafety, { decimals: 1 });

    const badge = $('#dcf-margin-safety-badge');
    const mos = result.marginOfSafety;
    badge.innerHTML = `Güvenlik Marjı: ${mos >= 0 ? '+' : ''}<span id="dcf-safety-num">${fmtNum(mos, 1)}</span>%`;
    if (mos >= 20) {
      badge.className = 'badge tone-strong-buy';
    } else if (mos >= 0) {
      badge.className = 'badge tone-buy';
    } else if (mos >= -20) {
      badge.className = 'badge tone-reduce';
    } else {
      badge.className = 'badge tone-sell';
    }

    $('#dcf-current-price').textContent = fmtPrice(params.currentPrice, stock.currency);

    // Render Değerleme Hassasiyet Matrisi (Sensitivity Heatmap)
    const sensContainer = $('#valuation-sensitivity-grid');
    if (sensContainer && result.sensitivity) {
      const sens = result.sensitivity;
      const currentPrice = params.currentPrice;
      
      let html = '<table style="border-collapse: collapse; margin: 0 auto; width: auto; font-family: monospace; font-size: 11.5px; border: 1px solid var(--border);">';
      
      // Header row (cols)
      html += '<thead><tr>';
      html += `<th style="padding: 10px; border: 1px solid var(--border); background: var(--bg-2); color: var(--muted); font-weight: 700;">${esc(sens.rowLabel)} \\ ${esc(sens.colLabel)}</th>`;
      sens.cols.forEach(colVal => {
        html += `<th style="padding: 10px; border: 1px solid var(--border); background: var(--bg-2); color: var(--muted); font-weight: 700; text-align: center;">${esc(colVal)}</th>`;
      });
      html += '</tr></thead><tbody>';
      
      // Rows
      sens.matrix.forEach((rowVals, rIdx) => {
        const rowLabelVal = sens.rows[rIdx];
        html += `<tr><td style="padding: 10px; border: 1px solid var(--border); background: var(--bg-2); color: var(--text); font-weight: 700; text-align: left;">${esc(rowLabelVal)}</td>`;
        
        rowVals.forEach((val, cIdx) => {
          // Calculate MOS for this cell
          const cellMOS = val > 0 ? ((val - currentPrice) / val) * 100 : -100;
          
          let cellBg = 'background-color: var(--bg-2);';
          let cellText = 'color: var(--text);';
          
          if (cellMOS >= 20) {
            cellBg = 'background-color: rgba(5, 150, 105, 0.35);'; // Strong Buy green
          } else if (cellMOS >= 0) {
            cellBg = 'background-color: rgba(5, 150, 105, 0.18);'; // Buy light green
          } else if (cellMOS >= -20) {
            cellBg = 'background-color: rgba(217, 119, 6, 0.22);'; // Reduce orange
          } else {
            cellBg = 'background-color: rgba(220, 38, 38, 0.25);'; // Sell red
          }
          
          // Highlight the center element (the actual selected values)
          let cellBorder = 'border: 1px solid var(--border);';
          let cellWeight = 'font-weight: 500;';
          if (rIdx === 2 && cIdx === 2) {
            cellBorder = 'border: 2px solid var(--text);';
            cellWeight = 'font-weight: 800; text-decoration: underline;';
          }
          
          html += `
            <td class="sens-cell" style="${cellBg} ${cellText} ${cellBorder} ${cellWeight} padding: 10px 12px; text-align: center; cursor: default;" 
                title="Değer: ${currencySym}${val.toFixed(2)} | Güvenlik Marjı: ${cellMOS.toFixed(1)}%">
              ${currencySym}${val.toFixed(0)}
            </td>
          `;
        });
        html += '</tr>';
      });
      
      html += '</tbody></table>';
      sensContainer.innerHTML = html;

      if (window.gsap && !reduceMotion) {
        const cells = sensContainer.querySelectorAll('.sens-cell');
        gsap.fromTo(cells, 
          { scale: 0.8, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.4, stagger: { grid: [5, 5], from: "center", amount: 0.3 }, ease: "back.out(1.2)" }
        );
      }
    }

    if (modelType === 'dcf') {
      countUp($('#dcf-ev-val-num'), result.enterpriseValue, { decimals: 0 });
      countUp($('#dcf-eq-val-num'), result.equityValue, { decimals: 0 });
      countUp($('#dcf-ttm-val-num'), params.revenue, { decimals: 0 });

      const tbody = $('#dcf-table-body');
      tbody.innerHTML = result.forecast.map(f => `
        <tr>
          <td>Yıl ${f.year}</td>
          <td>${currencySym}${fmtNum(f.revenue, 0)}</td>
          <td>${currencySym}${fmtNum(f.ebit, 0)}</td>
          <td>${currencySym}${fmtNum(f.fcf, 0)}</td>
          <td><b>${currencySym}${fmtNum(f.pv, 0)}</b></td>
        </tr>
      `).join('');
    }

  } catch (e) {
    console.error('Değerleme hesaplama hatası:', e);
  }
}

/* ---------- Olaylar ---------- */
document.querySelectorAll('.navitem').forEach((n) => n.addEventListener('click', () => setView(n.dataset.view)));
$('#sortSel').addEventListener('change', (e) => { sortBy = e.target.value; if (['us', 'bist', 'crypto'].includes(activeView)) { renderScoreChart(); renderTable(); } });
$('#refreshBtn').addEventListener('click', refresh);
document.querySelectorAll('[data-desk-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    assetDeskState.mode = btn.dataset.deskMode;
    const list = DATA && DATA[activeView] ? DATA[activeView] : [];
    const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
    syncDeskControls(assetDeskState.market || activeView, assetDeskState.interval || deskDefaultInterval(activeView));
    renderAssetDesk(asset);
  });
});
$('#deskIntervalSel').addEventListener('change', (e) => {
  assetDeskState.interval = e.target.value;
  const list = DATA && DATA[activeView] ? DATA[activeView] : [];
  const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
  renderAssetDesk(asset);
});

const toggleBtn = $('#deskSmaToggleBtn');
if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    assetDeskState.showSMA = !assetDeskState.showSMA;
    localStorage.setItem('finans-show-sma', assetDeskState.showSMA);
    updateSmaButtonVisual();
    const list = DATA && DATA[activeView] ? DATA[activeView] : [];
    const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
    if (asset) {
      renderAssetDesk(asset);
    }
  });
}

/* ---------- Tema Seçici İşlemleri ---------- */
function initThemeSelector() {
  const btns = document.querySelectorAll('.theme-btn');
  const savedTheme = localStorage.getItem('finans-theme') || 'carbon';
  
  const applyTheme = (theme) => {
    // Remove old themes
    document.body.classList.remove('theme-carbon', 'theme-silver', 'theme-amber', 'theme-green');
    // Add new theme
    document.body.classList.add('theme-' + theme);
    // Save to localStorage
    localStorage.setItem('finans-theme', theme);
    
    // Update active button state
    btns.forEach(btn => {
      if (btn.dataset.theme === theme) {
        btn.classList.add('active');
        btn.style.borderColor = 'var(--text)';
      } else {
        btn.classList.remove('active');
        btn.style.borderColor = 'transparent';
      }
    });
  };

  // Bind click events
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
    });
  });

  // Apply default/saved theme
  applyTheme(savedTheme);
}

initThemeSelector();
updateSmaButtonVisual();
initAnimations();

setView('overview');
load();
setInterval(silentRefresh, 10 * 60 * 1000);

/* ---------- GSAP Premium Animasyonları ---------- */
function triggerRevealAnimations(container) {
  if (!container || !window.gsap || reduceMotion) return;
  const items = container.querySelectorAll('.card, .kpi, .table-wrap, .trading-desk, .lit, .scenario');
  if (!items.length) return;

  gsap.killTweensOf(items);
  gsap.set(items, { opacity: 0, y: 15 });

  if (window.ScrollTrigger) {
    items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const inViewport = rect.top >= 0 && rect.top <= window.innerHeight;
      
      if (inViewport) {
        gsap.to(item, {
          opacity: 1,
          y: 0,
          duration: 0.45,
          ease: 'power2.out',
          clearProps: 'transform'
        });
      } else {
        gsap.to(item, {
          scrollTrigger: {
            trigger: item,
            start: 'top 92%',
            toggleActions: 'play none none none',
          },
          opacity: 1,
          y: 0,
          duration: 0.55,
          ease: 'power2.out',
          clearProps: 'transform'
        });
      }
    });
  } else {
    gsap.to(items, {
      opacity: 1,
      y: 0,
      duration: 0.45,
      stagger: 0.05,
      ease: 'power2.out',
      clearProps: 'transform'
    });
  }
}

function initAnimations() {
  if (!window.gsap) return;

  if (window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  // 1. Sidebar Navitem interactions
  document.querySelectorAll('.navitem').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      gsap.to(btn, {
        scale: 1.03,
        x: 4,
        duration: 0.2,
        ease: 'power2.out'
      });
      const icon = btn.querySelector('.ni');
      if (icon) {
        gsap.to(icon, { scale: 1.25, duration: 0.2, ease: 'back.out(1.7)' });
      }
    });

    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, {
        scale: 1,
        x: 0,
        duration: 0.2,
        ease: 'power2.out'
      });
      const icon = btn.querySelector('.ni');
      if (icon) {
        gsap.to(icon, { scale: 1, duration: 0.2, ease: 'power2.out' });
      }
    });

    btn.addEventListener('mousedown', () => {
      gsap.to(btn, { scale: 0.96, duration: 0.1 });
    });

    btn.addEventListener('mouseup', () => {
      gsap.to(btn, { scale: 1.03, duration: 0.1 });
    });
  });

  // 2. Card Hover Float and Glow Effects (Delegated)
  document.addEventListener('mouseover', e => {
    const card = e.target.closest('.card, .lit, .scenario');
    if (card && !card.dataset.animatingHover) {
      card.dataset.animatingHover = 'true';
      gsap.to(card, {
        y: -4,
        boxShadow: '0 10px 24px oklch(0% 0 0 / 0.45)',
        borderColor: 'var(--border-2)',
        duration: 0.28,
        ease: 'power2.out'
      });
    }
  });

  document.addEventListener('mouseout', e => {
    const card = e.target.closest('.card, .lit, .scenario');
    if (card && (!e.relatedTarget || !card.contains(e.relatedTarget))) {
      delete card.dataset.animatingHover;
      gsap.to(card, {
        y: 0,
        boxShadow: 'none',
        borderColor: 'var(--border)',
        duration: 0.28,
        ease: 'power2.out'
      });
    }
  });

  // 3. Buttons and segmented controls press feedback (Delegated)
  document.addEventListener('mousedown', e => {
    const btn = e.target.closest('.btn, .seg, .theme-btn');
    if (btn) {
      gsap.to(btn, { scale: 0.95, duration: 0.1 });
    }
  });

  document.addEventListener('mouseup', e => {
    const btn = e.target.closest('.btn, .seg, .theme-btn');
    if (btn) {
      gsap.to(btn, { scale: 1, duration: 0.1 });
    }
  });
}
