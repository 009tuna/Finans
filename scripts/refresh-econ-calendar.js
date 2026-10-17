// Ekonomik veri takvimini yeniler ve api_cache'e yazar (beklenti, önceki, gerçekleşen).
'use strict';
try { require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') }); } catch (_) {}
const { buildEconomicCalendar } = require('../src/econ-calendar-source');

buildEconomicCalendar().then((payload) => {
  const released = payload.events.filter((event) => event.actual).length;
  console.log('Ekonomik takvim: ' + payload.events.length + ' olay, ' + released + ' gerçekleşen · durum ' + payload.coverage.status);
}).catch((err) => { console.error('Ekonomik takvim yenilenemedi:', err.message); process.exitCode = 1; });
