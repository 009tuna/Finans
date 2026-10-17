# Şirket açıklamaları · lisanssız resmî kaynak pilotu

1 Ekim 2026. Yerel uygulama ve gerçek kaynak erişimi kabulü; canlı frontend/API dağıtımı ve gerçek şirket kaydı yayını bu pakette yapılmadı.

## Değişiklik ve gerekçe

| Önce | Sonra | Neden |
|---|---|---|
| BIST şirket bildirimleri için doğrulanmış otomatik kaynak yoktu. | FROTO'nun ilk açıklama sayfası ve TUPRS'nin seçili yıl özel durum listesi bağımsız olarak toplanır. | Lisanslı KAP erişimi olmadan doğrulanabilir, sınırlı bir şirket kapsamı kurulur. |
| Şirket arşivi SPK kayıtlarının arasında kaybolabiliyordu. | BIST'te Tümü / Düzenleyici / Şirketler filtreleri; kaynak ve tarih bilgisi; boş filtreyi temizleme eylemi. | Kaynak türleri ayrılır; model olayları Tümü görünümünde korunur. |
| Aynı bağlantının farklı açıklamalara işaret etmesi sessiz dedup ile kaybolabilirdi. | Başlık ve tarih çelişkileri inceleme gerektirir; ilk gözlem ve düzeltmeler ayrı saklanır. | Kaynak hatası gerçek bir doğrulama sorunu olarak görünür. |
| Kaynak kesintisi başarıyla boş liste gibi yorumlanabilirdi. | Hata/kısmi kapsam ayrı; önceki kayıt, kanıt hash'i ve eski kontrol gününe ait sayı korunur. | Eksik erişim yeni sıfır haber diye sunulmaz. |
| Araştırma girdisindeki ilk sekiz BIST kaydı şirket açıklamalarını dışarıda bırakabilirdi. | En fazla sekiz şirket kaydı ayrı araştırma alanında ve açık kanıt sınırlarıyla sunulur. | Model belge içeriğini veya fiyat etkisini başlıktan doğrulanmış sayamaz. |

Finansal formüller, risk kuralları, araştırma modeli, tahmin defteri ve otomasyon takvimi değiştirilmedi. Yeni API/veritabanı şeması yok; mevcut `market_sources_v1` CAS kaydı kullanılır. Günlük `refreshMarketNews` pilotu içerir. Sağlıklı/kısmi kaynaklar 24 saat, başarısız kaynaklar bir saat ara ile tekrar kontrol edilir. CAS yeniden denemesi kaynak indirmesini tekrarlamaz.

## Gerçek kaynak kanıtı

Kaynaklar: [Ford Otosan](https://www.fordotosan.com.tr/tr/yatirimcilar/duyurular/ozel-durum-aciklamalari), [Tüpraş](https://www.tupras.com.tr/tr/duyuru-ve-yayinlar).

Kısıtlı ortamda curl ve native fetch zaman aşımına uğradı. İzinli ağ denemesinde mevcut Windows HTTP taşıyıcısı iki resmî sayfayı aldı. Sertifika doğrulaması kapatılmadı. [Kaynak okuma kanıtı](2026-10-01-company-ir-probe.json): 20 FROTO + 56 TUPRS açıklaması, toplam 76 tarihli kayıt ve 75 ayrı belge bağlantısı. Bu **günlük haber sayısı değildir**. Son liste tarihleri FROTO 6 Eylül, TUPRS 9 Eylül 2026; kaynak kontrol zamanları Ekim ayındadır. Yayıncı saati uydurulmaz.

Tüpraş'ın `https://www.kap.org.tr/tr/Bildirim/1575803` bağlantısı 15 Nisan 2026 finansal takvim ve 25 Mart 2026 Fitch notu açıklamalarında ortak kullanılıyor. İki kayıt da korunur ve inceleme gerekir. Hangi açıklamanın doğru olduğu veya belge içeriği bu pilotta doğrulanmadı. Tam KAP API erişimi ve şirket belgesi metin çözümlemesi yoktur. Kaynak yönlendirmeleri, güvensiz host/path, geçersiz/gelecek tarihler ve büyük yanıtlar reddedilir.

[Gerçek yayın önizlemesi](2026-10-01-company-ir-publication-preview.json), mevcut buluttaki 241 kayda karşı çalıştırıldı: 0 şirket kaydından 76 şirket kaydına, toplam 317 kayda geçiş gösterildi. Mevcut kayıtlar korunur. `storageWritesRequested:false`, `modelCalled:false`, belge gövdesi okuması 0. Bu dosya **bulut yayını veya canlı geri okuma değildir**.

## UI ve test kabulü

İzole sunucu, gerçek kaynak okumasının yerel kesitini sunar; ekranın en üstünde bulut yayını olmadığı belirtilir. Gerçek portföy/not yazmaları iletilmez. Rapor içinde BIST şirket filtresi klavyeyle seçildi; yeniden render sonrası odak seçili filtreye döndü. İlk yalnız şirket kesitinde boş Düzenleyici filtresinin temizleme eylemi çalıştı. Tümünü göster ile 76 kayıt ve iki çelişki doğrulandı; Fitch ayrıntısı açılarak görünür kapsam metni okundu. Son önizleme mevcut ABD, SPK ve kripto akışlarını da korur: BIST toplam 118, Düzenleyici 41, Şirketler 76; kalan bir kayıt model olayıdır ve Tümü görünümünde kalır. Son yedi genişlik ölçümü ve mobil/masaüstü ekranları bu birleşik kesitle tekrarlandı. Konsolda error/warn kaydı yok.

320 / 390 / 630 / 820 / 1024 / 1280 / 1440 CSS px ölçümleri: kaynak ve piyasa kontrollerinde metin kırpılması ve gövde taşması yok; altı kontrolün hedef yüksekliği 44 px. Bu yeni kaynak alanını kapsar; bütün ürünün erişilebilirlik/gerçek zoom kabulü değildir. [Ham tarayıcı ölçümleri](2026-10-01-company-ir-browser.json).

- [Masaüstü kaynak durumu](2026-10-01-company-ir-desktop.png)
- [Mobil şirket filtresi](2026-10-01-company-ir-mobile.png)
- [Çelişkili açıklama](2026-10-01-company-ir-conflict.png)
- [Tam npm test çıktısı](2026-10-01-company-ir-npm-test.txt)

Yeni testler gerçek HTML ayrıştırması, güvenli bağlantılar, yayıncı tarihleri, kısmi/başarısız kaynak, CAS yarışı, ilk kaydı koruma, başlık düzeltmesi ve eski başlığa dönüş, aynı gözlemde iki farklı açıklama, sonradan gelen eski yanıt, cooldown no-op, günlük kaynak agregasyonu, ayrı araştırma girdisi ve varsayılan yazmasız CLI önizlemesini kapsar. Finansal başarı veya model kalibrasyonu bu testlerin konusu değildir.

Son kaynak/araştırma/CLI kesitinde `npm test` 68 dosyayı kapsayan komutla çıkış 0 tamamlandı; yeni üç dosyadaki 21 testin tamamı geçti. Önceki test sayısı yerine bu paket sonucu geçerlidir.

Önizlemenin diğer piyasa akışlarını koruyan son düzenlemesinden sonra kabul sunucusu HTTP/izolasyon testi ve iki kabul scriptinin sözdizimi kontrolü ayrıca geçti. Yerel 5194 önizlemesi inceleme için açık bırakıldı; gerçek tarayıcı boyutu eski haline döndürüldü.

## Tekrar çalıştırma ve canlı kapısı

`npm run sources:company:probe`: yalnız resmî şirket listelerini kontrol eder; veritabanına yazmaz. `--update-fixtures` verilmedikçe test HTML'leri değiştirilmez.

`npm run sources:company:preview`: gerçek kaynakları mevcut bulut kaydıyla karşılaştırır; varsayılan olarak yazmaz. `node scripts/refresh-company-ir.js --publish` yalnız kaynak defterini günceller ve CAS geri okumasını doğrular. Bu tur `--publish` çalıştırılmadı.

`node scripts/company-ir-ui-qa.js`: yerel 5190 sunucusu açıkken izole kabul kesitini 5194'te açar. Başlangıç verisi gerçek probe kanıtıdır; yeni kaynak isteği veya bulut yayını yapmaz.

Canlı kontrolünde `/api/market-news` HTTP 404 ve `bulunamadi` döndü. `/api/report?resource=market-news` HTTP 200 olsa da haber grupları yerine eski rapor alanlarını döndürdü. Dolayısıyla canlı sürüm yeni kaynak haber API'sini taşımıyor. Önce frontend/API ve Vercel yönlendirmeleri dağıtılmalı, ardından kapsamlı canlı uç kabulü ve gerçek şirket kaydı yayını yapılmalı. Bu kapı kapanmadan pilot canlı çalışıyor denmez.

Genel hedef açık: gerçek CPI model kaydı/ilk sonuç, bağımsız konsensüs, ileri dönem örneklemle kalibrasyon, bütün araçlarda klavye/ekran okuyucu/gerçek zoom ve canlı dağıtım henüz tam kabul edilmiş değildir.

## 2 Ekim · canlı kapının kapanması

Yukarıdaki yayın yapılmadı/404 ifadeleri 1 Ekim paketinin tarihsel durumudur. Pilot 2 Ekim İstanbul gününde Supabase'e yazıldı ve 76 şirket / 317 toplam kayıt geri okundu. Vercel Node yönlendirmesi düzeltildi; son frontend/API ana adreste çalışıyor. İki kaynak çelişkisi, arşiv/günlük ayrımı ve belge gövdesi sınırı korunuyor. [Canlı kabul ve açık kapılar](2026-10-02-live-release-acceptance.md) güncel kanıttır; tam KAP erişimi veya bütün hedefin tamamlanması değildir.
