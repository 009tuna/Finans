'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const macro = require('../public/macro');

const ids = ['us_cpi_headline_mom_sa', 'us_cpi_core_mom_sa', 'us_cpi_headline_yoy_nsa', 'us_cpi_core_yoy_nsa'];
const family = {
  family: 'us_cpi',
  nextEvent: { eventId: 'us_cpi:2026-09', period: '2026-09', scheduledAt: '2026-10-14T12:30:00Z' },
  events: [], sourceStatus: { status: 'partial', checkedAt: '2026-10-01T10:00:00Z' },
  metrics: ids.map((metric, index) => ({
    metric, unit: 'percent', label: metric, adjustment: index < 2 ? 'seasonally_adjusted' : 'not_seasonally_adjusted', frequency: index < 2 ? 'monthly' : 'annual',
    previousFirstRelease: { period: '2026-08', value: index + 1, publishedAt: '2026-09-11T12:30:00Z', observedAt: '2026-09-11T12:31:00Z', sourceUrl: 'https://www.bls.gov/cpi/', contentHash: 'hash-' + index },
    forecasts: [{ eventId: 'us_cpi:2026-09', metric, unit: 'percent', period: '2026-09', status: 'frozen', methodId: 'last_first_release_v1', estimate: index + 1.1, rationale: 'Baseline', sourceUrl: 'https://example.com/forecast-' + index }],
    outcomes: [], scorecards: [{ methodId: 'last_first_release_v1', n: index, mae: index ? 0.2 : null }],
    consensus: index === 0 ? { eventId: 'us_cpi:2026-09', metric, unit: 'percent', period: '2026-09', value: 0.2, sourceUrl: 'https://example.com/consensus' } : null,
    consensusStatus: { status: index === 0 ? 'available' : 'not_connected' }, modelForecasts: index === 1 ? [{ eventId: 'us_cpi:2026-09', metric, unit: 'percent', period: '2026-09', pointEstimate: 0.3, sourceUrl: 'https://example.com/model' }] : [],
  })),
};

const panel = macro.renderMacro({ families: { us_cpi: family } }, '', Date.parse('2026-10-01T00:00:00Z'), true, { family: 'us_cpi' });
assert.match(panel, /İstihdam[\s\S]*Enflasyon/);
assert.match(panel, /ABD enflasyon[\s\S]*Eylül 2026[\s\S]*15:30/);
assert.equal((panel.match(/<tr><th scope="row"/g) || []).length, 4, 'CPI is rendered as four compact metric rows');
assert.match(panel, /Önceki ilk açıklama[\s\S]*Kaynağı aç/);
assert.match(panel, /Konsensüs[\s\S]*0,2%/);
assert.match(panel, /Model[\s\S]*0,3%/);
assert.match(panel, /<th scope="col" aria-label="İlk model tahmini">İlk model tahmini<\/th>/);
assert.match(panel, /<td><b>0,3%<\/b><\/td>/);
assert.doesNotMatch(panel, /<td><span>İlk model tahmini<\/span><b>/, 'model meaning is carried by the table header once');
assert.match(panel, /Kayıt yok/);
assert.match(panel, /n=0|Yeterli örnek yok/);
assert.doesNotMatch(panel, />0%<[^]*?Konsensüs/, 'missing consensus does not become numeric zero');
assert.match(panel, /Kaynak ve kanıt ·/);

const missing = macro.renderMacro({ families: {} }, '', Date.now(), false, { family: 'us_cpi' });
assert.match(missing, /Enflasyon · kaynak bekleniyor[\s\S]*Enflasyon kaynak ailesi mevcut değil/);
assert.doesNotMatch(missing, /disabled/);

const defaultView = macro.renderMacro({ families: { us_cpi: family } }, '', Date.now());
assert.match(defaultView, /data-macro-family="us_nfp"/);
assert.doesNotMatch(defaultView, /class="macro-cpi-table"/, 'NFP remains the default even when CPI data exists');
const failedRefresh = macro.renderMacro({ families: { us_cpi: family } }, 'Yenileme başarısız.', Date.now(), true, { family: 'us_cpi' });
assert.match(failedRefresh, /mevcut kayıt korunuyor/);
assert.match(failedRefresh, /data-macro-retry/);
assert.match(failedRefresh, /1,1%/, 'last successful method estimate remains visible');

const mismatched = structuredClone(family);
for (const metric of mismatched.metrics) {
  metric.forecasts = [{ ...metric.forecasts[0], period: '2026-07', eventId: 'us_cpi:2026-07', estimate: 99.99, rationale: 'obsolete-special-proof' }];
  metric.previousFirstRelease = { ...metric.previousFirstRelease, period: '2026-10', value: 88.88 };
  metric.modelForecasts = [{ pointEstimate: 77.77 }];
  metric.consensus = { metric: metric.metric, unit: 'percent', period: '2026-08', eventId: 'us_cpi:2026-08', value: 66.66 };
}
const mismatchHtml = macro.renderCpi(mismatched);
assert.doesNotMatch(mismatchHtml, /99,99|88,88|77,77|66,66|obsolete-special-proof/, 'wrong-event and untyped numbers cannot appear as current estimates');

const sample = structuredClone(family);
sample.metrics[0].scorecards = [{ methodId: 'last_first_release_v1', sampleSize: 3, mae: 0.15 }];
assert.match(macro.renderCpi(sample), /n=3[\s\S]*0,15 yüzde puan/);
const initial = macro.renderCpi({ sourceStatus: { status: 'not_initialized' }, metrics: family.metrics });
assert.match(initial, /Enflasyon kaynakları henüz alınmadı/);
assert.doesNotMatch(initial, /class="macro-cpi-table"/);
assert.match(panel, /role="tabpanel" aria-labelledby="macro-tab-us-cpi"/);
assert.match(panel, /aria-controls="macro-panel-us-cpi" tabindex="0"/);
const resolved = structuredClone(family);
resolved.metrics[0].forecasts[0].id = 'baseline-first';
resolved.observations = [{ id: 'first-actual', period: '2026-09', publishedAt: '2026-10-14T12:30:00Z', sourceUrl: 'https://www.bls.gov/news.release/archives/cpi_10142026.htm' }];
resolved.metrics[0].outcomes = [{ metric: ids[0], unit: 'percent', actual: 0.2, error: -0.1, actualId: 'first-actual', forecastId: 'baseline-first', resolvedAt: '2026-10-14T12:31:00Z', contested: true }];
const outcomeHtml = macro.renderCpi(resolved);
assert.match(outcomeHtml, /İlk sonuç · Manşet · aylık/);
assert.match(outcomeHtml, /-0,1 yüzde puan/);
assert.match(outcomeHtml, /Kanıt çelişkili; puanlama dışı/);

const css = fs.readFileSync(require.resolve('../public/macro.css'), 'utf8');
assert.match(css, /macro-cpi-table/);
assert.match(css, /\.macro-cpi-table caption\.sr-only \{ position: absolute;/);
assert.match(css, /macro-cpi-table thead th:nth-child\(4\) \{ width: 15%; \}/);
assert.match(css, /@media\s*\(max-width:\s*979px\)[\s\S]*macro-family-tabs button/);

console.log('CPI UI rendering and missing-source tests passed');
