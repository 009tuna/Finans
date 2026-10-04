// Piyasa-başı tahmini işlem maliyeti modeli.
// 3 derin araştırma raporunun (2026) sentezi: açık komisyon + spread + slippage
// (+ kripto için ortalama funding/işlem payı) kabaca dahil. Round-trip = gidiş-dönüş.
// Değerler kasıtlı olarak muhafazakâr ve TEK YERDE ayarlanabilir.
//   US:     ~%0.10 (komisyon ~0 ama PFOF/slippage/spread)
//   BIST:   ~%0.40 (komisyon + BSMV + borsa/takas payı + spread; T+2 fırsat maliyeti hariç)
//   Kripto: ~%0.20 (maker/taker + spread; funding hariç, o pozisyon süresine bağlı)
'use strict';

const ROUND_TRIP = { us: 0.001, bist: 0.004, crypto: 0.002 };

function roundTripCost(market) {
  const m = String(market || '').toLowerCase();
  return ROUND_TRIP[m] != null ? ROUND_TRIP[m] : 0.002;
}

function oneWayCost(market) {
  return roundTripCost(market) / 2;
}

/**
 * Maliyet kapısı: beklenen brüt hareket (%), round-trip maliyetin en az 2 katı mı?
 * Raporların ortak kuralı: "hedef hareket ≥ 2–3× maliyet değilse işlem alma."
 * @param {string} market
 * @param {number} rewardPct - beklenen hareket yüzdesi (örn. hedef/giriş-1)*100
 */
function costGate(market, rewardPct) {
  const rt = roundTripCost(market) * 100; // %
  const ratio = rt > 0 && rewardPct != null ? rewardPct / rt : null;
  return {
    costPct: Math.round(rt * 1000) / 1000,
    rewardPct: rewardPct != null ? Math.round(rewardPct * 100) / 100 : null,
    ratio: ratio != null ? Math.round(ratio * 100) / 100 : null,
    pass: ratio != null ? ratio >= 2 : null,
  };
}

module.exports = { ROUND_TRIP, roundTripCost, oneWayCost, costGate };
