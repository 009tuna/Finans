# Finans çalışma alanı — yeniden kurulan görsel düzen

2 Ekim 2026 · Taslak uygulama, görsel kabul bekliyor.

Kullanıcı önceki büyük ve seyrek düzeni, ardından yalnız küçültmeye dayanan sıkılaştırmayı reddetti. Bu paket iki sürümün de görsel kabulünün yerine geçmez; yeni yerleşimin gerçek ekran üzerinde incelenmesi gerekir.

## Yön

Ana içerik ön planda, gezinme ve kaynaklar yardımcı alanlarda kalır. Sakin grafit yüzeyler ve sınırlı mavi seçim vurgusu kullanılır. Büyük sayılar, dikkat isteyen rozetler, dekoratif ikon hareketleri ve iç içe çerçeveler azaltılır. Bütün mevcut görevler ve finansal içerik korunur.

| Alan | Uygulama kararı |
| --- | --- |
| Gezinme | 176 px; 12 px etiket, 34 px masaüstü satır. Uzun adlar için yalnız küçültmek yerine yeterli genişlik. |
| Üst çubuk | 52 px başlangıç yüksekliği; 20 px başlık, 11.5 px yardımcı metin. |
| Ana alan | Kalan genişlik; 16/20 px kenar boşluğu, tutarlı 8/12/16/24 px bölüm aralıkları. |
| Yazı | 13 px arayüz, 12.5 px tablo, 13.5 px rapor; 15–16 px bölüm başlıkları. |
| Kontroller | Masaüstünde 32 px; telefon ve kaba işaretçide 44 px hedef alanı. |
| Rapor | Önce rapor kesiti ve kısa veri durumu; sonra bölüm bağlantıları ve düz içerik akışı. Aynı başlık için iki büyük kutu kullanılmaz. |
| Kaynaklar | Sağ içerik kenarında 192 px; bütün kayıtlar açılabilir kaynak defterinde korunur. |
| Paneller | Bağımsız araç veya veri grubunda yüzey; aynı okuma akışındaki alt başlıklarda çizgi ve boşluk. |

## İşlev ve veri sınırları

Genel Bakış görevleri, portföy kayıtları, üç piyasanın listeleri ve grafikleri, tarayıcı, strateji testi, projeksiyon, rapor ve okuryazarlık yerinde kalır. Model seçimi, API sözleşmeleri, değerleme ve risk formülleri, araştırma kayıtları ve otomasyon takvimi değişmez.

Raporda önceki analiz, eksik kapsam ve yenileme hatası açıklamaları kapalı ayrıntının arkasına saklanmaz. Haftalık yorum, fırsatlar, sinyaller, riskler, quiz, eğitim ipucu ve kaynakların tamamı korunur. Model yorumu ölçülmüş sonuç olarak sunulmaz.

## Doğrulama sınırı

İçerik koruma ve istek yarışı davranışları otomatik kontrollerle incelenir. CSS ve testlerin geçmesi görsel kabul değildir. Yerel kabul adresinde tarayıcı aracının kayıtlı erişim engeli sürmektedir; başka port veya araç üzerinden aşılmaz. Yeni düzen için gerçek ekran, farklı genişlikler, yakınlaştırma ve klavye kontrolü tamamlanmadan görsel kabul veya canlı yayın iddiası kurulmaz.

Önceki taslak PR güncellenir; yeni görünümün görsel kabulü ayrı kalır.

## Kod doğrulaması

Tam `npm test` paketi başarıyla tamamlandı. Yeni rapor davranış kontrolü haftalık yorum, dünya gelişmeleri, fırsatlar, altı sinyal grubunun mevcut üretim yolu, riskler, üç piyasa yorumu, eğitim ipucu, quiz, araştırma ve takvim içeriğinin korunmasını inceler. On iki güvenli kaynak bağlantısı tutulur; zararlı protokol ve ham HTML bağlantıya çevrilmez. Önceki istek yarışı, gezinme ve kayıt kontrolleri de geçer. Tam çıktı `2026-10-02-workspace-rebuild-tests.txt` yerel dosyasındadır.

Tam paketin ilk çalıştırmasında `intelligence.test.js` içindeki API testi, örneğin tarihini sabitlemeden gerçek saati kullanıyordu; örnek açıklama zamanı geçince `nextEvent` boş kaldı. Yalnız bu testin saatini kendi sabit `NOW` değerine bağlayıp sonunda eski saati geri yükledik. Üretim takvimi veya hesaplama değiştirilmedi.

Yerel önizleme aynı kabul adresinde, `http://127.0.0.1:5196/?qa=full#view=report`, çalışır. Canlı verinin salt okunur kesitini kullanır; kabul ekranındaki kayıtlar bellekte izole edilir. Windows'ta doğrudan Node bağlantısı zaman aşımına uğradığı için mevcut `windowsFetch` taşıyıcısı kullanılmıştır; ürün kodunun veri akışı değiştirilmemiştir. Bu servis hazırlığı tarayıcı erişim engelini kaldırmaz ve görsel denetim kanıtı değildir.
