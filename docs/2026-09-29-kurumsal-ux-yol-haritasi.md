# Finans — Karar Masası

**30 Eylül uygulama kaydı:** [İşlev koruma matrisi, ekranlar ve doğrulama sonuçları](karar-masasi-qa/verification.md). Manuel ekran okuyucu, gerçek %200 yakınlaştırma, sistem hareket azaltma ve saha performansı kabulü açık olarak kaydedildi.

29 Eylül 2026 · Sürüm 3 · Onaylanan UI/UX uygulama şartnamesi

Bu belge hedef davranışı tanımlar. Kabul sonuçları `docs/karar-masasi-qa/verification.md` içinde ayrıca kaydedilir; bu plan tek başına üretimin tamamlandığını göstermez. Kullanıcının son kararı önceki sanat yönlerinden üstündür.

## 1. Ürün ve karakter

Finans, portföyünü takip eden ve varlıkları araştıran bireysel yatırımcı için bir karar masasıdır. Ana ekranda portföy, risk ve karar hazırlığı; varlık incelemesinde grafik ve kanıt; raporda kaynaklı okuma öne çıkar. Bütün mevcut işlevler korunur. Haber merkezli Piyasa Atlası konsepti uygulama referansı değildir.

Hedef hisler: kontrol (konum ve veri zamanı belli), merak (değişimden gerekçeye geçiş), akıcılık (araçlar arasında bağlam korunur), güven (veri/varsayım/görüş/ölçüm ayrılır) ve keyif (kısa, tutarlı geri bildirim).

Karakter üç kararla kurulur: her göreve farklı kompozisyon; gerçek eski/yeni durumu açıklayan Karar izi; araştırmadan teste, senaryoya ve kullanıcı notuna kesintisiz geçiş. Karar izi iki karşılaştırılabilir kayıt yoksa değişim uydurmaz; son durum ve veri zamanı gösterir.

Referanslar: [Linear](https://linear.app/now/how-we-redesigned-the-linear-ui) yüzey ve gezinme hiyerarşisi; [Koyfin](https://www.koyfin.com/features/custom-dashboards/) yoğun tablo ve grafik için yeterli alan; [TradingView](https://www.tradingview.com/support/solutions/43000487210-i-want-to-add-or-remove-columns-to-the-watchlist/) okunabilir liste kontrolleri. Referans ekranlar kopyalanmaz. Awwwards düzeyinde özen hedeflenir; ödül veya test edilmemiş memnuniyet garantisi verilmez.

Impeccable ürün register'ı ana kalite çerçevesidir. Design Taste marka/anti-şablon ilkelerinde kullanılır; yoğun dashboard kapsamını dışladığı için landing düzeni uygulanmaz. UI UX Pro Max tablo, form, gezinme ve erişilebilirlik kontrolünü destekler.

## 2. Görsel ve etkileşim sistemi

Ana zemin düz grafit; dekoratif parlamalar kaldırılır. Bölümler başlık, boşluk ve yüzey farkıyla ayrılır. İç içe ve aynı boyda tekrarlanan kartlar düzleştirilir. Logo ve Plus Jakarta Sans korunur. Başlık emojileri kaldırılır; mevcut navigasyon ikon dili sürdürülür.

| Karbon tokenı | OKLCH |
|---|---|
| Zemin | `18% 0.006 250` |
| Navigasyon | `16% 0.006 250` |
| İçerik | `23% 0.008 250` |
| Yükseltilmiş yüzey | `28% 0.010 250` |
| Ayırıcı | `34% 0.010 250` |
| Ana / ikincil / yardımcı metin | `96% 0.004 250` / `80% 0.006 250` / `72% 0.006 250` |
| Vurgu | `68% 0.160 255` |

Kontrast kabulü token değerinden üstündür: normal metin ≥4.5:1. Karbon, Gümüş, Kehribar, Yeşil kimlikleri, kayıtlı tema seçimi ve aynı durum sözlüğü korunur. Yeşil/kırmızı finansal yön veya sonucu anlatır; eksiklik/bekleme ayrıca metinle belirtilir.

Tipografi: 12/14/16/18/20/24/28/32/36 px. Ana başlık 32–36 px, mobil 28 px; gövde16, tablo14, metadata≥12. Rakamlar tabular; birim, yüzde ve gerekli hassasiyet görünür. Uzun metin72ch.

Kabuk: sidebar224 px, topbar64 px, kenar boşluğu32/24/16 px; boşluk4/8/12/16/24/32/48; kontrol radius6, panel10; tablo satırı44; mobil birincil hedef44. 980 px altında Menü düğmesi ve odak yönetimli açılır navigasyon. Görünüm menüsü dört temayı ad ve seçili durumla sunar.

Navigasyon: Çalışma Alanı (Genel Bakış, Portföy); Piyasalar (ABD, BIST, Kripto, Tarayıcı); Analiz (Test, Projeksiyon); Araştırma (Rapor, Okuryazarlık). Üst çubuk sayfa/veri durumu/ilgili eylemi taşır.

Hareket: basma120 ms; filtre/sekme/varlık seçimi180; detay220; kaynak180; mobil menü giriş220 çıkış160; tema180. Kayıt yerinde durum ve onay işareti, yenileme işlem boyunca simge. İçerik hemen görünür; uzun çıkış, sürekli süs, her karta aynı giriş ve sıfırdan sayı animasyonu yok. Reduced motion anlık.

## 3. Ekran kompozisyonları

### Genel Bakış

Portföy özeti → dikkat gerektiren risk/eksiklik → tam genişlik karar listesi → piyasa bağlamı → performans/öğrenim. Dar sağ sütunda kritik tablo yok. Hazır/kanıta bağlı/bloke ayrılır, bütün huni kategorileri erişilir. Seçilen adayda Veri → Teknik durum → Araştırma → Hazırlık, gerçek alanlar ve eksik kanıt gerekçesiyle gösterilir.

Yönetici özeti, makro katman, katalizör, hareketli varlık, döviz, rejim ve ölçümler korunur. Örnek dağılım Model portföyü olarak gerçek portföyden ayrılır. İki karşılaştırılabilir kayıt yoksa Karar izi yalnız son durumu gösterir.

### Portföy

Kompakt değer/kâr-zarar/risk özeti hemen geniş pozisyon tablosuna bağlanır. Miktar, maliyet, fiyat, değer, P&L, ağırlık ve eylemler korunur. Mevcut ağırlıklar yatay dağılımda sayılarla gösterilir; tek varlık %100 açık. Profil/risk planı çelişkisi yeşil güven rozetiyle örtülmez.

Yeterli içerik alanında düzenleme360 px yan panel; dar alanda tek sütun. Aynı sembol kaydı toplam miktar ve ortalama maliyeti değiştirir: önceden dolu form, eski→yeni önizleme ve açık açıklama. İşlem defteri/ek alım muhasebesi oluşturulmaz.

### Piyasalar

Üstte sembol/isim arama, sıralama ve sonuç sayısı. İçerik alanı≥1040 px ise320 px liste ve geniş detay; altında liste/detay ayrı görünüm. Listeye dön seçim/scroll/odağı geri getirir.

Detay: sembol/şirket/fiyat/değişim/veri zamanı → ana grafik → Özet/Teknik/Araştırma/Not ve takip. Bütün indikatör, karar, risk, şirket, benzer, komite, tez, alarm ve öğrenim alanları korunur. RSI/MACD/SMA adları görünür. Grafik/fiyat zamanı ayrı. Grafiğe odaklan yalnız alanı büyütür; veri istemez, seçim/dönem/göstergeleri korur.

### Tarayıcı

Piyasa/kategori/arama ile ortak sonuç tablosu. Aşırı satım/alım, kırılım, ayı/trend, çelişki korunur; çoklu sinyal silinmez. Boş kategori kısa açıklama.25 sonuç/sayfa;25/50/100. Varlıktan teste sembol taşınır; otomatik başlatılmaz.

### Strateji Testi

Tek parametre grubu → kıyas özeti → eğri → risk metrikleri → işlemler. Girdi değişince mevcut sonuç Önceki test sonucu olur.0 işlem isabet değildir. Geçersiz/hata/boş şirket verisi anlaşılır gösterilir.

### Projeksiyon

Portföy senaryosu (Monte Carlo/tasarruf/dönem/stres/korelasyon) ve Şirket değerlemesi (DCF/Graham/DDM/varsayımlar/hassasiyet/10 yıllık tablo) ayrı sekmeler. İçerik≥1080 px ise340 px varsayım paneli yanında sonuç; dar alanda varsayım→sonuç. Slider yanında sayısal giriş. Sonuç bağlı girdi/zaman/para birimini gösterir. Yeni girdiye eski sonuç bağlanmaz. Yüzdelikler kalibre edilmiş güven aralığı değildir. Tek varlık korelasyon gerekçesi görünür.

### Rapor ve Okuryazarlık

Rapor: tarih/veri zamanı/çalışma eşleşmesi/bütünlük → Özet/Gelişmeler/Piyasa etkileri/Takvim/Tahmin sonuçları.72ch okuma, geniş alanda280 px kaynak alanı, dar tek akış. Günlük/haftalık içerik, karşı kanıt ve kaynak korunur; model görüşü ölçümden ayrılır; yeni sunum için model çağrısı yok.

Okuryazarlık: konu listesi/okuma/uygulama örneği. Rehber, hesaplayıcı, quiz, ipucu, arşiv korunur; ilgili araçtan rehbere bağlantı. Eğitim ilerlemesi yatırım başarısı sayılmaz.

## 4. Teknik davranış ve sınırlar

URL `#view=market&market=bist&symbol=ASTOR`; geçersiz seçim güvenli açıklamayla mevcut listeye döner. Arama her tuşta history üretmez; geri/ileri görünüm/seçim/filtre/scroll korur. Grafik tercihleri piyasa bazında. Taslaklar varlık anahtarıyla oturum belleğinde; özel bilgiler URL/varsayılan kalıcı storage'a yazılmaz. Menü Escape→tetikleyici; yeni sayfa→başlık; detaydan dönüş→kaynak düğme. Eski istek yeni görünümü ezmez.

Kaydediliyor/Kaydedildi/Kaydedilemedi yerinde; başarısız istekte girdi ve eski kayıt korunur; çift işlem önlenir. Alarm başarısı kural kaydıdır, teslim vaadi değil. Silme mevcut onayla, sunucu başarısından sonra; desteklenmeyen undo yok.

İlk yüklemede sabit iskelet; yenilemede son başarılı içerik; eskide gerçek veri zamanı; kısmi başarısızlıkta başarılı piyasalar; gerçek boş portföyde ekleme; erişim hatasında hata/tekrar dene; filtre boşluğunda temizle; eşleşmeyen raporda açık ayrım; hesaplanamayanda gerekçe. HTTP tamamlanma zamanı veri üretim zamanı değildir. Teknik skor olasılık, karar kalitesi isabet değildir; sıfır örneklemde başarı oranı yok.

Vanilla JS, API, mevcut grafik kütüphaneleri korunur. Model/risk/tahmin/otomasyon değişmez. CSS token/bileşen/ekran olarak düzenlenir, yeni override yığını oluşturulmaz. Yenileme form/odağı silmez; grafik/listener yaşam döngüsü yönetilir. Gerçek th/aria-sort, klavye sekmeleri, slider sayısal altı, taşmayan popover ve grafik metin/veri alternatifi zorunlu. Yeni API/DB şeması yok; muhasebe, bildirim, geçmiş üretimi ayrı kapsam.

## 5. Paketler ve kabul

1. Güven + işlev envanteri.2. Görsel temel.3. Genel Bakış/Portföy/Varlık üç ana kompozisyon.4. Tarayıcı/Test/Projeksiyon.5. Rapor/Öğrenme.6. Entegrasyon ve son denetim. En fazla iki uygulama ajanı; ayrılmamış dosyalar sırayla. Ana ajan tasarım ve kabulü yönetir; her paket değişiklik/kanıt/açık sorun teslim eder.

320/390/630/820/1024/1280/1440 px, dört tema,%200 zoom,reduced motion. Kolonlar kullanılabilir içerik alanına göre; gövde taşmaz; yatay scroll yalnız gerekli tablo/matris. Klavye/ekran okuyucu, görünür odak ve odağı örtmeyen sticky alan. [Kontrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [hedef boyutu](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [hareket](https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html) kontrol edilir.

`npm test` geçer; yeni testler URL/geri dönüş, kayıt hata, istek yarışı, veri durumu ve içerik korumaya odaklanır. [Core Web Vitals](https://web.dev/articles/vitals) LCP≤2.5s/INP≤200ms/CLS≤0.1 hedeflenir; laboratuvar sonucu saha sonucu değildir.

Teslim: çalışan yerel önizleme, aynı veriyle önce/sonra, işlev koruma matrisi, gerçek test raporu ve güncel DESIGN kaydı. Canlı yayın ayrı son adımdır.


## Ek — korunan işlev ve görev sözleşmeleri

## İşlev koruma matrisi — uygulayıcının kontrol listesi

Her satır uygulama paketinde `korundu / taşındı / bağımlı / doğrulanmadı` olarak işaretlenir. Veri kaynağı sütunu kavramsaldır; uygulayıcı gerçek mevcut yanıt alanını koddan eşler. UI'da hesaplanmayan değerler üretmek için yeni model çağrısı yapılmaz.

| ID | Korunacak işlev | Hedef yer ve erişim | Veri kaynağı | Kabul kanıtı |
|---|---|---|---|---|
| OV-01 | Portföy özeti, piyasa KPI, genişlik, sinyal farkı | Genel Bakış üst özet → ilgili piyasa/pozisyon | Piyasa anlık görüntüsü, mevcut karşılaştırma, portföy | Toplam ve fark aynı veri zamanına bağlı; eksik veri ayrılır. |
| OV-02 | Karar kokpiti, fikir hunisi, makro overlay, katalizörler | Genel Bakış karar listesi → gerekçe; huninin tüm kovaları filtre olarak | Mevcut action layer / rapor | Adayın neden hazır/bloke olduğu ve eksik kanıt açılır; uzun başlık/tarih okunur. |
| OV-03 | Yönetici özeti, rejim, top picks, örnek dağılım, movers, döviz | Gelişmiş analiz bölümleri → adlandırılmış bağlantı | Mevcut analiz/veri | Hiçbir panel kaybolmaz; örnek dağılım gerçek portföyden açıkça ayrılır. |
| OV-04 | İsabet karnesi, sistem/kullanıcı ayrımı, karar öğrenimi | Genel Bakış `Performans ve öğrenim` bölümü | Journal / mevcut ölçüm alanları | Örneklem, açık/kapanan kayıt ve dönem görünür; sıfır örneklem `hesaplanamadı`. |
| MKT-01 | Arama, sıralama, liste, fiyat grafiği, dönem, SMA/RSI/MACD | Üç piyasa ekranı → varlık detayı | Piyasa ve grafik yanıtları | Sembol/şirket adı arama; dönem/indikatör/geri dönüş; ayrı zaman damgaları. |
| MKT-02 | İndikatörler, gerekçeler, karar/risk, şirket özeti, benzerler, komite notu | Varlık detayı `Özet / Teknik / Araştırma / Not ve takip` bölümleri | Mevcut asset/action layer | Her mevcut alan yeni yerde açılabilir; eksik alan sahte metinle doldurulmaz. |
| MKT-03 | Tez, bozulma koşulu, önerilen/kayıtlı alarm kuralı | Varlık detayı `Not ve takip` | Journal / mevcut kayıt API | Başarılı kayıt, hata, taslak ve geri dönüş; alarmın ne yaptığı açık. |
| PORT-01 | Pozisyon ekle/düzenle/sil, miktar, ortalama maliyet, kâr/zarar, dağılım | Portföy tablosu → satır düzenle; `Pozisyon ekle` | Mevcut aggregate holdings / portföy API | Aynı sembol güncellemesi açıkça anlatılır; işlem defteri gibi sunulmaz. |
| PORT-02 | Portföy aksiyonları, risk planı, limit/yoğunlaşma | Portföy üst risk özeti → detay | Mevcut risk/action layer | Çelişkili profil yeşil güven rozetiyle sunulmaz; hesaplama değişikliği ayrı bağımlılık. |
| SCAN-01 | Aşırı satım/alım, hacimli kırılım, ayı/trend, çelişki | Tarayıcı kategori filtreleri → sonuç → varlık | Mevcut indikatör/puanlar | Tüm kategoriler ulaşılır; çoklu sinyal silinmez; boş kategori kısa durum. |
| BT-01 | Test parametreleri, karşılaştırma, risk metrikleri, eğri, işlemler | Strateji Testi → sonuç özeti/grafik/işlemler | Mevcut backtest yanıtı | İşlemsiz sonuç, hata, eski sonuç ve yeni parametre ayrılır. |
| FC-01 | Monte Carlo, tasarruf, dönem, olasılıksal sonuçlar, stres, korelasyon | Projeksiyon `Portföy senaryosu` | Mevcut portföy/forecast yanıtları | Tek varlık, eksik geçmiş, ek nakit ve para birimi açıklanır. |
| VAL-01 | DCF/Graham/DDM, varsayılanlar, varsayımlar, sonuç, hassasiyet, 10 yıllık tablo | Projeksiyon `Şirket değerlemesi` | Mevcut temel alanlar ve hesaplayıcı | Üç model çalışır; değer ve kaynak/varsayım ayrımı korunur. |
| RPT-01 | Günlük/haftalık rapor, olaylar, kaynaklar, takvim, AI yorum, tahmin ölçümleri | Günlük Rapor → bölüm bağlantıları | Mevcut report/research/evaluation alanları | Rapor eşleşmesi/tarih/model adı varsa doğru gösterilir; eski rapor görünür biçimde etiketlenir. |
| EDU-01 | Rehber, pozisyon hesaplayıcı, quiz, günlük ipucu ve arşiv | Okuryazarlık + mevcut rapor içi eğitim bağlantıları | Mevcut içerik, quiz ve arşiv | Hesaplayıcı/quiz davranışı korunur; eğitim ilerlemesi işlem başarısı gibi gösterilmez. |
| SHELL-01 | Tema, mobil menü, yenileme, yetkili kayıt | Ortak kabuk ve ilgili form | Mevcut tema tercihi ve API | Dört tema, menü focus, yetki hatası, tekrar deneme ve girdi korunması. |

## Kullanıcı görevleri — girişten tamamlanmaya

| Görev | Adımlar ve baskın eylem | Tamamlanma ve geri dönüş |
|---|---|---|
| T1 — Günlük kontrol | Genel Bakış → portföy/risk özetini oku → değişen sinyali seç → gerekçeyi aç | Portföy riskinin ve sinyalin veri zamanı görülür; geri dönüş aynı konuma gelir. |
| T2 — Pozisyon güncelle | Portföy → mevcut satırda `Düzenle` → toplam adet/ortalama maliyet önceden dolu → değişikliği incele → kaydet | Kaydetme sırasında tek istek; başarıda satır güncellenir, hatada alanlar/önceki portföy korunur. |
| T3 — Aday araştır | Tarayıcı → piyasa/kategori filtrele → varlık seç → teknik/araştırma incele → mevcut testi aç | Varlık mevcut test seçicisine taşınır; otomatik test başlatılmaz. Dönüşte filtre ve satır konumu korunur. |
| T4 — Tez ve takip | Varlık → not/bozulma koşulu yaz → kaydet → mevcut alarm kuralını etkinleştir | Taslak/kaydedilmiş ayrımı görünür; kayıt başarısı bildirim teslimi olarak anlatılmaz. |
| T5 — Senaryo incele | Projeksiyon → şirket/model veya portföy seç → varsayımı değiştir → sonuç/duyarlılığı incele → varsayılana dön | Sonucun bağlı olduğu girdiler ve zaman görünür; yeni girdilerle eski sonuç karışmaz. |
| T6 — Araştırmayı doğrula | Rapor → veri bütünlüğünü oku → olay/kaynak → koşullu yorum → ölçüm | Kaynak ve görüş ayırt edilir; sonuçlanmamış tahmin ölçülmüş başarı sayılmaz. |

## Davranış sözleşmesi

### NAV-STATE — URL, seçim ve taslaklar (P1/F)

Görünüm, piyasa ve varlık seçimi hash/URL durumuyla eşlenir; örnek `#market=bist&symbol=ASTOR`. Geçerli doğrudan bağlantı doğru ekranı açar; geçersiz/erişilemeyen varlık mevcut piyasaya döner ve kısa açıklama verir. Tarayıcı geri/ileri görünüm hiyerarşisini izler. Arama yazarken her tuş geçmiş girdisi üretmez; büyük gezinme adımları geçmişe eklenir. Not, portföy tutarı, sır/yetki bilgisi URL'ye yazılmaz.

Piyasa bazında arama/sıralama/seçim ve liste kaydırması sekme dönüşünde korunur. Grafik dönemi/indikatörü varlık veya piyasa için belirlenmiş tek kuralla korunur; beklenmedik başka piyasaya taşınmaz. Başarılı not kaydı sunucuda; başarısız/kaydedilmemiş taslak oturum belleğinde varlık anahtarıyla tutulur. Yerel kalıcı taslak saklama varsayılan değildir. Sayfa kapanışında kaydedilmemiş değişiklik uyarısı sunulur, tarayıcı uyarısının kesin çalışacağı vaat edilmez. Not render/yenileme ile silinmez. Tema mevcut kalıcı tercih olarak korunur.

Odak kuralları: menü Kapat/Escape ile kapanırsa açan düğmeye döner; menüden yeni sayfa seçilirse yeni görünümün başlığına gider; detaydan listeye dönülürse kaynak satırın detay düğmesine döner. Kaynak satır filtre/veri değişimiyle yoksa liste başlığına döner ve kısa açıklama verir.

### PORT-SAVE — Portföy ve kayıt işlemleri (P0/U)

Mevcut kod aynı sembol için `amount` ve `avgPrice` değerlerini **değiştiriyor**; yeni alımı ağırlıklı maliyete eklemiyor. Ekle/düzenle arayüzü bunu yansıtmalı. Mevcut sembol seçilirse `Pozisyonu güncelle` başlığı, toplam adet ve ortalama maliyet alanları, eski → yeni önizleme görünür. Açıklama: `Bu kayıt mevcut pozisyonun toplam adet ve ortalama maliyetini günceller.` Gerçek işlem geçmişi/ek alım muhasebesi B kapsamıdır.

Alanlar para birimiyle etiketlenir; pozitif miktar/fiyat gibi mevcut sözleşme kuralları korunur. Hata alanın yanında, genel API hatası formun altında gösterilir. `Kaydedilmemiş değişiklik → Kaydediliyor → Kaydedildi / Kaydedilemedi` aynı yerde görünür. Tekrar basma ikinci istek oluşturmaz. Silme mevcut onay ve sunucu başarısı ile yapılır; gerçek geri alma desteklenmiyorsa `Geri al` düğmesi uydurulmaz. Not/alarm için de başarısız istek kayıt yapılmış gibi sunulmaz. Alarm anahtarı yalnız kural kaydını temsil ediyorsa metin `Kural kaydedildi` olur; push/e-posta/SMS teslimi B kapsamıdır.

### DATA-STATE — Veri ve güven durumları (P0/U)

| Durum | Görünür metin örneği | Eylem/ davranış |
|---|---|---|
| İlk yükleme | `Piyasa verileri yükleniyor` | İçerik şekline uygun sabit iskelet; bağlı eylem geçici devre dışı. |
| Güncel | `Veri: 29 Eylül 2026 14:30 GMT+2` | `Güncel` yalnız mevcut tazelik kuralına göre; canlı akış yoksa `Anlık` yazılmaz. |
| Yenileme | `Son veriler kontrol ediliyor` | Son başarılı içerik kalır; düğmede işlem geri bildirimi. |
| Eski | `Son veri: … · yeni veri alınamadı` | Eski içerik tarihli kalır; eski olduğunu gizleyen yeşil durum yok. |
| Kısmi | `ABD ve BIST yüklendi; kripto verisi alınamadı` | Başarılı pazarlar çalışır; hata ilgili alanda ve tekrar deneme. |
| Gerçek boş | `Henüz pozisyon eklenmedi` | Portföy başarıyla okunduğu doğrulanır; `Pozisyon ekle`. |
| Filtrede sonuç yok | `Bu filtrelerle sonuç bulunamadı` | Aktif filtreler görünür; `Filtreleri temizle`. |
| Hata/erişim | `Portföy yüklenemedi` / `Bu kayıt için yetki gerekiyor` | Boş portföy görünümü kullanılmaz; düzenleme girdileri korunur. |
| Hesaplanamıyor | `Korelasyon için en az iki varlık gerekiyor` | Kısa gerekçe; mevcut ilgili eyleme bağlantı. |
| Rapor eşleşmiyor | `Bu fiyat verisiyle eşleşen AI raporu yok` | Teknik veri çalışır; varsa tarihli eski rapora erişim, yoksa açık eksiklik. |

Metinler örnektir; tarihler test fixture'ıdır, üretimde gerçek yanıt kullanılır. Veri yaşı yanıtın gerçek veri zamanından hesaplanır; az önce HTTP isteği tamamlanması verinin az önce üretildiği anlamına gelmez. Yenileme okuma/yeniden üretim farkını anlatır: görünümü tekrar okumak ile yetkili sunucu veri üretimi aynı düğmeyle belirsizleştirilmez. Mevcut yenileme yönetici yetkisi istiyorsa bunun neyi güncellediği ve neden yetki gerektiği açıklanır. Mevcut doğrulama akışındaki kullanıcı metni `Yönetici doğrulaması` gibi görev dilinde olur; `Vercel ADMIN_SECRET` gibi uygulama ayrıntıları ürün kopyasından çıkarılır. API anahtarı/model sırları ürün akışına taşınmaz. Yetki mimarisini değiştirmek B kapsamıdır.

`Teknik skor` olasılık değildir; `veri/karar kalitesi` isabet oranı değildir; `kanıt bekliyor` alanında hangi kanıtın eksik olduğu yazılır. Risk özetinde mevcut risk planı ile profil uyuşmuyorsa çelişki görünür hale getirilir, genel yeşil profil kaldırılır. Risk formülünü değiştirmek UI düzeltmesi sayılmaz. Monte Carlo bantları mevcut simülasyon yüzdelikleri ise bu isimle sunulur; kalibre edilmiş tahmin güven aralığı diye adlandırılmaz. Veri dönemi/örneklemi bilinmiyorsa üretilmez.

Genel Bakış, sinyal farkı ve Karar izi için iki karşılaştırılabilir snapshot bulunmazsa son teknik durum/veri zamanı gösterilir; `Değişim karşılaştırması mevcut değil` açıklaması kullanılır. Görev T1 mevcut durum üzerinden devam eder. Yeni geçmiş verisi üretimi B kapsamıdır; eski/yeni değer uydurulmaz.



## Ek — zorunlu kabul senaryoları

| Kod | Senaryo | Beklenen sonuç |
|---|---|---|
| A1 | Eşleşen veriyle Genel Bakış, hazır aday yok ama teknik AL var | AL skoru ile hazır karar ayrılır; kokpit bütün kritik alanları okunur gösterir. |
| A2 | Portföyde tek varlık %100; risk planı yoğunlaşma uyarılı | Yeşil `Dengeli` güven mesajı yok; risk gerekçesi anlaşılır. |
| A3 | Mevcut sembolü düzenle; kayıt API 500 dönsün | Toplam adet/maliyet güncelleme anlamı açık; girdi ve eski kayıt korunur, tekrar deneme çalışır. |
| A4 | Not yaz → başka sayfa → geri dön → kaydet | Taslak kaybolmaz; server başarıdan sonra kaydedildi; yetki hatasında sahte başarı yok. |
| A5 | Filtreli BIST listesi → varlık → tarayıcı geri/ileri | Görünüm, seçim, filtre ve scroll geri gelir; doğrudan URL aynı varlığı açar. |
| A6 | A varlığı isteği yavaş; hemen B'yi seç | B görünümüne A fiyat/grafik/notu basılmaz; gereksiz live duyuru yok. |
| A7 | Kripto başarısız, ABD/BIST başarılı; rapor eşleşmiyor | Başarılı piyasalar kullanılır; 0 kripto/boş rapor normal durum gibi sunulmaz. |
| A8 | Backtest 0 işlem; değerlemede geçersiz alan; tek varlık korelasyonu | 0 örneklem isabet olarak sunulmaz; alan hatası ve hesaplanamama gerekçesi görünür. |
| A9 | Klavye ile menü, filtre, sekme, slider, detay, kaynak ve form | Tüm görevler tamamlanır; focus görünür/geri döner; tooltip tek bilgi kaynağı değildir. |
| A10 | Ekran okuyucu ile fiyat/karar ve grafik özeti | Sembol, birim, durum anlaşılır; alternatif verilere ulaşılır. |
| A11 | Dört tema, uzun Türkçe metin, hareket azaltma, %200 zoom, 320–1440 px | Kritik metin kaybolmaz, kontrollere ulaşılır, gövde taşmaz; içerik animasyona bağlı değil. |
| A12 | Yeni veri gelirken form dolu; çift kaydet/çift simülasyon denemesi | Girdi/bağlam korunur; tek işlem, eski sonuç yeni girdinin sonucu gibi sunulmaz. |
