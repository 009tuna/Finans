'use strict';
const { createHash } = require('node:crypto');
const { readStore, updateStore } = require('./intelligence-store');
const { IR_COMPANIES, SCOPE, safeDisclosureUrl, publisherDate, collectCompanyDisclosures } = require('./company-ir');
const { localDate } = require('./official-market-feeds');
const KEY = 'market_sources_v1';
const initial = { schemaVersion: 1, items: [], sources: {} };
const digest = value => createHash('sha256').update(value).digest('hex');

function latestCompanyRecords(items) {
  const latest = new Map();
  for (const item of items.filter(item => item.type === 'company_disclosure')) {
    const identity = item.supersedes || item.id, stamp = Date.parse(item.observedAt);
    if (!Number.isFinite(stamp)) continue;
    const previous = latest.get(identity);
    if (!previous || stamp > previous.stamp) latest.set(identity, { stamp, items: [item] });
    else if (stamp === previous.stamp) previous.items.push(item);
  }
  // Different descriptions in the same list observation remain ambiguous, not an arbitrary correction.
  return [...latest.values()].flatMap(group => group.items);
}

// This is a pure CAS transform. Retries never repeat source requests.
function mergeCompanySnapshot(current, snapshot) {
  const sources = { ...current.sources }, byId = new Map(current.items.map(item => [item.id, item]));
  for (const company of IR_COMPANIES) {
    const incoming = snapshot?.sources?.[company.id];
    if (!incoming || incoming.skipped || incoming.symbol !== company.symbol || incoming.sourceUrl !== company.sourceUrl
      || !Number.isFinite(Date.parse(incoming.checkedAt))) continue;
    const previous = sources[company.id] || {};
    if (Number.isFinite(Date.parse(previous.checkedAt)) && Date.parse(previous.checkedAt) >= Date.parse(incoming.checkedAt)) continue;
    const succeeded = ['available', 'partial'].includes(incoming.status);
    let rejectedCount = 0;
    if (succeeded) for (const item of snapshot.items || []) {
      if (item.sourceId !== company.id) continue;
      const url = safeDisclosureUrl(item.url, company);
      const expectedId = company.id + ':' + digest(url + '|' + item.publishedDate).slice(0, 24);
      if (item.sourceId !== company.id || item.symbol !== company.symbol || item.market !== 'bist' || item.type !== 'company_disclosure'
        || !url || item.url !== url || item.id !== expectedId || publisherDate(item.publishedDate?.split('-').reverse().join('.')) !== item.publishedDate
        || !item.title || item.title.length > 600 || item.sourceUrl !== company.sourceUrl || item.publishedAt != null
        || item.contentHash !== digest(item.publishedDate + '|' + item.title + '|' + url) || item.listingHash !== incoming.listingHash || !/^[a-f0-9]{64}$/.test(item.listingHash || '')
        || item.publishedDate > localDate(incoming.checkedAt) || item.observedAt !== incoming.checkedAt || item.listingCheckedAt !== incoming.checkedAt
        || !['company_listing_link_verified', 'company_listing_link_conflict'].includes(item.evidenceStatus)) { rejectedCount++; continue; }
      const existing = byId.get(item.id);
      if (!existing) byId.set(item.id, item);
      else {
        // Title/date evidence and conflict status can change; preserve first observation.
        const latest = [...byId.values()].filter(old => old.id === item.id || old.supersedes === item.id).reverse()
          .sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)))[0];
        if (latest.contentHash === item.contentHash && latest.evidenceStatus === item.evidenceStatus) continue;
        const versionId = item.id + ':' + digest(item.contentHash + '|' + item.evidenceStatus + '|' + item.observedAt).slice(0, 16);
        byId.set(versionId, { ...item, id: versionId, supersedes: item.id });
      }
    }
    const retained = [...byId.values()].filter(item => item.sourceId === company.id);
    sources[company.id] = { ...incoming, scope: SCOPE, listingScope: company.listingScope,
      ...(rejectedCount ? { status: 'partial', errorCode: 'company_records_filtered', rejectedCount } : {}),
      lastSuccessfulAt: incoming.status === 'available' && !rejectedCount ? incoming.checkedAt : previous.lastSuccessfulAt || null,
      lastCompletedAt: succeeded ? incoming.checkedAt : previous.lastCompletedAt || null,
      count: latestCompanyRecords(retained).length,
      retainedCount: retained.length, documentLinkCount: new Set(retained.map(item => item.url)).size,
      listingHash: succeeded ? incoming.listingHash : previous.listingHash || null,
      listingVerifiedAt: succeeded ? incoming.checkedAt : previous.listingVerifiedAt || previous.lastCompletedAt || null,
      todayDateOnlyCount: succeeded ? incoming.todayDateOnlyCount ?? null : previous.todayDateOnlyCount ?? null,
      todayDateOnlyAt: succeeded ? incoming.checkedAt : previous.todayDateOnlyAt || null,
      todayDateOnlyDate: succeeded ? incoming.todayDateOnlyDate || null : previous.todayDateOnlyDate || null,
      latestPublishedDate: incoming.latestPublishedDate || previous.latestPublishedDate || null };
  }
  return { ...current, items: [...byId.values()], sources };
}

async function refreshCompanyIr({ database, collector = collectCompanyDisclosures, now, force = false } = {}) {
  const { value: previous } = await readStore(KEY, initial, database);
  const snapshot = await collector({ previousSources: previous.sources, force, ...(now === undefined ? {} : { now }) });
  const value = await updateStore(KEY, initial, current => mergeCompanySnapshot(current, snapshot), database);
  const sources = Object.fromEntries(IR_COMPANIES.filter(company => value.sources[company.id]).map(company => [company.id, value.sources[company.id]]));
  const failures = Object.entries(sources).filter(([, source]) => source.status !== 'available').map(([source, record]) => ({ source, status: record.status, errorCode: record.errorCode || 'source_unavailable' }));
  return { source: 'company_ir', scope: SCOPE, status: Object.keys(sources).length !== IR_COMPANIES.length || failures.length ? 'partial' : 'available',
    sources, failures, retained: value.items.filter(item => item.type === 'company_disclosure').length };
}
module.exports = { mergeCompanySnapshot, refreshCompanyIr, latestCompanyRecords };
