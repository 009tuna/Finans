'use strict';
const { createHash } = require('crypto');
const { readStore, updateStore } = require('./intelligence-store');
const { collectOfficialFeeds } = require('./official-market-feeds');
const { IR_COMPANIES, collectCompanyDisclosures } = require('./company-ir');
const { mergeCompanySnapshot, latestCompanyRecords } = require('./company-ir-store');
const KEY = 'market_sources_v1';
const initial = { schemaVersion: 1, items: [], sources: {} };
const hash = (text) => createHash('sha256').update(text).digest('hex');
const months = { ocak: 1, şubat: 2, mart: 3, nisan: 4, mayıs: 5, haziran: 6, temmuz: 7, ağustos: 8, eylül: 9, ekim: 10, kasım: 11, aralık: 12 };
function text(html) {
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([a-f\d]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}
function officialUrl(value) {
  try { const url = new URL(value, 'https://www.spk.gov.tr'); return url.protocol === 'https:' && ['spk.gov.tr', 'www.spk.gov.tr'].includes(url.hostname) && /\.pdf$/i.test(url.pathname) ? url.href : null; } catch (_) { return null; }
}
function parseSpkBulletins(html, { sourceUrl, observedAt }) {
  const entries = []; const seen = new Set();
  for (const match of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = text(match[2]);
    const number = label.match(/Bülten\s+No\s*:\s*(\d{4})\/(\d+)/i);
    const date = label.match(/Yayımlanma\s*:\s*(\d{1,2})\s+([\p{L}]+)\s+(\d{4})/iu);
    const url = officialUrl(match[1]);
    if (!number || !date || !url) continue;
    const month = months[date[2].toLocaleLowerCase('tr-TR')]; if (!month) continue;
    const dateOnly = `${date[3]}-${String(month).padStart(2, '0')}-${date[1].padStart(2, '0')}`;
    const valid = new Date(dateOnly + 'T00:00:00Z');
    if (!Number.isFinite(valid.getTime()) || valid.toISOString().slice(0, 10) !== dateOnly || dateOnly > observedAt.slice(0, 10)) continue;
    const id = 'spk:' + number[1] + '/' + number[2]; if (seen.has(id)) continue; seen.add(id);
    entries.push({ id, market: 'bist', type: 'regulatory_bulletin', title: `SPK bülteni ${number[1]}/${number[2]}`, url,
      source: 'SPK', sourceUrl, publishedDate: dateOnly, publishedAt: null, observedAt, contentHash: hash(label + '|' + url),
      evidence: 'Resmî bülten listesinde yayımlanan belge. PDF içeriği ve yürürlük değişikliği henüz ayrıştırılmadı.', evidenceStatus: 'document_link_verified', kind: 'primary' });
  }
  return entries.sort((a, b) => b.publishedDate.localeCompare(a.publishedDate) || Number(b.id.split('/')[1]) - Number(a.id.split('/')[1]));
}
async function fetchOfficialText(url) {
  const fetcher = process.platform === 'win32' && !process.env.VERCEL ? require('./windows-fetch').windowsFetch : fetch;
  const response = await fetcher(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Finans source monitor/1.0' } });
  if (!response.ok) throw new Error('Official source HTTP ' + response.status);
  const body = await response.text(); if (body.length > 2000000) throw new Error('Official source too large');
  return body;
}
async function refreshMarketNews({ database, fetchText = fetchOfficialText, collectFeeds, fetchFeeds, collectAnnouncements, collectKap, collectCompanyIr, inspectDocument, documentLimit = 3, now } = {}) {
  const fixedNow = now === undefined ? null : new Date(now).toISOString();
  const startedAt = fixedNow || new Date().toISOString();
  const url = `https://www.spk.gov.tr/spk-bultenleri/${startedAt.slice(0, 4)}-yili-spk-bultenleri`;
  let entries = []; let errorCode = null;
  let spkCheckedAt;
  try {
    const html = await fetchText(url);
    spkCheckedAt = fixedNow || new Date().toISOString();
    entries = parseSpkBulletins(html, { sourceUrl: url, observedAt: spkCheckedAt });
    if (!entries.length) throw new Error('Unsupported official list');
  }
  catch (error) { errorCode = /HTTP (\d+)/.test(error.message) ? 'http_' + error.message.match(/HTTP (\d+)/)[1] : 'source_unavailable'; }
  spkCheckedAt ||= fixedNow || new Date().toISOString();
  // Fixture callers can provide `now`; production timestamps are captured after each source responds.
  // Keep all I/O outside updateStore's compare-and-set callback.
  let feedSnapshot = null;
  const injectedFeedCollector = collectFeeds === false ? false : (collectFeeds || fetchFeeds);
  if (injectedFeedCollector !== false) {
    try { feedSnapshot = await (injectedFeedCollector || collectOfficialFeeds)({ ...(fixedNow ? { now: fixedNow, observedAt: fixedNow } : {}) }); }
    catch (error) {
      const checkedAt = fixedNow || new Date().toISOString();
      feedSnapshot = { items: [], sources: Object.fromEntries(['ethereum', 'bitcoin_core', 'solana'].map((id) => [id, {
        status: 'unavailable', checkedAt, lastSuccessfulAt: null, count: 0, last24HoursCount: 0, errorCode: 'source_unavailable',
      }])) };
    }
  }
  const documents = new Map();
  // Network work stays outside the CAS callback; retries must not repeat PDF downloads.
  if (entries.length && documentLimit > 0) {
    const { value: previous } = await readStore(KEY, initial, database);
    const inspect = inspectDocument || ((item) => require('./spk-documents').inspectBulletin(item, { now: () => fixedNow ? new Date(fixedNow) : new Date() }));
    for (const item of entries.slice(0, Math.min(3, Math.max(0, documentLimit)))) {
      const cached = previous.items.filter((x) => (x.id === item.id || x.supersedes === item.id) && x.contentHash === item.contentHash && x.document?.available
        && Date.parse(x.document.extractedAt) <= Date.parse(spkCheckedAt) && Date.parse(spkCheckedAt) - Date.parse(x.document.extractedAt) < 24 * 60 * 60 * 1000)
        .sort((a, b) => b.document.extractedAt.localeCompare(a.document.extractedAt))[0];
      if (cached) { documents.set(item.id, cached.document); continue; }
      try { documents.set(item.id, await inspect(item)); }
      catch (_) { documents.set(item.id, { available: false, contentStatus: 'unavailable', reason: 'document_unavailable' }); }
    }
  }
  // Press announcements are an independent official source. Fetch before CAS and
  // keep its failures isolated from the bulletin and market-feed collectors.
  let announcementSnapshot = null;
  if (collectAnnouncements !== false) {
    try {
      const collector = collectAnnouncements || require('./spk-announcements').collectSpkAnnouncements;
      // Fixed `now` remains available to injected fixture collectors; the real
      // collector timestamps each completed request using the wall clock.
      announcementSnapshot = await collector(collectAnnouncements ? (fixedNow ? { now: fixedNow } : {}) : { year: Number(startedAt.slice(0, 4)) });
    } catch (_) {
      const checkedAt = fixedNow || new Date().toISOString();
      announcementSnapshot = { items: [], checkedAt, status: 'unavailable', sourceUrl: 'https://spk.gov.tr/duyurular/basin-duyurulari/' + checkedAt.slice(0, 4), errorCode: 'source_unavailable', failures: [] };
    }
  }
  let kapSnapshot = null;
  if (collectKap !== false) {
    try {
      const collector = collectKap || require('./kap-announcements').collectKapAnnouncements;
      kapSnapshot = await collector(fixedNow ? { now: fixedNow } : {});
    } catch (_) {
      const checkedAt = fixedNow || new Date().toISOString();
      kapSnapshot = { items: [], checkedAt, status: 'unavailable', sourceUrl: 'https://www.kap.org.tr/tr/bildirim-sorgu', errorCode: 'source_unavailable', failures: [] };
    }
  }
  let companySnapshot = null;
  if (collectCompanyIr !== false) {
    const { value: previous } = await readStore(KEY, initial, database);
    try { companySnapshot = await (collectCompanyIr || collectCompanyDisclosures)({ previousSources: previous.sources, ...(fixedNow ? { now: fixedNow } : {}) }); }
    catch (_) {
      const checkedAt = fixedNow || new Date().toISOString();
      companySnapshot = { items: [], sources: Object.fromEntries(IR_COMPANIES.map(company => [company.id, {
        symbol: company.symbol, sourceUrl: company.sourceUrl, status: 'unavailable', checkedAt, errorCode: 'source_unavailable',
      }])) };
    }
  }
  const value = await updateStore(KEY, initial, (current) => {
    const spkIsStale = Number.isFinite(Date.parse(current.sources.spk?.checkedAt)) && Date.parse(current.sources.spk.checkedAt) >= Date.parse(spkCheckedAt);
    const byId = new Map(current.items.map((item) => [item.id, item]));
    if (!spkIsStale) for (const entry of entries) {
      const item = documents.has(entry.id) ? { ...entry, document: documents.get(entry.id) } : entry;
      // Keep the first observed document evidence; corrections append a different version.
      const existing = byId.get(item.id);
      if (!existing) byId.set(item.id, item);
      else if (existing.contentHash !== item.contentHash) byId.set(item.id + ':' + item.contentHash.slice(0, 12), { ...item, id: item.id + ':' + item.contentHash.slice(0, 12), supersedes: item.id });
      else if (!existing.document?.available && item.document) byId.set(item.id, { ...existing, document: item.document });
      else if (item.document?.available && existing.document?.available && item.document.documentHash !== existing.document.documentHash) {
        const versionId = item.id + ':pdf:' + item.document.documentHash.slice(0, 12);
        if (!byId.has(versionId)) byId.set(versionId, { ...item, id: versionId, supersedes: item.id });
      }
    }
    const sources = { ...current.sources };
    if (announcementSnapshot) {
      const previous = sources.spk_announcements || {};
      const stale = Number.isFinite(Date.parse(previous.checkedAt)) && Date.parse(previous.checkedAt) >= Date.parse(announcementSnapshot.checkedAt);
      if (!stale) {
        const ids = new Set(current.items.map((x) => x.id));
        for (const item of announcementSnapshot.items || []) if (!ids.has(item.id)) { byId.set(item.id, item); ids.add(item.id); }
        const successful = announcementSnapshot.status === 'available' || announcementSnapshot.status === 'partial';
        sources.spk_announcements = { sourceUrl: announcementSnapshot.sourceUrl || null, status: announcementSnapshot.status || 'unavailable', checkedAt: announcementSnapshot.checkedAt,
          lastCompletedAt: successful ? announcementSnapshot.checkedAt : previous.lastCompletedAt || null,
          lastSuccessfulAt: announcementSnapshot.status === 'available' ? announcementSnapshot.checkedAt : previous.lastSuccessfulAt || null,
          errorCode: announcementSnapshot.errorCode || null, failures: announcementSnapshot.failures || [],
          count: [...byId.values()].filter((x) => x.sourceId === 'spk_announcements').length,
          discoveredCount: announcementSnapshot.discoveredCount ?? null, filteredCount: announcementSnapshot.filteredCount ?? null,
          scope: announcementSnapshot.scope || 'official_spk_press_announcements_evidence_only' };
      }
    }
    if (kapSnapshot) {
      const previous = sources.kap || {};
      const stale = Number.isFinite(Date.parse(previous.checkedAt)) && Date.parse(previous.checkedAt) >= Date.parse(kapSnapshot.checkedAt);
      if (!stale) {
        const ids = new Set(current.items.map((x) => x.id));
        for (const item of kapSnapshot.items || []) if (!ids.has(item.id)) { byId.set(item.id, item); ids.add(item.id); }
        const successful = kapSnapshot.status === 'available' || kapSnapshot.status === 'partial';
        sources.kap = { sourceUrl: kapSnapshot.sourceUrl || null, status: kapSnapshot.status || 'unavailable', checkedAt: kapSnapshot.checkedAt,
          lastCompletedAt: successful ? kapSnapshot.checkedAt : previous.lastCompletedAt || null,
          lastSuccessfulAt: kapSnapshot.status === 'available' ? kapSnapshot.checkedAt : previous.lastSuccessfulAt || null,
          errorCode: kapSnapshot.errorCode || null, failures: kapSnapshot.failures || [], count: [...byId.values()].filter((x) => x.sourceId === 'kap_announcements').length,
          discoveredCount: kapSnapshot.discoveredCount ?? null, evidence: (previous.evidence || kapSnapshot.evidence) ? { ...(previous.evidence || {}), ...(kapSnapshot.evidence || {}) } : null,
          scope: kapSnapshot.scope || 'official_kap_company_disclosures' };
      }
    }
    const last = current.sources.spk || {};
    if (!spkIsStale) sources.spk = { sourceUrl: url,
      status: errorCode ? 'unavailable' : 'available', checkedAt: spkCheckedAt, lastSuccessfulAt: errorCode ? last.lastSuccessfulAt || null : spkCheckedAt, errorCode,
      scope: 'bulletin_document_links_and_limited_text', count: entries.length,
      documentsInspected: documents.size, documentsExtracted: [...documents.values()].filter((x) => x.available).length,
      documentFailures: [...documents].filter(([, x]) => !x.available).map(([id, x]) => ({ id, reason: x.reason })) };
    for (const [feedId, incoming] of Object.entries(feedSnapshot?.sources || {})) {
      const previous = sources[feedId] || {};
      if (Number.isFinite(Date.parse(previous.checkedAt)) && Date.parse(previous.checkedAt) >= Date.parse(incoming.checkedAt)) continue;
      const succeeded = incoming.status === 'available';
      const incomingItems = feedSnapshot.items.filter((item) => item.feedId === feedId);
      if (succeeded) {
        for (const item of incomingItems) {
          const duplicate = [...byId.values()].find((old) => old.feedId === feedId && (old.id === item.id || old.contentHash === item.contentHash));
          if (!duplicate) byId.set(item.id, item);
        }
      }
      const retainedCount = [...byId.values()].filter((item) => item.feedId === feedId).length;
      sources[feedId] = { ...incoming, count: retainedCount, retainedCount,
        lastSuccessfulAt: succeeded ? incoming.lastSuccessfulAt : previous.lastSuccessfulAt || null,
        last24HoursCount: succeeded ? incoming.last24HoursCount : previous.last24HoursCount ?? null,
        last24HoursAt: succeeded ? incoming.checkedAt : previous.last24HoursAt || previous.lastSuccessfulAt || null,
        todayDateOnlyCount: succeeded ? incoming.todayDateOnlyCount ?? 0 : previous.todayDateOnlyCount ?? null,
        todayDateOnlyAt: succeeded ? incoming.checkedAt : previous.todayDateOnlyAt || null,
        latestPublishedAt: incoming.latestPublishedAt || previous.latestPublishedAt || null };
    }
    // KAP's public collector is a separate, explicitly unverified scope; retain its status metadata.
    if (!kapSnapshot && feedSnapshot?.sources?.kap && (!sources.kap || Date.parse(feedSnapshot.sources.kap.checkedAt) > Date.parse(sources.kap.checkedAt))) sources.kap = feedSnapshot.sources.kap;
    return mergeCompanySnapshot({ ...current, items: [...byId.values()], sources }, companySnapshot);
  }, database);
  const checkedSources = Object.fromEntries(Object.entries(value.sources || {}).filter(([id]) => id === 'spk' || id === 'spk_announcements' || id === 'kap' || ['ethereum', 'bitcoin_core', 'solana'].includes(id) || IR_COMPANIES.some(company => company.id === id)));
  const failures = Object.entries(checkedSources).filter(([, source]) => source.status !== 'available').map(([id, source]) => ({
    source: id, status: source.status, errorCode: source.errorCode || (source.status === 'unverified' ? 'public_feed_not_verified' : 'source_unavailable'),
  }));
  for (const documentFailure of checkedSources.spk?.documentFailures || []) failures.push({ source: 'spk', scope: 'document', id: documentFailure.id, errorCode: documentFailure.reason || 'document_unavailable' });
  const countsBySource = Object.fromEntries(Object.entries(checkedSources).map(([id, source]) => [id, {
    count: source.count ?? 0, retainedCount: source.retainedCount ?? source.count ?? 0,
    last24HoursCount: source.last24HoursCount ?? null, last24HoursAt: source.last24HoursAt || source.lastSuccessfulAt || null,
    todayDateOnlyCount: source.todayDateOnlyCount ?? null, todayDateOnlyAt: source.todayDateOnlyAt || null,
    todayDateOnlyDate: source.todayDateOnlyDate || null,
  }]));
  return { status: failures.length ? 'partial' : 'available', source: 'market_news', count: entries.length, retained: value.items.length,
    errorCode: errorCode || failures[0]?.errorCode || null, failures, countsBySource, sources: checkedSources,
    documentsExtracted: [...documents.values()].filter((x) => x.available).length };
}
function buildMarketFeeds(store, report, now = new Date().toISOString()) {
  const groups = { us: [], bist: [], crypto: [] }; const seen = new Set();
  const localToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const add = (item) => {
    if (!groups[item.market] || !item.url || !item.title) return;
    try { const url = new URL(item.url); if (!['http:', 'https:'].includes(url.protocol)) return; } catch (_) { return; }
    if (item.publishedAt && (!Number.isFinite(Date.parse(item.publishedAt)) || Date.parse(item.publishedAt) > Date.parse(now))) return;
    if (item.publishedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(item.publishedDate) || item.publishedDate > localToday)) return;
    const key = item.market + '|' + item.url + '|' + item.title + (item.type === 'company_disclosure' ? '|' + item.publishedDate : ''); if (seen.has(key)) return; seen.add(key); groups[item.market].push(item);
  };
  const companyVersions = new Set(latestCompanyRecords(store.items || []).map(item => item.id));
  [...(store.items || [])].reverse().sort((a, b) => String(b.document?.extractedAt || b.observedAt || '').localeCompare(String(a.document?.extractedAt || a.observedAt || ''))).forEach(item => {
    if (item.type === 'company_disclosure') {
      if (!companyVersions.has(item.id)) return;
    }
    add(item);
  });
  const research = report?.ai?.research;
  const sources = new Map((research?.sources || []).map((source) => [source.id, source]));
  for (const event of research?.events || []) {
    const source = (event.sourceIds || []).map((id) => sources.get(id)).find(Boolean); if (!source) continue;
    add({ id: 'research:' + (report.ai.runId || '') + ':' + event.id, market: event.market, type: 'research_event', title: event.title, url: source.url,
      source: source.title, kind: source.kind, publishedAt: source.publishedAt || null, observedAt: report.ai.generatedAt || null,
      whatChanged: event.whatChanged, counterEvidence: event.counterEvidence, evidenceStatus: 'model_cited', evidence: source.evidence });
  }
  for (const news of report?.base?.calendar?.companyNews || []) add({ ...news, id: 'company:' + hash(news.url || '').slice(0, 16),
    market: 'us', type: 'company_news', title: news.headline, evidenceStatus: 'provider_link', kind: 'secondary' });
  for (const market of Object.keys(groups)) groups[market].sort((a, b) => String(b.publishedAt || b.publishedDate || '').localeCompare(String(a.publishedAt || a.publishedDate || '')));
  return { groups, sources: store.sources || {}, counts: Object.fromEntries(Object.keys(groups).map((market) => [market, groups[market].length])),
    coverage: ['us', 'bist', 'crypto'].map((market) => ({ market, status: groups[market].length ? 'partial' : 'unavailable',
      reason: market === 'bist' ? 'SPK bültenleri ve basın duyuruları; şirket kaynak pilotu yalnız FROTO ve TUPRS açıklama listelerini kapsar. Şirket belgesi içeriği okunmaz; tam KAP veri servisi bağlı değildir. Güncel erişim kaynak durumunda gösterilir.' : market === 'crypto' ? 'Kapsam yalnız Ethereum Foundation blogu, Bitcoin Core duyuruları ve Solana changelog akışlarıdır; zincir üstü olaylar, borsa duyuruları ve tüm kripto varlıklar kapsanmaz.' : 'Mevcut şirket haberleri ve kaynaklı araştırma; kapsam tam haber servisi değildir.' })) };
}
async function getMarketNews({ database, report, now } = {}) {
  const { value } = await readStore(KEY, initial, database);
  return buildMarketFeeds(value, report, now);
}
module.exports = { KEY, initial, parseSpkBulletins, refreshMarketNews, getMarketNews, buildMarketFeeds, fetchOfficialText };
