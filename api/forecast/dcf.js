// POST /api/forecast/dcf — DCF / Graham / DDM değerleme modelleri
'use strict';

const { calculateDCF, calculateGraham, calculateDDM } = require('../../src/forecast');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const params = req.body;
    let result;

    if (params.modelType === 'graham') {
      result = calculateGraham(params);
    } else if (params.modelType === 'ddm') {
      result = calculateDDM(params);
    } else {
      result = calculateDCF(params);
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(result);
  } catch (e) {
    console.error('[api/forecast/dcf] hata:', e.message);
    res.status(400).json({ error: (e && e.message) || 'Değerleme hatası' });
  }
};
