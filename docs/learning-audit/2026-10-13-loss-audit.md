# Kayıp ve kanıt denetimi

Denetim: 2026-10-13T19:51:48.139Z

Bu rapor kayıtları değiştirmez. Kaydedilmiş sonuçların aritmetik tutarlılığını ve kanıt boşluklarını inceler. Gerçek veya sanal işlemin bağımsız olarak doğrulandığı iddia edilmez.

Toplam 374 satır; 374 ayrı dolu kimlik; 0 yinelenen kimlik grubu. Yinelenen kimliğin bütün satırları sonuç ortalamasından dışlandı.

Ortalamalar eşit ağırlıklı kaydedilmiş brüt tahmin sonucudur; net veya gerçekleşmiş portföy getirisi değildir. Pozisyon büyüklüğü, sermaye tahsisi ve gerçekleşmiş masraf bilgisi bilinmiyor.

| Kohort / piyasa | Kayıt | Pozitif | Negatif | Bekleyen | Belirsiz | Geçersiz | Eksik | Sonuç örneklemi | Ham ortalama % |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| legacy-system / bist | 303 | 76 | 220 | 7 | 0 | 0 | 0 | 296 | -1.5686 |
| legacy-system / us | 41 | 12 | 24 | 5 | 0 | 0 | 0 | 36 | -0.7778 |
| legacy-system / crypto | 30 | 8 | 18 | 4 | 0 | 0 | 0 | 26 | -0.8885 |

Sonuç sınıfları birbirini dışlar; sıfır, giriş yapılmayan ve bilinmeyen sonuçlar JSON raporunda ayrıca bulunur. Eksik fiyat/zaman veya çelişkili sonuçlar ortalamaya girmez.

Karar anında kaydedilmiş skor aralıkları ve tarih yoğunluğu JSON raporunda her kohort için ayrıdır. Gün bilgisi createdAt alanının tarih kısmıdır; gerçekleşmiş işlem günü değildir. Küçük örneklem ve tek güne yığılma genellemeyi zayıflatır.

Pozitif/negatif sonuç büyüklüğü oranı yalnız betimseldir. Kaydedilmiş hedef/stop geometrisi işlem öncesi nominal plandır; işlem gerçekleşmesi, strateji beklentisi veya nedensel kayıp açıklaması değildir. Eksik giriş fiyatı tahmin edilmez.

Kanıt alanlarının varlığı doğrulanmış işlem sayılmaz. Güncel snapshot sadece kapsam bilgisi verir; geçmiş fiyat, gösterge, karar koşulu veya kaybın nedeni buradan türetilmez.

## Piyasa bazında sonuç büyüklüğü

| Kohort / piyasa | Pozitif n / ort. % | Negatif n / büyüklük % | Betimsel büyüklük oranı | Bilinen plan n / nominal hedef-risk oranı |
|---|---:|---:|---:|---:|
| legacy-system / bist | 76 / 11.3737 | 220 / 6.0395 | 1.8832 | 303 / 2.0035 |
| legacy-system / us | 12 / 9.0417 | 24 / 5.6875 | 1.5897 | 41 / 2.0003 |
| legacy-system / crypto | 8 / 19.4250 | 18 / 9.9167 | 1.9588 | 30 / 2.0127 |

Bu büyüklükler geçmiş kaydedilmiş sonuç altkümesini betimler; örneklem sayısı olmadan yorumlanmamalıdır. Bir piyasanın kaybı RSI, makro koşul veya belirli göstergeden kaynaklandı sonucuna varılamaz.

## Kanıt kapsamı

- legacy-system: 358 tanınan kapalı sonuç; 22 kayıtta sonuç/çözümleyici metadata alanları. Bağımsız doğrulanmış işlem sayısı bilinmiyor.
  - Eksik currency: 374.
  - Eksik decision-source-proof: 374.
  - Eksik entry-source-proof: 374.
  - Eksik outcome-evidence: 336.
  - Eksik price-basis: 374.
  - Eksik resolver-version: 336.
  - Eksik strategy-version: 365.

## Sonraki inceleme

- Freeze and inspect the historical source snapshot referenced at each decision and resolution.
- Verify currency and adjusted/unadjusted price basis; never infer them from market membership.
- Verify eligibility, entry observation, exit ordering and same-bar target/stop ambiguity.
- Obtain position size, allocation and actual costs before any realized portfolio performance claim.
- Compare sufficiently sized cohorts with out-of-time validation before changing thresholds or training.
