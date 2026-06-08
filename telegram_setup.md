# 📲 Telegram Bildirim Kurulum Kılavuzu

Finans Otomasyonu günlük raporunu her sabah otomatik olarak Telegram üzerinden cebinize almak için bu kılavuzu takip edebilirsiniz. Şimdilik kod katmanı devre dışı bırakılmıştır, ancak ileride etkinleştirmek isterseniz adımlar aşağıdadır.

## 1. Telegram Botu Oluşturma
1. Telegram uygulamasında **@BotFather** kullanıcısını aratın ve sohbet başlatın.
2. `/newbot` komutunu gönderin.
3. Botunuz için bir isim girin (Örn: `Finans Analizim`).
4. Botunuz için benzersiz bir kullanıcı adı (username) girin (Örn: `finans_otomasyon_bot`). Bu adın sonu `bot` ile bitmelidir.
5. BotFather size bir **HTTP API Token** (Erişim Anahtarı) verecektir. Bunu güvenli bir yere kopyalayın.
   * Örnek Token: `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`

## 2. Chat ID (Sohbet Kimliği) Alma
Botun mesajları size gönderebilmesi için kendi Telegram hesap kimliğinizi (Chat ID) bilmeniz gerekir:
1. Telegram'da kendi botunuzu (kullanıcı adıyla aratarak) bulun ve **Başlat (Start)** butonuna basın.
2. Telegram'da **@userinfobot** kullanıcısını aratın ve sohbet başlatın.
3. Size anında **Id** değerinizi gönderecektir. Bu sayı sizin `chat_id` değerinizdir.
   * Örnek Chat ID: `987654321`

## 3. Yapılandırma (`config.json`)
Oluşturduğunuz bilgileri projenin kök dizinindeki `config.json` dosyasına aşağıdaki gibi ekleyebilirsiniz:

```json
{
  "finnhubToken": "...",
  "port": 5174,
  "telegram": {
    "enabled": true,
    "token": "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ",
    "chatId": "987654321"
  },
  "watchlists": {
    "us": [...],
    "bist": [...],
    "crypto": [...]
  }
}
```

## 4. İleride Bildirim Betiğini Çalıştırmak
İleride eklenebilecek bir `src/notifier.js` betiği, her sabah `daily-update.bat` akışının sonunda çalışarak `data/report/base.json` ve `data/report/ai.json` raporlarını okuyup Telegram API aracılığıyla size gönderecektir:

```powershell
# daily-update.bat sonuna eklenecek komut:
node src\notifier.js
```
