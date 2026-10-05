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

Her modülün testinin eksik modülle başarısız olduğu ve uygulamadan sonra geçtiği gözlendi. Başlangıç regresyonları geçti. Nihai tam test, tarayıcı kabulü, bağımsız kod denetimi ve yayın sonuçları teslim öncesi burada kaydedilecektir.
