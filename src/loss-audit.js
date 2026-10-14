'use strict';

// Pure, read-only diagnostics of saved records. This module neither resolves
// predictions nor certifies that a real or paper trade was executed.
const { classifyRecord } = require('../public/structural-records');
const STRUCTURAL = 'structural-long-v1';
const FINISHED = new Set(['target-hit', 'stop-hit', 'expired-win', 'expired-loss', 'time-exit']);
const MARKETS = new Set(['bist', 'us', 'crypto']);
const STATUSES = ['positive', 'negative', 'zero', 'pending', 'not-entered', 'ambiguous', 'invalid', 'incomplete', 'unknown'];
const COHORTS = ['legacy-system', 'structural-system', 'manual', 'historical-simulation', 'unknown-source'];
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const present = x => x != null && x !== '';
function time(x) {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)) return NaN;
  const day = x.slice(0, 10), dayMs = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(dayMs) && new Date(dayMs).toISOString().slice(0, 10) === day ? Date.parse(x) : NaN;
}
function cohortOf(r) {
  if (r.source === 'manual' || r.source === 'user') return 'manual';
  if (r.source === 'historical-simulation') return 'historical-simulation';
  if (r.source !== 'system') return 'unknown-source';
  return r.strategyVersion === STRUCTURAL ? 'structural-system' : 'legacy-system';
}
function scoreBucket(score) {
  if (!finite(score)) return 'unknown';
  if (score < 0 || score > 100) return 'outside-0-100';
  return score < 20 ? '0-19' : score < 40 ? '20-39' : score < 60 ? '40-59' : score < 80 ? '60-79' : '80-100';
}
function savedDate(value) {
  if (!Number.isFinite(time(value))) return 'unknown';
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date ? date : 'unknown';
}
function diagnoseRecord(input, { duplicate = false, auditedAt } = {}) {
  const r = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const cohort = cohortOf(r), structural = r.strategyVersion === STRUCTURAL;
  const issues = [], missing = [], warnings = [];
  const issue = key => issues.push(key), absent = key => missing.push(key);
  const market = MARKETS.has(r.market) ? r.market : 'unknown';
  const created = time(r.createdAt), resolved = time(r.resolvedAt), now = time(auditedAt);
  const entry = structural ? r.execution?.fillPrice : r.entry;
  const exit = structural ? r.exitPrice : r.closePrice;
  const result = structural ? r.grossResultPct : r.resultPct;
  const currency = structural ? r.plan?.currency : r.currency;
  const basis = structural ? r.plan?.priceBasis : r.priceBasis;
  const closed = FINISHED.has(r.outcome) && (structural || r.outcome !== 'time-exit');
  const ambiguous = r.outcome === 'ambiguous' || r.outcomeEvidence === 'ambiguous_bar' || r.evidence?.status === 'ambiguous';
  const pending = r.outcome === 'open' || (structural && ['registered', 'pending-entry', 'filled'].includes(r.execution?.state));
  const notEntered = r.outcome === 'not-entered' || (structural && ['missed-entry', 'expired-entry'].includes(r.execution?.state));
  if (!present(r.id)) absent('id');
  if (duplicate) issue('duplicate-id');
  if (!MARKETS.has(r.market)) absent('known-market');
  if (!Number.isFinite(created)) absent('createdAt');
  if (Number.isFinite(created) && Number.isFinite(now) && created > now) issue('created-after-audit');
  if (present(r.resolvedAt) && !Number.isFinite(resolved)) issue('invalid-resolvedAt');
  if (Number.isFinite(resolved) && Number.isFinite(created) && resolved <= created) issue('resolved-before-or-at-created');
  if (Number.isFinite(resolved) && Number.isFinite(now) && resolved > now) issue('resolved-after-audit');
  if (!present(currency)) absent('currency');
  if (!present(basis)) absent('price-basis');
  if (!present(r.strategyVersion)) absent('strategy-version');
  if (!present(r.source)) absent('source');
  if (present(r.score) && (!finite(r.score) || r.score < 0 || r.score > 100)) warnings.push('invalid-saved-score');
  if (!structural) {
    if (!positive(entry)) { present(entry) ? issue('invalid-entry') : absent('entry'); }
    if (!positive(r.stop)) { present(r.stop) ? issue('invalid-stop') : absent('stop'); }
    if (!positive(r.target)) { present(r.target) ? issue('invalid-target') : absent('target'); }
    if (positive(entry) && positive(r.stop) && positive(r.target) && !(r.stop < entry && entry < r.target)) issue('invalid-long-plan-levels');
  }
  if (closed || ambiguous) {
    if (!Number.isFinite(resolved)) absent('resolvedAt');
    if (!present(r.resolverVersion)) absent('resolver-version');
    if (structural ? !present(r.exitEvidence?.sourceSnapshotId) : !present(r.outcomeEvidence)) absent('outcome-evidence');
  }
  if (structural) {
    if (!present(r.sourceSnapshotId) || !present(r.sourceEvidence?.hash)) absent('decision-source-proof');
    if (!present(r.execution?.entryEvidence?.sourceSnapshotId)) absent('entry-source-proof');
    if (present(r.sourceEvidence?.currency) && present(currency) && currency !== r.sourceEvidence.currency) issue('currency-conflict');
    if (present(r.sourceEvidence?.priceBasis) && present(basis) && basis !== r.sourceEvidence.priceBasis) issue('price-basis-conflict');
    if (closed && r.execution?.state !== 'closed') issue('closed-outcome-execution-state-conflict');
    const filledAt = time(r.execution?.fillEffectiveAt);
    if (closed && (!Number.isFinite(filledAt) || filledAt <= created)) issue('invalid-fill-order');
    if (closed && Number.isFinite(filledAt) && Number.isFinite(resolved) && resolved < filledAt) issue('resolved-before-fill');
    if (closed && classifyRecord(r).category !== 'verified') absent('structural-contract-metadata');
  } else {
    if (!present(r.sourceSnapshotId) && !present(r.sourceEvidence?.hash)) absent('decision-source-proof');
    if (!present(r.entryEvidence)) absent('entry-source-proof');
  }
  if (pending && present(r.resolvedAt)) issue('pending-with-resolution');
  if (ambiguous && present(result)) issue('ambiguous-with-numeric-result');
  if (notEntered && present(result)) issue('not-entered-with-numeric-result');
  let arithmetic = 'not-applicable';
  if (closed && !ambiguous && !pending && !notEntered) {
    if (!positive(entry)) { present(entry) ? issue('invalid-entry') : absent('entry'); }
    if (!positive(exit)) { present(exit) ? issue('invalid-exit') : absent('exit'); }
    if (!finite(result)) { present(result) ? issue('invalid-result') : absent('result'); }
    arithmetic = positive(entry) && positive(exit) && finite(result) ? 'consistent' : 'untestable';
    // Legacy resolver stores one decimal. Half a tenth plus floating tolerance
    // is allowed, not an arbitrary percentage-point discrepancy.
    if (arithmetic === 'consistent' && Math.abs(result - (exit / entry - 1) * 100) > (structural ? 1e-8 : 0.05000001)) {
      issue('return-price-arithmetic-conflict'); arithmetic = 'inconsistent';
    }
    // Price direction avoids falsely rejecting a rounded 0.0% expired win.
    const directionalResult = positive(entry) && positive(exit) ? exit - entry : result;
    if (finite(directionalResult) && ((['target-hit', 'expired-win'].includes(r.outcome) && directionalResult <= 0) || (r.outcome === 'stop-hit' && directionalResult >= 0) || (r.outcome === 'expired-loss' && directionalResult > 0))) issue('outcome-return-sign-conflict');
    if (!structural && positive(exit) && ((r.outcome === 'target-hit' && positive(r.target) && Math.abs(exit - r.target) > Math.max(1, r.target) * 1e-8) || (r.outcome === 'stop-hit' && positive(r.stop) && Math.abs(exit - r.stop) > Math.max(1, r.stop) * 1e-8))) issue('outcome-exit-level-conflict');
  }
  if (structural && positive(entry) && positive(exit) && finite(r.netResultPct) && finite(r.plan?.costModel?.roundTrip)) {
    const cost = r.plan.costModel.roundTrip;
    if (cost < 0 || cost >= 1 || Math.abs(r.netResultPct - (exit / entry * (1 - cost / 2) ** 2 - 1) * 100) > 1e-8) issue('stored-net-arithmetic-conflict');
  }
  const essentialMissing = !present(r.id) || market === 'unknown' || !Number.isFinite(created) || (closed && (!Number.isFinite(resolved) || arithmetic === 'untestable'));
  let status = issues.length ? 'invalid' : ambiguous ? 'ambiguous' : notEntered ? 'not-entered' : pending ? 'pending' : !closed ? 'unknown' : essentialMissing ? 'incomplete' : result > 0 ? 'positive' : result < 0 ? 'negative' : 'zero';
  if (!issues.length && essentialMissing && ['pending', 'not-entered', 'ambiguous'].includes(status)) status = 'incomplete';
  const stop = structural ? r.plan?.stop : r.stop, target = structural ? r.plan?.target : r.target;
  // A filled structural record uses its saved paper fill. An unfilled entry
  // zone is never replaced by a midpoint or by today's market quote.
  const planKnown = !issues.length && present(r.id) && market !== 'unknown' && Number.isFinite(created) && positive(entry) && positive(stop) && positive(target) && stop < entry && target > entry;
  const metadataPresent = closed && (structural ? present(r.resolverVersion) && present(r.exitEvidence?.sourceSnapshotId) : present(r.resolverVersion) && present(r.outcomeEvidence));
  return {
    cohort, market, status, recordedOutcome: ['open', ...FINISHED, 'ambiguous', 'not-entered'].includes(r.outcome) ? r.outcome : 'unknown',
    issues: [...new Set(issues)], missing: [...new Set(missing)], warnings, arithmetic, closed, metadataPresent,
    scoreBucket: scoreBucket(r.score), createdDate: savedDate(r.createdAt),
    result: ['positive', 'negative', 'zero'].includes(status) ? result : null,
    hasCurrency: present(currency), hasPriceBasis: present(basis),
    plan: planKnown ? { rewardPct: (target / entry - 1) * 100, riskPct: (1 - stop / entry) * 100, rewardRiskRatio: (target - entry) / (entry - stop), basis: structural ? 'saved-paper-fill' : 'saved-nominal-entry' } : null,
  };
}
function counts(rows, fn) {
  const result = {};
  for (const row of rows) { const key = fn(row); result[key] = (result[key] || 0) + 1; }
  return result;
}
function summarize(rows) {
  const values = rows.map(r => r.result).filter(finite), gains = values.filter(v => v > 0), losses = values.filter(v => v < 0);
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  const plans = rows.map(r => r.plan).filter(Boolean);
  const dates = counts(rows, r => r.createdDate), knownDays = Object.entries(dates).filter(([d]) => d !== 'unknown');
  const peak = knownDays.length ? Math.max(...knownDays.map(([, n]) => n)) : 0;
  const issues = {}, missing = {}, warnings = {};
  for (const row of rows) {
    for (const key of row.issues) issues[key] = (issues[key] || 0) + 1;
    for (const key of row.missing) missing[key] = (missing[key] || 0) + 1;
    for (const key of row.warnings) warnings[key] = (warnings[key] || 0) + 1;
  }
  return {
    total: rows.length, recordedOutcomes: counts(rows, r => r.recordedOutcome),
    outcomePartition: Object.fromEntries(STATUSES.map(s => [s, rows.filter(r => r.status === s).length])),
    rawResult: {
      label: 'Unweighted saved gross prediction result; arithmetic-consistent subset; execution unverified; not a portfolio return',
      sampleSize: values.length, excluded: rows.length - values.length, closedExcluded: rows.filter(r => r.closed && r.result == null).length,
      meanPct: mean(values), medianPct: values.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : null,
      positiveCount: gains.length, negativeCount: losses.length, zeroCount: values.filter(x => x === 0).length,
      positiveSharePct: values.length ? gains.length / values.length * 100 : null,
      avgPositiveMagnitudePct: mean(gains), avgNegativeMagnitudePct: losses.length ? -mean(losses) : null,
      descriptivePayoffMagnitudeRatio: gains.length && losses.length ? mean(gains) / -mean(losses) : null,
      unknownCurrencyCount: rows.filter(r => r.result != null && !r.hasCurrency).length,
      unknownPriceBasisCount: rows.filter(r => r.result != null && !r.hasPriceBasis).length,
    },
    evidence: {
      closedRecords: rows.filter(r => r.closed).length,
      closedWithOutcomeAndResolverMetadata: rows.filter(r => r.metadataPresent).length,
      metadataIsExecutionVerification: false, independentlyVerifiedExecutions: null,
      independentVerificationReason: 'Frozen source documents, fill sequence and execution receipts have not been independently inspected by this audit',
      arithmetic: counts(rows, r => r.arithmetic), issueCounts: issues, missingFieldCounts: missing, warningCounts: warnings,
    },
    savedLongPlan: {
      label: 'Nominal saved target/stop geometry; not an executed risk ratio or strategy expectancy; no entry inferred',
      knownCount: plans.length, unknownOrExcludedCount: rows.length - plans.length, basisCounts: counts(plans, p => p.basis),
      avgRewardPct: mean(plans.map(p => p.rewardPct)), avgRiskPct: mean(plans.map(p => p.riskPct)), avgRewardRiskRatio: mean(plans.map(p => p.rewardRiskRatio)),
    },
    createdDateConcentration: {
      basis: 'Saved createdAt date prefix, not trade date or inferred exchange date', byDate: dates,
      knownDistinctDays: knownDays.length, unknownDateCount: dates.unknown || 0,
      largestDayCount: peak, largestDayShareOfAllPct: rows.length ? peak / rows.length * 100 : null,
    },
  };
}
function grouped(rows, getKey, fixedKeys = []) {
  return Object.fromEntries([...new Set([...fixedKeys, ...rows.map(getKey)])].sort().map(key => [key, summarize(rows.filter(r => getKey(r) === key))]));
}
function buildLossAudit(journal, { auditedAt = new Date().toISOString(), snapshot = null, inputMode = 'supplied-journal' } = {}) {
  if (!journal || !Array.isArray(journal.predictions)) throw new Error('Journal must contain a predictions array; missing data is not an empty audit');
  if (!Number.isFinite(time(auditedAt))) throw new Error('A valid audit timestamp is required');
  const identifiers = new Map();
  for (const r of journal.predictions) if (r && present(r.id)) identifiers.set(r.id, (identifiers.get(r.id) || 0) + 1);
  const rows = journal.predictions.map(r => diagnoseRecord(r, { duplicate: (identifiers.get(r?.id) || 0) > 1, auditedAt }));
  const duplicateGroups = [...identifiers.values()].filter(n => n > 1);
  const cohorts = grouped(rows, r => r.cohort, COHORTS);
  for (const [cohort, summary] of Object.entries(cohorts)) {
    const selected = rows.filter(r => r.cohort === cohort);
    summary.byMarket = grouped(selected, r => r.market, ['bist', 'us', 'crypto', 'unknown']);
    summary.byScoreBucket = grouped(selected, r => r.scoreBucket);
  }
  const snapshotCoverage = snapshot ? {
    present: true, generatedAt: Number.isFinite(time(snapshot.generatedAt)) ? snapshot.generatedAt : null,
    marketAssetCounts: Object.fromEntries(['bist', 'us', 'crypto'].map(m => [m, Array.isArray(snapshot[m]) ? snapshot[m].length : null])),
    use: 'Current coverage context only; not used for past entries, features, indicators, outcomes or market attribution',
  } : { present: false, use: 'Not supplied; no current data inferred' };
  const allRecords = summarize(rows);
  // Global counts remain useful inventory. Incompatible cohorts must not be
  // pooled into an apparent strategy/transaction performance statistic.
  const mixedCohorts = new Set(rows.map(r => r.cohort)).size > 1;
  allRecords.rawResult.mixedCohorts = mixedCohorts;
  if (mixedCohorts) {
    for (const key of ['meanPct', 'medianPct', 'positiveSharePct', 'avgPositiveMagnitudePct', 'avgNegativeMagnitudePct', 'descriptivePayoffMagnitudeRatio']) allRecords.rawResult[key] = null;
    for (const key of ['avgRewardPct', 'avgRiskPct', 'avgRewardRiskRatio']) allRecords.savedLongPlan[key] = null;
    allRecords.rawResult.reason = 'Cross-cohort inventory only; averages and ratios suppressed. Inspect each cohort separately.';
  }
  return {
    schemaVersion: 1, auditedAt, inputMode,
    methodology: {
      readOnly: true, aggregateOnly: true, cohortPartition: COHORTS,
      unit: 'saved prediction record', independentExecutionVerification: false,
      returnMeaning: 'Unweighted stored gross record result, never net realized portfolio return',
      missingEvidencePolicy: 'Unknown fields remain unknown. No current snapshot or guessed trade fills repair historical records.',
      arithmeticTolerancePct: { legacy: 0.05000001, structural: 1e-8 },
      associationPolicy: 'Market, saved score and date comparisons are descriptive associations, not causal loss explanations or tuning prescriptions',
      unknownInputs: ['position size', 'capital allocation', 'actual execution', 'actual fees/slippage', 'decision-time indicators when not frozen', 'independently verified historical source bars'],
    },
    inventory: { totalRows: rows.length, distinctPresentIds: identifiers.size, missingIdRows: rows.filter(r => r.missing.includes('id')).length,
      duplicateIdGroups: duplicateGroups.length, duplicateIdRows: duplicateGroups.reduce((a, b) => a + b, 0), duplicatesExcludedFromResults: true },
    allRecords, cohorts, snapshotCoverage,
    nextEvidenceNeeded: [
      'Freeze and inspect the historical source snapshot referenced at each decision and resolution.',
      'Verify currency and adjusted/unadjusted price basis; never infer them from market membership.',
      'Verify eligibility, entry observation, exit ordering and same-bar target/stop ambiguity.',
      'Obtain position size, allocation and actual costs before any realized portfolio performance claim.',
      'Compare sufficiently sized cohorts with out-of-time validation before changing thresholds or training.',
    ],
  };
}
function formatNumber(value) { return finite(value) ? value.toFixed(4) : 'bilinmiyor'; }
function renderLossAuditMarkdown(report) {
  const lines = ['# Kayıp ve kanıt denetimi', '', `Denetim: ${report.auditedAt}`, '',
    'Bu rapor kayıtları değiştirmez. Kaydedilmiş sonuçların aritmetik tutarlılığını ve kanıt boşluklarını inceler. Gerçek veya sanal işlemin bağımsız olarak doğrulandığı iddia edilmez.', '',
    `Toplam ${report.inventory.totalRows} satır; ${report.inventory.distinctPresentIds} ayrı dolu kimlik; ${report.inventory.duplicateIdGroups} yinelenen kimlik grubu. Yinelenen kimliğin bütün satırları sonuç ortalamasından dışlandı.`, '',
    'Ortalamalar eşit ağırlıklı kaydedilmiş brüt tahmin sonucudur; net veya gerçekleşmiş portföy getirisi değildir. Pozisyon büyüklüğü, sermaye tahsisi ve gerçekleşmiş masraf bilgisi bilinmiyor.', '',
    '| Kohort / piyasa | Kayıt | Pozitif | Negatif | Bekleyen | Belirsiz | Geçersiz | Eksik | Sonuç örneklemi | Ham ortalama % |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const cohort of COHORTS) {
    for (const market of ['bist', 'us', 'crypto', 'unknown']) {
      const s = report.cohorts[cohort].byMarket[market];
      if (!s.total) continue;
      const p = s.outcomePartition;
      lines.push(`| ${cohort} / ${market} | ${s.total} | ${p.positive} | ${p.negative} | ${p.pending} | ${p.ambiguous} | ${p.invalid} | ${p.incomplete} | ${s.rawResult.sampleSize} | ${formatNumber(s.rawResult.meanPct)} |`);
    }
  }
  lines.push('', 'Sonuç sınıfları birbirini dışlar; sıfır, giriş yapılmayan ve bilinmeyen sonuçlar JSON raporunda ayrıca bulunur. Eksik fiyat/zaman veya çelişkili sonuçlar ortalamaya girmez.', '',
    'Karar anında kaydedilmiş skor aralıkları ve tarih yoğunluğu JSON raporunda her kohort için ayrıdır. Gün bilgisi createdAt alanının tarih kısmıdır; gerçekleşmiş işlem günü değildir. Küçük örneklem ve tek güne yığılma genellemeyi zayıflatır.', '',
    'Pozitif/negatif sonuç büyüklüğü oranı yalnız betimseldir. Kaydedilmiş hedef/stop geometrisi işlem öncesi nominal plandır; işlem gerçekleşmesi, strateji beklentisi veya nedensel kayıp açıklaması değildir. Eksik giriş fiyatı tahmin edilmez.', '',
    'Kanıt alanlarının varlığı doğrulanmış işlem sayılmaz. Güncel snapshot sadece kapsam bilgisi verir; geçmiş fiyat, gösterge, karar koşulu veya kaybın nedeni buradan türetilmez.', '',
    '## Piyasa bazında sonuç büyüklüğü', '',
    '| Kohort / piyasa | Pozitif n / ort. % | Negatif n / büyüklük % | Betimsel büyüklük oranı | Bilinen plan n / nominal hedef-risk oranı |',
    '|---|---:|---:|---:|---:|');
  for (const cohort of COHORTS) for (const market of ['bist', 'us', 'crypto', 'unknown']) {
    const s = report.cohorts[cohort].byMarket[market]; if (!s.total) continue;
    const raw = s.rawResult, plan = s.savedLongPlan;
    lines.push(`| ${cohort} / ${market} | ${raw.positiveCount} / ${formatNumber(raw.avgPositiveMagnitudePct)} | ${raw.negativeCount} / ${formatNumber(raw.avgNegativeMagnitudePct)} | ${formatNumber(raw.descriptivePayoffMagnitudeRatio)} | ${plan.knownCount} / ${formatNumber(plan.avgRewardRiskRatio)} |`);
  }
  lines.push('', 'Bu büyüklükler geçmiş kaydedilmiş sonuç altkümesini betimler; örneklem sayısı olmadan yorumlanmamalıdır. Bir piyasanın kaybı RSI, makro koşul veya belirli göstergeden kaynaklandı sonucuna varılamaz.', '', '## Kanıt kapsamı', '');
  for (const cohort of COHORTS) {
    const s = report.cohorts[cohort]; if (!s.total) continue;
    lines.push(`- ${cohort}: ${s.evidence.closedRecords} tanınan kapalı sonuç; ${s.evidence.closedWithOutcomeAndResolverMetadata} kayıtta sonuç/çözümleyici metadata alanları. Bağımsız doğrulanmış işlem sayısı bilinmiyor.`);
    for (const [field, n] of Object.entries(s.evidence.missingFieldCounts).sort()) lines.push(`  - Eksik ${field}: ${n}.`);
    for (const [issue, n] of Object.entries(s.evidence.issueCounts).sort()) lines.push(`  - Çelişki ${issue}: ${n}.`);
    for (const [warning, n] of Object.entries(s.evidence.warningCounts).sort()) lines.push(`  - Tanısal uyarı ${warning}: ${n}.`);
  }
  lines.push('', '## Sonraki inceleme', '', ...report.nextEvidenceNeeded.map(x => '- ' + x), '');
  return lines.join('\n');
}
module.exports = { buildLossAudit, diagnoseRecord, renderLossAuditMarkdown, cohortOf, scoreBucket };
