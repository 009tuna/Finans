# Finans — yoğun çalışma alanı düzeltmesi

Kullanıcı son ekranı büyük yazı, gereksiz boşluk, geniş sol menü ve dar ana içerik nedeniyle reddetti. Önceki görsel kabul geri çekildi. Esas hedef ekranda daha fazla işlev ve veri görmektir.

## Güncel uygulama kararı

- Masaüstünde sol menü 152 px, menü metni 12 px, satır yüksekliği 32 px; küçük logo ve grup başlıkları.
- Üst çubuk 48 px, başlık 20 px. Gövde 13 px; ortak panel ve tablo düzeni sıkılaştırılır.
- Rapor ana sütunu kalan bütün genişliği kullanır. Kaynak defteri 208 px olarak içerik alanının sağ kenarına yerleşir; sütun aralığı 16 px.
- Rapor metni 13 px ve 1,5 satır aralığıdır. Rapordaki 72ch genişlik sınırı kaldırılır; eğitim metinlerinin okuma sınırı korunur.
- Kaynak tarihleri kısa gösterilir; İstanbul (UTC+3) ortak kaynak başlığında görünürdür. Yayın zamanı bilinmiyorsa tarih üretilmez.
- Masaüstü kontrolleri 32 px; küçük ekran/dokunmatik alanlarda mevcut 44 px hedefleri korunur. Menü, kaynaklar, rapor bölümleri ve analiz işlevleri kaldırılmaz.
- Finansal formüller, model, kayıtlı araştırma/tahminler, API ve otomasyon takvimi değişmez.

## Kabul kapsamı

Yeni tasarımın kabulü henüz yapılmadı. Önceki ikinci görüntü yeni yoğunluk düzeninin kanıtı değildir. 5196 için tarayıcı aracının kayıtlı erişim engeli sürmektedir. Yeni kullanıcı görüntüsü, mobil ve gerçek yakınlaştırma ile etkileşimli denetim açık kontrollerdir. Kod/test başarısı görsel kalite kabulü yerine geçmez.

## Kod doğrulaması

`npm test` kapsamındaki 72 test dosyasının tamamı geçti. Kaynak tarihinin İstanbul saatine dönüşümü, eksik tarihin korunması ve bütünlüğe ilişkin durum etiketleri kontrol edildi. Son CSS incelemesinde mobil arama alanının ID özgüllüğü ve listeye dönüş/tema kontrollerinin 44 px hedefi korundu; `ui-contract` ve `workspace-density` kontrolleri tekrar geçti. Bu sonuçlar yedi genişlikte görsel kabul veya gerçek tarayıcı yakınlaştırması kanıtı değildir.
