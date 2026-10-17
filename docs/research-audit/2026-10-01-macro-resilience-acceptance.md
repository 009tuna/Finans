# Makro kaynak/model dayanıklılığı · yerel kabul

1 Ekim 2026. Bu paket yerel kabulden geçti; bütün ürünün kabulü veya canlı dağıtımı değildir.

## Son davranış

Bağımsız NFP/CPI kayıtları ve model araştırması ayrı hata ve önbellek katmanları kullanır. Bir ailenin deposu veya projeksiyonu başarısız olduğunda diğer aile çalışmaya devam eder. Araştırma okunamıyorsa bağımsız kaynak güncellenebilir; bağımsız kaynak okunamıyorsa mevcut model araştırması kullanılabilir. Son başarılı kaynak/model içerikleri ayrı saklanır.

`storeStatus.checkedAt` ve `researchCheckedAt` okuma kontrol zamanıdır. Kaynağın üretim/yayın zamanı veya modelin üretim zamanı sayılmaz. Arayüz, son başarılı model **okumasını** gerçek tahmin tarihi ve kesim zamanından ayırır.

Kaynak önbelleği; ilk açıklama, sabit yöntem kıyası, kaynak edinim kanıtı, revizyon/çelişki bilgisi ve provenance dışlamalarını korur. Yalnız modelin kaynaklı takvim atfı bağımsız veri edinilmiş sayılmaz. Önceki dönemin model kaydı yeni dönemin tablosuna taşınmaz: metrik, birim, gerekçe, kaynak ve koşullu senaryo ayrı geçmişte erişilebilir kalır. Sağlıklı boş araştırma, eski model önbelleğini temizler; erişim hatası aynı davranışı tetiklemez.

Gecikmiş eski yanıt yeni seçimi/önbelleği değiştiremez. Yeni düzeltme veya takvim çelişkisi sırasında önbellekli model başarı kartı güncel ölçüm gibi sunulmaz; mevcut örneklem ve hata değerleri sıfırlanmaz. Çözümleyici yalnız vadesi gelen ailenin kaydını okur; ortak araştırma okunamazsa sonuç yazmaz. İlk tahminin değişmezliği ve finansal formüller korunur.

## İnceleme sonucu

| Önce | Sonra | Gerekçe |
|---|---|---|
| Bir depo arızası diğer makro aileyi etkileyebiliyordu | Aile bazında okuma/projeksiyon ve sonuç çözümleme izolasyonu | Kullanılabilir veri kullanılabilir kalır. |
| Model ve bağımsız verinin korunması aynı akışa bağlıydı | Ayrı önbellekler ve katmana özgü uyarılar | Kaynak hatası ile model yokluğu birbirine karışmaz. |
| Kaynaklı takvim içeren fallback gerçek kaynak önbelleğini ezebiliyordu | Bağımsız gözlem kanıtı aranır; takvim atfı ayrı korunur | Sahte bağımsız edinim izlenimi oluşmaz. |
| Gelecek döneme geçişte eski tahmin veya yanlış olay seçilebiliyordu | Dönem/olay/metrik eşleşmesi; en yakın gelecek olay; ayrı geçmiş | İlk tahmin doğru döneme bağlı kalır. |
| Genel Bakış özetinde `report` kapsam dışında kullanılıyordu | Değişken fonksiyon kapsamında; başarı/hata regresyonu | Rapor özeti gerçek tarayıcıda işlenir. |

## Doğrulama

Son kapsam düzeltmesi dahil `npm test` 65 dosya ile exit 0 tamamlandı. [Tam çıktı](2026-10-01-macro-resilience-npm-test.txt). Yeni kontroller gerçek API projeksiyonunu gerçek frontend istemcisine aktarır; yalnız HTML kalıbını denetlemez. Model önbelleği 7 davranış testi, API/frontend sözleşmesi, izolasyon, fixture güvenliği ve Genel Bakış başarı/hata çalıştırması kapsanır.

Tarayıcı: Codex IAB, `http://127.0.0.1:5193/?qa=cpi-model#view=overview`. Başlık `Finans Otomasyonu · Yatırım Paneli`; ana içerik boş değil, hata overlay'i yok. Yakalanan dört eski `report is not defined` konsol kaydı düzeltme öncesine aittir. Düzeltme sonrası yeniden yükleme ve Kararlar/Açıklama beklentileri geçişinde yeni error/warn kaydı oluşmadı; rapor özeti içerikle doğrulandı.

| Etkileşim / durum | Sonuç |
|---|---|
| Model deposu hatası | Yeni bağımsız değer gelir; aynı dönem model tahminleri korunur. |
| NFP deposu hatası | CPI güncellenir, CPI'ye NFP hata uyarısı sızmaz; NFP son kaynak/model içeriğini korur. |
| CPI deposu hatası | Dört metrik ve son model içerikleri korunur; eski veri açıkça etiketlenir. |
| HTTP 503 ve toparlanma | Son içerik korunur; sağlıklı yanıtta uyarılar temizlenir. |
| Yeni dönem + model hatası | Yeni tabloda Erişilemiyor; önceki dört tahmin ayrı geçmişte. Geçmiş klavyede Enter ile açıldı. |
| Sağlıklı boş model defteri | Kayıt yok; eski model/geçmiş temizlenir. |
| Önbelleksiz ilk model hatası | Erişilemiyor; bağımsız tablo kullanılabilir. |
| 320/390/630/820/1024/1280/1440 px | Hata görünümünde gövde taşması yok; gözlenen açılım hedefleri 44 px. Yatay kaydırma tablo içinde. |
| Karbon tema uyarı/tekrar deneme metni | İki örnek; en düşük kontrast 6,49:1, 12 px altı metin yok. Bütün temalar için uygunluk iddiası değil. |

[Tarayıcı akışı ve ölçümler](2026-10-01-macro-resilience-browser.json), [kontrast hesabı](2026-10-01-macro-warning-contrast.json), [kaynak hatası ekranı](2026-10-01-macro-source-error.png), [mobil ilk hata](2026-10-01-macro-model-error-mobile.png), [toparlanmış ekran](2026-10-01-macro-recovered.png).

## Kanıtın sınırları

Hata, toparlanma ve CPI model değerleri **sentetik kabul verisidir**. QA kontrol paneli yalnız test sunucusuna yazar; gerçek portföy, not, araştırma veya tahmin sonucu yazmaz. Alt kontrol paneli test ekranına aittir; mobil görüntüde tabloyu örter, ürün bileşeni değildir. Gerçek yerel 5190 sunucusu yeniden başlatılmadı; yeni backend sözleşmesi sahte depo kullanan testlerde doğrulandı. Bu çalışma yeni bir canlı araştırma yayını değildir.

Bu pakette model çağrısı, `npm run research`, kayıt yayını, commit/push veya deploy yapılmadı. Güncel Supabase geri okuması Windows aktarımında `curl 28` ile zaman aşımına uğradı; **güncel hash eşitliği doğrulanmadı**. [Geri okuma durumu](2026-10-01-macro-resilience-readback.json). Önceki başarılı geri okumanın sonuçları bu paketin güncel doğrulaması olarak sunulmaz.

Tekrar üretim: gerçek yerel 5190 sunucusu açıkken `node scripts/macro-resilience-ui-qa.js`; 5193'te Açıklama beklentileri → Enflasyon seçilir ve izole kabul kontrolü kullanılır.

## Açık kabul kapıları

- Gerçek kaynaklı CPI model yayını ve yayımlandıktan sonraki resmî ilk sonuç; güncel canlı defter geri okuması.
- Bağımsız CPI konsensüsü, yeterli ileri dönem örneklem ve kronolojik kalibrasyon. Sonuç yokken başarı/isabet oranı yok.
- Lisanssız şirket yatırımcı ilişkileri kaynakları ve SPK etkilerinin açık kapsamla kabulü; tam KAP servis kapsamı iddiası yok.
- Portföy işlem defteri; bütün araçlarda form, seçim, klavye, dört tema, hareket azaltma ve gerçek tarayıcı %80/%100/%125/%200 yakınlaştırma kabulü.
- Yeni frontend/API kodunun canlı dağıtımı ve üretim sonrası geri okuma. Bu paket genel hedefi tamamlamaz.
