const assert = require('assert');
const fs = require('fs');
const path = require('path');

function calcPortfolioTotals({ data, portfolioData, usdtry = 33.5 }) {
  let totalValueUSD = 0;
  let totalValueTRY = 0;
  let totalPnLUSD = 0;
  let totalPnLTRY = 0;

  const findAssetData = (sym, market) => {
    const list = data[market] || [];
    return list.find((x) => x.symbol === sym || (market === 'crypto' && x.id === sym));
  };

  const processAsset = (h, market, cur) => {
    const asset = findAssetData(h.symbol, market);
    if (!asset) return;
    const value = h.amount * (asset.price || 0);
    const cost = h.amount * h.avgPrice;
    const pnl = value - cost;
    if (cur === 'USD') {
      totalValueUSD += value;
      totalPnLUSD += pnl;
    } else {
      totalValueTRY += value;
      totalPnLTRY += pnl;
    }
  };

  (portfolioData.us || []).forEach((h) => processAsset(h, 'us', 'USD'));
  (portfolioData.crypto || []).forEach((h) => processAsset(h, 'crypto', 'USD'));
  (portfolioData.bist || []).forEach((h) => processAsset(h, 'bist', 'TRY'));

  const finalValueUSD = totalValueUSD + totalValueTRY / usdtry;
  const finalPnLUSD = totalPnLUSD + totalPnLTRY / usdtry;
  const finalPnLTRY = totalPnLUSD * usdtry + totalPnLTRY;
  return { finalValueUSD, finalPnLUSD, finalPnLTRY };
}

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'latest.json'), 'utf8'));
const portfolioData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'portfolio.json'), 'utf8'));
const totals = calcPortfolioTotals({ data, portfolioData });
assert.equal(Number.isFinite(totals.finalValueUSD), true);
assert.equal(Number.isFinite(totals.finalPnLUSD), true);
assert.equal(Number.isFinite(totals.finalPnLTRY), true);

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
assert.match(html, /id="backtest-trades-body"/);
assert.match(html, /vendor\/lightweight-charts\.standalone\.production\.js/);
assert.match(html, /id="dailyDigest"/);
assert.match(html, /id="overviewBriefing"/);
assert.doesNotMatch(html, /id="overviewRoutes"/);
assert.match(html, /class="overview-advanced/);
assert.match(html, /id="cfoDecisionCockpit"/);
assert.ok(html.indexOf('id="overview-panel-decisions"') < html.indexOf('id="cfoDecisionCockpit"'));
assert.ok(html.indexOf('id="overview-panel-forecasts"') < html.indexOf('id="morningExpectations"'), 'beklenti kartı kendi sekmesinde durur; ilk adayları ekran altına itmez');
assert.match(html, /id="predictionScorecard"/);
assert.match(html, /id="decisionLearningPanel"/);
assert.match(html, /id="signalOverlayPanel"/);
assert.match(html, /id="ideaFunnel"/);
assert.match(html, /id="catalystCalendar"/);
assert.match(html, /id="portfolioActions"/);
assert.match(html, /id="portfolioRiskPlan"/);
assert.match(html, /action-layer\.js/);
assert.match(html, /class="[^"]*trading-desk/);
assert.match(html, /id="navToggle"/);
assert.match(html, /id="navBackdrop"/);
assert.match(html, /id="navClose"/);
assert.match(html, /class="appearance-menu"/);
assert.match(html, /class="market-workspace"/);
assert.match(html, /class="market-list-pane"/);
assert.match(html, /class="market-detail-pane"/);
assert.match(html, /id="marketSearch"/);
assert.match(html, /id="backtest-story"/);
assert.match(html, /<th>Gerekçe<\/th>/);
assert.match(html, /<th>Net getiri %<\/th>/);
assert.match(html, /<section class="view" id="view-literacy"/);
assert.ok(html.indexOf('id="backtest-trades-body"') < html.indexOf('id="view-literacy"'));

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.match(server, /\/api\/chart/);

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
assert.match(app, /loadJournal/);
assert.match(app, /saveJournal/);
assert.match(app, /asset-note-form/);
assert.match(app, /alert-toggle-form/);
assert.match(app, /renderPredictionScorecard/);
assert.match(app, /renderOverviewBriefing/);
assert.doesNotMatch(app, /renderOverviewRoutes\(\);/);
assert.match(app, /renderDecisionLearningPanel/);
assert.match(app, /renderCfoDecisionCockpit/);
assert.match(app, /renderSignalOverlayPanel/);
assert.match(app, /assetSignalOverlayCard/);
assert.match(app, /assetLearningCard/);
assert.match(app, /reportSignalOverlayHtml/);
assert.match(app, /renderIdeaFunnel/);
assert.match(app, /renderCatalystCalendar/);
assert.match(app, /renderPortfolioRiskPlan/);
assert.match(app, /assetResearchCard/);
assert.match(app, /buildInvestmentCommitteeMemo/);
assert.match(app, /committee-memo-card/);
assert.match(app, /function openNavigation/);
assert.match(app, /assetDeskRequest/);
assert.match(app, /marketUi/);
assert.match(app, /report-toc/);
assert.match(app, /document\.documentElement\.dataset\.theme = theme/);
assert.match(html, /localStorage\.getItem\('finans-theme'\)/);

console.log('ui contract tests passed');
