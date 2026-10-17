# Finans — AL sinyalleri için strateji taraması

14 Ekim 2026 · Literatür taraması ve otomatik test önerisi

## Karar

İlk karşılaştırma için sade trend takibi, göreli momentum, fiyat kırılımı ve mevcut destek/yeniden test yöntemi seçilmeli. Ortalamaya dönüş ayrı bir deney olmalı. Şirket kalitesi/değer ve haber sürprizi stratejileri, tarihsel verileri otomatik ve zamanına uygun alınabildiğinde sonraki aşamaya geçmeli.

Bu sıralama araştırmaları ve Finans'ın günlük fiyat verisiyle çalışan yapısını birlikte değerlendiren benim önerimdir. Çalışmaların başarısını Finans'ın başarısı olarak sunmuyoruz. Bu tur strateji kodu, aktif eşikler, modeller veya eski sonuçlar değiştirilmedi; yeni backtest çalıştırılmadı.

## Kapsam ve sınır

Yazarların/araştırma kurumlarının sayfaları, yayıncı özetleri ve erişilebilir makale metinleri incelendi. Bu sistematik meta-analiz değildir; bütün yayınların tam metni okunmadı. Bazı NBER sayfaları doğrudan açılırken hata verdi, içerikleri indekslenmiş birincil kaynak özetinden değerlendirildi. Tam metni açılmayan bir çalışmanın yöntem ayrıntıları doğrulanmış kabul edilmedi.

Uzun/kısa portföy, vadeli kontrat, endeks ve yalnız alım yapan tek hisse sistemi aynı şey değildir. Eski bir örneklemdeki bulgu, bugünkü ABD/BIST/kripto varlık listesinde maliyet sonrası avantaj olduğunu göstermez. AQR hem araştırma üreten hem yatırım yöneten bir kurumdur; tek kaynak olarak kullanılmadı. Türkiye araştırmaları ve maliyet/yanlılık çalışmaları karşılaştırmaya dahil edildi.

## Strateji aileleri

| Aile | Temel fikir | Araştırmadan çıkan bulgu | Finans için değerlendirme |
|---|---|---|---|
| Zaman serisi momentumu / trend | Varlığın kendi geçmiş yönü sürüyorsa alımda kalmak; koşul bozulunca çıkmak | Moskowitz, Ooi ve Pedersen'in çalışması 58 vadeli/forward kontratta uzun dönemli momentum buluyor | İlk sade kıyas. Hisse ve spot kriptoya yalnız alım uyarlaması yeniden test edilmeli |
| Göreli momentum | Aynı piyasadaki varlıkları geçmiş performansına göre sıralamak | Jegadeesh–Titman hisse momentumunu, uygulama araştırmaları maliyet sonrası uygulanabilirliği inceliyor | ABD için erken aday. Mevcut dar listede sıralama tüm piyasayı temsil etmez |
| Hareketli ortalama / fiyat kanalı kırılımı | Fiyatın geçmiş ortalama veya önceden oluşmuş tepeyi aşması | Brock ve arkadaşları tarihsel Dow Jones örnekleminde olumlu bulgular bildiriyor | Basit otomatik test adayı; bu çok eski örneklem bugünkü kârlılığı kanıtlamaz |
| Destekten dönüş / kırılım sonrası yeniden test | Güçlü trendde daha tanımlı giriş, stop ve hedef aramak | Teknik örüntülerin bilgi içerebildiğine dair çalışmalar var; Finans'ın tam koşullarının başarısı gösterilmiş değil | Mevcut yöntem kıyas olarak korunmalı; ek şartların gerçekten fayda sağlayıp sağlamadığı ayrı ölçülmeli |
| Ortalamaya dönüş | Kısa vadede aşırı düşen varlığın toparlanmasını beklemek | Dönüş getirilerinin maliyete duyarlılığı belirgin; bazı Türkiye çalışmaları ters yönlü etki buluyor | Ayrı deney. Düşük RSI tek başına AL koşulu olmasın |
| Kalite ve değer | Kârlı, sağlam, makul değerlenmiş şirketlere yönelmek | QMJ ve değer/momentum literatürü tarihsel portföy bulguları sunuyor | Tarihsel finansal açıklama zamanı ve şirket verileri otomatik alınmadan test eksik olur |
| Haber / bilanço sürprizi | Beklentiyi aşan gerçek açıklamanın sonraki fiyat etkisini izlemek | PEAD literatürü açıklama sonrası devam hareketini ve işlem engellerini inceliyor | Zaman damgalı açıklama ve açıklama öncesi konsensüs gerekli. LLM'in olumlu haber yorumu bunun yerine geçmez |
| Çiftler / göreli değer | İlişkili iki varlığın ayrışmasının kapanmasını beklemek | Gatev ve arkadaşları tarihsel ABD hisse çiftlerini incelemiş | Şimdilik ikinci planda: iki bacak, açığa satış ve ayrı maliyet modeli; mevcut AL akışına doğrudan uymaz |
| Volatiliteye göre risk azaltma | Oynaklık yükselince pozisyon riskini düşürmek | Moreira–Muir bazı faktör portföylerinde iyileşme buluyor | Giriş sinyali değildir. Önce sabit büyüklükle stratejileri karşılaştır, sonra ayrı risk katmanı olarak dene |

Kaynaklar: [Zaman serisi momentumu](https://www.aqr.com/Insights/Datasets/Time-Series-Momentum-Original-Paper-Data), [hisse momentumu](https://www.nber.org/papers/w7159), [momentum uygulaması](https://www.aqr.com/Insights/Research/Working-Paper/Implementing-Momentum-What-Have-We-Learned), [hareketli ortalama/kırılım](https://onlinelibrary.wiley.com/doi/10.1111/j.1540-6261.1992.tb04681.x), [teknik örüntü araştırması](https://www.nber.org/papers/w7613), [işlem maliyetleri](https://www.aqr.com/Insights/Research/Working-Paper/Trading-Costs-of-Asset-Pricing-Anomalies), [kalite](https://www.aqr.com/Insights/Research/Working-paper/Quality-minus-Junk), [değer ve momentum](https://www.aqr.com/insights/research/journal-article/value-and-momentum-everywhere), [haber ve momentum](https://www.nber.org/papers/w34086), [çiftler](https://www.nber.org/papers/w7032), [volatilite yönetimi](https://www.nber.org/papers/w22208).

## Piyasalara göre yorum

### ABD

Sade trend ve göreli momentum erken test için en makul adaylar. Bu bir literatür ve veri uygunluğu değerlendirmesidir, henüz Finans'ın sonuçlarına dayanan bir kazanan seçimi değildir. Momentum uygulama çalışması yedi yıllık gerçek portföy verisinde gider ve tahmini işlem maliyetlerini dikkate alır; aynı maliyet ve sonucu bize aktaramayız. [Ross ve arkadaşları](https://www.aqr.com/Insights/Research/Working-Paper/Implementing-Momentum-What-Have-We-Learned).

Momentumun keskin toparlanma dönemlerinde zarar üretebildiğine dair araştırma da var. İlgili bulguda uzun/kısa portföyün kaybeden hisseleri açığa satan bacağı önemlidir; yalnız alım yapan Finans'a aynı kayıp boyutu atfedilmez. Buradan çıkarımım, piyasaların farklı dönemlerini ayrı raporlamaktır. [Momentum Crashes](https://www.aqr.com/insights/research/journal-article/momentum-crashes).

### BIST

Momentum burada otomatik olarak birinci seçenek değildir. Serkan Ünal'ın 2021 çalışması 1997–2020 döneminde işlem gören şirketlerin geçmiş getirilerini gruplar; üst beşteki kazananların sonraki dönemde ortalama altında performans gösterdiğini bildirir. Bu bulgu belirli dönem ve portföy tanımına aittir; bütün günlük momentum kurallarını çürütmez. [Makale](https://dergipark.org.tr/tr/pub/ijmeb/article/832584).

Eski bir İMKB tezinde 223 teknik kuralın çoğu maliyet hariç olumlu görünürken, maliyet eklenince al-tuta göre avantaj çok azalır. Tek tez ve eski dönem güncel BIST hakkında kesin hüküm değildir; maliyet kontrolünü atlamamak için bir karşı örnektir. [Marmara Üniversitesi arşivi](https://openaccess.marmara.edu.tr/entities/publication/0200fc08-12ae-4b1b-a2f0-85a04180bb27).

Önerim: BIST'te trend ve dönüş yaklaşımını aynı veriyle karşılaştırmak. Önceki canlı kontrolde görülen seans saatleri uyuşmazlığı çözülmeden, işlem giriş/çıkış simülasyonunu güvenilir sonuç olarak yayımlamamak. Bu teknik engel stratejinin iyi veya kötü olduğunu söylemez; kullanıcıdan elle belge beklenmez.

### Kripto

Liu–Tsyvinski Bitcoin, Ripple ve Ethereum örnekleminde zaman serisi momentumu ve yatırımcı ilgisiyle ilişkili öngörü bulur. Üç varlık üzerinden elde edilen tarihsel sonuçlar bütün altcoinlere taşınamaz. [Araştırma](https://www.nber.org/papers/w24877).

İlk test için spot fiyatla sade trend ve kırılım düşünülebilir. Alım-satım farkı, komisyon ve düşük likiditede kayma stresleri ayrı ölçülmeli. Vadeli kontrat/funding/arbitraj stratejilerini spot fiyat verisiyle yapılmış gibi göstermemeliyiz. Geçmiş varlık listesi yoksa sonuç yalnız mevcut liste için bir incelemedir; tüm kripto piyasası başarısı değildir.

## İlk otomatik karşılaştırma seti

Aşağıdaki değerler önerdiğim başlangıç deneyleridir; makalelerden Finans için çıkarılmış optimal parametreler değildir. Önce bunları sabitlemek ve kaç varyant denendiğini kaydetmek gerekir.

| Deney | Başlangıç tanımı | Çözdüğü soru |
|---|---|---|
| Mevcut yöntem | Eski puanlama ve yeni destek/yeniden test yöntemi ayrı sürümlerle | Yeni kurallar eski yöntemi gerçekten iyileştiriyor mu? |
| Sade trend | Tamamlanmış günlük kapanışın 200 günlük ortalama üzeri olması; koşul bozulunca çıkış | Karmaşık puana gerek olmadan risk/getiri iyileşiyor mu? |
| Göreli momentum | Aynı piyasanın 126 işlem günündeki getirisine göre sıralama; en son 21 günü dışlama; aylık yeniden değerlendirme | Varlık seçimi, yalnız puan eşiğinden daha iyi mi? |
| Fiyat kanalı kırılımı | Bugünün kapanışını önceki 55 tamamlanmış seansın en yüksek fiyatıyla karşılaştırma; önceki 20 seansın dip seviyesine dayanan çıkış | Destek kümeleri yerine sade kırılım daha faydalı mı? |
| Kontrollü dönüş | Uzun trendin üstündeki varlıkta kısa RSI düşüşü ve sonraki kapanışta toparlanma; kısa süreli çıkış | Yükselişi kovalamak yerine geçici düşüşten giriş daha iyi mi? |

Dönüş deneyinin RSI süresi/eşiği ve kısa çıkış süresi henüz seçilmedi. Bu seçim ilk testi çalıştırmadan önce kayıt altına alınmalı; kötü sonuç görünce aynı dönemde tekrar tekrar oynanmamalı. Kırılım düzeyi hesaplanırken bugünkü mum geçmiş pencereye katılmaz. Sinyal günü kapanış fiyatından geriye dönük kusursuz alım varsayılmaz; sonraki uygun seans ve fiyat boşlukları hesaba katılır.

Tek bir karşılaştırma tablosunda bütün yöntemlere ortak fiyat, maliyet, pozisyon boyutu ve zaman kesiti uygulanır. Giriş kalitesini çıkış kalitesinden ayırmak için ortak çıkışla ek kontrol yapılır. Her varyant aynı strateji değişikliğinin yeni başarılı örneği gibi sayılmaz.

## Otomasyon için uygulanabilir değerlendirme

1. Günlük fiyat verisi otomatik alınır; veri zamanı ve şirket fiyat düzeltmeleri sistem tarafından kontrol edilir. Kaynak erişim hataları ayrı raporlanır.
2. Yalnız o gün bilinen veriyle karar üretilir. Gelecekteki mumla eski destek teyidi veya güncel bilanço ile geçmiş değerleme yapılmaz.
3. ABD, BIST ve kripto ayrı ölçülür. Günlük, aylık ve 90/180 günlük ufuklar tek başarı oranında birleştirilmez.
4. Strateji dönemi ortak al-tut ve eşit ağırlıklı sepetle karşılaştırılır. İşlem başına ortalama, toplam portföy getirisi yerine yazılmaz.
5. Önceden tanımlanmış birkaç zaman penceresinde tekrar değerlendirilir. Çakışan ileri sonuçlar eğitim ve test arasında ayrılır. Test dönemi ayar seçmek için tekrar tekrar kullanılmaz.
6. Temel maliyet ve daha yüksek maliyet senaryoları denenir. Gerçek ücretler otomatik bilinmiyorsa açık varsayım kullanılır; maliyetin sıfır olduğu varsayılmaz.
7. Çok varyant denendiğinde en iyisini seçmenin getirdiği yanlılık da değerlendirilir. PBO/benzeri analiz veri yeterliyse yardımcıdır; küçük örneklemde istatistiksel kesinlik üretilmez. [Bailey ve arkadaşları](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf).
8. Testte umut veren yöntem önce sanal günlük takipte mevcut yöntemle yan yana çalışır. Eski kayıtların sonuçları değiştirilmez.

Bu akışın hiçbir aşaması kullanıcıdan elle işlem girmesini gerektirmez. Araştırma protokolü de bütün yöntemler için bir kez uygulanır; her sinyalde yeni manuel inceleme listesi oluşturulmaz.

## Başarı ölçümü

Ana değerlendirme maliyet sonrası portföy sonucu, kıyasa göre fark ve en büyük düşüştür. İşlem sayısı, piyasada kalınan süre, ortalama/medyan işlem sonucu, kazanç/kayıp büyüklüğü, işlem sıklığı ve farklı dönemlerdeki dağılım bunları açıklar. Yüksek isabet tek başına yeterli değildir; az sayıda büyük kayıp çok sayıda küçük kazancı silebilir.

Avantaj birkaç varlık veya tek yükseliş döneminde yoğunlaşıyorsa bu durum gösterilir. Küçük parametre değişiminde sonuç çöküyorsa yöntem sağlam kabul edilmez. Güncel varlık listesini geçmişe uyguladığımızda hayatta kalan şirket seçimi yanlılığı vardır; bu sınıra uygun isimlendirme yapılır.

90/180 günlük öğrenme sonuçlarının oluşması, kısa vadeli strateji karşılaştırmasının tek ön şartı değildir. Mevcut otomatik geçmiş fiyatlarla tarihsel deney başlatılabilir; tarihsel simülasyon canlıda ileriye dönük başarı diye sunulmaz.

## Şimdilik seçmediğim yaklaşımlar

- Tek başına RSI/MACD kesişimi veya çok sayıda benzer göstergenin oy çoğunluğu: ayrı ve ortak katkıları test edilmeden AL doğruluğu varsayılmaz.
- Günlük açıklama zamanları olmadan haber duygu puanıyla alım: sonradan öğrenilen haber geçmiş karara sızabilir.
- Hızlı çiftler, funding ve arbitraj: gerekli çift bacak, işlem yeri ve tarihsel maliyet/funding verileri bu taramada sağlanmış değil.
- Büyük model/deep learning/RL değişimi: sade kıyasları yenip yenemediğini göstermeden karmaşıklık artırır.
- BIST'e doğrudan ABD parametrelerini taşıma: yerel literatürün karşı bulguları ve mevcut veri engeli nedeniyle ayrı deney gerekir.

## Önerilen uygulama sırası

Önce ortak otomatik test ve rapor; ardından sade trend, göreli momentum ve kırılımın mevcut yöntemle karşılaştırılması. Dönüş ayrı deney olarak eklenir. BIST veri engeli çözülürken kaynakları uygun olan ABD ve kripto deneyleri ilerleyebilir. En son temel veri/haber stratejileri ve risk büyüklüğü katmanı eklenir. Bir kazanan çıkmaması da geçerli sonuçtur; bu durumda AL sayısını artırmak için kuralları gevşetmeyiz.
