# Otomatik öğrenme ve sade sunum

14 Ekim 2026

Kullanıcıdan elle belge veya gerçek işlem kaydı beklenmez. Günlük araştırma akışı zaten öğrenme yenilemesini araştırma öncesinde ve sonrasında çağırır. Bu paket o davranışı açıklar; model, risk, sonuç formülü, ilk tahmin ve mevcut veri kayıtlarını değiştirmez.

- Öğrenme paneli otomatik kayıt, alınan sonuç, beklenen sonuç ve yetersiz veri sayısını gösterir.
- Fiyat öğrenmesinde 90/180 günlük süre, haberlerde resmî açıklama sonucu beklenir. Sinyallerde hedef/stop takibi ayrı çalışır.
- Kaynak güncellemeleri tek açılır bölümde okunur. Sayısal değişim ilk kaydın yerine kullanılmaz; kullanıcıya insan incelemesi görevi atanmaz.
- Eski kaynağın ayrıntısı eksikse hangi fiyatın değiştiği bilinmiyor olarak kalır. Tekrarlanan teknik açıklama her satır yerine bir kez gösterilir. Sınırlı ayrıntı listesinde son kaç kaydın gösterildiği belirtilir.
- Sinyaller ekranı otomatik sanal takip ve kaynak arızasını sade dille anlatır. Veri kontrolü kaldırılmadı; bilinmeyen sonuç başarı sayılmaz.
- Günlük otomasyon talimatına elle kayıt şartı koymama ve sade bildirim kuralı eklendi. GPT-6.1 Sol, günlük saat 09:30 ve sessiz bildirim tercihi korundu.

Doğrulama: tam `npm test` geçti. Öğrenme UI ve observer testleri, kaynak sorunu ile manuel görev ayrımını ve yalnız yetersiz kaydı bulunan boş sonuç durumunu ayrıca kontrol eder. Canlı ekran kontrolü teslimde doğrulanır. Bu değişiklik getiri iyileştirmesi veya model eğitimi değildir.
