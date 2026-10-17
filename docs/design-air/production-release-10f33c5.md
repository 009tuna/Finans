# Finans — üretim yayını

Doğrulama: 4 Ekim 2026, yaklaşık 11:08 Europe/Istanbul.

- GitHub `master`: `10f33c5a7b618c10f184086a2ffb9df20340a59d`.
- Canlı adres: https://finans-dashboard-iota.vercel.app/.
- Doğrulanan ve ana adrese geçirilen Vercel yayını: `dpl_EsXbSLtQ5DXtcuycDfhKHd9CgPsZ`, Node 24.x, READY.
- Önceki üretim yayını, gerekirse geri dönüş için: `dpl_2R9DY3ZbQmdY5ptTKQZt8ympPLhM`.
- GitHub CI: https://github.com/009tuna/Finans/actions/runs/37187433946 — başarılı.

## Kontroller

Tam `npm test` zinciri geçti. Yeni 12 portföy testi; ilk okumanın eksikliği, upsert hatası, eksik yazma kanıtı, koşullu silme hatası, başka sekmede değişen kayıt, son okuma uyuşmazlığı, gerçek sıfır ve API hata durumlarını kapsar. Node/Vercel portföy hata davranışı aynı handler üzerinden çalışır. Test kaynak okuması Windows satır sonlarını normalize eder.

Canlı veri, rapor, araştırma, makro, haber, günlük ve portföy GET istekleri doğru JSON sözleşmeleriyle 200 döndü. Haberler ABD/BIST/Kripto gruplarına ayrılıyor. Veri kesitinde 12 ABD, 100 BIST, 21 kripto varlığı var; kontrol sırasında gerçek portföy boştu.

DCF salt okunur POST kontrolünde sabit nakit akışı örneği 2,5 adil değer / %60 güvenlik marjı verdi. Geçersiz değerleme isteği 400, yetkisiz portföy/günlük/yenileme POST istekleri 401 döndü. Gerçek portföy veya günlük kaydı değiştirilmedi.

AAPL grafiğinde 251 günlük bar, Yahoo/USD ve America/New_York takvim kanıtı; BTC grafiğinde 365 bar, Binance/USDT ve UTC takvim kanıtı doğrulandı. Grafik okumaları olağan uygulama önbelleğini güncelleyebilir.

Altı sunulan arayüz dosyasının normalize SHA-256 değeri Git'teki bu commit ile aynı: index.html, app.js, workspace.css, workspace.js, macro.js, research.js. Üretim paketi özel veri, yerel AI taslağı, .env veya Supabase geçici CLI dosyalarını içermiyor.

Tarayıcıda gerçek verilerle ana ekran, üç piyasa ayrımı, sağ/sol panel daraltma, açıklama beklentileri ve günlük rapor geçişi çalıştı. 390 piksel mobil kontrolde sayfa yatay taşmadı (clientWidth ve scrollWidth 385). Görüntüler: production-release-10f33c5-overview.png, production-release-10f33c5-mobile.png. Kontrol sırasında tarayıcı konsolunda hata yok; Vercel'in son 15 dakikalık sorgusunda 5xx kaydı dönmedi. Bu, kontrol aralığının gözlemidir.

## Sınırlar ve korunan çalışma

Supabase yönetim PAT erişimi 401 verdi; bu yayına yeni SQL fonksiyonu veya şema bağımlılığı eklenmedi. Portföy güncellemesi önce tek upsert'i doğrular, sonra yalnız ilk okumada görülen ve updated_at sürümü değişmemiş kaldırılan kayıtları temizler. Son okuma hedefle uyuşmadan başarı bildirilmez. Birden fazla HTTP adımı tek transaction değildir; ara aşama hatası kullanıcıya sonucu yenileyip kontrol etmesini söyler. Tam transaction için ayrıca yönetim erişimiyle SQL fonksiyonu gerekir.

Aynı klasördeki “Impeccable skillini incele” sohbetinin yayından sonra eklediği devam eden arayüz/deneyim değişiklikleri commit edilmedi ve bu yayına alınmadı; yerel dosyalar korundu. Yerel özel data değişiklikleri ve manuel model taslağı da push edilmedi. Bu belge ve son yayın ekranları yerel doğrulama çıktılarıdır.
