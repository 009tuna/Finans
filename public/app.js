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
let REPORT_CACHE = null;
let activeDetailCharts = {};
let assetDeskChart = null;
let assetDeskResize = null;
let assetDeskState = {
  market: null,
  symbol: null,
  mode: 'candles',
  interval: null,
  showSMA:  localStorage.getItem('finans-show-sma')  === 'true',
  showRSI:  localStorage.getItem('finans-show-rsi')  === 'true',
  showMACD: localStorage.getItem('finans-show-macd') === 'true',
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
let JOURNAL = { notes: {}, alerts: [], predictions: [], theses: {}, catalysts: [], riskRules: [] };

async function loadJournal() {
  try {
    const res = await fetch('/api/journal', { cache: 'no-store' });
    JOURNAL = await res.json();
  } catch (e) {
    console.error('Journal yüklenemedi:', e);
    JOURNAL = { notes: {}, alerts: [], predictions: [], theses: {}, catalysts: [], riskRules: [] };
  }
}

async function saveJournal() {
  try {
    await fetch('/api/journal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(JOURNAL),
    });
  } catch (e) {
    console.error('Journal kaydedilemedi:', e);
  }
}

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
    await loadJournal();
    try { await loadReportCache(); } catch (_) { REPORT_CACHE = null; }
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
  bist: ['🇹🇷 BIST 100', 'En büyük 100 şirket · teknik analiz', 'view-market'],
  crypto: ['₿ Kripto', '21 coin · teknik momentum analizi', 'view-market'],
  portfolio: ['💼 Portföyüm', 'Maliyet, kâr/zarar ve portföy sağlık analizi', 'view-portfolio'],
  screener: ['🔍 Teknik Tarayıcı', 'Kritik indikatör sinyalleri ve alarmlar', 'view-screener'],
  backtest: ['📈 Strateji Testi', 'Geçmiş fiyat verileriyle teknik puan stratejisi testi', 'view-backtest'],
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
    renderOverviewBriefing(); renderExecSummary(); renderDailyDigest(); renderOverviewRoutes(); renderKpis(); renderCfoDecisionCockpit(); renderPredictionScorecard(); renderDecisionLearningPanel(); renderSignalOverlayPanel(); renderIdeaFunnel(); renderCatalystCalendar(); renderMarketRegime(); renderFxWidget();
    if (document.querySelector('.overview-advanced') && document.querySelector('.overview-advanced').open) {
      renderPicks(); renderAlloc(); renderMovers();
    }
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
  } else if (activeView === 'literacy') {
    renderLiteracyView();
  }
}

/* ---------- Günlük Rapor ---------- */
function reportExecutiveReadingHtml(base, ai) {
  const s = base && base.sentiment ? base.sentiment : {};
  const overlaySummary = base && base.signalOverlay && base.signalOverlay.summary ? base.signalOverlay.summary : {};
  const macro = ai && ai.macroSummary ? ai.macroSummary : 'Makro yorum henuz uretilmedi; deterministik teknik rapor okunuyor.';
  const today = ai && ai.todayFocus ? ai.todayFocus : 'Bugun icin oncelik: genel duyarlilik, skor degisimi ve yaklasan katalizorleri birlikte oku.';
  const positioning = ai && ai.weeklyOutlook && ai.weeklyOutlook.positioning ? ai.weeklyOutlook.positioning : 'Pozisyon kararini tek sinyale baglama; rapor, teknik skor ve portfoy agirligini birlikte oku.';
  const worldNews = ai && Array.isArray(ai.worldNews) ? ai.worldNews.slice(0, 4) : [];
  const companyNews = base && base.calendar && Array.isArray(base.calendar.companyNews) ? base.calendar.companyNews.slice(0, 5) : [];
  const commentary = ai && ai.commentary ? ai.commentary : {};
  const marketLines = [
    commentary.us ? '<li><b>ABD</b><span>' + esc(commentary.us) + '</span></li>' : '',
    commentary.bist ? '<li><b>BIST</b><span>' + esc(commentary.bist) + '</span></li>' : '',
    commentary.crypto ? '<li><b>Kripto</b><span>' + esc(commentary.crypto) + '</span></li>' : '',
  ].filter(Boolean).join('');
  const worldHtml = worldNews.length
    ? worldNews.map((n) => '<li><b>' + esc(n.impact || 'notr') + '</b><span>' + esc(n.title || '') + '</span></li>').join('')
    : '<li><span>Kuresel haber ozeti icin AI raporu bekleniyor.</span></li>';
  const companyHtml = companyNews.length
    ? companyNews.map((n) => '<li><b>' + esc(n.symbol || '-') + '</b><span>' + esc(n.headline || '') + '</span></li>').join('')
    : '<li><span>Takip listesi icin sirket haber akisi yok.</span></li>';

  return '<div class="card reveal report-reader-card">' +
    '<div class="report-reader-head">' +
      '<div><span class="brief-kicker">Yonetici okuma akisi</span><h2>Once resmi anla, sonra detaya in.</h2></div>' +
      '<div class="reader-sentiment"><b>' + esc(s.label || '-') + '</b><span>' + esc(String(s.avg == null ? '-' : s.avg)) + '/100</span></div>' +
    '</div>' +
    '<div class="reader-grid">' +
      '<section class="reader-block reader-main"><h3>Makro degisim</h3><p>' + esc(macro) + '</p><ul>' + (marketLines || '<li><span>Pazar yorumu bekleniyor.</span></li>') + '</ul></section>' +
      '<section class="reader-block"><h3>Mikro ve haber akisi</h3><ul>' + worldHtml + companyHtml + '</ul></section>' +
      '<section class="reader-block"><h3>Bana etkisi</h3><p>' + esc(today) + '</p><div class="reader-impact">' +
        '<span>AL sinyali <b>' + esc(String(s.buys == null ? '-' : s.buys)) + '</b></span>' +
        '<span>Yukselen <b>' + esc(String(s.gainers == null ? '-' : s.gainers)) + '</b></span>' +
        '<span>Makro baski <b>' + esc(String(overlaySummary.reduced || 0)) + '</b></span>' +
      '</div><p>' + esc(positioning) + '</p></section>' +
    '</div>' +
  '</div>';
}

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
  const aiBadge = ai ? '<span class="ai-badge">✦ Yapay zeka · canlı makro yorum</span>' : '';

  let h = '';
  // Başlık
  h += '<div class="card reveal"><div class="report-head"><div>' +
    '<h2>📰 Günlük Piyasa Raporu</h2><div class="report-date">' + base.date + ' · ' + s.total + ' varlık · ' + s.buys + ' AL sinyali · ' + s.gainers + ' yükselen</div></div>' +
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + aiBadge + '<span class="sent-pill ' + sc + '">' + s.label + ' · ' + s.avg + '/100</span></div></div></div>';

  h += reportExecutiveReadingHtml(base, ai);
  h += reportSignalOverlayHtml(base);

  // Yapay zeka makro + haber
  if (ai && ai.macroSummary) {
    h += '<div class="card reveal"><div class="card-head"><h2>🌍 Makro ve Dünya Durumu</h2><span class="ai-badge">✦ Yapay zeka</span></div>' +
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

  // Haftalık Retro
  if (ai && ai.weeklyRetro) {
    h += '<div class="card reveal"><div class="card-head"><h2>Geçen Hafta Ne Dedik? (Haftalık Geri Bakış)</h2><span class="ai-badge">✦ Yapay zeka</span></div>' +
      '<p class="rep-macro">' + esc(ai.weeklyRetro) + '</p></div>';
  }

  // Bu hafta: katalizör takvimi + finans direktörü senaryo analizi
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

  // Yapay zeka pazar yorumu
  if (ai && ai.commentary) {
    const c = ai.commentary;
    h += '<div class="card reveal"><div class="card-head"><h2>🗒️ Pazar Yorumu</h2><span class="ai-badge">✦ Yapay zeka</span></div><div class="commentary">' +
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

  // Yapay zeka günün odağı + okuryazarlık ipucu
  if (ai && (ai.todayFocus || ai.literacyTip)) {
    h += '<div class="card reveal">';
    if (ai.todayFocus) h += '<div class="card-head"><h2>🎯 Bugün Neye Dikkat?</h2><span class="ai-badge">✦ Yapay zeka</span></div><p class="rep-macro">' + esc(ai.todayFocus) + '</p>';
    if (ai.literacyTip) h += '<div class="tip-card" style="margin-top:14px"><h4>📚 ' + esc(ai.literacyTip.title || 'Günün dersi') + '</h4><p>' + esc(ai.literacyTip.body || '') + '</p></div>';
    h += '</div>';
  }

  // Daily Quiz
  if (ai && ai.quiz) {
    const quizDate = base.date || new Date().toISOString().slice(0, 10);
    const lastPlayed = localStorage.getItem('finans-quiz-last-played');
    const streak = parseInt(localStorage.getItem('finans-quiz-streak') || '0', 10);
    const hasPlayedToday = lastPlayed === quizDate;
    
    h += '<div class="card reveal" id="quiz-card" style="margin-top: 14px;">';
    h += '<div class="card-head"><h2>🧠 Günün Finansal Akıl Yürütme Sorusu</h2><span class="ai-badge">✦ Günlük Soru</span></div>';
    h += '<p style="font-weight: 600; margin-bottom: 12px; font-size: 14px;">' + esc(ai.quiz.question) + '</p>';
    
    if (hasPlayedToday) {
      const selectedIndex = parseInt(localStorage.getItem('finans-quiz-last-selected') || '0', 10);
      h += '<div style="display: flex; flex-direction: column; gap: 8px;">';
      ai.quiz.options.forEach((opt, idx) => {
        const isCorrect = idx === ai.quiz.correctIndex;
        const isSelected = idx === selectedIndex;
        let borderStyle = 'border: 1px solid var(--border);';
        let bgStyle = '';
        let icon = '';
        if (isCorrect) {
          borderStyle = 'border: 1px solid var(--green);';
          bgStyle = 'background: rgba(5, 150, 105, 0.1);';
          icon = '🟢 ';
        } else if (isSelected) {
          borderStyle = 'border: 1px solid var(--red);';
          bgStyle = 'background: rgba(220, 38, 38, 0.1);';
          icon = '🔴 ';
        }
        h += '<div style="padding: 10px 14px; border-radius: 6px; font-size: 13px; ' + borderStyle + ' ' + bgStyle + '">' + icon + esc(opt) + '</div>';
      });
      h += '</div>';
      h += '<div style="margin-top: 14px; padding: 12px; background: var(--bg-2); border: 1px solid var(--border); border-radius: 6px;">';
      h += '<b style="color: ' + (selectedIndex === ai.quiz.correctIndex ? 'var(--green)' : 'var(--red)') + ';">' + (selectedIndex === ai.quiz.correctIndex ? 'Tebrikler! Doğru cevap.' : 'Yanlış cevap.') + '</b>';
      h += '<p style="margin: 6px 0 0 0; font-size: 12.5px; color: var(--muted);">' + esc(ai.quiz.explanation) + '</p>';
      h += '</div>';
      h += '<div style="margin-top: 10px; font-size: 12px; font-weight: 600; color: var(--accent);">🔥 Mevcut seri skoru: ' + streak + ' gün</div>';
    } else {
      h += '<div style="display: flex; flex-direction: column; gap: 8px;" id="quiz-options-container">';
      ai.quiz.options.forEach((opt, idx) => {
        h += '<button class="btn" style="text-align: left; padding: 10px 14px; background: var(--bg-2); border: 1px solid var(--border); font-size: 13px; width: 100%; cursor: pointer;" onclick="submitQuizAnswer(' + idx + ', ' + ai.quiz.correctIndex + ', \'' + quizDate + '\')">' + esc(opt) + '</button>';
      });
      h += '</div>';
      h += '<div id="quiz-streak-display" style="margin-top: 10px; font-size: 12px; font-weight: 600; color: var(--accent);">🔥 Seri Skoru: ' + streak + ' gün</div>';
    }
    h += '</div>';
  }

  h += '<div class="card reveal"><p class="muted">Üretim: ' + (ai ? 'kural-tabanlı teknik + yapay zeka makro/haber katmanı' : 'kural-tabanlı teknik (yapay zeka katmanı bekleniyor)') + ' · ' + relTime(base.generatedAt) + '. <b>Yatırım tavsiyesi değildir.</b></p></div>';

  el.innerHTML = h;
  triggerRevealAnimations(el);
}
function esc(t) { return String(t == null ? '' : t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function flag(c) { return { US: '🇺🇸', CN: '🇨🇳', JP: '🇯🇵', DE: '🇩🇪', GB: '🇬🇧', EU: '🇪🇺', EA: '🇪🇺', TR: '🇹🇷', FR: '🇫🇷' }[c] || c; }

// Bu haftanın katalizör takvimi + finans direktörü senaryo analizi (base = deterministik, ai = yorum)
function reportSignalOverlayHtml(base) {
  const overlay = base && base.signalOverlay;
  if (!overlay || !overlay.assets) return '';
  const summary = overlay.summary || {};
  const rows = Object.values(overlay.assets)
    .filter((x) => x.totalAdjustment !== 0)
    .sort((a, b) => Math.abs(b.totalAdjustment) - Math.abs(a.totalAdjustment))
    .slice(0, 5)
    .map((x) => {
      const cls = x.totalAdjustment > 0 ? 'pos' : 'neg';
      return '<div class="overlay-row report-overlay-row">' +
        '<span><b>' + esc(x.symbol) + '</b><small>Teknik ' + x.technicalScore + ' -> Makro ' + x.adjustedScore + ' · ' + esc(overlayStatusLabel(x.status)) + '</small></span>' +
        '<em class="overlay-adj oa-' + cls + '">' + adjustmentLabel(x.totalAdjustment) + '</em>' +
      '</div>';
    }).join('');
  return '<div class="card reveal signal-overlay-card">' +
    '<div class="card-head"><h2>Makro Sinyal Katmani</h2><span class="card-sub">AL/SAT degil; teknik skora sinirli makro/katalizor katmani</span></div>' +
    '<div class="overlay-summary">' +
      '<div><b>' + (summary.boosted || 0) + '</b><span>Destek</span></div>' +
      '<div><b>' + (summary.reduced || 0) + '</b><span>Baski</span></div>' +
      '<div><b>' + (summary.highPressure || 0) + '</b><span>Katalizor</span></div>' +
      '<div><b>' + (summary.stale || 0) + '</b><span>Suresi dolan</span></div>' +
    '</div>' +
    '<div class="overlay-rows">' + (rows || '<p class="muted compact">Aktif overlay etkisi yok.</p>') + '</div>' +
  '</div>';
}

function weeklyHtml(base, ai) {
  const cal = base.calendar || {};
  const wo = (ai && ai.weeklyOutlook) || null;
  const econ = cal.economic || [];
  const earn = cal.earnings || [];
  const news = cal.companyNews || [];
  if (!wo && !econ.length && !earn.length && !news.length) return '';

  let h = '<div class="card reveal"><div class="card-head"><h2>📅 Bu Hafta: Veri &amp; Katalizör Takvimi</h2>' + (wo ? '<span class="ai-badge">✦ Yapay zeka · finans direktörü senaryosu</span>' : '') + '</div>';

  if (wo && wo.cfoSummary) h += '<div class="tip-card" style="margin-bottom:16px"><h4>🧠 Finans Direktörü Bakışı: Haftanın Sentezi</h4><p>' + esc(wo.cfoSummary) + '</p></div>';

  // Senaryo kartları
  if (wo && Array.isArray(wo.events) && wo.events.length) {
    h += '<div class="rep-section"><h3>Veri beklentileri ve senaryo analizi</h3><div class="scenarios">';
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
    h += '<div class="chips">' + earn.slice(0, 14).map((e) => '<span class="chip' + (e.watch ? ' chip-watch' : '') + '">' + esc(e.symbol) + ' · ' + esc(e.date) + (e.epsEstimate != null ? ' · HBK ' + esc(String(e.epsEstimate)) : '') + '</span>').join('') + '</div></div>';
  }

  // Şirket haber akışı
  if (news.length) {
    h += '<div class="rep-section"><h3>Şirket haber akışı</h3>' + news.map((n) => '<div class="news-item"><span class="news-impact imp-neutral">' + esc(n.symbol) + '</span><span>' + esc(n.headline || '') + (n.source ? ' <span class="muted">— ' + esc(n.source) + '</span>' : '') + '</span></div>').join('') + '</div>';
  }

  if (wo && wo.positioning) h += '<div class="tip-card" style="margin-top:14px"><h4>🎯 Pozisyon Disiplini</h4><p>' + esc(wo.positioning) + '</p></div>';

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
async function renderOverviewBriefing() {
  const el = $('#overviewBriefing');
  if (!el) return;
  let base = null;
  let ai = null;
  try {
    const report = await loadReportCache();
    base = report && report.base;
    ai = report && report.ai;
  } catch (_) {
    base = null;
    ai = null;
  }

  const s = base && base.sentiment ? base.sentiment : null;
  const overlaySummary = base && base.signalOverlay && base.signalOverlay.summary ? base.signalOverlay.summary : {};
  const macro = ai && ai.macroSummary
    ? ai.macroSummary
    : 'Rapor katmani henuz hazir degil; ilk okuma icin teknik ozet ve piyasa skorlarini kullan.';
  const focus = ai && ai.todayFocus
    ? ai.todayFocus
    : 'Bugun once raporu oku, sonra sadece skor degisimi olan varliklara in.';
  const news = ai && Array.isArray(ai.worldNews) ? ai.worldNews.slice(0, 3) : [];
  const newsHtml = news.length
    ? news.map((n) => '<li>' + esc(n.title || '') + '</li>').join('')
    : '<li>Canli haber ozeti icin gunluk AI raporu bekleniyor.</li>';
  const sentiment = s ? s.label + ' / ' + s.avg + '/100' : 'Rapor bekleniyor';
  const breadth = s ? s.gainers + ' yukselen / ' + s.total + ' varlik' : 'Veri yukleniyor';
  const pressure = (overlaySummary.reduced || 0) + ' baski, ' + (overlaySummary.boosted || 0) + ' destek';

  el.innerHTML = '<div class="overview-briefing card reveal">' +
    '<div class="brief-main">' +
      '<span class="brief-kicker">Bugun once bunu oku</span>' +
      '<h2>Gunluk rapor ana ekranin merkezinde.</h2>' +
      '<p>' + esc(macro) + '</p>' +
      '<div class="brief-actions">' +
        '<button class="btn" type="button" onclick="setView(\'report\')">Gunluk raporu oku</button>' +
        '<button class="btn btn-secondary" type="button" onclick="setView(\'portfolio\')">Portfoyu kontrol et</button>' +
      '</div>' +
    '</div>' +
    '<div class="brief-side">' +
      '<div class="brief-focus"><b>Bugunun odagi</b><span>' + esc(focus) + '</span></div>' +
      '<div class="brief-metrics">' +
        '<div><span>Duyarlilik</span><b>' + esc(sentiment) + '</b></div>' +
        '<div><span>Genislik</span><b>' + esc(breadth) + '</b></div>' +
        '<div><span>Makro basinc</span><b>' + esc(pressure) + '</b></div>' +
      '</div>' +
      '<ul class="brief-news">' + newsHtml + '</ul>' +
    '</div>' +
  '</div>';
}

function renderOverviewRoutes() {
  const el = $('#overviewRoutes');
  if (!el) return;
  const route = (view, title, body, meta) => {
    return '<button class="route-card" type="button" onclick="setView(\'' + view + '\')">' +
      '<span>' + esc(meta) + '</span><b>' + esc(title) + '</b><em>' + esc(body) + '</em>' +
    '</button>';
  };
  el.innerHTML = '<div class="overview-routes reveal">' +
    route('report', 'Raporu oku', 'Makro, mikro haber akisi ve bugunun etkisi tek yerde.', '1') +
    route('us', 'Piyasaya in', 'ABD, BIST veya kripto tablolarinda teknik detaylara bak.', '2') +
    route('portfolio', 'Portfoyu kontrol et', 'Agirlik, risk ve pozisyon sagligini ayri oku.', '3') +
    route('screener', 'Sinyal ara', 'Sadece yeni firsat veya alarm ariyorsan teknik tarayiciya gec.', '4') +
  '</div>';
}

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

/* ---------- Chart renk paleti — marka aksanları (gri yerine kısıtlı, uyumlu renk) ---------- */
const CHART = {
  accent: '#6f9bff',   // marka indigo-mavi (ana seri)
  green:  '#3ddc97',   // yeşil (pozitif/optimistik)
  red:    '#f6766f',   // mercan kırmızı (negatif/pessimistik) — alarm tonu değil
  amber:  '#ecb45a',
  orange: '#f0925a',
  violet: '#a78bfa',
  teal:   '#34d4c4',
  axis:   '#8a92a0',
  grid:   'rgba(255,255,255,0.045)',
  neutral:'#5a6472',   // nötr ikincil (al-tut, medyan referans)
  toneColor(tone) {
    return ({ 'strong-buy': '#3ddc97', buy: '#57d3a4', hold: '#ecb45a', reduce: '#f0925a', sell: '#f6766f' })[tone] || '#6f9bff';
  },
};
// Smooth alan dolgusu için dikey gradient (renk → şeffaf)
function chartGradient(canvas, hex, alpha) {
  try {
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
    const r = parseInt(hex.slice(1, 3), 16), gg = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    g.addColorStop(0, 'rgba(' + r + ',' + gg + ',' + b + ',' + alpha + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    return g;
  } catch (_) { return 'rgba(111,155,255,0.10)'; }
}

function renderAlloc() {
  const alloc = (DATA.allocation || []).filter((a) => a.weight > 0);
  if (allocChart) allocChart.destroy();
  if (!window.Chart || !alloc.length) return;
  allocChart = new Chart($('#allocChart'), {
    type: 'doughnut',
    data: { labels: alloc.map((a) => a.label), datasets: [{ data: alloc.map((a) => a.weight), backgroundColor: [CHART.accent, CHART.teal, CHART.violet, CHART.amber, CHART.green, CHART.orange], borderColor: '#12151b', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, animation: { duration: reduceMotion ? 0 : 700 }, cutout: '62%', plugins: { legend: { position: 'right', labels: { color: '#7d8590', boxWidth: 12, font: { size: 11, family: 'Plus Jakarta Sans' } } }, tooltip: { callbacks: { label: (x) => x.label + ': %' + x.raw } } } },
  });
}

function renderMovers() {
  const all = allScored().slice().sort((a, b) => b.analysis.score - a.analysis.score).slice(0, 12);
  if (moversChart) moversChart.destroy();
  if (!window.Chart || !all.length) return;
  moversChart = new Chart($('#moversChart'), {
    type: 'bar',
    data: { labels: all.map((x) => x.symbol), datasets: [{ data: all.map((x) => x.analysis.score), backgroundColor: all.map((x) => CHART.toneColor(x.analysis.tone)), hoverBackgroundColor: 'rgba(255,255,255,.22)', borderRadius: 6 }] },
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
    data: { labels: list.map((x) => x.symbol), datasets: [{ data: list.map((x) => x.analysis.score), backgroundColor: list.map((x) => CHART.toneColor(x.analysis.tone)), hoverBackgroundColor: 'rgba(255,255,255,.22)', borderRadius: 6 }] },
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
  updateRsiButtonVisual();
  updateMacdButtonVisual();
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
function addLwSeries(chart, name, options, paneIndex) {
  const lw = window.LightweightCharts || {};
  // v5: chart.addSeries(SeriesType, options, paneIndex)
  if (chart.addSeries && lw[name]) {
    return (paneIndex != null)
      ? chart.addSeries(lw[name], options, paneIndex)
      : chart.addSeries(lw[name], options);
  }
  // v4 fallback (paneIndex ignoré)
  if (name === 'CandlestickSeries' && chart.addCandlestickSeries) return chart.addCandlestickSeries(options);
  if (name === 'LineSeries'        && chart.addLineSeries)        return chart.addLineSeries(options);
  if (name === 'HistogramSeries'   && chart.addHistogramSeries)   return chart.addHistogramSeries(options);
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

// Full-series RSI for chart pane (Wilder smoothing)
function calculateRSISeries(bars, period = 14) {
  if (!bars || bars.length < period + 1) return [];
  const closes = bars.map(b => b.close);
  const out = [];
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) avgGain += ch; else avgLoss -= ch;
  }
  avgGain /= period; avgLoss /= period;
  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  out.push({ time: bars[period].time, value: rsi0 });
  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(ch, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-ch, 0)) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    out.push({ time: bars[i].time, value: rsi });
  }
  return out;
}

// Full-series MACD for chart pane
function calculateMACDSeries(bars, fast = 12, slow = 26, sig = 9) {
  if (!bars || bars.length < slow + sig) return null;
  const closes = bars.map(b => b.close);
  const ef = calculateEMA(closes, fast);
  const es = calculateEMA(closes, slow);
  // Build aligned macd values
  const macdVals = [];
  const macdTimes = [];
  for (let i = 0; i < closes.length; i++) {
    if (ef[i] != null && es[i] != null) {
      macdVals.push(ef[i] - es[i]);
      macdTimes.push(bars[i].time);
    }
  }
  const sigVals = calculateEMA(macdVals, sig);
  const macdLine = [], signalLine = [], hist = [];
  for (let i = 0; i < macdVals.length; i++) {
    if (sigVals[i] == null) continue;
    const m = macdVals[i], s = sigVals[i], h = m - s;
    macdLine.push({ time: macdTimes[i], value: m });
    signalLine.push({ time: macdTimes[i], value: s });
    hist.push({ time: macdTimes[i], value: h, color: h >= 0 ? '#28d793' : '#ef4444' });
  }
  return { macdLine, signalLine, hist };
}

function updateSmaButtonVisual() {
  const btn = $('#deskSmaToggleBtn');
  const txt = $('#deskSmaStatusText');
  if (!btn || !txt) return;
  if (assetDeskState.showSMA) {
    btn.dataset.active = 'true'; txt.textContent = 'AÇIK'; txt.style.color = '#28d793'; btn.style.borderColor = 'var(--text)';
  } else {
    btn.dataset.active = 'false'; txt.textContent = 'KAPALI'; txt.style.color = 'var(--muted)'; btn.style.borderColor = 'var(--border)';
  }
}

function updateRsiButtonVisual() {
  const btn = $('#deskRsiToggleBtn');
  const txt = $('#deskRsiStatusText');
  if (!btn || !txt) return;
  if (assetDeskState.showRSI) {
    btn.dataset.active = 'true'; txt.textContent = 'AÇIK'; txt.style.color = '#a78bfa'; btn.style.borderColor = 'var(--text)';
  } else {
    btn.dataset.active = 'false'; txt.textContent = 'KAPALI'; txt.style.color = 'var(--muted)'; btn.style.borderColor = 'var(--border)';
  }
}

function updateMacdButtonVisual() {
  const btn = $('#deskMacdToggleBtn');
  const txt = $('#deskMacdStatusText');
  if (!btn || !txt) return;
  if (assetDeskState.showMACD) {
    btn.dataset.active = 'true'; txt.textContent = 'AÇIK'; txt.style.color = '#f97316'; btn.style.borderColor = 'var(--text)';
  } else {
    btn.dataset.active = 'false'; txt.textContent = 'KAPALI'; txt.style.color = 'var(--muted)'; btn.style.borderColor = 'var(--border)';
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
    ? { color: CHART.accent, lineWidth: 2, priceLineVisible: false }
    : {
        upColor: '#2fbe88',
        downColor: '#e2666e',
        borderVisible: true,
        borderUpColor: '#2fbe88',
        borderDownColor: '#e2666e',
        wickUpColor: '#6b7585',
        wickDownColor: '#6b7585',
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
      color: '#4382ff', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });
    if (sma20Series) sma20Series.setData(sma20Data);
    const sma50Series = addLwSeries(chart, 'LineSeries', {
      color: '#ff9f43', lineWidth: 1.2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
    });
    if (sma50Series) sma50Series.setData(sma50Data);
  }

  // --- RSI Panosu ---
  if (assetDeskState.showRSI) {
    const rsiSeries_data = calculateRSISeries(bars, 14);
    if (rsiSeries_data.length > 0) {
      const rsiPane = 1;
      const rsiS = addLwSeries(chart, 'LineSeries', {
        color: '#a78bfa',
        lineWidth: 1.5,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        priceScaleId: 'rsi-scale',
      }, rsiPane);
      if (rsiS) {
        rsiS.setData(rsiSeries_data);
        // 0–100 sabit ölçek
        try {
          rsiS.priceScale().applyOptions({ autoScale: false, minimum: 0, maximum: 100 });
        } catch (_) {}
        // 70 referans çizgisi
        rsiS.createPriceLine({ price: 70, color: 'rgba(239,68,68,0.5)', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '70' });
        // 30 referans çizgisi
        rsiS.createPriceLine({ price: 30, color: 'rgba(40,215,147,0.5)', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: '30' });
        // 50 orta çizgi
        rsiS.createPriceLine({ price: 50, color: 'rgba(125,133,144,0.25)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      }
    }
  }

  // --- MACD Panosu ---
  if (assetDeskState.showMACD) {
    const macdData = calculateMACDSeries(bars, 12, 26, 9);
    if (macdData && macdData.hist.length > 0) {
      const macdPane = assetDeskState.showRSI ? 2 : 1;
      const histS = addLwSeries(chart, 'HistogramSeries', {
        priceLineVisible: false,
        lastValueVisible: false,
        color: '#28d793',
        priceScaleId: 'macd-scale',
      }, macdPane);
      if (histS) histS.setData(macdData.hist);

      const macdLineS = addLwSeries(chart, 'LineSeries', {
        color: '#4382ff',
        lineWidth: 1.2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        priceScaleId: 'macd-scale',
      }, macdPane);
      if (macdLineS) macdLineS.setData(macdData.macdLine);

      const signalS = addLwSeries(chart, 'LineSeries', {
        color: '#f97316',
        lineWidth: 1.2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceScaleId: 'macd-scale',
      }, macdPane);
      if (signalS) signalS.setData(macdData.signalLine);
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

function assetThesisCard(x) {
  const key = x.market + ':' + x.symbol;
  const note = JOURNAL.notes[key] || { thesis: '', invalidation: '' };
  
  const suggested = (window.FinansActionLayer && window.FinansActionLayer.buildAssetThesis)
    ? window.FinansActionLayer.buildAssetThesis(x, DATA)
    : { thesis: '', invalidation: '', catalysts: [] };

  const thesisVal = note.thesis || '';
  const invalidationVal = note.invalidation || '';

  const catalystsHtml = (suggested.catalysts || []).map(c => '<li>' + esc(c) + '</li>').join('');

  return '<div class="asset-thesis-wrapper">' +
    '<div class="asset-thesis">' +
      '<div>' +
        '<h4>Yatırım Tezi</h4>' +
        '<p>' + esc(note.thesis || suggested.thesis || 'Tez yok.') + '</p>' +
      '</div>' +
      '<div>' +
        '<h4>Bozulma Koşulu</h4>' +
        '<p>' + esc(note.invalidation || suggested.invalidation || 'Bozulma koşulu yok.') + '</p>' +
      '</div>' +
      '<div>' +
        '<h4>Katalizörler</h4>' +
        '<ul>' + catalystsHtml + '</ul>' +
      '</div>' +
    '</div>' +
    '<form class="asset-note-form" data-market="' + x.market + '" data-symbol="' + x.symbol + '">' +
      '<div class="note-grid">' +
        '<label>Tez Notu' +
          '<textarea name="thesis" placeholder="Örn: 50g hareketli ortalama üstünde kalırsa alım yönlü izlenecek.">' + esc(thesisVal) + '</textarea>' +
        '</label>' +
        '<label>Bozulma Notu' +
          '<textarea name="invalidation" placeholder="Örn: Stop seviyesinin altında veya 50g ortalamanın altında kapanışlarda tez bozulur.">' + esc(invalidationVal) + '</textarea>' +
        '</label>' +
      '</div>' +
      '<div class="note-actions">' +
        '<button type="submit" class="btn">Notu Kaydet</button>' +
        '<span class="note-status" id="note-status-' + x.market + '-' + x.symbol + '"></span>' +
      '</div>' +
    '</form>' +
  '</div>';
}

function alertRulesCard(x) {
  let weightPct = 0;
  if (portfolioData && window.FinansActionLayer && window.FinansActionLayer.buildPortfolioActions) {
    const portActions = window.FinansActionLayer.buildPortfolioActions({ data: DATA, portfolioData: portfolioData });
    const row = portActions.rows.find(r => r.symbol === x.symbol);
    if (row) weightPct = row.weightPct;
  }
  
  const suggested = (window.FinansActionLayer && window.FinansActionLayer.buildAlertRules)
    ? window.FinansActionLayer.buildAlertRules(x, { weightPct: weightPct })
    : [];

  let alertsHtml = '';
  if (suggested.length === 0) {
    alertsHtml = '<p class="muted compact">Önerilen alarm kuralı yok.</p>';
  } else {
    alertsHtml = suggested.map(a => {
      const id = [x.market.toLowerCase(), x.symbol.toUpperCase(), a.trigger.toLowerCase()].join(':');
      const activeAlert = (JOURNAL.alerts || []).find(y => y.id === id);
      const isChecked = activeAlert && activeAlert.enabled;
      
      return '<form class="alert-toggle-form" data-market="' + x.market + '" data-symbol="' + x.symbol + '" data-trigger="' + esc(a.trigger) + '" data-action="' + esc(a.action) + '" style="margin-top:8px;">' +
        '<label class="alert-switch">' +
          '<input type="checkbox" ' + (isChecked ? 'checked' : '') + '>' +
          '<span></span>' +
        '</label>' +
        '<div>' +
          '<b>' + esc(a.trigger) + '</b>' +
          '<span>' + esc(a.action) + '</span>' +
        '</div>' +
      '</form>';
    }).join('');
  }

  return '<div class="alert-rules">' +
    '<h4>Önerilen Alarm Kuralları</h4>' +
    alertsHtml +
  '</div>';
}

function assetResearchCard(x) {
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildCompanyTearsheet || !window.FinansActionLayer.buildCompsSnapshot) return '';
  const tear = window.FinansActionLayer.buildCompanyTearsheet(x, DATA, JOURNAL);
  const comps = window.FinansActionLayer.buildCompsSnapshot(x, DATA);
  const metrics = tear.metrics.map((m) => '<div><span>' + esc(m.label) + '</span><b>' + esc(m.value) + '</b></div>').join('');
  const gaps = tear.gaps.length ? tear.gaps.map((g) => '<li>' + esc(g) + '</li>').join('') : '<li>Temel veri eksigi gorunmuyor.</li>';
  const peers = comps.peerSet.length ? comps.peerSet.map((p) => '<span>' + esc(p.symbol) + ' · ' + p.score + '</span>').join('') : '<span>Benzer sirket yok</span>';
  return '<div class="asset-research-card">' +
    '<div class="research-block">' +
      '<div class="research-head"><h4>Sirket Ozeti</h4><span>' + esc(tear.bankerRead) + '</span></div>' +
      '<p>' + esc(tear.thesis) + '</p>' +
      '<div class="research-metrics">' + metrics + '</div>' +
      '<ul class="research-gaps">' + gaps + '</ul>' +
    '</div>' +
    '<div class="research-block">' +
      '<div class="research-head"><h4>Benzer Sirket Gozlemi</h4><span>Tarama kalitesi</span></div>' +
      '<p>' + esc(comps.readThrough) + '</p>' +
      '<div class="peer-strip">' + peers + '</div>' +
      '<ul class="research-gaps">' + comps.limitations.map((g) => '<li>' + esc(g) + '</li>').join('') + '</ul>' +
    '</div>' +
    committeeMemoCard(x) +
  '</div>';
}

function committeeMemoCard(x) {
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildInvestmentCommitteeMemo) return '';
  const base = REPORT_CACHE && REPORT_CACHE.base ? REPORT_CACHE.base : {};
  const memo = window.FinansActionLayer.buildInvestmentCommitteeMemo(x, DATA, JOURNAL, base);
  const list = (items) => (items && items.length ? items.map((item) => '<li>' + esc(item) + '</li>').join('') : '<li>Kayit yok.</li>');
  return '<div class="committee-memo-card verdict-' + esc(memo.verdict) + '">' +
    '<div class="research-head"><h4>Yatirim Komitesi Notu</h4><span>' + esc(verdictLabel(memo.verdict)) + '</span></div>' +
    '<p class="memo-ask">' + esc(memo.decisionAsk) + '</p>' +
    '<div class="memo-snapshot">' +
      '<div><span>Fiyat</span><b>' + esc(memo.snapshot.price) + '</b></div>' +
      '<div><span>Skor</span><b>' + esc(memo.snapshot.score) + '</b></div>' +
      '<div><span>Ayarlanmis skor</span><b>' + esc(memo.snapshot.adjustedScore) + '</b></div>' +
      '<div><span>Etiket</span><b>' + esc(memo.snapshot.label) + '</b></div>' +
    '</div>' +
    '<div class="memo-grid">' +
      '<div><h5>Neye inaniyoruz?</h5><ul>' + list(memo.sections.whatWeBelieve) + '</ul></div>' +
      '<div><h5>Eksik kanit</h5><ul>' + list(memo.sections.evidenceGaps) + '</ul></div>' +
      '<div><h5>Risk iletimi</h5><ul>' + list(memo.sections.riskTransmission) + '</ul></div>' +
      '<div><h5>Sonraki aksiyon</h5><ul>' + list(memo.sections.nextActions) + '</ul></div>' +
    '</div>' +
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

function getScoreDelta(asset) {
  const c = asset && asset.decision && asset.decision.confidence;
  if (c && typeof c.scoreDelta === 'number') return c.scoreDelta;
  if (c && typeof c.previousScore === 'number' && asset.analysis && typeof asset.analysis.score === 'number') {
    return asset.analysis.score - c.previousScore;
  }
  return null;
}

function renderTable() {
  const list = currentList();
  
  // Bellek sızıntılarını önlemek için eski detay grafiklerini temizle
  Object.values(activeDetailCharts).forEach(chart => chart.destroy());
  activeDetailCharts = {};
  
  const tsEl = $('#tableTimestamp');
  if (tsEl && DATA.generatedAt) {
    const timeStr = new Date(DATA.generatedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    tsEl.textContent = 'Skorlar ' + timeStr + ' anlık görüntüsüne dayanır · gün içinde değişebilir';
  }

  let html = '<table><thead><tr><th>Sembol</th><th>Fiyat</th><th>Gün %</th><th>RSI</th><th>MACD</th><th>50g %</th><th>Vol</th><th>Puan</th><th>Öneri</th></tr></thead><tbody>';
  list.forEach((x, idx) => {
    const a = x.analysis, i = x.ind || {}, s = i.signals || {};
    const chCls = (x.changePct || 0) >= 0 ? 'pos' : 'neg';
    const dist = s.distSma50;
    
    const delta = getScoreDelta(x);
    let deltaHtml = '';
    if (delta != null && delta !== 0) {
      const deltaCls = delta > 0 ? 'pos' : 'neg';
      const deltaSign = delta > 0 ? '+' : '';
      deltaHtml = ' <span class="score-delta ' + deltaCls + '" style="font-size: 11px; font-weight: 800; margin-left: 5px;">' + deltaSign + delta + '</span>';
    }

    html +=
      '<tr class="row" data-i="' + idx + '">' +
      '<td><span class="sym">' + x.symbol + '</span><div class="coname">' + (x.name || '') + '</div></td>' +
      '<td>' + fmtPrice(x.price, x.currency) + '</td>' +
      '<td class="' + chCls + '">' + fmtPct(x.changePct) + '</td>' +
      '<td style="color:' + rsiColor(i.rsi) + ';font-weight:600">' + (i.rsi != null ? i.rsi : '–') + '</td>' +
      '<td>' + macdCell(i) + '</td>' +
      '<td class="' + ((dist || 0) >= 0 ? 'pos' : 'neg') + '">' + (dist != null ? fmtPct(dist) : '–') + '</td>' +
      '<td>' + (i.atrPct != null ? '%' + i.atrPct : '–') + '</td>' +
      '<td><span class="scorecell"><span class="scorebar"><i style="width:' + a.score + '%;background:' + toneColor(a.tone) + '"></i></span>' + a.score + deltaHtml + '</span></td>' +
      '<td><span class="badge tone-' + a.tone + '">' + a.label + '</span></td>' +
      '</tr>' +
      '<tr class="detail" id="detail-' + idx + '" hidden><td colspan="9"><div class="detailwrap">' +
      decisionInsightCard(x) +
      assetThesisCard(x) +
      alertRulesCard(x) +
      assetSignalOverlayCard(x) +
      assetLearningCard(x) +
      assetResearchCard(x) +
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
      <div class="value ${finalPnLUSD >= 0 ? 'pos' : 'neg'}">${fmtPrice(finalPnLUSD, 'USD')} (${fmtPct(finalPnLPercent)})<small>TL: ${fmtPrice(finalPnLTRY, 'TRY')} · USD reel getiriyi yansıtır</small></div>
    </div>
    <div class="kpi">
      <div class="label">Risk Profili</div>
      <div class="value"><span class="sent-pill ${riskCls}" style="font-size: 14px; padding: 4px 10px; font-weight:700;">${riskLabel}</span><small>Kripto ağırlığı: %${Math.round(cryptoWeightPct)}</small></div>
    </div>
    <div class="infl-note">💡 <b>Para illüzyonu:</b> TL'deki nominal kâr enflasyonla erir — <b>USD bazlı kâr/zarar reel getirinin daha dürüst göstergesidir</b>. Reel TL ≈ (1+nominal)/(1+TÜFE)−1 · yıllık TÜFE ~%32 (2026).</div>
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
  renderPortfolioRiskPlan();
  
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
        backgroundColor: [CHART.accent, CHART.violet, CHART.teal],
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

/* ---------- Strateji testi görünümü ---------- */
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
          alert('Strateji testi hatası: ' + result.error);
          return;
        }
        
        displayBacktestResults(result);
      } catch (err) {
        alert('Sunucu hatası oluştu');
      } finally {
        runBtn.disabled = false;
        runBtn.innerHTML = '<span class="btn-ic">▶</span> Testi Çalıştır';
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
      <div class="label">Al-Tut Getirisi</div>
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

  // Al/Sat marker'ları: işlem günlerini sermaye eğrisinde işaretle
  const dayToIdx = {};
  curve.forEach((c, i) => { dayToIdx[c.day] = i; });
  const buyPts = new Array(curve.length).fill(null);
  const sellPts = new Array(curve.length).fill(null);
  (res.trades || []).forEach(t => {
    const idx = dayToIdx[t.day];
    if (idx == null || !curve[idx]) return;
    if (t.type === 'BUY') buyPts[idx] = curve[idx].total;
    else sellPts[idx] = curve[idx].total;
  });

  backtestChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Strateji Getirisi',
          data: strategyData,
          borderColor: CHART.accent,
          backgroundColor: chartGradient(canvas, CHART.accent, 0.16),
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
          tension: 0.1
        },
        {
          label: 'Al-Tut Getirisi (Normalleştirilmiş)',
          data: bhData,
          borderColor: CHART.neutral,
          borderDash: [5, 5],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.1
        },
        {
          label: '▲ Alış',
          data: buyPts,
          borderColor: 'transparent',
          backgroundColor: CHART.green,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointStyle: 'triangle',
          showLine: false,
          fill: false
        },
        {
          label: '◆ Satış',
          data: sellPts,
          borderColor: 'transparent',
          backgroundColor: CHART.red,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointStyle: 'rectRot',
          showLine: false,
          fill: false
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
        { scale: 1, opacity: 1, duration: 0.34, stagger: { grid: [matrix.length, symbols.length], from: "center", amount: 0.28 }, ease: "power3.out" }
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
      { opacity: 1, scale: 1, y: 0, duration: 0.32, ease: 'power3.out', clearProps: 'transform' }
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
          borderColor: CHART.green,
          backgroundColor: 'transparent',
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0.1
        },
        {
          label: 'Medyan (%50 Beklenen Gidişat)',
          data: res.percentiles.median,
          borderColor: CHART.accent,
          backgroundColor: chartGradient(canvas, CHART.accent, 0.12),
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: true
        },
        {
          label: 'Pessimistik (%10 Olasılık Alt Sınır)',
          data: res.percentiles.pessimistic,
          borderColor: CHART.red,
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
          { scale: 1, opacity: 1, duration: 0.28, stagger: { grid: [5, 5], from: "center", amount: 0.22 }, ease: "power3.out" }
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
document.addEventListener('toggle', (e) => {
  const target = e.target;
  if (target && target.classList && target.classList.contains('overview-advanced') && target.open) {
    renderPicks();
    renderAlloc();
    renderMovers();
    renderMarketRegime();
    renderFxWidget();
  }
}, true);
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
    if (asset) renderAssetDesk(asset);
  });
}

const rsiToggleBtn = $('#deskRsiToggleBtn');
if (rsiToggleBtn) {
  rsiToggleBtn.addEventListener('click', () => {
    assetDeskState.showRSI = !assetDeskState.showRSI;
    localStorage.setItem('finans-show-rsi', assetDeskState.showRSI);
    updateRsiButtonVisual();
    const list = DATA && DATA[activeView] ? DATA[activeView] : [];
    const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
    if (asset) renderAssetDesk(asset);
  });
}

const macdToggleBtn = $('#deskMacdToggleBtn');
if (macdToggleBtn) {
  macdToggleBtn.addEventListener('click', () => {
    assetDeskState.showMACD = !assetDeskState.showMACD;
    localStorage.setItem('finans-show-macd', assetDeskState.showMACD);
    updateMacdButtonVisual();
    const list = DATA && DATA[activeView] ? DATA[activeView] : [];
    const asset = list.find((x) => x.symbol === assetDeskState.symbol) || list[0];
    if (asset) renderAssetDesk(asset);
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

/* ---------- Otomasyon Karar ve Okuryazarlık Yardımcıları ---------- */
function renderDailyDigest() {
  const el = $('#dailyDigest');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildDailyChangeDigest) { el.innerHTML = ''; return; }
  const d = window.FinansActionLayer.buildDailyChangeDigest(DATA);
  
  const item = (x, dir) => {
    const cls = dir === 'up' ? 'imp-pos' : 'imp-neg';
    const sign = dir === 'up' ? '+' : '';
    return '<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border); font-size:12px;">' +
      '<b>' + esc(x.symbol) + ' <span style="font-size:10px; color:var(--muted); text-transform:uppercase;">(' + esc(x.market) + ')</span></b>' +
      '<div style="display:flex; gap:8px; align-items:center;">' +
        '<span class="badge tone-' + x.tone + '" style="font-size:11px;">' + x.label + ' · ' + x.score + '</span>' +
        '<span class="news-impact ' + cls + '" style="font-size:11px; padding:2px 6px; border-radius:4px; font-weight:700;">' + sign + x.delta + '</span>' +
      '</div>' +
    '</div>';
  };
  
  const up = d.improving.length ? d.improving.map((x) => item(x, 'up')).join('') : '<p class="muted compact" style="font-size:12px;">Güçlenen belirgin sinyal yok.</p>';
  const down = d.weakening.length ? d.weakening.map((x) => item(x, 'down')).join('') : '<p class="muted compact" style="font-size:12px;">Zayıflayan belirgin sinyal yok.</p>';
  
  el.innerHTML = '<div class="card reveal action-card">' +
    '<div class="card-head"><h2>Bugün Ne Değişti?</h2><span class="card-sub">Dünkü skora göre karar radarı</span></div>' +
    '<p class="action-headline" style="font-size:13.5px; font-weight:600; margin-bottom:14px; color:var(--accent);">' + esc(d.headline) + '</p>' +
    '<div class="digest-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">' +
      '<div><h3 style="font-size:12.5px; font-weight:700; margin-bottom:8px; color:var(--green);">🟢 Güçlenen Sinyaller</h3>' + up + '</div>' +
      '<div><h3 style="font-size:12.5px; font-weight:700; margin-bottom:8px; color:var(--red);">🔴 Zayıflayan Sinyaller</h3>' + down + '</div>' +
    '</div>' +
  '</div>';
}

async function renderCfoDecisionCockpit() {
  const el = $('#cfoDecisionCockpit');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildCfoDecisionCockpit) { el.innerHTML = ''; return; }
  let base = REPORT_CACHE && REPORT_CACHE.base;
  if (!base) {
    try {
      const report = await loadReportCache();
      base = report && report.base;
    } catch (_) {
      base = {};
    }
  }
  const cockpit = window.FinansActionLayer.buildCfoDecisionCockpit(DATA, JOURNAL, base || {});
  const statusLabel = { ready: 'Hazir', gated: 'Kanita bagli', blocked: 'Bloke', watch: 'Izle' };
  const rows = cockpit.rows.length ? cockpit.rows.map((row) => {
    const missing = row.missingEvidence.length
      ? row.missingEvidence.slice(0, 2).map((x) => '<li>' + esc(x) + '</li>').join('')
      : '<li>Baglayici eksik yok</li>';
    return '<button class="cfo-row cfo-' + esc(row.status) + '" type="button" onclick="navigateToAsset(\'' + esc(row.market) + '\', \'' + esc(row.symbol) + '\')">' +
      '<span class="cfo-symbol"><b>' + esc(row.symbol) + '</b><small>' + esc(row.marketLabel) + ' · ' + esc(row.decisionAsk) + '</small></span>' +
      '<span class="cfo-score"><b>' + row.score + '</b><small>makro ' + row.adjustedScore + '</small></span>' +
      '<span class="cfo-status">' + esc(statusLabel[row.status] || row.status) + '</span>' +
      '<span class="cfo-binding">' + esc(row.bindingReason) + '</span>' +
      '<ul class="cfo-missing">' + missing + '</ul>' +
      '<em class="cfo-next">' + esc(row.nextWorkflow) + '</em>' +
    '</button>';
  }).join('') : '<p class="muted compact">Karar satiri uretmek icin veri bekleniyor.</p>';

  el.innerHTML = '<div class="card reveal cfo-cockpit-card">' +
    '<div class="card-head"><h2>Finans Direktoru Karar Kokpiti</h2><span class="card-sub">Karar hazirligi, baglayici risk ve eksik kanit</span></div>' +
    '<p class="action-headline">' + esc(cockpit.summary) + '</p>' +
    '<div class="cfo-row cfo-head" aria-hidden="true"><span>Varlik</span><span>Skor</span><span>Durum</span><span>Baglayici neden</span><span>Eksik kanit</span><span>Sonraki is</span></div>' +
    '<div class="cfo-rows">' + rows + '</div>' +
  '</div>';
}

function renderPredictionScorecard() {
  const el = $('#predictionScorecard');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildPredictionScorecard) return;
  
  const card = window.FinansActionLayer.buildPredictionScorecard(JOURNAL);
  
  const last5 = card.last5Closed.length
    ? card.last5Closed.map((p) => {
        const sign = p.resultPct > 0 ? '+' : '';
        const pctCls = p.resultPct > 0 ? 'imp-pos' : p.resultPct < 0 ? 'imp-neg' : 'imp-neutral';
        const outcomeText = p.outcome === 'target-hit' ? 'Hedef Vuruldu' : p.outcome === 'stop-hit' ? 'Stop Oldu' : p.outcome === 'expired-win' ? 'Vade (Kâr)' : 'Vade (Zarar)';
        return '<div class="scorecard-row" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding:6px 0; font-size:12px;">' +
          '<b>' + esc(p.symbol) + ' <span style="font-size:10px; color:var(--muted); text-transform:uppercase;">(' + esc(p.market) + ')</span></b>' +
          '<div style="display:flex; gap:10px; align-items:center;">' +
            '<span style="font-size:11.5px;">' + esc(outcomeText) + '</span>' +
            '<span class="news-impact ' + pctCls + '" style="font-size:11px; padding:2px 6px; border-radius:4px; font-weight:700;">' + sign + p.resultPct + '%</span>' +
          '</div>' +
        '</div>';
      }).join('')
    : '<p class="muted compact">Henüz kapanmış tahmin yok; kararlar kaydedildikçe isabet oranı burada birikecek.</p>';
    
  el.innerHTML = '<div class="card reveal scorecard-card">' +
    '<div class="card-head"><h2>🎯 İsabet Karnesi</h2><span class="card-sub">Otomatik çözülen tahmin performansı</span></div>' +
    '<div class="scorecard-metrics" style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 10px; text-align:center; margin-bottom:16px;">' +
      '<div style="background:var(--bg-2); padding:10px; border-radius:6px;"><b>' + card.winRate + '%</b><span style="display:block; font-size:11px; color:var(--muted); margin-top:4px;">İsabet</span></div>' +
      '<div style="background:var(--bg-2); padding:10px; border-radius:6px;"><b>' + card.open + '</b><span style="display:block; font-size:11px; color:var(--muted); margin-top:4px;">Açık</span></div>' +
      '<div style="background:var(--bg-2); padding:10px; border-radius:6px;"><b>' + (card.avgResultPct > 0 ? '+' : '') + card.avgResultPct + '%</b><span style="display:block; font-size:11px; color:var(--muted); margin-top:4px;">Ort. Getiri</span></div>' +
      '<div style="background:var(--bg-2); padding:10px; border-radius:6px;"><b>' + card.wins + '/' + card.losses + '</b><span style="display:block; font-size:11px; color:var(--muted); margin-top:4px;">Kazan/Kaybet</span></div>' +
    '</div>' +
    '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:16px; border-top:1px solid var(--border); padding-top:12px;">' +
      '<div style="font-size:12px; line-height:1.4;">' +
        '<h4 style="margin:0 0 6px 0; font-size:12px; font-weight:700;">🤖 Sistem Kararları</h4>' +
        'Toplam: ' + card.bySource.system.total + ' · Kapanan: ' + card.bySource.system.closed + '<br>' +
        'İsabet: <span style="font-weight:700; color:var(--accent);">' + card.bySource.system.winRate + '%</span> (Kazanan: ' + card.bySource.system.wins + ')' +
      '</div>' +
      '<div style="font-size:12px; line-height:1.4; border-left:1px solid var(--border); padding-left:14px;">' +
        '<h4 style="margin:0 0 6px 0; font-size:12px; font-weight:700;">👤 Kullanıcı Notları</h4>' +
        'Toplam: ' + card.bySource.user.total + ' · Kapanan: ' + card.bySource.user.closed + '<br>' +
        'İsabet: <span style="font-weight:700; color:var(--accent);">' + card.bySource.user.winRate + '%</span> (Kazanan: ' + card.bySource.user.wins + ')' +
      '</div>' +
    '</div>' +
    '<div style="border-top:1px solid var(--border); padding-top:12px;">' +
      '<h4 style="margin:0 0 8px 0; font-size:12.5px; font-weight:700;">📜 Son 5 Çözülen Karar</h4>' +
      '<div class="scorecard-list" style="display:flex; flex-direction:column; gap:4px;">' + last5 + '</div>' +
    '</div>' +
  '</div>';
}

async function renderDecisionLearningPanel() {
  const el = $('#decisionLearningPanel');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildDecisionLearningPanel) return;

  let base = REPORT_CACHE && REPORT_CACHE.base;
  if (!base) {
    el.innerHTML = '<div class="card reveal decision-learning-card"><div class="card-head"><h2>🧠 Karar Öğrenme Döngüsü</h2><span class="card-sub">Rapor kaynağı okunuyor</span></div><p class="muted compact">Karar öğrenme verisi yükleniyor.</p></div>';
    try {
      const report = await loadReportCache();
      base = report && report.base;
    } catch (e) {
      base = null;
    }
  }

  const learning = window.FinansActionLayer.buildDecisionLearningPanel(base);

  if (learning.empty) {
    el.innerHTML = '<div class="card reveal decision-learning-card">' +
      '<div class="card-head"><h2>🧠 Karar Öğrenme Döngüsü</h2><span class="card-sub">' + esc(learning.summary) + '</span></div>' +
      '<p class="muted compact">Öğrenme verisi bulunamadı veya henüz işlenmedi.</p>' +
      '</div>';
    return;
  }

  const metrics = learning.metrics.map(function(m) {
    return '<div><b>' + esc(m.value) + '</b><span>' + esc(m.label) + '</span></div>';
  }).join('');

  const rules = learning.rules.length ? learning.rules.map(function(r) {
    const adj = r.adjustment > 0 ? '+' + r.adjustment : r.adjustment;
    return '<li>' +
      '<b>' + esc(r.scopeLabel) + '</b>' +
      '<span>' + adj + ' (güven %' + Math.round(r.confidence * 100) + ')</span>' +
      '<em>' + esc(r.reason) + ' (örnek: ' + r.sampleSize + ')</em>' +
      '</li>';
  }).join('') : '<li><em>Aktif kural bulunamadı.</em></li>';

  const lessons = learning.lessons.length ? learning.lessons.map(function(l) {
    return '<li>' +
      '<b>' + esc(l.symbol) + ' (' + esc(marketShortLabel(l.market)) + ')</b>' +
      '<span>%' + Math.round((l.confidence || 0) * 100) + ' güven</span>' +
      '<em>' + esc(l.lesson) + '</em>' +
      '</li>';
  }).join('') : '<li><em>Son ders bulunamadı.</em></li>';

  const review = learning.reviewQueue.length ? learning.reviewQueue.map(function(q) {
    const prioCls = q.priority === 'high' ? 'imp-neg' : 'imp-neutral';
    return '<li>' +
      '<b>' + esc(marketShortLabel(q.market)) + '</b>' +
      '<span><span class="news-impact ' + prioCls + '" style="font-size:10px; padding:2px 4px; border-radius:4px; font-weight:700;">' + esc(q.priority.toUpperCase()) + '</span></span>' +
      '<em>' + esc(q.reason) + ' <br><strong style="color:var(--text); font-size:11px;">Eylem:</strong> ' + esc(q.nextAction) + '</em>' +
      '</li>';
  }).join('') : '<li><em>İnceleme sırası boş.</em></li>';

  el.innerHTML = '<div class="card reveal decision-learning-card">' +
    '<div class="card-head"><h2>🧠 Karar Öğrenme Döngüsü</h2><span class="card-sub">' + esc(learning.summary) + '</span></div>' +
    '<div class="learning-metrics">' + metrics + '</div>' +
    '<div class="learning-grid">' +
      '<div>' +
        '<h4>Aktif Kurallar</h4>' +
        '<ul>' + rules + '</ul>' +
      '</div>' +
      '<div>' +
        '<h4>Son Çıkarılan Dersler</h4>' +
        '<ul>' + lessons + '</ul>' +
      '</div>' +
      '<div>' +
        '<h4>İnceleme Sırası</h4>' +
        '<ul>' + review + '</ul>' +
      '</div>' +
    '</div>' +
    '</div>';
}

function assetLearningCard(x) {
  if (!x) return '';
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildAssetLearningSnippet) return '';
  const base = REPORT_CACHE && REPORT_CACHE.base ? REPORT_CACHE.base : null;
  const snippet = window.FinansActionLayer.buildAssetLearningSnippet(x, base);
  if (!snippet) return '';

  const cls = snippet.adjustment > 0 ? 'alc-pos' : snippet.adjustment < 0 ? 'alc-neg' : 'alc-neutral';
  const adjLabel = snippet.adjustment !== 0 ? (snippet.adjustment > 0 ? '+' : '') + snippet.adjustment : '';

  return '<div class="asset-learning-card ' + cls + '">' +
    '<div class="research-head"><h4>Karar Öğrenimi</h4><span>' + esc(snippet.kind) + '</span></div>' +
    '<div class="asset-learning-title"><b>' + esc(snippet.title) + (adjLabel ? ' (' + adjLabel + ')' : '') + '</b></div>' +
    '<p>' + esc(snippet.detail) + '</p>' +
    '<em>Güven derecesi: %' + Math.round((snippet.confidence || 0) * 100) + ' (Örneklem: ' + (snippet.sampleSize || 1) + ')</em>' +
    '</div>';
}

function getReportSignalOverlay() {
  return REPORT_CACHE && REPORT_CACHE.base && REPORT_CACHE.base.signalOverlay ? REPORT_CACHE.base.signalOverlay : null;
}

function getAssetSignalOverlay(asset) {
  const overlay = getReportSignalOverlay();
  if (!overlay || !overlay.assets || !asset) return null;
  const market = String(asset.market || '').toLowerCase();
  const key = market + ':' + String(asset.symbol || '').toUpperCase();
  return overlay.assets[key] || null;
}

function adjustmentLabel(n) {
  const value = Number(n) || 0;
  return (value > 0 ? '+' : '') + value;
}
function overlayTypeLabel(type) {
  return {
    macro: 'Makro',
    fedDecision: 'Fed karari',
    usRetailSales: 'ABD perakende',
    aiCapexReadThrough: 'Yapay zeka yatirimi',
    enterpriseAiDemand: 'Kurumsal yapay zeka talebi',
    btcLiquidity: 'BTC likiditesi',
    tlPressure: 'TL baskisi',
    tcmbCarry: 'TCMB tasima etkisi',
    oilSensitivity: 'Petrol hassasiyeti',
    companyNews: 'Sirket haberi',
    earnings: 'Bilanco',
    macroCatalyst: 'Makro katalizor',
    thesisStatus: 'Tez durumu',
    tearsheetCompleteness: 'Veri tamligi',
    compsValuationGap: 'Carpan boslugu',
    modelAuditGap: 'Model denetimi',
    scenarioSensitivity: 'Senaryo hassasiyeti',
    predictionCalibration: 'Tahmin kalibrasyonu',
    learningCalibration: 'Ogrenme kalibrasyonu',
  }[type] || type || 'Bilesen';
}
function overlayStatusLabel(status) {
  return {
    boost: 'Destek',
    risk: 'Risk',
    watch: 'Izle',
    neutral: 'Notr',
    ready: 'Hazir',
    gated: 'Kanita bagli',
    blocked: 'Bloke',
  }[status] || status || 'Belirsiz';
}
function marketShortLabel(market) {
  return { us: 'ABD', bist: 'BIST', crypto: 'Kripto', macro: 'Makro' }[String(market || '').toLowerCase()] || String(market || '').toUpperCase();
}
function catalystPressureLabel(value) {
  return { high: 'yuksek', medium: 'orta', low: 'dusuk' }[value] || value || 'belirsiz';
}
function timingLabel(value) {
  return { dated: 'tarihli', window: 'pencere' }[value] || value || 'belirsiz';
}
function sourceLabel(value) {
  const text = String(value || '').trim();
  return {
    'company/news': 'Sirket haberi',
    calendar: 'Takvim',
    Yahoo: 'Yahoo',
    SeekingAlpha: 'Seeking Alpha',
  }[text] || text.replace(/\//g, ' / ') || 'Kaynak';
}
function actionKindLabel(value) {
  return {
    add: 'Ekle',
    buy: 'Al',
    hold: 'Tut',
    watch: 'Izle',
    trim: 'Azalt',
    reduce: 'Azalt',
    rebalance: 'Dengele',
    exit: 'Cik',
    avoid: 'Uzak dur',
  }[value] || value || 'Not';
}
function workflowLabel(value) {
  return {
    'thesis tracker -> catalyst calendar': 'tez takibi -> katalizor takvimi',
    'thesis tracker -> company tearsheet': 'tez takibi -> sirket ozeti',
    'valuation / expectations gate': 'degerleme / beklenti kapisi',
    'prediction calibration': 'tahmin kalibrasyonu',
    'watchlist / thesis draft': 'izleme listesi / tez taslagi',
    'reject / wait for repair': 'reddet / sinyal onarimini bekle',
  }[value] || value || 'Not';
}
function verdictLabel(value) {
  return {
    blocked: 'Bloke',
    'screen-grade': 'Tarama kalitesi',
    'senior-review-ready': 'Kidemli incelemeye hazir',
  }[value] || value || 'Belirsiz';
}

function renderSignalOverlayPanel() {
  const el = $('#signalOverlayPanel');
  if (!el) return;
  const overlay = getReportSignalOverlay();
  if (!overlay || !overlay.assets) {
    el.innerHTML = '<div class="card reveal signal-overlay-card"><div class="card-head"><h2>Makro Sinyal Katmani</h2><span class="card-sub">Rapor bekleniyor</span></div><p class="muted compact">Makro katman henuz uretilmedi; teknik skorlar aynen kullaniliyor.</p></div>';
    return;
  }

  const summary = overlay.summary || {};
  const assets = Object.values(overlay.assets || {})
    .filter((x) => x.totalAdjustment !== 0)
    .sort((a, b) => Math.abs(b.totalAdjustment) - Math.abs(a.totalAdjustment))
    .slice(0, 6);
  const markets = ['us', 'bist', 'crypto'].map((m) => {
    const item = overlay.market && overlay.market[m] ? overlay.market[m] : { adjustment: 0, reason: 'notr' };
    const cls = item.adjustment > 0 ? 'pos' : item.adjustment < 0 ? 'neg' : 'neutral';
    return '<div class="overlay-market om-' + cls + '"><b>' + esc(marketShortLabel(m)) + ' ' + adjustmentLabel(item.adjustment) + '</b><span>' + esc(item.reason || '') + '</span></div>';
  }).join('');
  const rows = assets.length ? assets.map((x) => {
    const cls = x.totalAdjustment > 0 ? 'pos' : 'neg';
    const top = (x.components || [])[0];
    return '<button class="overlay-row" type="button" onclick="navigateToAsset(\'' + esc(x.market) + '\', \'' + esc(x.symbol) + '\')">' +
      '<span><b>' + esc(x.symbol) + '</b><small>Teknik ' + x.technicalScore + ' -> Makro ' + x.adjustedScore + ' · ' + esc(top ? overlayTypeLabel(top.type) : overlayStatusLabel(x.status)) + '</small></span>' +
      '<em class="overlay-adj oa-' + cls + '">' + adjustmentLabel(x.totalAdjustment) + '</em>' +
    '</button>';
  }).join('') : '<p class="muted compact">Aktif makro/katalizor etkisi yok.</p>';

  el.innerHTML = '<div class="card reveal signal-overlay-card">' +
    '<div class="card-head"><h2>Makro Sinyal Katmani</h2><span class="card-sub">Teknik skoru bozmaz; toplam etki +/-' + overlay.maxAdjustment + '</span></div>' +
    '<div class="overlay-summary">' +
      '<div><b>' + (summary.boosted || 0) + '</b><span>Destek</span></div>' +
      '<div><b>' + (summary.reduced || 0) + '</b><span>Baski</span></div>' +
      '<div><b>' + (summary.highPressure || 0) + '</b><span>Katalizor</span></div>' +
      '<div><b>' + (summary.stale || 0) + '</b><span>Suresi dolan</span></div>' +
    '</div>' +
    '<div class="overlay-markets">' + markets + '</div>' +
    '<div class="overlay-rows">' + rows + '</div>' +
  '</div>';
}

function assetSignalOverlayCard(x) {
  const overlay = getAssetSignalOverlay(x);
  if (!overlay) return '';
  const cls = overlay.totalAdjustment > 0 ? 'pos' : overlay.totalAdjustment < 0 ? 'neg' : 'neutral';
  const components = (overlay.components || []).slice(0, 7).map((c) => {
    const tone = c.adjustment > 0 ? 'pos' : c.adjustment < 0 ? 'neg' : 'neutral';
    return '<li><span class="overlay-chip oc-' + tone + '">' + adjustmentLabel(c.adjustment) + '</span><b>' + esc(overlayTypeLabel(c.type)) + '</b><em>' + esc(c.reason || '') + '</em></li>';
  }).join('');
  const expired = (overlay.expiredComponents || []).length
    ? '<p class="overlay-expired">' + overlay.expiredComponents.length + ' eski makro sinyal suresi doldugu icin etkisiz.</p>'
    : '';
  return '<div class="asset-overlay-card aoc-' + cls + '">' +
    '<div class="research-head"><h4>Makro Katman</h4><span>' + esc(overlayStatusLabel(overlay.status)) + ' · guven ' + Math.round((overlay.confidence || 0) * 100) + '%</span></div>' +
    '<div class="asset-overlay-score"><div><span>Teknik skor</span><b>' + overlay.technicalScore + '</b></div><div><span>Makro etki</span><b>' + adjustmentLabel(overlay.totalAdjustment) + '</b></div><div><span>Ayarlanmis skor</span><b>' + overlay.adjustedScore + '</b></div></div>' +
    '<ul class="asset-overlay-components">' + (components || '<li><em>Aktif bilesen yok.</em></li>') + '</ul>' +
    expired +
  '</div>';
}

function bucketTitle(key) {
  return {
    advance: 'Derin arastirma',
    watchlist: 'Izleme listesi',
    gated: 'Degerleme kapisi',
    unproven: 'Kanitsiz tema',
    reject: 'Reddet',
  }[key] || key;
}

function renderIdeaFunnel() {
  const el = $('#ideaFunnel');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildIdeaFunnel) { el.innerHTML = ''; return; }
  const funnel = window.FinansActionLayer.buildIdeaFunnel(DATA, JOURNAL);
  const keys = ['advance', 'watchlist', 'gated', 'reject'];
  const bucketHtml = keys.map((key) => {
    const rows = (funnel.buckets[key] || []).slice(0, 4);
    const empty = '<p class="muted compact">Bu kovada aday yok.</p>';
    const list = rows.length ? rows.map((x) => {
      return '<button class="idea-row" type="button" onclick="navigateToAsset(\'' + esc(x.market) + '\', \'' + esc(x.symbol) + '\')">' +
      '<span><b>' + esc(x.symbol) + '</b><small>' + esc(x.marketLabel) + ' · ' + esc(workflowLabel(x.nextWorkflow)) + '</small></span>' +
        '<em class="badge tone-' + esc(x.tone) + '">' + esc(x.label) + ' · ' + x.score + '</em>' +
      '</button>';
    }).join('') : empty;
    return '<div class="idea-bucket ib-' + key + '">' +
      '<div class="idea-bucket-head"><h3>' + bucketTitle(key) + '</h3><span>' + (funnel.counts[key] || 0) + '</span></div>' +
      list +
    '</div>';
  }).join('');

  el.innerHTML = '<div class="card reveal idea-funnel-card">' +
    '<div class="card-head"><h2>Fikir Hunisi</h2><span class="card-sub">Aday, izleme ve red kovaları; nihai tavsiye degildir</span></div>' +
    '<p class="action-headline">' + esc(funnel.headline) + '</p>' +
    '<div class="idea-grid">' + bucketHtml + '</div>' +
  '</div>';
}

async function loadReportCache() {
  if (REPORT_CACHE) return REPORT_CACHE;
  const res = await fetch('/api/report', { cache: 'no-store' });
  REPORT_CACHE = await res.json();
  return REPORT_CACHE;
}

async function renderCatalystCalendar() {
  const el = $('#catalystCalendar');
  if (!el) return;
  if (!window.FinansActionLayer || !window.FinansActionLayer.buildCatalystCalendar) { el.innerHTML = ''; return; }

  let base = REPORT_CACHE && REPORT_CACHE.base;
  if (!base) {
    el.innerHTML = '<div class="card reveal catalyst-card"><div class="card-head"><h2>Katalizor Takvimi</h2><span class="card-sub">Rapor kaynagi okunuyor</span></div><p class="muted compact">Katalizor verisi yukleniyor.</p></div>';
    try {
      const report = await loadReportCache();
      base = report && report.base;
    } catch (e) {
      base = null;
    }
  }

  const calendar = window.FinansActionLayer.buildCatalystCalendar(DATA, base || {});
  const rows = calendar.events.slice(0, 6).map((ev) => {
    const pressureCls = ev.decisionPressure === 'high' ? 'imp-neg' : ev.decisionPressure === 'medium' ? 'imp-neutral' : 'imp-pos';
    return '<div class="catalyst-row">' +
      '<div><b>' + esc(ev.title) + '</b><span>' + esc(ev.symbol || marketShortLabel(ev.market) || 'Makro') + ' · ' + esc(timingLabel(ev.timingConfidence)) + ' · ' + esc(sourceLabel(ev.source)) + '</span></div>' +
      '<div class="catalyst-meta"><small>' + esc(ev.date || 'pencere') + '</small><em class="news-impact ' + pressureCls + '">' + esc(catalystPressureLabel(ev.decisionPressure)) + '</em></div>' +
    '</div>';
  }).join('');
  const prep = calendar.prepQueue.slice(0, 3).map((x) => '<li>' + esc(x.action) + '</li>').join('');

  el.innerHTML = '<div class="card reveal catalyst-card">' +
    '<div class="card-head"><h2>Katalizor Takvimi</h2><span class="card-sub">Karar baskisina gore sirali olaylar</span></div>' +
    (rows || '<p class="muted compact">Rapor kaynaginda izlenecek katalizor yok. /api/report uretildiginde burada siralanir.</p>') +
    (prep ? '<div class="prep-queue"><h3>Hazirlik kuyrugu</h3><ul>' + prep + '</ul></div>' : '') +
  '</div>';
}

function renderPortfolioRiskPlan() {
  const actionsEl = $('#portfolioActions');
  const riskEl = $('#portfolioRiskPlan');
  if (!portfolioData || !window.FinansActionLayer || !window.FinansActionLayer.buildPortfolioRiskPlan) {
    if (actionsEl) actionsEl.innerHTML = '';
    if (riskEl) riskEl.innerHTML = '';
    return;
  }
  const USDTRY = (DATA.fx && DATA.fx.usdtry) ? DATA.fx.usdtry : 38.0;
  const plan = window.FinansActionLayer.buildPortfolioRiskPlan({ data: DATA, portfolioData: portfolioData, usdtry: USDTRY });
  if (actionsEl) {
    actionsEl.innerHTML = '<div class="card reveal action-card">' +
      '<div class="card-head"><h2>Portfoy Aksiyonlari</h2><span class="card-sub">Pozisyon ve sinyal kaynakli karar notlari</span></div>' +
      '<div class="portfolio-actions">' + (plan.actions.length ? plan.actions.map((a) => {
        return '<div class="portfolio-action pa-' + esc(a.tone) + '"><span>' + esc(actionKindLabel(a.kind)) + '</span><p>' + esc(a.text) + '</p></div>';
      }).join('') : '<p class="muted compact">Portfoy aksiyonu yok.</p>') + '</div>' +
    '</div>';
  }
  if (riskEl) {
    const constraints = plan.constraints.length ? plan.constraints.map((c) => {
      return '<div class="risk-constraint"><b>' + esc(c.label) + '</b><span>' + esc(c.detail) + '</span></div>';
    }).join('') : '<p class="muted compact">Baglayici risk kisiti yok.</p>';
    const rules = plan.monitoringRules.slice(0, 5).map((r) => '<li><b>' + esc(r.symbol || 'Portfoy') + ':</b> ' + esc(r.action) + '</li>').join('');
    const budget = plan.riskBudget || { totalNavUsd: plan.totalUsd, maxSingleNamePct: 35, maxCryptoPct: 50, bindingConstraint: '-' };
    const allocRows = (plan.targetAllocations || []).slice(0, 6).map((x) => {
      return '<div class="target-allocation ta-' + esc(x.action) + '">' +
        '<b>' + esc(x.symbol) + '</b><span>' + esc(x.currentWeightPct) + '% -> azami ' + esc(x.maxWeightPct) + '%</span><em>' + esc(actionKindLabel(x.action)) + '</em>' +
      '</div>';
    }).join('');
    riskEl.innerHTML = '<div class="card reveal risk-plan-card rp-' + esc(plan.status) + '">' +
      '<div class="card-head"><h2>Risk Plani</h2><span class="card-sub">Baglayici kisit, tutulacak risk ve izleme kurallari</span></div>' +
      '<div class="risk-budget-strip">' +
        '<div><span>NAV</span><b>$' + fmtNum(budget.totalNavUsd, 0) + '</b></div>' +
        '<div><span>Tek varlik limiti</span><b>%' + esc(budget.maxSingleNamePct) + '</b></div>' +
        '<div><span>Kripto limiti</span><b>%' + esc(budget.maxCryptoPct) + '</b></div>' +
        '<div><span>Baglayici kisit</span><b>' + esc(budget.bindingConstraint) + '</b></div>' +
      '</div>' +
      '<div class="risk-plan-layout">' +
        '<div><span class="risk-status">' + esc(plan.status) + '</span><p>' + esc(plan.retainedExposure) + '</p></div>' +
        '<div class="risk-constraints">' + constraints + '</div>' +
        '<div class="risk-rules"><h3>Izleme kurallari</h3><ul>' + (rules || '<li>Kural uretmek icin portfoy verisi ekle.</li>') + '</ul></div>' +
      '</div>' +
      '<div class="target-allocation-list">' + (allocRows || '<p class="muted compact">Hedef agirlik icin portfoy verisi ekle.</p>') + '</div>' +
    '</div>';
  }
}

let calculatorListenersAttached = false;

function renderLiteracyView() {
  // 1. Fetch tips archive
  fetch('/api/report', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      const tips = data && data.tipsArchive;
      renderTipsArchive(tips);
    })
    .catch(err => {
      console.error('İpuçları yüklenemedi:', err);
      renderTipsArchive([]);
    });

  // 2. Setup calculator listeners (only once)
  if (!calculatorListenersAttached) {
    const inputs = ['#calc-capital', '#calc-risk-pct', '#calc-price', '#calc-atr'];
    inputs.forEach(sel => {
      const el = $(sel);
      if (el) {
        el.addEventListener('input', updatePositionCalculator);
      }
    });
    calculatorListenersAttached = true;
  }
  
  // Initial calculation
  updatePositionCalculator();
  triggerRevealAnimations($('#view-literacy'));
}

function updatePositionCalculator() {
  if (!window.FinansActionLayer || !window.FinansActionLayer.calculatePosition) return;
  
  const capital = parseFloat($('#calc-capital').value) || 0;
  const riskPct = parseFloat($('#calc-risk-pct').value) || 0;
  const price = parseFloat($('#calc-price').value) || 0;
  const atr = parseFloat($('#calc-atr').value) || 0;
  
  const res = window.FinansActionLayer.calculatePosition(capital, riskPct, price, atr);
  
  if (res.available) {
    $('#res-entry').textContent = fmtNum(res.entry, res.entry >= 1000 ? 0 : res.entry >= 1 ? 2 : 4);
    $('#res-stop').textContent = fmtNum(res.stop, res.stop >= 1000 ? 0 : res.stop >= 1 ? 2 : 4);
    $('#res-target').textContent = fmtNum(res.target, res.target >= 1000 ? 0 : res.target >= 1 ? 2 : 4);
    $('#res-risk-amount').textContent = fmtNum(res.riskAmount, 2);
    $('#res-units').textContent = res.units >= 1 ? fmtNum(Math.floor(res.units), 0) : fmtNum(res.units, 4);
    $('#res-pos-amount').textContent = fmtNum(res.positionAmount, 2);
  } else {
    $('#res-entry').textContent = '–';
    $('#res-stop').textContent = '–';
    $('#res-target').textContent = '–';
    $('#res-risk-amount').textContent = '–';
    $('#res-units').textContent = '–';
    $('#res-pos-amount').textContent = '–';
  }
}

function renderTipsArchive(tips) {
  const el = $('#tipsArchiveList');
  if (!el) return;
  
  if (!tips || !tips.length) {
    el.innerHTML = '<p class="muted" style="text-align:center; padding:12px;">Henüz arşivlenmiş ipucu yok.</p>';
    return;
  }
  
  const sorted = tips.slice().sort((a, b) => b.date.localeCompare(a.date));
  
  el.innerHTML = sorted.map(tip => {
    return '<div style="background:var(--bg-2); border:1px solid var(--border); border-radius:8px; padding:16px;">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">' +
        '<h4 style="margin:0; font-size:13.5px; font-weight:700;">' + esc(tip.title) + '</h4>' +
        '<span style="font-size:10.5px; color:var(--muted); font-family:monospace;">' + esc(tip.date) + '</span>' +
      '</div>' +
      '<p style="margin:0; font-size:12.5px; color:var(--text); line-height:1.5;">' + esc(tip.body) + '</p>' +
    '</div>';
  }).join('');
}

window.submitQuizAnswer = function(selectedIndex, correctIndex, quizDate) {
  const isCorrect = selectedIndex === correctIndex;
  let streak = parseInt(localStorage.getItem('finans-quiz-streak') || '0', 10);
  if (isCorrect) {
    streak += 1;
  } else {
    streak = 0;
  }
  localStorage.setItem('finans-quiz-last-played', quizDate);
  localStorage.setItem('finans-quiz-last-selected', selectedIndex);
  localStorage.setItem('finans-quiz-streak', streak);
  
  renderReport();
};

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

  if (reduceMotion) return;

  // Logo drawing and idle animations
  if (document.querySelector('.logo-svg') && !reduceMotion) {
    // Initial draw animation
    gsap.fromTo('.logo-trend, .logo-arrow', 
      { strokeDasharray: 40, strokeDashoffset: 40, opacity: 0 }, 
      { strokeDashoffset: 0, opacity: 1, duration: 1.2, ease: 'power2.out', stagger: 0.15 }
    );
    gsap.fromTo('.logo-hex, .logo-hex-inner', 
      { scale: 0.8, opacity: 0, transformOrigin: '50% 50%' }, 
      { scale: 1, opacity: (i, el) => el.classList.contains('logo-hex-inner') ? 0.15 : 0.3, duration: 1.2, ease: 'back.out(1.5)', stagger: 0.1 }
    );
    gsap.fromTo('.logo-node-1, .logo-node-2', 
      { scale: 0, opacity: 0, transformOrigin: '50% 50%' }, 
      { scale: 1, opacity: 1, duration: 0.6, delay: 0.8, ease: 'back.out(2)', stagger: 0.1 }
    );
    // Continuous idle breathing animation
    gsap.to('.logo-svg', {
      y: -1.5,
      duration: 2.2,
      repeat: -1,
      yoyo: true,
      ease: 'sine.inOut'
    });
    // Brand header hover expansion
    const brand = document.querySelector('.brand');
    if (brand) {
      brand.addEventListener('mouseenter', () => {
        gsap.to('.logo-hex', { rotate: 30, scale: 1.05, transformOrigin: '50% 50%', duration: 0.5, ease: 'power2.out' });
        gsap.to('.logo-hex-inner', { rotate: -30, scale: 1.05, transformOrigin: '50% 50%', duration: 0.5, ease: 'power2.out' });
        gsap.to('.logo-arrow', { x: 1, y: -1, scale: 1.1, transformOrigin: '20px 7px', duration: 0.4, ease: 'power2.out' });
        gsap.to('.logo-node-1, .logo-node-2', { scale: 1.4, transformOrigin: '50% 50%', duration: 0.4, ease: 'back.out(2)', stagger: 0.05 });
      });
      brand.addEventListener('mouseleave', () => {
        gsap.to('.logo-hex', { rotate: 0, scale: 1, transformOrigin: '50% 50%', duration: 0.4, ease: 'power2.out' });
        gsap.to('.logo-hex-inner', { rotate: 0, scale: 1, transformOrigin: '50% 50%', duration: 0.4, ease: 'power2.out' });
        gsap.to('.logo-arrow', { x: 0, y: 0, scale: 1, transformOrigin: '20px 7px', duration: 0.3, ease: 'power2.out' });
        gsap.to('.logo-node-1, .logo-node-2', { scale: 1, transformOrigin: '50% 50%', duration: 0.3, ease: 'power2.out' });
      });
    }
  }

  if (reduceMotion) return;

  function playNavIconMotion(btn) {
    const view = btn.dataset.view;
    if (!view) return;

    if (view === 'overview') {
      const p1 = btn.querySelector('.ov-panel-1');
      const p2 = btn.querySelector('.ov-panel-2');
      const p3 = btn.querySelector('.ov-panel-3');
      const chart = btn.querySelector('.ov-chart');
      const dot = btn.querySelector('.ov-dot');
      const border = btn.querySelector('.ov-border');
      gsap.killTweensOf([p1, p2, p3, chart, dot, border]);
      gsap.to([p1, p2, p3], { scale: 1.08, transformOrigin: '50% 50%', stagger: 0.04, duration: 0.25, ease: 'power2.out' });
      gsap.to(border, { strokeDashoffset: 4, duration: 0.5, ease: 'linear', repeat: -1 });
      gsap.fromTo(chart, { strokeDasharray: 20, strokeDashoffset: 20 }, { strokeDashoffset: 0, duration: 0.4, ease: 'power2.out' });
      gsap.to(dot, { scale: 1.4, transformOrigin: '50% 50%', duration: 0.25, ease: 'power2.out' });
    } else if (view === 'us') {
      const bolt = btn.querySelector('.us-bolt');
      const trend = btn.querySelector('.us-trend');
      const dot = btn.querySelector('.us-dot');
      gsap.killTweensOf([bolt, trend, dot]);
      // Animate tech bolt lighting up & scaling with a back effect
      gsap.fromTo(bolt, { scale: 0.8, rotate: -10, opacity: 0.5 }, { scale: 1.05, rotate: 0, opacity: 1, transformOrigin: '12px 12px', duration: 0.35, ease: 'back.out(2)' });
      // Draw trend path
      gsap.fromTo(trend, { strokeDasharray: 25, strokeDashoffset: 25 }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out', delay: 0.05 });
      gsap.fromTo(dot, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, transformOrigin: '50% 50%', duration: 0.3, ease: 'back.out(2)', delay: 0.3 });
    } else if (view === 'bist') {
      const tl = btn.querySelector('.tr-tulip-l');
      const tr = btn.querySelector('.tr-tulip-r');
      const tc = btn.querySelector('.tr-tulip-c');
      const stem = btn.querySelector('.tr-tulip-stem');
      const trend = btn.querySelector('.tr-trend');
      const dot = btn.querySelector('.tr-dot');
      gsap.killTweensOf([tl, tr, tc, stem, trend, dot]);
      // Animate Tulip blooming
      gsap.fromTo(stem, { scaleY: 0 }, { scaleY: 1, transformOrigin: '50% 100%', duration: 0.25, ease: 'power2.out' });
      gsap.fromTo(tc, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, transformOrigin: '12px 16px', duration: 0.35, ease: 'back.out(1.5)', delay: 0.05 });
      gsap.fromTo(tl, { rotate: 15, scale: 0.8, transformOrigin: '12px 16px' }, { rotate: 0, scale: 1, duration: 0.35, ease: 'back.out(1.8)', delay: 0.1 });
      gsap.fromTo(tr, { rotate: -15, scale: 0.8, transformOrigin: '12px 16px' }, { rotate: 0, scale: 1, duration: 0.35, ease: 'back.out(1.8)', delay: 0.1 });
      // Draw trend path
      gsap.fromTo(trend, { strokeDasharray: 25, strokeDashoffset: 25 }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.out', delay: 0.1 });
      gsap.fromTo(dot, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, transformOrigin: '50% 50%', duration: 0.3, ease: 'back.out(2)', delay: 0.35 });
    } else if (view === 'crypto') {
      const hex = btn.querySelector('.cr-hex');
      const ring = btn.querySelector('.cr-ring');
      const core = btn.querySelector('.cr-core');
      const lines = btn.querySelectorAll('.cr-line-v, .cr-line-l, .cr-line-r');
      const nodes = btn.querySelectorAll('.cr-node');
      gsap.killTweensOf([hex, ring, core, ...lines, ...nodes]);
      // Blockchain data crawl animations
      gsap.to(hex, { strokeDashoffset: -12, duration: 1.2, ease: 'linear', repeat: -1 });
      gsap.to(lines, { strokeDashoffset: -10, duration: 1, ease: 'linear', repeat: -1 });
      gsap.to(ring, { rotate: 360, transformOrigin: '12px 12px', duration: 2.5, ease: 'linear', repeat: -1 });
      gsap.to(core, { scale: 1.3, transformOrigin: '12px 12px', duration: 0.6, ease: 'sine.inOut', repeat: -1, yoyo: true });
      gsap.to(nodes, { scale: 1.4, transformOrigin: '50% 50%', duration: 0.5, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: 0.1 });
    } else if (view === 'portfolio') {
      const body = btn.querySelector('.pf-safe-body');
      const dial = btn.querySelector('.pf-dial');
      const dialOuter = btn.querySelector('.pf-dial-outer');
      const ticks = btn.querySelectorAll('.pf-tick');
      const core = btn.querySelector('.pf-lock-core');
      gsap.killTweensOf([body, dial, dialOuter, ...ticks, core]);
      gsap.to(body, { scale: 1.04, transformOrigin: '50% 50%', duration: 0.25, ease: 'power2.out' });
      gsap.to([dial, ...ticks], { rotate: 180, transformOrigin: '12px 12px', duration: 0.5, ease: 'power2.out' });
      gsap.to(dialOuter, { rotate: -90, transformOrigin: '12px 12px', duration: 0.5, ease: 'power2.out' });
      gsap.to(core, { scale: 1.3, transformOrigin: '12px 12px', duration: 0.25, ease: 'power2.out' });
    } else if (view === 'screener') {
      const elementsToShake = btn.querySelectorAll('.sc-glass, .sc-glass-inner, .sc-cross-v, .sc-cross-h, .sc-handle');
      const dot1 = btn.querySelector('.sc-dot-1');
      const dot2 = btn.querySelector('.sc-dot-2');
      gsap.killTweensOf([...elementsToShake, dot1, dot2]);
      gsap.to(elementsToShake, {
        x: 1.5,
        y: -1.5,
        duration: 0.12,
        yoyo: true,
        repeat: 3,
        ease: 'sine.inOut'
      });
      gsap.to(dot1, { scale: 1.4, x: -1, y: 1, transformOrigin: '50% 50%', duration: 0.3, ease: 'power2.out' });
      gsap.to(dot2, { scale: 1.4, x: 1, y: -1, transformOrigin: '50% 50%', duration: 0.3, ease: 'power2.out' });
    } else if (view === 'backtest') {
      const ni = btn.querySelector('.bt-node-in');
      const proc = btn.querySelector('.bt-node-proc');
      const no = btn.querySelector('.bt-node-out');
      const loop = btn.querySelector('.bt-loop');
      const arrow = btn.querySelector('.bt-arrow');
      gsap.killTweensOf([ni, proc, no, loop, arrow]);
      gsap.to(proc, { rotate: 90, transformOrigin: '12px 8px', duration: 0.45, ease: 'power2.out' });
      gsap.to([ni, no], { scale: 1.25, transformOrigin: '50% 50%', stagger: 0.05, duration: 0.25, ease: 'back.out(2)' });
      gsap.to(loop, { strokeDashoffset: -8, duration: 0.8, ease: 'linear', repeat: -1 });
      gsap.to(arrow, { scale: 1.15, transformOrigin: '9px 11px', duration: 0.25, ease: 'power2.out' });
    } else if (view === 'forecast') {
      const high = btn.querySelector('.fc-high');
      const low = btn.querySelector('.fc-low');
      const node = btn.querySelector('.fc-split-node');
      const expected = btn.querySelector('.fc-expected');
      const cone = btn.querySelector('.fc-cone');
      gsap.killTweensOf([high, low, node, expected, cone]);
      // Continuous breathing fan chart animation
      gsap.to(high, { rotate: -8, transformOrigin: '12px 14px', duration: 1.2, ease: 'sine.inOut', repeat: -1, yoyo: true });
      gsap.to(low, { rotate: 8, transformOrigin: '12px 14px', duration: 1.2, ease: 'sine.inOut', repeat: -1, yoyo: true });
      gsap.to(cone, { scaleY: 1.25, transformOrigin: '12px 14px', duration: 1.2, ease: 'sine.inOut', repeat: -1, yoyo: true });
      gsap.to(expected, { rotate: 4, transformOrigin: '12px 14px', duration: 0.8, ease: 'sine.inOut', repeat: -1, yoyo: true });
      gsap.to(node, { scale: 1.3, transformOrigin: '50% 50%', duration: 0.6, ease: 'sine.inOut', repeat: -1, yoyo: true });
    } else if (view === 'report') {
      const doc = btn.querySelector('.rp-doc');
      const fold = btn.querySelector('.rp-fold');
      const bars = btn.querySelectorAll('[class^="rp-bar-"]');
      const lines = btn.querySelectorAll('[class^="rp-line-"]');
      const hand = btn.querySelector('.rp-clock-hand');
      gsap.killTweensOf([doc, fold, ...bars, ...lines, hand]);
      gsap.to(doc, { scale: 1.03, transformOrigin: '50% 50%', duration: 0.25, ease: 'power2.out' });
      gsap.to(fold, { x: -0.4, y: 0.4, scale: 1.1, transformOrigin: '100% 0%', duration: 0.25, ease: 'power2.out' });
      gsap.fromTo(bars, { scaleY: 0.3, transformOrigin: '50% 100%' }, { scaleY: 1.2, transformOrigin: '50% 100%', stagger: 0.05, duration: 0.3, ease: 'back.out(1.5)' });
      gsap.fromTo(lines, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, transformOrigin: '0% 50%', stagger: 0.05, duration: 0.25, ease: 'power2.out' });
      gsap.to(hand, { rotate: 360, transformOrigin: '17.5px 16.5px', duration: 0.5, ease: 'power2.out' });
    } else if (view === 'literacy') {
      const l = btn.querySelector('.lt-page-l');
      const r = btn.querySelector('.lt-page-r');
      const star1 = btn.querySelector('.lt-star-1');
      const star2 = btn.querySelector('.lt-star-2');
      gsap.killTweensOf([l, r, star1, star2]);
      gsap.to(star1, { rotate: 180, scale: 1.35, y: -1, transformOrigin: '12px 5px', duration: 0.45, ease: 'back.out(1.8)' });
      gsap.to(star2, { rotate: -180, scale: 1.35, y: -1, transformOrigin: '17px 6px', duration: 0.45, delay: 0.05, ease: 'back.out(1.8)' });
      gsap.to(l, { scaleX: 0.85, transformOrigin: '100% 50%', duration: 0.15, ease: 'power2.inOut', yoyo: true, repeat: 1 });
      gsap.to(r, { scaleX: 0.85, transformOrigin: '0% 50%', duration: 0.15, delay: 0.05, ease: 'power2.inOut', yoyo: true, repeat: 1 });
    }
  }

  function resetNavIconMotion(btn) {
    const view = btn.dataset.view;
    if (!view) return;

    if (view === 'overview') {
      const p1 = btn.querySelector('.ov-panel-1');
      const p2 = btn.querySelector('.ov-panel-2');
      const p3 = btn.querySelector('.ov-panel-3');
      const chart = btn.querySelector('.ov-chart');
      const dot = btn.querySelector('.ov-dot');
      const border = btn.querySelector('.ov-border');
      gsap.killTweensOf([p1, p2, p3, chart, dot, border]);
      gsap.to([p1, p2, p3], { scale: 1, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' });
      gsap.to(border, { strokeDashoffset: 0, duration: 0.2, ease: 'power2.out' });
      gsap.to(chart, { strokeDashoffset: 0, duration: 0.2, ease: 'power2.out' });
      gsap.to(dot, { scale: 1, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' });
    } else if (view === 'us') {
      const bolt = btn.querySelector('.us-bolt');
      const trend = btn.querySelector('.us-trend');
      const dot = btn.querySelector('.us-dot');
      gsap.killTweensOf([bolt, trend, dot]);
      gsap.to(bolt, { scale: 1, rotate: 0, opacity: 1, transformOrigin: '12px 12px', duration: 0.2, ease: 'power2.out' });
      gsap.to(trend, { strokeDashoffset: 0, duration: 0.2, ease: 'power2.out' });
      gsap.to(dot, { scale: 1, opacity: 1, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' });
    } else if (view === 'bist') {
      const tl = btn.querySelector('.tr-tulip-l');
      const tr = btn.querySelector('.tr-tulip-r');
      const tc = btn.querySelector('.tr-tulip-c');
      const stem = btn.querySelector('.tr-tulip-stem');
      const trend = btn.querySelector('.tr-trend');
      const dot = btn.querySelector('.tr-dot');
      gsap.killTweensOf([tl, tr, tc, stem, trend, dot]);
      gsap.to([tl, tr, tc], { scale: 1, rotate: 0, opacity: 1, transformOrigin: '12px 16px', duration: 0.2, ease: 'power2.out' });
      gsap.to(stem, { scaleY: 1, transformOrigin: '50% 100%', duration: 0.2, ease: 'power2.out' });
      gsap.to(trend, { strokeDashoffset: 0, duration: 0.2, ease: 'power2.out' });
      gsap.to(dot, { scale: 1, opacity: 1, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' });
    } else if (view === 'crypto') {
      const hex = btn.querySelector('.cr-hex');
      const ring = btn.querySelector('.cr-ring');
      const core = btn.querySelector('.cr-core');
      const lines = btn.querySelectorAll('.cr-line-v, .cr-line-l, .cr-line-r');
      const nodes = btn.querySelectorAll('.cr-node');
      gsap.killTweensOf([hex, ring, core, ...lines, ...nodes]);
      gsap.to(hex, { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' });
      gsap.to(lines, { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' });
      gsap.to(ring, { scale: 1, rotate: 0, transformOrigin: '12px 12px', duration: 0.3, ease: 'power2.out' });
      gsap.to(core, { scale: 1, transformOrigin: '12px 12px', duration: 0.3, ease: 'power2.out' });
      gsap.to(nodes, { scale: 1, transformOrigin: '50% 50%', duration: 0.3, ease: 'power2.out' });
    } else if (view === 'portfolio') {
      const body = btn.querySelector('.pf-safe-body');
      const dial = btn.querySelector('.pf-dial');
      const dialOuter = btn.querySelector('.pf-dial-outer');
      const ticks = btn.querySelectorAll('.pf-tick');
      const core = btn.querySelector('.pf-lock-core');
      gsap.killTweensOf([body, dial, dialOuter, ...ticks, core]);
      gsap.to(body, { scale: 1, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' });
      gsap.to([dial, ...ticks], { rotate: 0, transformOrigin: '12px 12px', duration: 0.3, ease: 'power2.out' });
      gsap.to(dialOuter, { rotate: 0, transformOrigin: '12px 12px', duration: 0.3, ease: 'power2.out' });
      gsap.to(core, { scale: 1, transformOrigin: '12px 12px', duration: 0.2, ease: 'power2.out' });
    } else if (view === 'screener') {
      const elementsToShake = btn.querySelectorAll('.sc-glass, .sc-glass-inner, .sc-cross-v, .sc-cross-h, .sc-handle');
      const dot1 = btn.querySelector('.sc-dot-1');
      const dot2 = btn.querySelector('.sc-dot-2');
      gsap.killTweensOf([...elementsToShake, dot1, dot2]);
      gsap.to(elementsToShake, { x: 0, y: 0, duration: 0.2, ease: 'power2.out' });
      gsap.to([dot1, dot2], { scale: 1, x: 0, y: 0, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' });
    } else if (view === 'backtest') {
      const ni = btn.querySelector('.bt-node-in');
      const proc = btn.querySelector('.bt-node-proc');
      const no = btn.querySelector('.bt-node-out');
      const loop = btn.querySelector('.bt-loop');
      const arrow = btn.querySelector('.bt-arrow');
      gsap.killTweensOf([ni, proc, no, loop, arrow]);
      gsap.to(proc, { rotate: 0, transformOrigin: '12px 8px', duration: 0.25, ease: 'power2.out' });
      gsap.to([ni, no], { scale: 1, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' });
      gsap.to(loop, { strokeDashoffset: 0, duration: 0.2, ease: 'power2.out' });
      gsap.to(arrow, { scale: 1, transformOrigin: '9px 11px', duration: 0.2, ease: 'power2.out' });
    } else if (view === 'forecast') {
      const high = btn.querySelector('.fc-high');
      const low = btn.querySelector('.fc-low');
      const node = btn.querySelector('.fc-split-node');
      const expected = btn.querySelector('.fc-expected');
      const cone = btn.querySelector('.fc-cone');
      gsap.killTweensOf([high, low, node, expected, cone]);
      gsap.to(high, { rotate: 0, transformOrigin: '12px 14px', duration: 0.3, ease: 'power2.out' });
      gsap.to(low, { rotate: 0, transformOrigin: '12px 14px', duration: 0.3, ease: 'power2.out' });
      gsap.to(cone, { scaleY: 1, transformOrigin: '12px 14px', duration: 0.3, ease: 'power2.out' });
      gsap.to(node, { scale: 1, transformOrigin: '50% 50%', duration: 0.3, ease: 'power2.out' });
      gsap.to(expected, { rotate: 0, scaleY: 1, transformOrigin: '12px 14px', duration: 0.3, ease: 'power2.out' });
    } else if (view === 'report') {
      const doc = btn.querySelector('.rp-doc');
      const fold = btn.querySelector('.rp-fold');
      const bars = btn.querySelectorAll('[class^="rp-bar-"]');
      const lines = btn.querySelectorAll('[class^="rp-line-"]');
      const hand = btn.querySelector('.rp-clock-hand');
      gsap.killTweensOf([doc, fold, ...bars, ...lines, hand]);
      gsap.to(doc, { scale: 1, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' });
      gsap.to(fold, { x: 0, y: 0, scale: 1, transformOrigin: '100% 0%', duration: 0.2, ease: 'power2.out' });
      gsap.to(bars, { scaleY: 1, transformOrigin: '50% 100%', duration: 0.2, ease: 'power2.out' });
      gsap.to(lines, { scaleX: 1, transformOrigin: '0% 50%', duration: 0.2, ease: 'power2.out' });
      gsap.to(hand, { rotate: 0, transformOrigin: '17.5px 16.5px', duration: 0.2, ease: 'power2.out' });
    } else if (view === 'literacy') {
      const l = btn.querySelector('.lt-page-l');
      const r = btn.querySelector('.lt-page-r');
      const star1 = btn.querySelector('.lt-star-1');
      const star2 = btn.querySelector('.lt-star-2');
      gsap.killTweensOf([l, r, star1, star2]);
      gsap.to([star1, star2], { rotate: 0, scale: 1, y: 0, duration: 0.2, ease: 'power2.out' });
      gsap.to([l, r], { scaleX: 1, transformOrigin: '50% 50%', duration: 0.2, ease: 'power2.out' });
    }
  }

  // 1. Sidebar navitem interactions
  document.querySelectorAll('.navitem').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      gsap.to(btn, {
        scale: 1.03,
        x: 4,
        duration: 0.16,
        ease: 'power3.out'
      });
      playNavIconMotion(btn);
    });

    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, {
        scale: 1,
        x: 0,
        duration: 0.16,
        ease: 'power3.out'
      });
      resetNavIconMotion(btn);
    });

    btn.addEventListener('mousedown', () => {
      gsap.to(btn, { scale: 0.96, duration: 0.1 });
    });

    btn.addEventListener('mouseup', () => {
      gsap.to(btn, { scale: 1.03, duration: 0.1 });
    });
  });

  // 2. Buttons and segmented controls press feedback (Delegated)
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

// Delegated event listeners for note-saving form and suggested alert switch
document.addEventListener('submit', async (e) => {
  const noteForm = e.target.closest('.asset-note-form');
  if (noteForm) {
    e.preventDefault();
    const market = noteForm.dataset.market;
    const symbol = noteForm.dataset.symbol;
    const key = market + ':' + symbol;
    const thesis = noteForm.elements.thesis.value;
    const invalidation = noteForm.elements.invalidation.value;

    JOURNAL.notes[key] = {
      thesis: thesis.trim(),
      invalidation: invalidation.trim(),
      updatedAt: new Date().toISOString()
    };

    const statusEl = noteForm.querySelector('.note-status');
    if (statusEl) statusEl.textContent = 'Kaydediliyor...';

    try {
      await saveJournal();
      if (statusEl) statusEl.textContent = '✓ Kaydedildi';
      // Refresh the row detail
      const row = noteForm.closest('.detail');
      if (row) {
        const idx = row.id.replace('detail-', '');
        const list = currentList();
        const asset = list[idx];
        if (asset) {
          const wrapper = row.querySelector('.asset-thesis-wrapper');
          if (wrapper) {
            const nextCard = assetThesisCard(asset);
            const temp = document.createElement('div');
            temp.innerHTML = nextCard;
            wrapper.replaceWith(temp.firstChild);
          }
        }
      }
    } catch (err) {
      if (statusEl) statusEl.textContent = '✗ Hata oluştu';
    }
  }
});

document.addEventListener('change', async (e) => {
  const alertSwitch = e.target.closest('.alert-toggle-form input[type="checkbox"]');
  if (alertSwitch) {
    const alertForm = alertSwitch.closest('.alert-toggle-form');
    if (alertForm) {
      const market = alertForm.dataset.market;
      const symbol = alertForm.dataset.symbol;
      const trigger = alertForm.dataset.trigger;
      const action = alertForm.dataset.action;
      const enabled = alertSwitch.checked;

      const id = [market.toLowerCase(), symbol.toUpperCase(), trigger.toLowerCase()].join(':');
      const alertObj = {
        id,
        market: market.toLowerCase(),
        symbol: symbol.toUpperCase(),
        trigger: trigger,
        action: action,
        enabled: enabled,
        createdAt: new Date().toISOString()
      };

      JOURNAL.alerts = (JOURNAL.alerts || []).filter(x => x.id !== id);
      if (enabled) {
        JOURNAL.alerts.push(alertObj);
      }

      alertForm.classList.add('saving');
      try {
        await saveJournal();
      } catch (err) {
        console.error('Alarm kaydedilemedi:', err);
        alertSwitch.checked = !enabled;
      } finally {
        alertForm.classList.remove('saving');
      }
    }
  }
});

