# Yapısal sinyaller ve sabit sanal işlemler

Tarih: 2026-10-04. Durum: sohbet tasarımı kullanıcı tarafından onaylandı; bu yazılı tasarım incelemeye hazır. Ürün kodu değişmedi.

## Amaç ve kabul edilen yaklaşım

Kullanıcı son fiyattan tekrar tekrar üretilen giriş/stop/hedef yerine, uygun zamanda otomatik verilen ve sonradan sonucu izlenebilen sinyaller istiyor. Yükselmiş bir varlığa geç giriş önermek, desteği/direnci dikkate almamak ve eski işlemin seviyelerini değiştirmek giderilecek. Orta vadeli yaklaşım 90–180 gün; yapay zekâ sinyal üretimi veya işlem takibi için zorunlu olmayacak.

Önerilen ve sohbet içinde onaylanan yaklaşım: açıklanabilir kurallı long stratejisi, teyitli fiyat yapısı, sabit işlem planı, sinyalden sonraki ilk kanıtlı açılıştan otomatik sanal yürütme, maliyetli ve sürümlere ayrılmış ölçüm. Önce mevcut ATR planını yalnız görünümde dondurmak giriş kalitesini çözmez. Doğrudan makine öğrenmesi eklemek ise güvenilir eğitim hedefi ve işlem verisi olmadan ölçümü daha da zayıflatır. Bu nedenle ilk sürüm kurallıdır; parametreler başarı iddiası taşımaz.

Sinyalde sanal kayıt ve takip hemen başlar. Kaydın oluşması, önceki kapanıştan gerçekleşmiş bir alış anlamına gelmez. Gerçek portföye veya aracı kuruma emir gönderilmez.

## Mevcut akışta doğrulanan sorunlar

- `src/decision.js` ve `public/action-layer.js`: giriş son fiyat; stop 1,5 ATR aşağıda, hedef 3 ATR yukarıda. Yapısal seviyeler bulunmuyor.
- `src/fetch-all.js`: mevcut teknik puan >=70 olan adaylar AI olmadan otomatik kaydediliyor; vade 30 gün. Üretim indikatörleri henüz tamamlanmamış günlük barı içerebiliyor.
- `src/decision-journal.js`: aynı varlığın açık kaydı çoğaltılmıyor ve ilk seviyeler korunuyor. Bu davranış korunacak.
- `public/app.js`: grafik ve bazı paneller yeni `decision.trade` kullanırken başka yüzeyler donmuş `activeSignal` kullanıyor.
- `src/prediction-resolver.js`: gözlenen açılış ve maliyet modeli olmadan stop/hedef seviyesinden sonuç yazabiliyor. Giriş100/stop95, sonraki gün open80/high85/low75/close82 örneği yanlış biçimde exit95 olarak çözülüyor.
- `src/yahoo.js` açılışları saklamıyor; günlük kaynak timestamp'ı her zaman seans açılışı değil. `src/crypto-market-data.js` gerçek açılışı normalize ediyor, fakat günlük seriye aktarmıyor. Grafik veya legacy cache için close'tan üretilmiş open yürütme kanıtı değildir.
- UI sonuç sınıflandırması ile backend/rapor başarı paydası aynı sözleşmeyi kullanmıyor. Manuel refresh eski işlemleri çözmüyor; çözümleme ayrı araştırma/workflow adımına bağlı.

## Bileşenler ve sınırlar

1. **Günlük kaynak kanıtı:** Yahoo ve Binance adaptörleri gerçek OHLCV, para birimi, gözlem zamanı, fiyat temeli, bar ve seans kanıtını korur. `daily-history` yalnız karar kesitinde tamamlanmış barları ayırır.
2. **Yapısal strateji:** saf `structural-signals` modülü, verilen kesitten trendi, teyitli bölgeleri ve setup'ı çıkarır. Ağ, AI veya yazma işlemi yapmaz. Aynı giriş ve parametrelerden aynı sonucu üretir.
3. **Sanal yürütme:** saf `paper-trade-engine` modülü, daha önce kalıcılaştırılmış emri sonraki kaynak gözlemleriyle ilerletir. Planı değiştirmez. Giriş ve sonuç kuralları canlı akış ve geçmiş replay için ortaktır.
4. **Kayıt orchestration:** mevcut journal ve `api_cache('journal')` CAS kullanılır. Kaynak gözlemleriyle açık kayıtlar çözülür, yeni kabul edilen setup'lar kaydedilir, kayıt başarılıysa snapshot yayımlanır. Yeni tablo veya servis gerekmiyor.
5. **Sunum ve ölçüm:** ortak kayıt seçici ve kanıt sınıflandırıcısı Node/browser ortamında kullanılır. Grafik, öneri, karar paneli ve rapor aynı işlem kaydını esas alır.

Yeni kuralların sürümleri: `structural-long-v1`, `observed-open-paper-v1`, `structural-paper-resolver-v1`. Parametre özeti/hash, setup türü, vade ve maliyet sürümü ayrıca kaydedilir. Eski `technical-rules-v1` kayıtları yeni sürüme çevrilmez.

## Veri sözleşmesi

- En az 220 tamamlanmış günlük bar; sıralı, benzersiz kaynak tarihleri ve aynı uzunlukta fiyat/kanıt dizileri gerekir. Trend ve yapı için eksik high/low/volume fallback değerleri kabul edilmez.
- BIST fiyatı TRY, ABD fiyatı kaynağın bildirdiği para birimi, Binance spot çifti USDT olarak tutulur. CoinGecko USD görünümü Binance USDT işlem fiyatı yerine kullanılamaz.
- Karar kesiti `min(generationCutoffAt, sourceObservedAt)` olur. Kaynakta gelecekte görünen veya bu kesitte kapanmamış bar strateji girdisi olamaz. Sonradan edinilen veri eski sinyalin gerekçesine eklenemez.
- Canlı yeni kayıt için kaynak gözlemi bir saatten eski olamaz. Son tamamlanmış barın beklenen son seans/bar olup olmadığı piyasa takvimi ve kaynak kapsamasıyla kontrol edilir; hafta sonu nedeniyle önceki seans kapanışı otomatik bayat sayılmaz. Takvim veya kapsama bilinmiyorsa yeni otomatik sinyal engellenir, açık kaydın kanıt durumu gösterilir.
- Yeni açılış alanları `opens`, `openVerified`, `barStartAt`, `barEndAt`, `timestampRole`, `sessionEvidence`, `sourceObservedAt` olarak taşınır. Eksik açılış sayısal bir fallback ile doldurulmaz.
- Yahoo günlük timestamp'ı yalnız bar etiketiyse `timestampRole=bar_label` olur. Gerçek açılış zamanı, aynı güne ait sağlayıcı regular seans başlangıcı veya sürümlü doğrulanmış seans takvimiyle kanıtlanır. Güncel `currentTradingPeriod` bilgisi ait olduğu günle birlikte arşivlenir; başka güne taşınmaz. Tarihsel açılış zamanı kanıtlanamıyorsa yürütme ve doğrulanmış başarı yazılamaz.
- Binance günlük açılışı gerçek kline `openTime`, UTC günlük takvim ve doğrulanmış OHLC'den gelir. Legacy close->open dönüşümü yürütmede yasaktır.
- Kaynak seans tarihleri/takvim, gözlem kapsaması ve veri boşlukları açıkça korunur. Eksik bir hafta içi gün, kanıt olmadan tatil sayılmaz. İlk gerekli açılış eksikken sonraki uygun açılışı seçmek yasaktır.
- Kullanılan OHLC ve olay kanıtı immutable içerik hash'iyle mevcut `api_cache` içinde ayrı kanıt anahtarlarına saklanır; journal yalnız referans, kritik pivot/fill/exit özeti ve kaynak zamanlarını taşır. Kanıt anahtarı ilk insert-CAS ile oluşturulur; aynı hash farklı içerikle değiştirilemez. Karar kanıtı, emir journal'a yazılmadan önce kalıcı olmalıdır. Günlük barların tümü her işlem için journal olay listesine kopyalanmaz; yalnız lifecycle geçişleri,90 gün değerlendirmesi ve farklı kanıt sorunu olayları eklenir. Yürütmenin doğrulanmış kapsamı ayrıca checkpoint olarak tutulur. Sonuç kanıtı, sonuç journal'a yazılmadan önce kalıcıdır.
- Split, para birimi/fiyat temeli değişimi veya kaynak revizyonu çelişkisi `evidence.status=evidence-incomplete` durumuna taşır; ilk plan sessizce düzeltilmez. İlk sürümde split sonrası performans otomatik normalize edilmez ve total-return iddiası yapılmaz.

## Strateji kuralları

Aşağıdaki eşikler başlangıç mühendislik varsayımlarıdır. Optimize edilmiş veya kazançlı oldukları ileri sürülmez. Üç piyasa ayrı konfigürasyon ve ölçüm grupları kullanır; ilk varsayılan teknik eşikler aynıdır. Parametre değişikliği mevcut işlemi etkilemez ve yeni parametre hash'i oluşturur. ATR, SMA ve tüm fiyat seviyeleri sonlu/pozitif olmalı; son tamamlanmış bar hacmi ve önceki20 barın doğrulanmış ortalama hacmi pozitif olmalıdır. Eksik/bozuk değerler varsayılan sayıyla kapatılmaz.

| Kural | İlk sürüm |
| --- | --- |
| Trend | Son tamamlanmış close>SMA200; SMA50>SMA200; SMA50, 10 bar önceki SMA50'den yüksek |
| Yapı penceresi | Son en fazla252 tamamlanmış bar; indikatörler mevcut daha uzun geçmişten hesaplanır |
| Pivot | Her iki tarafta3 bar; strict yüksek/düşük karşılaştırması; eşit tepe/dip pivot sayılmaz |
| Bölge | En az2 teyitli pivot; temaslar arasında en az10 bar; küme toplam genişliği<=0,75 ATR14 |
| Kümeleme | Fiyata göre sıralı deterministik gruplama; tüm grup genişliği sınır içinde kalır, zincirleme genişleme yapılmaz; merkez medyan |
| Stop tamponu | Gerçek destek/bölge alt sınırı−0,25 ATR14 |
| Hedef | Girişin üzerindeki ilk teyitli direnç alt sınırı−0,25 ATR14 |
| Uzama kapısı | Son close−SMA50<=3 ATR14 ve son5 bar close artışı<=3 ATR14 |
| Risk sınırı | Giriş bölgesinin en yüksek kabul fiyatında yapısal stop mesafesi<=%10 |
| Kabul | Maliyet sonrası hedef getirisi pozitif ve net risk/ödül>=1,5 |
| Yeniden kayıt | Kapanış/iptal sonrasında10 tamamlanmış bar ve bundan sonra oluşmuş yeni setup tetikleyicisi |

Pivot `i`, ancak `i+3` bar kapandığında bilinir; pivot zamanı ve teyit zamanı ayrı kaydedilir. Geçmiş replay her karar için o anda bilinen kesiti kullanır. Sonradan teyitlenen pivotla eski kırılımı yeniden yorumlayamaz.

Setup A'nın ATR referansı karar kesitindeki son tamamlanmış barın ATR14 değeri; B'ninki b−1 ATR14 değeridir. Dip pivotları destek, tepe pivotları direnç için ayrı gruplanır. Pivotlar fiyat, teyit indeksi, pivot indeksi sırasıyla sıralanır. En düşük atanmamış fiyattan başlayan greedy grup, yalnız yeni fiyat−grup minimumu<=0,75 ATR iken genişler. Bölge min/max gerçek pivot fiyatlarıdır; grupta indeks farkı>=10 olan en az iki pivot gerekir. Kullanılan ATR değeri/tarihi dondurulur.

A için kapanışın altında kalan geçerli desteklerin üst sınırı en yüksek olan seçilir. Dirençler alt sınırlarına göre sıralanır; üst sınırı giriş bölgesinin alt sınırını aşan ilk bölge üst engeldir. B'nin tam olarak aynı dondurulmuş kırılım bölgesi üst hedef değildir. İlk üst engel giriş bölgesiyle kesişiyorsa veya tamponlu hedef<=giriş bölgesi üst sınırıysa kayıt engellenir; R kapısını geçmek için sonraki dirence atlanmaz.

### Setup A: yükselen trendde destek geri çekilmesi

Trend kapıları geçer. Son tamamlanmış tetikleyici bar için `bölge alt sınırı−0,25 ATR<=low<=bölge üst sınırı+0,5 ATR` ve `bölge üst sınırı<close<=bölge üst sınırı+0,75 ATR` gerekir; close ayrıca önceki close'dan yüksektir. Giriş bölgesi `[bölge üst sınırı, bölge üst sınırı+0,75 ATR]` olur. Bölge oluşturulduktan sonra teyitli bir günlük close yapısal stopun altına inmişse aynı destek kullanılamaz; sonrasında oluşup teyit edilmiş en az iki yeni dip pivotu içeren yapı gerekir.

### Setup B: hacimli kırılımın yeniden testi

Kırılım barı `b`, `b−1` kesitinde zaten teyitli olan direnç üst sınırı+0,25 ATR üzerinde kapanır. Hacmi kendisinden önceki20 tamamlanmış bar ortalamasının en az1,3 katıdır. Bölge, pivot kimlikleri ve kırılım öncesi ATR dondurulur.

Sonraki1–10 tamamlanmış bar içinde tetikleyici için `bölge alt sınırı−0,25 ATR<=low<=bölge üst sınırı+0,5 ATR` ve `bölge üst sınırı<close<=bölge üst sınırı+0,75 ATR` gerekir. Aradaki tamamlanmış barın close'u dondurulmuş yapısal stopun altına inmişse setup iptal olur. Bu close tabanlı setup geçersizliği, işlem açıldıktan sonraki hard-stop aralık/gap yürütmesinden ayrıdır. Giriş bölgesi kırılmış bölge üst sınırından0,75 ATR yukarısına kadardır. Stop ve tamponlar kırılım öncesi dondurulmuş ATR ile hesaplanır. Hedef bölgesi retest karar kesitinde teyitli gerçek üst dirençten seçilir; sonradan ilk hedef değiştirilemez.

V1'in ortak sinyal kabulü tamamlanmış günlük barla yapılır. Canlı fiyat, aynı sağlayıcı/para biriminden tazeyse ekranın `Giriş kaçtı / geri çekilmeyi bekle` uyarısına katkı verir; farklı bir otomatik kayıt tetikleyicisi veya veto değildir. Güncel quote'u geçmiş replay'de bulunmayan gizli bir strateji girdisi yapmak yasaktır. Her iki ortamda otomatik giriş için aynı sonraki açılış/giriş bölgesi kapısı zorunludur; güçlü mevcut teknik puan bu kapıları aşamaz. Tamamlanmış barın kendisi giriş bölgesinden uzamışsa zaten setup kabul edilmez.

Aynı kesitte birden fazla setup uygunsa en yeni tetikleyici bar, eşitlikte B, yine eşitlikte girişe en yakın kök bölge seçilir. Son eşitlik deterministik setupId alfabetik sırasıyla çözülür. Bu seçim politikası parametre hash'ine dahildir; sonradan gerçekleşmiş getiri seçim girdisi olamaz.

Üst direnç bulunmuyorsa `Hedef doğrulanamadı / izle` olur; otomatik kayıt açılmaz. Hedefi2R yapmak için yükseltmek veya kabul oranını tutturmak için stopu sıkıştırmak yasaktır. Yeni zirvede trend exit veya ölçülü hareket ayrı bir gelecekteki stratejidir.

## Sabit kayıt ve kalıcı emir zamanı

Mevcut `journal.predictions` korunur. Yeni kayıt aşağıdaki ayrı alanları taşır:

```text
id, market, symbol, source=system, strategyVersion, parameterHash, setupId
signalCreatedAt, generationCutoffAt, sourceSnapshotId, sourceEvidence/hash
plan { setup, entryZone, stop, target, supportEvidence, resistanceEvidence,
       atrReference, horizonDays, entryExpiresAt, currency, priceBasis, costModel }
execution { state, eligibilityAt, registrationRevision, fillEffectiveAt,
            fillObservedAt, fillPreparedAt, fillPrice, entryEvidence }
evidence { status, reasons, verifiedThrough, entryWindowExpired }
events[], outcome, resolvedAt, resultPreparedAt, exitEvidence, grossResultPct, netResultPct
```

`plan` ve kaynak gerekçesi kayıt anından sonra değişmez. Fiili sanal giriş fiyatı ayrıca tutulur; planın giriş bölgesini değiştirmez. Mevcut düz `entry` alanı ile uyumlulukta aday fiyatını gerçekleşmiş giriş diye sunmak yasaktır; yeni kayıtta yürütme bilgisi açıkça tercih edilir.

Lifecycle ile kanıt ayrıdır: `execution.state={registered,pending-entry,filled,closed,missed-entry,expired-entry}`; `evidence.status={verified,data-pending,evidence-incomplete,ambiguous}`. Kanıt sorunu pending veya filled lifecycle'ını kaybettirmez. Belirsiz terminal sonuçta state=closed ve fiyat/getiri null olur. Pending için outcome=open; terminal giriş kaçtı/ömür doldu için outcome=not-entered; kapalı filled için target-hit/stop-hit/time-exit/ambiguous olur. Bu yeni outcome değerlerini ortak sınıflandırıcı açıkça destekler.

`signalCreatedAt` hesaplama zamanıdır; kalıcı emir zamanı değildir. İlk CAS başarılı olduktan sonra cevap alınan UTC zaman üst sınırı ve kayıt revision'ı kabul makbuzu olarak ek bir CAS ile saklanır. `eligibilityAt` bu kabul makbuzunun zamanıdır. Mevcut CAS revision'ı istemci tarafından yazmadan önce üretildiğinden tek başına commit zamanı kanıtı olarak kullanılamaz.

İlk kayıtta durum `registered`; makbuz kalıcılaşınca `pending-entry` olur. Makbuz adımı başarısızsa kaydın yürütmesi hazır değildir ve yeni sinyal yayımlanmaz. Crash sonrası makbuzu olmayan kayıt ancak yeni kabul zamanı ile hazırlanabilir; daha önceki açılışlara geriye dönük bağlanamaz. Sinyal09:59:59'da hesaplanmış, yazma cevabı10:00:01'de alınmışsa10:00 açılışı kullanılamaz.

Kimlik strateji, parametreler, piyasa/sembol, setup kök bölgesi ve tetikleyici bar üzerinden deterministik üretilir. Tekrar aynı setup yeni kayıt açamaz. Piyasa+sembol başına terminal olmayan sistem lifecycle'ı, kanıt durumundan bağımsız olarak ikinci otomatik kaydı engeller; eski açık sistem kaydı da bu kilide dahildir. Kullanıcının manuel senaryoları ayrı kalır.

Re-arm beklemesi terminal olay zamanından sonraki10 tamamlanmış bardır; günlük dokunuşun kesin saati bilinmiyorsa olay barının kapanış üst sınırı kullanılır. Yeni tetikleyici bekleme tamamlandıktan sonra oluşmalıdır; eski tetikleyicinin geç gözlenmesi yeni setup değildir. Stop/yapısal geçersizlikle bozulan kök bölge, geçersizlikten sonra oluşup teyit edilmiş en az iki yeni pivotlu yapı olmadan tekrar kullanılamaz. Hedef/zaman kapanışında aynı sağlam bölge ancak yeni temas/kırılım ve yeni tetikleyiciyle kullanılabilir.

## Sanal yürütme ve sonuç

### Giriş

Sinyal sonrası ilk beklenen, kaynak zamanı kanıtlı açılışın `barStartAt>eligibilityAt` olması gerekir. Açılış giriş bölgesinin içindeyse, stop<open<target ve dondurulmuş maliyet/risk kapıları hâlâ geçerliyse `filled` olur. Bölge dışına gap veya stop/hedefin ötesinde açılış `missed-entry` olur; sonraki gün uygun fiyat seçilemez. Günlük high/low'da bölgeye daha sonra dokunmak ilk sürümde limit-entry fill'i değildir.

Emir ömrü eligibilityAt'tan itibaren ABD/BIST için7x24 saat, kripto için48 saattir. Süre geçtiğinde ilk açılışın bulunmaması, gerçekleşmediği anlamına gelmez. İlk gerekli açılış kanıtı eksikse state=pending-entry, evidence.status=data-pending ve entryWindowExpired=true kalır; varlık kilidi korunur. expired-entry yalnız doğrulanmış takvim/kapsama emir ömründe yürütülebilir ilk açılış olmadığını gösteriyorsa terminaldir. Geç gelen kanıt sadece pencere içindeki tarihsel ilk açılışı çözer; pencere sonrasındaki açılıştan fill yapmaz. Terminal kaydı geri açamaz. Bu kayıtlar kâr/zarar paydasına girmez.

Günlük barın ertesi gün gözlenmesi geçerli bir önceki açılış yürütmesini kanıtlayabilir; bunun için emir açılıştan önce kalıcı olmalıdır. `fillEffectiveAt` gerçek kaynak açılışı, `fillObservedAt` kaynaktan öğrenilen zaman, `fillPreparedAt` olayın yazmadan önce hesaplandığı zamandır. fillPreparedAt veya resultPreparedAt commit/cevap zamanı diye sunulmaz. Yeni emir için gerekli kalıcı kabul makbuzu diğer olayların hazırlanma zamanından ayrıdır. Sonraki barın iyi/kötü kapanmış olması giriş kararını değiştiremez.

Zaman invariant'ları: strateji barEndAt<=generationCutoffAt; eligibilityAt>=signalCreatedAt; fillEffectiveAt>eligibilityAt; fillObservedAt>=fillEffectiveAt; fillPreparedAt>=fillObservedAt. Açılış fiyatı için barın kapanması şart değildir; high/low sonucu için barEndAt<=exitObservedAt şarttır. Kaynak/sunucu zamanı çelişirse saatler düzeltilerek sonuç üretilmez; kanıt eksik olur. Günlük stop/hedef dokunuşunun kesin saati bilinmediğinden exitTimeBounds=[barStartAt,barEndAt] saklanır; gap/zaman açılışında exitEffectiveAt kesin barStartAt'tır. Süre ekranı kesin olmayan intraday saati uydurmaz.

### Açık işlem ve çıkış

- Giriş açılışından önceki hareketler sonuç sayılmaz. Açılıştan alınan barın tamamlanmış aralığı kullanılabilir; giriş sonrası tek stop veya hedef dokunuşu çözülür.
- Sonraki bar stop altında/eşit açılırsa stop çıkış referansı gerçek open olur. Hedef üzerinde/eşit açılırsa dondurulmuş limit hedefi kullanılır; bu muhafazakâr politika kaydedilir. Kaynak-open bilinmeden gap çıkışı doğrulanamaz.
- Open stop ve hedef arasında ve günlük bar ikisine de dokunmuşsa `ambiguous` olur. Sıra uydurulmaz; noktasal getiri ve başarı sonucu yazılmaz, belirsizlik sayısı gösterilir.
- Arada kayıp seans, doğrulanmamış OHLC veya kaynak çelişkisi varsa daha sonraki hedef dokunuşu doğrulanmış kazanç olamaz. `evidence.status=evidence-incomplete` olayları eklenir; kanıt giderilene kadar sonuç dışarıda tutulur.
- Ana vade180 takvim günü, 90. gün ara değerlendirmedir; ara değerlendirme yeni işlem veya kazanılmış başarı değildir. Konfigürasyonda90 gün seçilirse bu tek kaydın vadesi ve ölçüm grubudur. Vade sayacı fillEffectiveAt'tan başlar.
- Vade tarihi fill'in piyasa yerel seans tarihine horizonDays takvim günü eklenerek hesaplanır; kriptoda UTC kullanılır. Bu tarih veya sonrasındaki ilk doğrulanmış seans açılışında pozisyon kapanır. Yaz saati nedeniyle180x24 saat ekleyip bir seans kaydırmak yasaktır. Önce gap stop/hedef kuralları değerlendirilir; ikisi de yoksa zaman çıkışı open üzerinden olur. Böylece vade kararından sonra oluşan günlük high/low hedef başarısı olarak seçilemez. Önceki seansın barı bu açılışa kadar duran stop/hedef kurallarıyla değerlendirilir. Gerekli ilk vade açılışı eksikse sonraki görünen açılış ikame edilmez; kanıt beklenir. Kaynakta bilinen tutma süresi veya zaman aralığı kaydedilir.
- Yeni fiyatlar yalnız açık işlemin güncel görünümünü/getirisini günceller. Stop taşımak, hedef değiştirmek veya ek alım ilk sürümde otomatik davranış değildir.

Tüm geçişler deterministik olay kimliği taşır. Aynı kaynak barı veya retry ikinci fill/çıkış yaratamaz. Her CAS aşaması en fazla3 deneme yapar;409 sonrası journal yeniden okunur ve aynı dondurulmuş olay güncel kayıt üzerine yeniden uygulanır. Yeni setup/plan/zaman icat edilmez; eşzamanlı notlar, uyarılar ve kayıtlar korunur. Diğer yazma hataları doğrudan hata döndürür. Journal kaydı başarılı fakat snapshot yayını başarısızsa journal geri alınmaz; yayın başarısızlığı açıkça döner. Sonraki tur aynı kayıt/makbuzu yeniden kullanır; sessiz başarılı yayın yapılmaz.

## Maliyet, performans ve eğitim

İlk sürüm mevcut `src/costs.js` tahmini oranlarını sürümlü `market-costs-v1` olarak dondurur: round-trip ABD%0,10, BIST%0,40, kripto%0,20. Bunlar gerçek broker tarifesi veya doğrulanmış gerçekleşme maliyeti değildir; komisyon/spread/kaymayı bir arada temsil eden simülasyon varsayımı olarak gösterilir. Spot long modelinde funding, temettü veya toplam getiri eklenmez. Aynı varsayım ayrıca fiyatı kaydırıp ikinci kez maliyet düşmek için kullanılmaz.

Tek yön maliyet `c=roundTrip/2`. Normalize edilmiş birim sermaye için net getiri `(exit/fill)*(1-c)^2-1`; brüt fiyat getirisi `exit/fill-1`. Giriş bölgesinin üst sınırı `E`, yapısal stop `S`, gerçek hedef `T` için net risk/ödül `[T/E*(1-c)^2-1] / [1-S/E*(1-c)^2]`; pay ve payda geçerli/pozitif olmalıdır. Hedefe varmak ve net kârlı olmak ayrı istatistiklerdir.

UI ve backend/rapor aynı uygunluk fonksiyonunu kullanır. Başarı paydası yalnız kaynak fill'i, çıkışı, sürekliliği, maliyeti ve sürümleri doğrulanmış kapalı kayıtlardır. Pending, registered, missed/expired-entry, ambiguous, evidence-incomplete, eski sürüm ve manuel senaryolar ayrı gösterilir. `n=0` için başarı/getiri bilinmiyor (`null`) olur.

Gruplar piyasa, setup, strateji/parametreler, horizon, execution/resolver sürümü, maliyet sürümü ve fiyat temeline göre ayrılır. İlk ekranda yeni kurallı sistem grubunun örneklem sayısı, hedef/stop/zaman çıkış dağılımı, net kazanma oranı, ortalama net getiri ve bilinen tutma süresi gösterilir. Net kazanma oranı netResultPct>0 olanların tüm uygun kapalı kayıtlara oranıdır; negatif ve tam sıfır sonuçlar ayrıca sayılır. Açık getiri gerçekleşmiş başarı değildir. Sonuçlar tanımlı sanal yürütme modeline aittir; brokerda gerçekleşmiş işlem başarısı diye sunulmaz. Varlık aynı süre ve maliyetle elde tutulmuş benchmark ayrı hesaplanır; toplam portföy getirisinin yerine konmaz. Bar sırası belirsizken MAE/MFE kesin tek işlem başarısı olarak sunulmaz.

Canlı ve geçmiş replay aynı strateji/yürütme saf fonksiyonlarını ve parametreleri çağırır; ayrı sinyal/fill politikası veya quote veto'su kullanmaz. Tarihsel OHLC yalnız o kararın prefix'i ile kullanılır;3 sağ teyit barı da o anda tamamlanmış olmalıdır. Replay emir kabulünü önceki barın kanıtlı kapanışından sonra, sonraki açılıştan önce varsayar ve bunu historical-simulation olarak etiketler; canlı yazma makbuzu varmış gibi uydurmaz. Geriye dönük simülasyon kaydı canlı journal'a yazılmaz. Güncel watchlist ve sonradan düzeltilmiş veriyle yapılan testin seçilim/veri sınırları belirtilir; tarihsel simülasyon canlı doğrulanmış sonuç kohortuna katılmaz. Kanıtlı erken stop/hedef sonuçları180 gün beklemez. Yeterli ileri gözlem olmayan açık işlem açık/sağdan sansürlü kalır; vade sonucu veya tüm kohort tamamlanmış başarı oranı uydurulmaz. Tarihsel seans/açılış kanıtı bulunmayan replay doğrulanmış sonuç üretmez.

İlk sürüm parametreleri otomatik optimize etmez. Sonraki eğitim, önce biriken doğru etiketli işlemler ve yeterli tarihsel kapsama, ardından zaman sıralı geliştirme/validasyon/ayrı test aralıkları ister. Aynı örneklemde eşik seçip başarı ölçmek ve eski seviyeleri yeni eşiklere uydurmak yasaktır. AI özet/gerekçe katkısı sağlayabilir; AI yokluğu veya hatası deterministik motoru durdurmaz.

## Entegrasyon ve görünüm

`runAll` kaynağı bir kez alır; mevcut açık sanal kayıtları aynı gözlemlerle ilerletir, tamamlanmış geçmişten yeni setup arar, journal değişikliklerini CAS ile kaydeder ve yalnız başarılı kayıt sonrası snapshot'a aktif planı ekler. Manuel `/api/refresh`, yerel yenileme ve GitHub günlük akışı aynı yolu kullanır. Ayrı resolver CLI bu ortak motorun idempotent çağrısı olur; ikinci işleme sonucu çoğaltamaz.

Mevcut sabah yenilemesi korunur. Açılış kanıtı ve gün sonu takibi için AI çağrısı içermeyen ek piyasa gözlem turları planlanır: BIST seans içinde, ABD seans içinde ve kripto hafta sonu dahil her UTC gününde. Mevcut GitHub workflow mekanizması kullanılır; yeni Codex zamanlanmış görev veya servis oluşturulmaz. Scheduler gecikmesi emrin veya gözlemin zamanı diye geçmişe yazılamaz. Bir tur kaçırılırsa kaynak/takvim kanıtı eksikliği görünür kalır.

Sunumda `Piyasa görünümü`, `Giriş bekleniyor`, `Sanal işlem açık`, `Giriş kaçtı`, `Hedef doğrulanamadı`, `Kanıt eksik` ve `İşlem kapandı` doğrudan etiketlenir. BIST, ABD ve Kripto mevcut ayrı gruplarında kalır. Grafikte kayıtlı stop/hedef sabittir; pending için giriş bölgesi, filled için gerçek sanal giriş çizilir. Güncel fiyat ayrı gösterilir. Yeni aday plan açık kayıt üzerinden çizilemez. Manuel ATR hesaplayıcısı kullanıcı senaryosu olarak kalabilir; otomatik sinyal diye sunulamaz.

UI tipografi, nefes alan düzen ve küçültülebilir panelleri korur. Bu çalışma yeni estetik tasarım yapmaz. Aynı checkout'taki bağımsız UI değişiklikleri alınmaz, geri çevrilmez veya bu çalışmanın commit'ine eklenmez; uygulama izole checkout'ta ilerleyip ilgili entegrasyonlar gözden geçirilerek birleştirilir.

## Doğrulama ve yayın kabulü

Anlamlı testler önce davranış eksikliğini göstermeli; ardından üretim değişikliğiyle geçmelidir:

1. Henüz kapanmamış bar ve sonradan teyitli pivot sinyal oluşturamaz; kırılımın bölgesi b−1 kesitinde bilinir.
2. Destek/direnç yokluğu, geç giriş, yakın hedef veya aşırı stop mesafesi otomatik kaydı engeller. Hedef kapı için yükseltilmez.
3. Aynı setup/refresh/CAS retry tek kayıt üretir; ilk plan/hash değişmez. Açık eski sistem kaydı ikinci pozisyonu engeller.
4. Seans öncesi/seans içi sinyal, kalıcı yazma gecikmesi ve Yahoo bar-label zamanı doğru açılışı ayırır. Eski close, grafik fallback-open ve legacy crypto open fill olamaz.
5. Bölge dışına gap girişi kaçırır; entry100/stop95/open80 örneği exit80 ve maliyetli kayıp verir. Aynı mumda iki seviye belirsiz kalır.
6. Eksik ilk açılış, kayıp ara seans, destek kırılması, bilinmeyen takvim ve split/revizyon başarı yazımını engeller.
7. 90/180 vade tek işlem üretir; hafta sonu/zaman çıkışı sonraki gerçek açılışa bağlanır. Vade sonrası high başarı için seçilemez.
8. Maliyet/getiri ve risk/ödül aynı formülü kullanır. Pozitif brüt ama negatif net sonuç kazanılmış net başarı sayılmaz; n=0 null'dır.
9. UI grafik/kart/rapor aynı sabit kaydı gösterir; canlı fiyat sadece güncel getiri/durumu değiştirir. Backend ve browser aynı uygunluk grubunu üretir.
10. AI hata/yokluk durumu motoru etkilemez. Manuel refresh ile otomasyon aynı giriş/sonuç fonksiyonlarını kullanır; geçmiş replay live journal'a yazmaz.

Son kabul: ilgili kaynak/strateji/journal/resolver/UI testleri ve `npm test` geçer; temiz izole ortamda sentetik kanıtlı bir uçtan uca akış gözlenir. Gerçek kullanıcı portföyü veya canlı finans kayıtları test için değiştirilmez. Masaüstü ve dar ekranda sabit seviyeler, pending/missed/ambiguous durumları ve sıfır örneklem görüntülenir. Yayına önce yeni şema/okuyucu/resolver birlikte çıkar; yeni otomatik kayıt kapısı ancak kanıt ve test şartları sağlanınca etkin olur. Eski kayıtların hash/sayı karşılaştırması korunur; eski motorun aynı anda yeni30 günlük kayıt üretmesi durdurulur.

## Kapsam sınırı

Aracı kurum bağlantısı, gerçek alım/satım, short/kaldıraç, otomatik stop taşıma, limit intraday entry, yeni veri sağlayıcısı, temettü/split toplam-getiri muhasebesi ve ML eğitimi ilk sürümde yoktur. Bunların yokluğu başarı veya işlem olmuş gibi taklit edilmez. İlk sürümün hedefi denetlenebilir giriş kuralları ve güvenilir sanal işlem geçmişidir; kazanç avantajı ancak ayrı veri ve doğrulamayla değerlendirilebilir.
