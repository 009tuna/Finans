# Teknik sonuçlar ve öğrenme kanıtı — canlı kabul

2 Ekim 2026. Bu paket genel hedefin bir adımıdır; bütün ürün kabulü değildir.

## Sorun ve değişiklik

Eski teknik sonuçlar, yöntem sürümleri ve zaman kanıtı kontrol edilmeden tek bir isabet oranına katılıyordu. Aynı kayıtlar örüntü kuralları ve birleşik tarihsel isabet puan etkisi üretiyordu. Örneklem içindeki ilişki kronolojik kalibrasyon değildir.

- Ortak `prediction-evidence.js` sınıflandırıcısı tarayıcı ve sunucuda aynı sürüm/zaman/sonuç kurallarını kullanır. Kayıt kimliği, geçerli seviyeler, oluşturma/sonuç/mum zamanı, desteklenen resolver, sonuç kanıtı ve fiyat/getiri tutarlılığı kontrol edilir. Yinelenen kimlikler örneklemi büyütemez.
- Her performans grubu kaynak, piyasa, strateji ve çözümleyici sürümünü korur. Açık senaryolar sonuç örneklemi değildir. Bütün grupları birleştiren başarı yüzdesi gösterilmez.
- Eski, geçersiz ve belirsiz kayıtlar görünür envanter ve gerekçelerle ayrılır. Arşiv grubu seçildiğinde eski ham hesabı **doğrulanmamış arşiv** olarak okunur; bütün grup kayıtlarına erişim korunur.
- Denetim satırı özgün strateji/model/resolver ve mum/fiyat alanlarını kopyalar; eksik alanları geçmişe yazmaz. Uygun sonuçlar öğrenme girdisidir; uygun olmayanların sayısı ve gerekçesi korunur.
- Öğrenme katsayısı hesabı öneri üretir; `proposal_only` / `chronological_validation_required` durumundadır. Ayrı bir doğrulanmış etkinleştirme iş akışı yoktur. Eski veya elle eklenmiş etkinleştirme bayrakları puan etkisi vermez. Birleşik tarihsel isabet puan etkisi de devreden çıkarıldı.
- Heuristik güven yüzdesi kalibre edilmiş olasılık olarak gösterilmez. Eski rapor çıkarımları arşiv bağlamıdır. Teknik skor, değerleme/risk formülleri ve kayıtlı tahmin sonuçları yeniden yazılmadı.

## Gerçek kayıtlar ve kapsam

Yerel dondurulmuş kesitte 367 teknik kayıt vardır: **365 eski, 2 sürümlü açık, 0 ölçüme uygun sonuç**. Denetim envanteri 337 kapanıştır; hiçbirinin tüm yeni ölçüm koşulları yoktur. Örüntü önerisi ve etkin kural sayısı 0'dır.

Canlı geri okumada 368 teknik kayıt vardır: aynı 365 eski kayıt ve **3 sürümlü açık**. Kabul çalışırken bir açık senaryo eklenmiştir; yerel ve canlı günlüğün birebir aynı olduğu iddia edilmez. Kesitler [uzlaştırma kaydında](2026-10-02-performance-reconciliation.json), son canlı sayılar [uç denetiminde](2026-10-02-performance-live-endpoints.json) bulunur.

Model tahmin defteri ayrı tutulur: 2 bekleyen tahmin / 0 ölçülmüş sonuç. İlk NFP tahmini 30 Eylül'de kaydedilen **100 bin** olarak kalmıştır. Yeni çalışma Eylül çekirdek CPI aylık mevsimsellikten arındırılmış değişimi için **%0,3** görüşünü kaydetmiştir. Bunlar model görüşüdür; isabet veya eğitim başarısı değildir. Araştırma yayını bu UI paketinden önce günlük otomasyon tarafından yapılmıştır; bu paket ek model çağrısı yapmadı.

## Kabul kanıtı

- `npm test`: **72 test dosyası** içeren paket exit 0. [Tam çıktı](2026-10-02-performance-npm-test.txt). Yeni ölçüm, yinelenen kayıt, gerçek resolver çıktısı, gelecekteki sonuç, farklı strateji, arşiv ve önerilerin etkisizliği senaryoları kapsanır.
- Gerçek tarayıcıda grup seçimi klavyenin aşağı oku ile değişir; seçim sonrası odak aynı kontrole döner. Portföy'e geçip tarayıcı geri eylemiyle dönünce grup korunur. Native ayrıntı ve seçim kontrolleri kullanılır.
- 320, 390, 630, 820, 1024, 1280, 1440 CSS px: bu iki panelde ve gövdede taşma yok; seçim kontrolü 44 px. [Ölçüm](2026-10-02-performance-widths.json). Bunlar gerçek tarayıcı yakınlaştırma deneyi değildir.
- Aynı dondurulmuş API verileriyle önce/sonra karşılaştırma: fiyat, günlük ve rapor JSON SHA256 değerleri eşit. [Kesit kanıtı](2026-10-02-performance-comparison-cut.json). Önceki üç sunulmuş dosya 5197'de, yeni dosyalar 5196'da aynı veriyle çalıştırıldı. Arayüz ilkinde bütün eski kapanışları `%28 (93/337)` olarak birleştirir; yenisi varsayılan görünümde yalnız sürümlü açıkları gösterir ve oran üretmez.
- [Önce](2026-10-02-performance-before.png), [sonra — aynı veri](2026-10-02-performance-after.png), [390 px](2026-10-02-performance-mobile.png), [canlı](2026-10-02-performance-live.png).
- Yerel panel denetiminde tarayıcı hata/uyarı kaydı yok. Bu, bütün ürün durumlarının veya saha performansının kabulü değildir.

## Yayın

Ana alan: https://finans-dashboard-iota.vercel.app/#view=overview

Yeni dağıtım: `dpl_BuLFgLoThMuoxtLtqBjPUAb9gZUC`, READY, ana alan promote sonrası aynı dağıtımda. [Dağıtım kaydı](2026-10-02-performance-live-deployment.json).

Korunan yeni dağıtımdaki app, action-layer, prediction-evidence ve styles dosyaları yerel test edilen dosyalarla SHA256 açısından aynı. Korunan araştırma API'si ve canlı fiyat/rapor/araştırma/günlük uçları başarılı. Rapor ve araştırmanın çalışma kimliği `42f05fec-1c0b-4dc3-8601-0e1e025f8472` olarak eşleşir. Son 15 dakikalık hata/uyarı sorgusu boş döndü; 15 dakika boyunca sürekli izleme veya gecikme yüzdelikleri ölçümü yapılmadı.

Geri dönüş: `dpl_8mEETWgBN66Vp8U4RpRK4v7Mh2LA`, `finans-dashboard-cj1obj0pc-tunahan81jb-7635s-projects.vercel.app`. Kritik gezinme, kayıt, yükleme veya hesaplama arızasında önceki dağıtıma dönülür. Veritabanı göçü yoktur.

Yayın bağlantı sorunu yerelde çözüldü: Vercel CLI'nin resmî OpenID keşif isteği Windows taşıyıcısına dahil edildi; URLSearchParams istek gövdesi doğru serileştirildi. Aynı hesap normal OAuth yenilemesiyle doğrulandı. Kimlik bilgileri çıktıya basılmadı; yerel yardımcı dağıtıma dahil değildir.

## Açık kapılar

GitHub CLI erişimi önceki denetimde geçersizdi; uzak otomasyon/kod sürümü henüz doğrulanmadı. Bu Vercel yayını, GitHub iş akışının güncellendiğini kanıtlamaz. Kaydedilmiş eski raporlar yeniden üretilmedi; yeni sunucu öğrenme özeti sonraki normal rapor üretiminde kullanılır.

Kronolojik eğitim/ayrı doğrulama örneklemi, gerçek ilk makro sonuçlar, kaynak iddialarının tamamının denetimi, altı ay için eksik Nisan–Mayıs içeriği, gerçek %80/%100/%125/%200 zoom ve bütün araçlarda erişilebilirlik/durum kabulü açık kalır. Tam KAP kapsamı ve şirket belge gövdelerinin doğrulanması tamamlanmadı. Genel hedef sürer.
