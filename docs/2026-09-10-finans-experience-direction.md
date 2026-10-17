# Finans: deneyim tasarımı önerisi

Durum: tasarım önerisi; uygulama onayı veya kod teslimi değildir. İnceleme mevcut kaynak kodu, yerel 9 Eylül raporları ve önceki QA ekran görüntülerine dayanır. Finansal haberlerin doğruluğu bu tasarım çalışmasında yeniden araştırılmadı.

## Önerilen yön: Piyasa Atlası

Finans markası korunur; Piyasa Atlası deneyimin çalışma adıdır. Kullanıcı gündüz bilgisayarında veya telefonda birkaç dakika içinde gündemi anlamak, ardından seçtiği varlığa geçmek istiyor. Bu nedenle varsayılan okuma yüzeyi nötr açık, metin koyu mürekkep; grafik ve karşılaştırma alanları koyu. Kobalt seçim ve yönlendirme rengi. Tam koyu görünüm tercihi bulunur. Mevcut dört tema seçiminin yeni paletlere geçişi açıkça tasarlanır; kayıtlı tercih sessizce kaybolmaz.

Geniş, asimetrik haber kompozisyonları, tek bir olaya ait büyük açıklayıcı görsel, seyrek ayırıcı çizgiler, kompakt piyasa satırları. Başlıklar karakterli fakat düğme ve veri metinleri sade sans. Ana başlık masaüstünde 44–64px, mobilde 30–36px; metin 16–18px; kontroller 14–16px. Rakamlar eşit basamak genişliği kullanır. Renk değerleri ve font adayları tek örnek sayfada Türkçe karakter/kontrast/yoğunluk kontrolünden sonra kesinleşir.

Üç yaratıcı seçenek:
- Piyasa Atlası: açık okuma yüzeyi, koyu grafik alanı, kaynaklı olay-etki ilişkileri. Önerilen ana yön.
- Gece Bülteni: baştan sona koyu, büyük haber tipografisi, yoğun grafik alanı. Güçlü atmosfer; mevcut tasarıma yakın kalma riski.
- Finans Laboratuvarı: nötr açık zemin, senaryo ve geçmiş karar karşılaştırması merkezde. Öğretici ve etkileşimli; günlük habere ulaşma süresi uzayabilir. Laboratuvar özellikleri Atlas içinde ayrı alan olur.

## İçerik bulguları ve editoryal kurallar

Yerel ai.json içinde 4 araştırma olayı, 2 koşullu senaryo, 0 forecast ve 0 araştırma sinyali bulunuyor. base.json ekonomik takvimi unavailable, bilançoları available; kripto kapsamını eksik bildiriyor. Bunlar canlı piyasanın bugünkü durumu olarak sunulmayacak.

- Rapor tarihi, olay tarihi, kaynak zamanı ve fiyat zamanı ayrı gösterilir. Eski rapordaki bugün ifadesi bugünkü haber izlenimi vermemeli.
- Teknik skor, model yorumu, sayısal tahmin ve gerçekleşen sonuç ayrı bilgi türleridir. 80/100 teknik skor %80 yükseliş ihtimali değildir.
- Konsensüs eksikse sürpriz büyüklüğü çizilmez; fiyat tepkisi doğrulanmadıysa boş grafiğe veya nötr etikete dönüştürülmez.
- Birincil kaynak ile resmî ikinci el özet ayrımı görünür kalır. Olayın gerçekliği ile modelin nedensellik yorumu aynı görsel çizgiyle sunulmaz.
- Günün ana haberi: ne değişti, beklentiden farkı, olası etki, karşı kanıt, sonraki izleme koşulu. Mevcut alanlar kullanılır; eksik alan için dekoratif içerik üretilmez.
- Uzun metodoloji metni yöntem alanına taşınır; kararın yorumunu değiştiren veri eksikliği haberin yanında kalır.
- Sinyal yok durumu: neden üretilemedi ve yeniden değerlendirme için hangi kanıt beklendiği. Sıfır tahmin başarı grafiği üretmez.

## Bilgi mimarisi

Birincil navigasyon: Bugün / Piyasalar / Takibim / Laboratuvar. Arama ayrıca görünürdür.

Bugün: son bültenin tarihi, bir ana olay, iki ikincil gelişme, bağlantılı piyasalar, sıradaki açıklamalar. Günlük rapor aynı olayların ayrıntılı okuma görünümüdür; ikinci bir tekrar akışı olmaz.

Piyasalar: ABD/BIST/Kripto, karşılaştırılabilir liste, grafik ve ilgili olaylar. Teknik tarayıcı burada gelişmiş filtreye dönüşür. Bir varlığı açınca önce fiyatın zamanı ve değişim, sonra haber, teknik görünüm, risk ve kişisel not gelir.

Takibim: izleme listesi, portföy, notlar, alarmlar. Yeni izleme listesi veya olay-portföy eşlemesi mevcut şemada yoksa ayrı iş kapsamıdır.

Laboratuvar: strateji testi, projeksiyon, geçmiş tahmin sonuçları ve konuyla ilişkili okuryazarlık. Kullanıcı ana sayfadan bunları bulmak için on eşit menü seçeneğini taramaz. Eski sayfalara doğrudan erişim korunur.

## İmza etkileşimler

1. Olaydan piyasaya: seçili haberin koşul, olası aktarım kanalı ve ilgili varlıkları yatay bir akışta gösterilir; telefonda adım adım dikey okunur. Önerilen ilişki, gözlenmiş fiyat tepkisinden kesikli çizgi ve metin etiketiyle ayrılır. Kullanıcı kaynağı aynı bağlamda açar. Serbestçe dolaşan düğüm yumağı veya dekoratif dünya küresi kullanılmaz.
2. O an ne biliyorduk: arşiv tarihi seçildiğinde yalnız o anda kaydedilmiş haber ve tahmin gösterilir; kullanıcı Sonucu göster dediğinde sonraki gerçekleşen veri eklenir. Zaman damgalı arşiv ve sonuç verisi olmayan dönemler desteklenmez. İlk aşamada mevcut günlük rapor arşivi kullanılabilir; ayrıntılı tekrar oynatma ek veri çalışmasıdır.
3. Beklenti ile gerçekleşen: doğrulanmış konsensüs, açıklama öncesi model tahmini ve gerçekleşen değer aynı ölçekte karşılaştırılır. Eksik noktalar belirtilir. Belirsizlik aralığı ancak kaydedilmişse çizilir; aralık animasyonla icat edilmez.
4. Senaryoyu dene: Laboratuvar içinde kullanıcı tek varsayımı değiştirir, mevcut hesaplama modeli sonuçları yeniden hesaplar. Değişen alanlar vurgulanır; varsayım, yöntem ve sınırları yanında görünür. Her sürükleme bir model/API çağrısı yapmaz. Nedensel model yoksa yalnız açıklayıcı senaryo metni gösterilir.

## Hareket ve yüzey işçiliği

Basış 100–140ms, seçim/menü 160–220ms, olay ayrıntısına bağlamı koruyan geçiş 240–320ms. Açılışta zorunlu gösteri yok. Haber seçimi ilgili grafiği ve kaynağı birlikte günceller. Güncellemede sayı sıfırdan sayılmaz; değişen satır kısa süre vurgulanır. Görünmeyen içerik animasyon tetiklenmesini beklemez.

Standart sayfa kaydırması, görünür odak, dokunmada gerçek düğmeler. Mobilde hover bağımlılığı yok. Hareket azaltma tercihinde konum/ölçek hareketi tamamen kapanır. Ses ancak ileride açık tercih olursa; sürekli ticker, cursor efekti, otomatik kamera hareketi yok.

## Uygulama ve maliyet sınırı

İlk teslim bütün siteyi kodlamak değildir: Bugün → bir olay → bir varlık yolunu gerçek mevcut içerikle, masaüstü ve mobilde çalışan tek örnek olarak tasarlamak. Aynı örnekte eksik kaynak ve eski rapor da gösterilir. Görsel dil burada kesinleştikten sonra diğer ekranlar uyarlanır.

Mevcut vanilla JS başlangıçta yeterlidir; tasarım amacıyla framework geçişi açılmaz. Render kodu, veri erişimi ve etkileşim durumu sınırları netleştirilir. UI gezinmesi model çağırmaz. Yeni çıkarımlar mevcut rapora ait tek bir üretim aşamasında yapılacaksa ayrı veri/model kapsamı olarak değerlendirilir.

En fazla iki uygulama ajanı: biri sayfa/etkileşim, biri görünüm/hareket; dosya sahipliği ayrılır. Root tek örnek onayı ve son kabul yapar. Hata çıktıkça bütün site yeniden taranmaz; ilgili akış yeniden test edilir. Her paket somut çalışan çıktı ve kısa test kanıtı verir. Kullanım limiti durumunda mevcut dosyalar ve kalan somut işler tek devir notunda bırakılır.

## Kabul

İlk ekranda kullanıcı ana olayı, veri tarihini ve ayrıntıya giriş yolunu bulmalı. Haber → kaynak/karşı kanıt → varlık yolunda seçim korunmalı. 390/630/820/1280/1440 genişlik, klavye, azaltılmış hareket, eski rapor, eksik konsensüs ve API hatası kontrol edilir. Sahte başarı veya kesinlik izlenimi yaratılmamalı. Performans hedefleri ölçülür; ödül kalitesi peşinen ilan edilmez.

## İncelenen referanslar

- https://pudding.cool/ — içerikten etkileşim fikri üretmek; finans ürününe birebir görsel kopya önerilmiyor.
- https://www.awwwards.com/sites/proof-1 — ödül kaydındaki deneyim odaklı marka ve veri görselleştirme yaklaşımı; tüm canlı etkileşimleri bu tur test edilmedi.
- https://stripe.com/annual-updates/2024 — raporu tarihlenmiş bir yayın olarak ele alma; animasyonları bu tur görsel olarak doğrulanmadı.
