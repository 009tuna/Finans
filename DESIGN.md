# Finans Otomasyonu - DESIGN Context

## 1. Color System (OKLCH)
Tüm renkler modern OKLCH modelini temel alır. Nötr koyu tonlar, marka rengine (indigo, hue: 250) doğru hafifçe tint edilmiştir.

| Token | OKLCH Tanımı | Hex Karşılığı | Kullanım Amacı |
|---|---|---|---|
| `--bg` | `oklch(11% 0.007 250)` | `#0f1115` | Derin lüks koyu arka plan |
| `--bg-2` | `oklch(13% 0.009 250)` | `#12151b` | İkincil arka plan, hover alanları |
| `--sidebar` | `oklch(10% 0.006 250)` | `#0d0e12` | Sol navigasyon menüsü |
| `--card` | `oklch(14.5% 0.012 250)` | `#151820` | İçerik panelleri, veri kutuları |
| `--card-2` | `oklch(12.5% 0.008 250)` | `#111319` | İç panel gölgeleri |
| `--border` | `oklch(19% 0.014 250)` | `#1e222b` | Standart çizgiler ve ayırıcılar |
| `--border-2` | `oklch(25% 0.02 250)` | `#2d323f` | Odaklanma veya hover durumundaki çizgiler |
| `--text` | `oklch(95% 0.008 250)` | `#f1f3f6` | Birincil beyaz metin |
| `--muted` | `oklch(68% 0.015 250)` | `#7f8798` | İkincil metinler ve açıklamalar |
| `--muted-2` | `oklch(48% 0.012 250)` | `#525866` | Tablo başlıkları, devre dışı metinler |

### Stratejik Renkler (Semaphores)
* **Accent (Brand)**: `oklch(62% 0.16 250)` (`#4382ff`)
* **Green (Buy)**: `oklch(72% 0.15 145)` (`#28d793`)
* **Red (Sell)**: `oklch(64% 0.18 25)` (`#ef4444`)
* **Yellow (Hold)**: `oklch(80% 0.13 85)` (`#eab308`)
* **Orange (Reduce)**: `oklch(72% 0.15 45)` (`#f97316`)
* **Violet (Special)**: `oklch(70% 0.13 290)` (`#a78bfa`)

---

## 2. Typography (Plus Jakarta Sans)
Yazı karakteri olarak modern, okunaklılığı yüksek **Plus Jakarta Sans** kullanılır.

* **Base Size**: `15px` / `1rem`
* **Hierarchy Ratio**: `1.25`
  * `xs`: `0.75rem` (11.2px)
  * `sm`: `0.875rem` (13.1px)
  * `base`: `1rem` (15px)
  * `md`: `1.25rem` (18.75px)
  * `lg`: `1.5625rem` (23.4px)
  * `xl`: `1.953rem` (29.3px)
* **Weights**:
  * Light (`300`): Ek açıklamalar, dipnotlar
  * Regular (`400`): Gövde metinleri, standart değerler
  * Medium (`500`): Tablo hücreleri, buton metinleri
  * SemiBold (`600`): Alt başlıklar, form etiketleri
  * Bold (`700`): Başlıklar, semboller
  * ExtraBold (`800`): Durum/Sinyal puanları

---

## 3. Spacing & Spacial Rhythm
* **Layout Grid**: 8px bazlı ölçeklendirme kullanılır. `8px`, `16px`, `24px`, `32px`, `48px` ve `64px` aralıkları ile dikey ritim kurulur.
* **Layout Decluttering**: 
  * "Her şeyi kart içine sarma" alışkanlığı terk edilmiştir.
  * Finansal Okuryazarlık ve Teknik Tarayıcı sekmelerinde gereksiz kart borders kaldırılmış, çizgisel bölmeler ve değişen sütun genişlikleriyle dergi mizanpajı (editorial style) hedeflenmiştir.
  * Tablolarda zebra şeritler yerine ince sınırlar ve geniş padding değerleri ile hücre nefes alabilirliği sağlanır.

---

## 4. Motion (Micro-interactions)
* **Eğriler (Easing Curves)**:
  * Pürüzsüz Geçiş (easeOutExpo): `cubic-bezier(0.16, 1, 0.3, 1)` (Navitem geçişleri, hover durumları)
  * Yaylanma Efekti (springBack): `cubic-bezier(0.34, 1.56, 0.64, 1)` (Butonlara tıklandığında ve form elemanlarında focus durumunda basış/açılış hissi)
* **Fiyat Detayı Reveal**:
  Tabloda bir satıra tıklandığında açılan detay alanı (`.detailwrap`), 300ms süren hafif bir yukarı kayma ve opaklık artışı ile birlikte yumuşak bir yaylanma efekti kullanılarak görünür hale gelir.
