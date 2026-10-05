# Öğrenme temeli — 5 Ekim 2026

## Çalışan kapsam

Karar kesitleri içerik hash'i ve global kimlik CAS bağıyla ilk hali korunarak kaydedilir. Fiyat özellikleri doğrulanmış tamamlanmış OHLCV'den çıkarılır; canlı quote ve açık mum özellikleri değiştirmez. Her aday gözlenir, AL seçimi eğitim evrenini belirlemez.

90/180 takvim günü ayrı hedeflerdir. NFP ve dört CPI hedefi yöntem/birim bazında ayrıdır. Resmî açıklama öncesi kanıtı olmayan makro kayıt eğitim dışında kalır. İlk sonuç korunur; revizyon veya tekrar yeni bağımsız başarı sayılmaz.

Veri setleri açık tarih sınırlarında bölünür. Eğitim sonucunun validation başlangıcından, validation sonucunun test başlangıcından önce bilinmesi gerekir. Fiyat ridge modeli train ölçeklerini kullanır; makro aday sadece eğitim hatasından sabit düzeltme öğrenir. Sıfır getiri/ham makro yöntemiyle eşleşmiş hata ölçülür. Örnek sayısı ekonomik üstünlük veya başarı olasılığı değildir.

Sürümler ve model başına tahminler değişmezdir. Sonradan geçmiş örneğe üretilen tahmin replay olarak ayrılır. V1 politikası shadow-only: otomatik sinyal puanı veya model aktivasyonu yoktur. Gölge tahminler sonuçtan önce kaydedilir; geçmiş test olumlu olsa bile ileri kanıt yokluğu korunur.

## Çalıştırma

- `npm run learning:refresh`: makro kayıtları alır, olgun fiyat etiketlerini çözer, mevcut adayların gölge kayıtlarını korur.
- `npm run learning:train`: aynı yenilemeyi yapar, yeterli veri ve yeni kayıt fingerprint'i varsa aday eğitir. Saat ilerlemesi tek başına yeni eğitim değildir.
- Günlük workflow sonuç çözümünden sonra yeniler. Günlük araştırma model üretiminden önce ve yeni tahminlerden sonra toplar; model erişim hatası ilk toplamayı engellemez.
- `/api/report?resource=learning`: salt okunur özet; yerel Node ve Vercel aynı sözleşmedir. POST 405, depolama hatası 503. Portföy, not ve ham kanıt açığa çıkarılmaz.
- Raporun altındaki Öğrenme defteri açıldığında yüklenir; birikimli/son 90 gün ölçümleri ayrı görünür. n=0 için hata ve fark null'dır.

## Bilinen sınırlar

Mevcut Yahoo günlük barları eksik seans veya kurumsal fiyat düzeltmesini tek başına kanıtlamaz. BIST/ABD için bu kanıtın yokluğu sonuçları unresolved bırakır; sonraki fiyatla eksik gün atlanmaz. Binance UTC günlük takvimi için eksik ilk bar kontrolü uygulanır. Yeni piyasa kesitleri bugünden birikir; geçmiş yanlış sanal işlem sonuçları eğitim etiketi olmaz.

Yeterli örnek olmadığında model yoktur; sahte katsayı, kalibre güven veya getiri iddiası yoktur. İleri değerlendirme 90/180 günlük görevler için zaman gerektirir. Yapısal giriş/stop/çıkış yürütmesi ayrı teslimdir; mevcut işlem sistemi bu pakette yeniden yazılmadı.

## Kararlar ve doğrulama

Global kimlik claim'i, hedef kimliği, geç gözlenen sonuçların availability zamanı, bağımsız makro provenance, ayrı macro validation/test minimumları ve hareketli asOf'tan bağımsız fit fingerprint'i ön denetimle sözleşmeye eklendi. Paylaşılan test-only CAS fixture ve injectable QA learning projection kapsamı tamamlar. UI mevcut Air tokenlarını kullanır; yeni renk sistemi veya dekoratif animasyon eklenmedi.

Her modülün testinin eksik modülle başarısız olduğu ve uygulamadan sonra geçtiği gözlendi. Başlangıç ve genişletilmiş tam `npm test` regresyonları geçti. Bağımsız denetim 6 Important hata buldu: yenilenen takvim kanıtı, ID'siz NFP sonuç eşleştirme, yarıda kalan claim, veri çekimi sonrası etiket saati, görünmez kaynak hatası ve seri DB okuma maliyeti. Bu altı durumun RED→GREEN regresyonları eklendi. Claim ilk payload'ı taşır; makro ilk schedule proof'u korur; canlı acquisition saati tarihsel değerlendirme kesitinden ayrılır; API doğrulanmış özet okur, alttaki kayıt okumaları 50 anahtarlı gruplara ayrılır. Özet zaman damgası görünürdür; aynı kesitte daha az kayıt taşıyan eşzamanlı özet yeni özeti geri alamaz.

İki Minor bulgu da düzeltildi: yakın dönem ölçümü sonucun gözlenme zamanına göre ayrılır; model başlığı varlığı ve 90/180 günlük hedefi içerir. Ertelenmiş denetim bulgusu yoktur. Canlı DB içeriği, RLS, kârlılık ve mevcut işlem resolver'ı bu fixture kabulünün sonucu değildir.

1440×960 masaüstünde 13px içerik ve yatay taşma olmaması; 390×844 mobilde sayfa taşması olmadan 540px tablonun kendi 327px alanında kayması doğrulandı. Native disclosure Enter ile açılıp kapanır ve odağı korur. [Masaüstü QA görüntüsü](../design-air/learning-acceptance/desktop.jpg), [mobil QA görüntüsü](../design-air/learning-acceptance/mobile.jpg): gösterilen 42 kesit ve model sentetik kabul verisidir; canlı ölçüm değildir. Boş/hata/retry durumları da izole sunucuda kontrol edilir; portföy/DB yazılmaz.

## Git teslimi ve yayın kontrolü

Son tam yerel test çalışması 112 test komutuyla başarılıdır. GitHub PR #4 CI `test` çalışması da başarılıdır. [PR #4](https://github.com/009tuna/Finans/pull/4), 5 Ekim 2026 21:22 TRT'de ana dala merge edildi: `006ea4cf8eca2e5c85eaf0676d9c4e67142ec9f8`. Kullanıcının mevcut yayın onayıyla işlem tamamlandı; yeni yayın onayı istenmedi.

Bu kesit için Vercel Git otomasyonu kendiliğinden bir production deployment üretmedi. Mevcut `finans-dashboard` projesi, aynı repo bağlantısıyla kullanılarak `dpl_2kpyAEYr4DCTZAUnxaVR1oJtNshQ` önizlemesi oluşturuldu; READY durumu ve tam commit SHA doğrulandı. Statik sayfa ve learning.js 200 dönerken öğrenme ve mevcut rapor API'leri önizlemede 503 döndü. Üretimde mevcut rapor ve makro API'leri 200 döndü. Bu nedenle önizleme promote edilmedi; production ortamıyla yeniden derleme gerekir. Vercel connector ortam değişkeni okuma çağrısına 403 verdi; yönetim tarayıcısı giriş ekranında. Önizleme ortamının kesin yapılandırma nedeni doğrulanamadı.

Bu kontrol sırasında çalışan eski üretim deployment'ı `dpl_H2xLp4U34wMhrkUQkhSbeeqhL8k8`, SHA `ab6b5a9895ba6c52150e09c47e3d694601708ebb` idi. Alan adı: https://finans-dashboard-iota.vercel.app. Canlı öğrenme panelinin yayınlandığı veya canlı DB'ye örnek yazıldığı iddia edilmez. Yayın engeli kodun test kabulünden ayrıdır.
