# Finans arayüz yenilemesi — 2 Ekim 2026

> Sonraki piyasa, araştırma ve hesap düzeltmelerinin 4 Ekim kabulü: [son düzenleme ve doğrulama kaydı](cleanup-verification.md). Bu belge ilk Air yenilemesinin tarihli kapsamını korur.

Yerel uygulama kodu yenilendi. Yeni açık tema, tutarlı küçük tipografi, daha geniş boşluklar ve bağımsız daraltılabilir menü/bağlam panelleri bütün çalışma ekranlarına uygulanır. Backend, veri hesapları ve yayın akışı bu paketin kapsamı değildir.

## Uygulama

- `public/workspace.css`: ortak açık tema ve yüzey/form/tablo/okuma sistemi; önceki koyu temalarla uyum; mobil ve container yerleşimleri.
- `public/workspace.js`: sol menüyü 204 → 64 px daraltma; genel bakış, rapor kaynakları ve portföy düzenleyicisini 264 → 44 px daraltma; bağımsız kalıcı tercihler ve geçici odak modu.
- `public/index.html`: yeni stil/davranış yüklemesi, tema geçişi ve erişilebilir kontroller; grafik bilgi kutusu ortak stillere taşındı.
- `public/app.js`: tema seçimi ve grafik/indikatör renkleri CSS tokenlarından çözülür. Grafik veri ve hesapları korunur.
- `test/workspace-layout.test.js`: gerçek workspace.js kodunu çalıştıran davranış regresyonları; `npm test` zincirine eklendi.

## Doğrulama

Tam `npm test` paketi başarılı: [test çıktısı](tests.txt). Yeni testler bağımsız tercihler, yeniden yükleme, odak modundan çıkış, saklanan form girdileri, klavye odağı, depolama hatası, sayfa geçişi ve asenkron rapor yenilenmesini kapsar.

Yerel tarayıcıda 1440, 1280, 1024, 768 ve 390 px genişliklerde Genel Bakış, Rapor, Portföy, Tarayıcı, Strateji Testi, Projeksiyon, Okuryazarlık ve BIST varlık ekranı tarandı. Sayfa yatay taşması görülmedi; geniş tablolar kendi kaydırılabilir alanlarını korur. Panel daralması ve odak modu gerçek ölçüyle doğrulandı. Mobil menü Escape ile kapanır ve odak Menü düğmesine döner. [Ölçüler](layout-checks.json).

Açık temada ana ekranların görünür HTML metinleri ve beş tema seçeneğinde piyasa ekranı örneklendi. Canvas içindeki çizim metinleri bu DOM kontrast ölçümüne dahil değildir. Opaklık animasyonu ve devre dışı kontroller gibi ölçülemeyen örnekler kayıt içinde ayrıca tutulur. Tam erişilebilirlik sertifikasyonu veya bütün ürünün tüm durumlarını kapsayan kabul değildir. [Kontrast sonuçları](contrast-results.json).

Grafik açık/koyu tema geçişi ve mobil yerleşimi görsel olarak kontrol edildi. Grafik tuvali sRGB tema renklerini `data-chart-text-color` / `data-chart-background` üzerinde de taşır. Son konsol denetiminde JavaScript hata kaydı yoktu.

Önizleme mevcut yerel kabul sunucusunda gerçek veri kesitinin okumasını kullanır. Portföy/journal yazmaları izole kalır. Bulut yayını yapılmadı.

## Ekran kayıtları

- [Genel bakış — masaüstü](overview-desktop.jpg)
- [Rapor — masaüstü](report-desktop.jpg)
- [Piyasa ve grafik — masaüstü](market-desktop.jpg)
- [Genel bakış — mobil](overview-mobile.jpg)
- [Rapor — mobil](report-mobile.jpg)
