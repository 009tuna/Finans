# Finans · tarihsel kanıtın güncel denetimi

Denetim kesiti: 2 Ekim 2026 01:06 İstanbul / 1 Ekim 22:06:22 UTC. Sonuç: **Kayıtlı dönem için sınırlamalarla kullanılabilir; doğrulanmış yatırım/model başarısı iddiası için yetersiz.** Altı aylık tam kaynak/iddia kabulü tamamlanmış değildir.

Kaynak: salt okunur ve sayfalı Supabase reports/market_history/market_snapshots SELECT'leri, teknik günlük ve değişmez araştırma defteri. [Tam kesit](2026-10-02-history-evidence.json), [özet](2026-10-02-history-summary.json), [bağımsız hesap mutabakatı](2026-10-02-history-reconciliation.json). Okumalar tek veritabanı işleminin atomik kesiti değildir. Model çağrısı ve kaynak verisine yazım yapılmadı; önceki 30 Eylül kanıt dosyasının SHA256 değeri değişmedi.

## Gerçek dönem ve ölçüm

- 8 Haziran–1 Ekim: 116 takvim günü, 87 rapor/geçmiş günü. Bu aralıktaki 84 hafta içi günün tarih satırı mevcut. Satır varlığı kaynakların veya AI üretiminin her gün tamamlandığını kanıtlamaz. Nisan–Mayıs kayıtları mevcut kaynakta bulunmuyor.
- Günlük rapor tablosunda AI zamanı olan 7 satır; yapılandırılmış kaynak listesi olan 3 satır. Araştırma defterinde 7 çalışma: 4 Astra, 3 GPT-6.1 Sol. AI'nin 87 gün yorum ürettiği çıkarılamaz.
- Defterde 44 kaynak referansı / 36 farklı URL / 24 olay girdisi. Bunlar çalışma bazındaki sayımlardır; olaylar farklı çalışmalarda tekrar edebilir. 26 referansta yayın zamanı yok. Bu sayılar bütün iddiaların bağımsız kaynakla doğrulandığı anlamına gelmez.
- Model araştırması: **1 sayısal tahmin, 0 ölçülmüş sonuç**. Model MAE/Brier/isabet oranı ve öğrenilmiş kalibrasyon iddiası yok.

## Teknik senaryolar model başarısı değildir

367 kayıt: 336 kapanmış, 31 açık. Tamamının kaynağı `system`. Kapanmış kayıtların 336'sında da `outcomeEvidence` yok; 367 kaydın 365'inde strateji/model sürümü yok. Belirsiz kayıt sayısının sıfır olması, eski mumlarda hiç belirsizlik yaşanmadığını kanıtlamaz.

| Piyasa | Kayıtlı kapanış | Kazanan* | Kayıtlı kazanan oranı | Ortalama brüt senaryo sonucu |
|---|---:|---:|---:|---:|
| ABD | 32 | 10 | %31,25 | −%1,13 |
| BIST | 293 | 75 | %25,60 | −%1,59 |
| Kripto | 11 | 8 | %72,73 | +%11,95 |
| Toplam | 336 | 93 | %27,68 | −%1,10 |

*Hedefe ulaşan veya vade sonunda giriş üzerinde kapanan kayıt. Bunlar eski kayıt etiketlerinden yeniden hesaplanan, eşit ağırlıklı brüt senaryo sonuçlarıdır. Emir gerçekleşmesi, ücret/kayma, sermaye ağırlığı ve bağımsız örneklem kanıtı yoktur. Gerçek portföy getirisi veya GPT-6.1 Sol başarısı gibi sunulamaz. Kriptonun 11 kapanışı güçlü genelleme için yeterli değildir.

Denetim anında TRMET kaydının `resolvedAt=2026-10-01T23:59:59Z` zamanı gelecekteydi. Bu kayıt çıkarılınca 335 kapanışın brüt ortalaması −%1,08; ana olumsuz sonuç değişmiyor. Eski günlük mumlarda hedef/stop sırası ayrıca doğrulanmış değildir. Tarih uyarıları ana ham kayıt ölçümünden ayrı raporlandı; kayıt silinmedi veya yeniden çözülmedi.

## Veri ve içerik sınırlamaları

1. Dört Haziran raporunda tarih anahtarı ile temel rapor üretim günü farklı. Dört eski AI satırında çalışma/kesit eşleşmesi kanıtlanamıyor. Sebep işlem logları olmadan kesinleştirilmez; geçmişte bilinen bilgiyle tahmin değerlendirmesinde kullanımları güvenilir kabul edilmez.
2. Günlük geçmiş evreni 44 varlıktan 133'e genişlemiş. Sabit evren veya bağımsız dönem kıyası varsayılamaz. 87 tarih satırında tekrar, eksik üretim zamanı veya kaydedilmiş fiyatlarda geçersiz değer bulunmadı; bu kontrol tam gün içi seri doğrulaması değildir.
3. `market_snapshots` yalnız mevcut 1 kesiti tutuyor. Günlük fiyat/puan geçmişi var; bütün gün içi girdileri yeniden kuracak arşiv yok.
4. Mevcut BIST kesitinde 100 şirketin hiçbirinde F/K veya piyasa değeri yok. Teknik sıralama temel değerleme kanıtı değildir. ABD'de 12 varlığın 11'inde F/K, 12'sinde piyasa değeri mevcut; tanım/dönem ayrıca gerekir. Kriptoda bu kesitte fiyat/zaman eksikliği yok; bu, haber veya zincir üstü kapsamın tamamlandığı anlamına gelmez.
5. Bu tur bütün 36 URL ve bütün metin iddiaları yeniden doğrulanmadı. [Önceki seçili içerik incelemesi](2026-09-30-degerlendirme.md) tarihsel örneklemdir; tüm içerik kabulünün yerine geçmez.

## Yapılan yöntem düzeltmesi

Denetim aracı, uygulamanın belirleyici sonuç tanımıyla eşlendi. Açık, bilinmeyen ve `ambiguous_bar` kayıtları kazanma/getiri paydasına girmiyor. Belirsizlik ile eski kanıt yokluğu ayrı sayılıyor; çift sayıda gözlemde medyan iki orta değerden hesaplanıyor. Güncel tarihle çıktı veya açık `--out` yolu kullanılabiliyor; 30 Eylül dosyasına sabit yazma kaldırıldı. Yeni bağımsız uç durum testi çalıştı ve npm test komutuna eklendi. Finansal puan/risk formülleri veya kayıtlı sonuçlar değiştirilmedi.

[Son 71 dosyalı npm test](2026-10-02-reading-and-history-npm-test.txt) çıkış kodu 0 ile tamamlandı. Gerçek kayıtların kazanma payı ve ortalaması ayrıca doğrudan toplama ile yeniden hesaplanıp mutabık bulundu; yardımcı fonksiyonun kendi çıktısını tekrar okumakla yetinilmedi.

## Sonraki kapılar

Önce uzaktaki otomasyon sürümünü doğrula. Yerel resolver v3 gerçek çözümleme zamanını yazar ve tamamlanmamış/güncel gün mumunu puanlamaz; fakat güncel bulut kaydının bunu kullandığı kanıtlanmadı. GitHub bağlayıcısı dosya okumalarında 404, CLI oturumu geçersiz döndü. Kullanıcıdan oturumu yenilemesi istendi. Uzaktaki hata kaynağı henüz kesinleşmedi; workflow değiştirilmedi veya tetiklenmedi.

Ardından eski ve sürümlü kayıtları ayrı performans gruplarıyla göster; ileri örneklemi yeni kanıt sözleşmesiyle biriktir. Model ilk tahmin/ilk resmî sonuç karşılaştırmasını koru; yeterli kronolojik örneklem olmadan yöntem önerisini etkinleştirme. Tam içerik denetiminde iddia → kaynak → zaman → yorum ayrımını bütün mevcut metinlerde doğrula. Bulunmayan Nisan–Mayıs verisini veya eksik geçmiş kaynak zamanlarını sonradan uydurma.
