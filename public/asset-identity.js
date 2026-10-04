// Local, verified brand assets. Missing identities fall back to the symbol, never a guessed URL.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FinansAssetIdentity = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const LOGOS = {
  "bist:AEFES": {
    "name": "ANADOLU EFES BİRACILIK VE MALT SANAYİİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-aefes.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-AEFES/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:AGHOL": {
    "name": "AG ANADOLU GRUBU HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-aghol.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-AGHOL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:AKSA": {
    "name": "AKSA AKRİLİK KİMYA SANAYİİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-aksa.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-AKSA/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:AKSEN": {
    "name": "AKSA ENERJİ ÜRETİM A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-aksen.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-AKSEN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ALARK": {
    "name": "ALARKO HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-alark.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ALARK/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ALTNY": {
    "name": "Altinay Savunma Teknolojileri A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-altny.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ALTNY/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ANSGR": {
    "name": "ANADOLU ANONİM TÜRK SİGORTA ŞİRKETİ",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ansgr.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ANSGR/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ARCLK": {
    "name": "ARÇELİK A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-arclk.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ARCLK/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ASELS": {
    "name": "ASELSAN ELEKTRONİK SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-asels.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ASELS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ASTOR": {
    "name": "ASTOR ENERJİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-astor.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ASTOR/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:BALSU": {
    "name": "Balsu Gida Sanayi ve Ticaret Anonim Sirketi",
    "id": null,
    "localPath": "/assets/asset-logos/bist-balsu.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-BALSU/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:BERA": {
    "name": "BERA HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-bera.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-BERA/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:BIMAS": {
    "name": "BİM BİRLEŞİK MAĞAZALAR A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-bimas.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-BIMAS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:BRSAN": {
    "name": "BORUSAN MANNESMANN BORU SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-brsan.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-BRSAN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:BRYAT": {
    "name": "BORUSAN YATIRIM VE PAZARLAMA A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-bryat.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-BRYAT/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:BSOKE": {
    "name": "BATISÖKE SÖKE ÇİMENTO SANAYİİ T.A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-bsoke.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-BSOKE/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:BTCIM": {
    "name": "BATIÇİM BATI ANADOLU ÇİMENTO SANAYİİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-btcim.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-BTCIM/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:CANTE": {
    "name": "ÇAN2 TERMİK A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-cante.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-CANTE/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:CCOLA": {
    "name": "COCA-COLA İÇECEK A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ccola.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-CCOLA/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:CIMSA": {
    "name": "ÇİMSA ÇİMENTO SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-cimsa.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-CIMSA/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:CVKMD": {
    "name": "CVK MADEN İŞLETMELERİ SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-cvkmd.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-CVKMD/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:CWENE": {
    "name": "CW ENERJİ MÜHENDİSLİK TİCARET VE SANAYİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-cwene.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-CWENE/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:DAPGM": {
    "name": "DAP GAYRİMENKUL GELİŞTİRME A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-dapgm.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-DAPGM/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:DOAS": {
    "name": "DOĞUŞ OTOMOTİV SERVİS VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-doas.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-DOAS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:DOHOL": {
    "name": "DOĞAN ŞİRKETLER GRUBU HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-dohol.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-DOHOL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:DSTKF": {
    "name": "DESTEK FAKTORİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-dstkf.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-DSTKF/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ECILC": {
    "name": "EİS ECZACIBAŞI İLAÇ SINAİ VE FİNANSAL YATIRIMLAR SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ecilc.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ECILC/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:EFOR": {
    "name": "Efor Yatirim Sanayi Ticaret A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-efor.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-EFOR/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:EKGYO": {
    "name": "EMLAK KONUT GAYRİMENKUL YATIRIM ORTAKLIĞI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ekgyo.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-EKGYO/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ENERY": {
    "name": "Enerya Enerji A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-enery.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ENERY/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ENJSA": {
    "name": "ENERJİSA ENERJİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-enjsa.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ENJSA/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ENKAI": {
    "name": "ENKA İNŞAAT VE SANAYİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-enkai.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ENKAI/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:EREGL": {
    "name": "EREĞLİ DEMİR VE ÇELİK FABRİKALARI T.A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-eregl.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-EREGL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:EUPWR": {
    "name": "EUROPOWER ENERJİ VE OTOMASYON TEKNOLOJİLERİ SANAYİ TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-eupwr.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-EUPWR/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:EUREN": {
    "name": "EUROPEN ENDÜSTRİ İNŞAAT SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-euren.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-EUREN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:FENER": {
    "name": "FENERBAHÇE FUTBOL A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-fener.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-FENER/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:FROTO": {
    "name": "FORD OTOMOTİV SANAYİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-froto.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-FROTO/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:GARAN": {
    "name": "TÜRKİYE GARANTİ BANKASI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-garan.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-GARAN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:GENIL": {
    "name": "GEN İLAÇ VE SAĞLIK ÜRÜNLERİ SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-genil.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-GENIL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:GESAN": {
    "name": "GİRİŞİM ELEKTRİK SANAYİ TAAHHÜT VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-gesan.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-GESAN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:GLRMK": {
    "name": "Gulermak Agir Sanayi Insaat Ve Taahhut A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-glrmk.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-GLRMK/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:GRSEL": {
    "name": "GÜR-SEL TURİZM TAŞIMACILIK VE SERVİS TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-grsel.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-GRSEL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:GRTHO": {
    "name": "Grainturk Holding A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-grtho.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-GRTHO/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:GSRAY": {
    "name": "GALATASARAY SPORTİF SINAİ VE TİCARİ YATIRIMLAR A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-gsray.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-GSRAY/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:GUBRF": {
    "name": "GÜBRE FABRİKALARI T.A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-gubrf.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-GUBRF/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:HALKB": {
    "name": "TÜRKİYE HALK BANKASI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-halkb.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-HALKB/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:HEKTS": {
    "name": "HEKTAŞ TİCARET T.A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-hekts.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-HEKTS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ISCTR": {
    "name": "TÜRKİYE İŞ BANKASI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-isctr.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ISCTR/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ISMEN": {
    "name": "İŞ YATIRIM MENKUL DEĞERLER A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ismen.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ISMEN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:IZENR": {
    "name": "Izdemir Enerji Elektrik Uretim A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-izenr.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-IZENR/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:KCHOL": {
    "name": "KOÇ HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-kchol.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-KCHOL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:KLRHO": {
    "name": "KİLER HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-klrho.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-KLRHO/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:KRDMD": {
    "name": "KARDEMİR KARABÜK DEMİR ÇELİK SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-krdmd.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-KRDMD/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:KTLEV": {
    "name": "KATILIMEVIM TASARRUF FINANSMAN A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ktlev.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-KTLEV/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:KUYAS": {
    "name": "KUYAŞ YATIRIM A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-kuyas.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-KUYAS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:MAGEN": {
    "name": "MARGÜN ENERJİ ÜRETİM SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-magen.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-MAGEN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:MAVI": {
    "name": "MAVİ GİYİM SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-mavi.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-MAVI/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:MGROS": {
    "name": "MİGROS TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-mgros.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-MGROS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:MIATK": {
    "name": "MİA TEKNOLOJİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-miatk.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-MIATK/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:MPARK": {
    "name": "MLP SAĞLIK HİZMETLERİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-mpark.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-MPARK/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:OBAMS": {
    "name": "Oba Makarnacilik Sanayi Ve Ticaret A. S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-obams.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-OBAMS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ODAS": {
    "name": "ODAŞ ELEKTRİK ÜRETİM SANAYİ TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-odas.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ODAS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:OTKAR": {
    "name": "OTOKAR OTOMOTİV VE SAVUNMA SANAYİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-otkar.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-OTKAR/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:OYAKC": {
    "name": "OYAK ÇİMENTO FABRİKALARI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-oyakc.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-OYAKC/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:PAHOL": {
    "name": "PASIFIK HOLDING A.S",
    "id": null,
    "localPath": "/assets/asset-logos/bist-pahol.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-PAHOL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:PASEU": {
    "name": "Pasifik Eurasia Lojistik dis Ticaret AS",
    "id": null,
    "localPath": "/assets/asset-logos/bist-paseu.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-PASEU/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:PATEK": {
    "name": "Pasifik Teknoloji AS",
    "id": null,
    "localPath": "/assets/asset-logos/bist-patek.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-PATEK/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:PETKM": {
    "name": "PETKİM PETROKİMYA HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-petkm.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-PETKM/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:PGSUS": {
    "name": "PEGASUS HAVA TAŞIMACILIĞI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-pgsus.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-PGSUS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:PSGYO": {
    "name": "PASİFİK GAYRİMENKUL YATIRIM ORTAKLIĞI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-psgyo.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-PSGYO/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:QUAGR": {
    "name": "QUA GRANITE HAYAL YAPI VE ÜRÜNLERİ SANAYİ TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-quagr.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-QUAGR/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:RALYH": {
    "name": "RAL YATIRIM HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ralyh.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-RALYH/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:REEDR": {
    "name": "Reeder Teknoloji Sanayi ve Ticaret A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-reedr.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-REEDR/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:SAHOL": {
    "name": "HACI ÖMER SABANCI HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-sahol.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-SAHOL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:SARKY": {
    "name": "SARKUYSAN ELEKTROLİTİK BAKIR SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-sarky.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-SARKY/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:SASA": {
    "name": "SASA POLYESTER SANAYİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-sasa.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-SASA/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:SISE": {
    "name": "TÜRKİYE ŞİŞE VE CAM FABRİKALARI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-sise.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-SISE/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:SKBNK": {
    "name": "ŞEKERBANK T.A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-skbnk.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-SKBNK/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:SOKM": {
    "name": "ŞOK MARKETLER TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-sokm.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-SOKM/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TABGD": {
    "name": "TAB Gida Sanayi ve Ticaret A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tabgd.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TABGD/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TAVHL": {
    "name": "TAV HAVALİMANLARI HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tavhl.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TAVHL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TCELL": {
    "name": "TURKCELL İLETİŞİM HİZMETLERİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tcell.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TCELL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TERA": {
    "name": "TERA YATIRIM MENKUL DEĞERLER A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tera.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TERA/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:THYAO": {
    "name": "TÜRK HAVA YOLLARI A.O.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-thyao.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-THYAO/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TKFEN": {
    "name": "TEKFEN HOLDİNG A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tkfen.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TKFEN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TOASO": {
    "name": "TOFAŞ TÜRK OTOMOBİL FABRİKASI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-toaso.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TOASO/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TRALT": {
    "name": "Turk Altin Isletmeleri A.S.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tralt.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TRALT/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TRENJ": {
    "name": "TR Dogal Enerji Kaynaklari Arastirma ve Uretim Anonim Sirketi",
    "id": null,
    "localPath": "/assets/asset-logos/bist-trenj.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TRENJ/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TRMET": {
    "name": "TR Anadolu Metal Madencilik Isletmeleri Anonim Sirketi",
    "id": null,
    "localPath": "/assets/asset-logos/bist-trmet.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TRMET/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TSKB": {
    "name": "TÜRKİYE SINAİ KALKINMA BANKASI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tskb.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TSKB/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TTKOM": {
    "name": "TÜRK TELEKOMÜNİKASYON A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ttkom.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TTKOM/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TUKAS": {
    "name": "TUKAŞ GIDA SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tukas.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TUKAS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TUPRS": {
    "name": "TÜPRAŞ-TÜRKİYE PETROL RAFİNERİLERİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tuprs.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TUPRS/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TUREX": {
    "name": "TUREKS TURİZM TAŞIMACILIK A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-turex.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TUREX/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:TURSG": {
    "name": "TÜRKİYE SİGORTA A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-tursg.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-TURSG/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ULKER": {
    "name": "ÜLKER BİSKÜVİ SANAYİ A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ulker.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ULKER/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:VAKBN": {
    "name": "TÜRKİYE VAKIFLAR BANKASI T.A.O.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-vakbn.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-VAKBN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:VESTL": {
    "name": "VESTEL ELEKTRONİK SANAYİ VE TİCARET A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-vestl.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-VESTL/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:YKBNK": {
    "name": "YAPI VE KREDİ BANKASI A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-ykbnk.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-YKBNK/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "bist:ZOREN": {
    "name": "ZORLU ENERJİ ELEKTRİK ÜRETİM A.Ş.",
    "id": null,
    "localPath": "/assets/asset-logos/bist-zoren.svg",
    "provider": "TradingView symbol page",
    "sourcePage": "https://tr.tradingview.com/symbols/BIST-ZOREN/",
    "checkedAt": "2026-10-04T17:26:36.459Z"
  },
  "crypto:ADA": {
    "name": "Cardano",
    "id": "cardano",
    "localPath": "/assets/asset-logos/crypto-ada.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.077Z"
  },
  "crypto:APT": {
    "name": "Aptos",
    "id": "aptos",
    "localPath": "/assets/asset-logos/crypto-apt.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.235Z"
  },
  "crypto:ARB": {
    "name": "Arbitrum",
    "id": "arbitrum",
    "localPath": "/assets/asset-logos/crypto-arb.jpg",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.187Z"
  },
  "crypto:AVAX": {
    "name": "Avalanche",
    "id": "avalanche-2",
    "localPath": "/assets/asset-logos/crypto-avax.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:04.966Z"
  },
  "crypto:BNB": {
    "name": "BNB",
    "id": "binancecoin",
    "localPath": "/assets/asset-logos/crypto-bnb.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.026Z"
  },
  "crypto:BTC": {
    "name": "Bitcoin",
    "id": "bitcoin",
    "localPath": "/assets/asset-logos/crypto-btc.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:04.814Z"
  },
  "crypto:DOGE": {
    "name": "Dogecoin",
    "id": "dogecoin",
    "localPath": "/assets/asset-logos/crypto-doge.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:04.985Z"
  },
  "crypto:DOT": {
    "name": "Polkadot",
    "id": "polkadot",
    "localPath": "/assets/asset-logos/crypto-dot.jpg",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.057Z"
  },
  "crypto:ETH": {
    "name": "Ethereum",
    "id": "ethereum",
    "localPath": "/assets/asset-logos/crypto-eth.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:04.867Z"
  },
  "crypto:FET": {
    "name": "Artificial Superintelligence Alliance",
    "id": "fetch-ai",
    "localPath": "/assets/asset-logos/crypto-fet.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.167Z"
  },
  "crypto:LINK": {
    "name": "Chainlink",
    "id": "chainlink",
    "localPath": "/assets/asset-logos/crypto-link.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.042Z"
  },
  "crypto:NEAR": {
    "name": "NEAR Protocol",
    "id": "near",
    "localPath": "/assets/asset-logos/crypto-near.jpg",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.133Z"
  },
  "crypto:OP": {
    "name": "Optimism",
    "id": "optimism",
    "localPath": "/assets/asset-logos/crypto-op.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.213Z"
  },
  "crypto:PEPE": {
    "name": "Pepe",
    "id": "pepe",
    "localPath": "/assets/asset-logos/crypto-pepe.jpg",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.228Z"
  },
  "crypto:RENDER": {
    "name": "Render",
    "id": "render",
    "localPath": "/assets/asset-logos/crypto-render.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.147Z"
  },
  "crypto:SOL": {
    "name": "Solana",
    "id": "solana",
    "localPath": "/assets/asset-logos/crypto-sol.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:04.892Z"
  },
  "crypto:SUI": {
    "name": "Sui",
    "id": "sui",
    "localPath": "/assets/asset-logos/crypto-sui.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.117Z"
  },
  "crypto:TRX": {
    "name": "TRON",
    "id": "tron",
    "localPath": "/assets/asset-logos/crypto-trx.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.097Z"
  },
  "crypto:UNI": {
    "name": "Uniswap",
    "id": "uniswap",
    "localPath": "/assets/asset-logos/crypto-uni.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.263Z"
  },
  "crypto:WIF": {
    "name": "dogwifhat",
    "id": "dogwifhat",
    "localPath": "/assets/asset-logos/crypto-wif.jpg",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:05.291Z"
  },
  "crypto:XRP": {
    "name": "XRP",
    "id": "ripple",
    "localPath": "/assets/asset-logos/crypto-xrp.png",
    "provider": "CoinGecko coin markets",
    "sourcePage": "https://docs.coingecko.com/reference/coins-markets",
    "checkedAt": "2026-10-04T17:25:04.904Z"
  },
  "us:AAPL": {
    "name": "Apple Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-aapl.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.106Z"
  },
  "us:AMD": {
    "name": "Advanced Micro Devices Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-amd.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.416Z"
  },
  "us:AMZN": {
    "name": "Amazon.com Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-amzn.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.253Z"
  },
  "us:AVGO": {
    "name": "Broadcom Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-avgo.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.680Z"
  },
  "us:COIN": {
    "name": "Coinbase Global Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-coin.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.692Z"
  },
  "us:GOOGL": {
    "name": "Alphabet Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-googl.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.096Z"
  },
  "us:META": {
    "name": "Meta Platforms Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-meta.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.270Z"
  },
  "us:MSFT": {
    "name": "Microsoft Corp",
    "id": null,
    "localPath": "/assets/asset-logos/us-msft.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.113Z"
  },
  "us:NFLX": {
    "name": "Netflix Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-nflx.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.528Z"
  },
  "us:NVDA": {
    "name": "NVIDIA Corp",
    "id": null,
    "localPath": "/assets/asset-logos/us-nvda.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.368Z"
  },
  "us:PLTR": {
    "name": "Palantir Technologies Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-pltr.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.829Z"
  },
  "us:TSLA": {
    "name": "Tesla Inc",
    "id": null,
    "localPath": "/assets/asset-logos/us-tsla.png",
    "provider": "Finnhub company profile",
    "sourcePage": "https://finnhub.io/docs/api/company-profile2",
    "checkedAt": "2026-10-04T17:25:04.550Z"
  }
};
  const boundScopes = typeof WeakSet === 'function' ? new WeakSet() : null;
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  function getIdentity(asset) {
    const input = asset && typeof asset === 'object' ? asset : {};
    const market = typeof input.market === 'string' ? input.market.toLowerCase() : '';
    const symbol = typeof input.symbol === 'string' ? input.symbol.trim().toUpperCase().replace(market === 'bist' ? /\.IS$/ : /$^/, '') : '';
    const validSymbol = /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(symbol);
    const key = market + ':' + symbol;
    const logo = validSymbol && Object.prototype.hasOwnProperty.call(LOGOS, key) ? LOGOS[key] : null;
    const sameCoin = !logo || market !== 'crypto' || !input.id || input.id === logo.id;
    const selected = logo && sameCoin ? logo : null;
    return {
      key, market, symbol,
      name: typeof input.name === 'string' && input.name.trim() ? input.name.trim() : selected ? selected.name : symbol,
      src: selected ? selected.localPath : null,
      monogram: validSymbol ? symbol : '?',
      source: selected ? selected.provider : null,
      sourcePage: selected ? selected.sourcePage || null : null,
      verifiedAt: selected ? selected.checkedAt : null
    };
  }
  function getLogo(asset) { return getIdentity(asset).src; }
  function logoHtml(asset, options = {}) {
    const identity = getIdentity(asset);
    const extraClasses = typeof options.className === 'string' ? options.className.split(/\s+/).filter(token => /^[A-Za-z][A-Za-z0-9_-]*$/.test(token)).join(' ') : '';
    return '<span class="asset-logo' + (extraClasses ? ' ' + extraClasses : '') + '" aria-hidden="true" data-asset-logo="' + esc(identity.key) + '">' +
      '<span class="asset-logo-monogram">' + esc(identity.monogram.slice(0, 3)) + '</span>' +
      (identity.src ? '<img src="' + esc(identity.src) + '" alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : '') + '</span>';
  }
  function bindLogoFallback(scope) {
    if (!scope || typeof scope.querySelectorAll !== 'function') return;
    function settle(image, available) {
      if (!image || !image.matches || !image.matches('[data-asset-logo] > img')) return;
      const box = image.parentElement, monogram = box.querySelector('.asset-logo-monogram');
      image.hidden = !available;
      if (monogram) monogram.hidden = available;
      box.classList.toggle('has-logo', available);
      box.classList.toggle('logo-unavailable', !available);
    }
    if (!boundScopes || !boundScopes.has(scope)) {
      if (boundScopes) boundScopes.add(scope);
      scope.addEventListener('load', event => settle(event.target, event.target.naturalWidth > 0), true);
      scope.addEventListener('error', event => settle(event.target, false), true);
    }
    scope.querySelectorAll('[data-asset-logo] > img').forEach(image => {
      if (image.complete) settle(image, image.naturalWidth > 0);
    });
  }
  function getCoverage() {
    return Object.keys(LOGOS).reduce((counts, key) => { counts[key.split(':')[0]] = (counts[key.split(':')[0]] || 0) + 1; return counts; }, { us: 0, bist: 0, crypto: 0 });
  }
  return { getIdentity, getLogo, logoHtml, bindLogoFallback, getCoverage };
});
