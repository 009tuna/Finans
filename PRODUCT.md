# Finans Otomasyonu - PRODUCT Context

## 17 Ekim 2026 — Veri takvimi ve AI analist katmanı

Her önemli veri açıklaması önceki değer, piyasa beklentisi ve gerçekleşen değerle gösterilir; gerçekleşen beklentiye göre üstü/altı/paralel olarak işaretlenir. Takvim Forex Factory haftalık akışı ile Nasdaq ekonomik takviminden otomatik gelir; Türkiye verilerini (TCMB, TÜİK) günlük AI araştırması ekler. AI her veri için kendi görüşünü, güven düzeyini ve beklenti üstü/altı durumda ABD, BIST ve kripto için ayrı etkiyi yazar; ayrıca her piyasa için 1–2 haftalık yön görüşü (olumlu/nötr/olumsuz, tez, destekleyenler, bozacaklar, izlenecek koşul) verir. Doğrulama ve kaynak denetimi arka planda kalır; görünen metin analist notu gibidir. NFP/CPI ölçülebilir tahmin kayıtları ayrı ve değiştirilemez olarak sürer.

## 14 Ekim 2026 — Otomatik öğrenme

Öğrenme ve sinyal ölçümü otomatik alınan fiyat, gösterge, veri zamanı ve resmî açıklamalarla yürür. Kullanıcıdan belge, gerçek emir gerçekleşmesi, not veya elle işlem kaydı istenmez. Kaynak doğrulaması sistemin veri kontrolüdür; kullanıcı görevi değildir. İlk karar korunur, sonraki kaynak değişimleri ayrı saklanır. Öğrenme modülünün 90/180 günlük fiyat sonucu ile sanal işlem hedef/stop sonucu ve gerçek kişisel portföy getirisi ayrı ölçümlerdir. Ana görünüm neyin toplandığını ve hangi sonucun beklendiğini anlatır; kaynak/kayıt teknik ayrıntıları açılır bölümde kalır.

## 13 Ekim 2026 — Araçlar ve sinyal kapsamı

Otomatik gözlem ana akıştır; Portföy, Strateji Testi, Finansal Projeksiyon ve Okuryazarlık isteğe bağlı olarak menüden ve doğrudan bağlantıyla erişilebilir kalır. Gözlem modu bu sayfaları Sinyaller'e yönlendirmez. Teknik AL adayları, önceki açık kayıtlar ve yeni yapısal işlemler ayrı gösterilir. Yeni işlem bulunmaması bütün piyasaların veya araçların çalışmadığı anlamına gelmez; kaynak engeli görünür açıklanır.

## 6 Ekim 2026 — Varsayılan kullanım

Kullanıcı okur ve izler; not yazma, kişisel tez oluşturma, alarm tanımlama veya elle işlem kaydetme zorunluluğu yoktur. Sistem yapısal koşullarla sinyali kaydeder, kanıtlı sanal giriş/çıkışı takip eder ve ölçüme uygun sonuçları ayırır. Ana ürün akışı Genel Bakış → Sinyaller → Günlük Rapor'dur. Model beklentisi, piyasa konsensüsü, koşullu etki ve gerçekleşen sonuç birbirinden ayrı gösterilir. Sayı veya kaynak eksikse açık eksik durum gösterilir; kullanıcıdan boşluğu doldurması istenmez.

## Users
* **Hedef Kitle**: Kendi portföyünü, piyasa puanlarını ve teknik indikatörlerini anlık takip etmek isteyen, gereksiz reklam ve görsel gürültüden uzak, veri yoğunluğuna (data-density) ve matematiksel doğruluğa önem veren bireysel yatırımcılar ve finansal analistler.
* **Kullanıcı Karakteri**: SRE (Site Reliability Engineer) veya sistem yöneticisi mantığıyla, verileri temiz, organize ve gecikmesiz bir şekilde izlemek isteyen analitik zihinler.

## Brand & Tone
* **Marka Adı**: Finans Otomasyonu (Yatırım Paneli)
* **Ton**: Matematiksel, rasyonel, ciddi, dikkat dağıtmayan ve minimalist.
* **Açıklama**: Spekülasyon veya şatafatlı grafikler yerine, somut teknik puanlama modelleri ve tarihsel backtest verileriyle yatırım kararlarını destekleyen bir gözetim aracı.

## Interface Register
* **Register**: `product`
* **Surface**: Kişisel Finans Kontrol Paneli (Interactive Dashboard)

## Anti-References (Yasaklı Tasarım Yaklaşımları)
* **SaaS Şablonları (AI Slop)**: Metinlerde gradyan kullanımı (`background-clip: text`), anlamsız cam efekti (glassmorphism) arka planları, her yerde aynı boyuttaki kart ızgaraları.
* **Hero Metric Şablonları**: Dev gibi yeşil sayılar, altında anlamsız küçük etiketler. Finansal veriler büyük puntodan ziyade, bağlamı ve tarihiyle birlikte anlamlıdır.
* **Kenar Çizgisi Vurguları (Side-strip borders)**: Kartların veya uyarı kutularının solunda/sağında 2px'lik renkli kenar çizgileriyle vurgu yapılması (SaaS klişesidir ve ucuz gösterir).
* **Renkli Aşırılık**: Her yeri neon yeşili veya kırmızıya boyamak. Renkler sadece eylem/durum bildirmek için çok kısıtlı ve stratejik düzeyde kullanılmalıdır.
