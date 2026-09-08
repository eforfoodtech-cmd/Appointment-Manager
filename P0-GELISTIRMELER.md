# P0 geliştirmeleri — sohbet hariç

## Kullanım

- Berber **Profil → Hizmetler, fiyatlar ve izinler**: hizmet ekleme/düzenleme/arşivleme; fiyat, süre ve hizmet sonrası ara; tek gün veya en fazla 90 günlük toplu kapalı aralık.
- Berber **Müşteriler**: sunucunun ürettiği kalıcı QR/kod; kayıtlı müşteri listesi, özel not, etiket, tamamlanan ziyaret ve gelmeme sayıları. Eski randevulardan müşteri bağlantıları aktarılır.
- Müşteri **Berber Bul**: kod/QR ile kalıcı bağlantı. Yeni kodlar önceki demo kodlarının yerine geçer; eski basılı QR'lar yeniden paylaşılmalıdır.
- **Randevu al**: hizmet/fiyat/süre seçimi ve işletme galerisi. Hizmet ve arası seçilen slot içine sığmalıdır; sistem slotun tamamını ayırır. Hizmet kataloğu boş eski işletmeler slotla rezervasyona devam eder.
- **Randevu detayı**: aynı berbere başka müsait saate taşıma. Müşteride 5 saat sınırı korunur. Eski randevu fiyatı katalog değişikliklerinden etkilenmez.
- **Profil → Randevu bildirimleri**: yeni randevu, iptal ve saat değişikliği; okundu bilgisi ve randevu bağlantısı. Sohbet eklenmedi.
- **Profil → Hesap, görseller ve güvenlik**: ad/telefon/e-posta, mevcut şifreyle değişiklik, doğrulama, profil fotoğrafı, berbere özel 6 görsellik galeri, şifre değiştirme, cihaz oturumları ve hesap silme.
- Hesap silme: aktif randevu varken engellenir. Hesap bilgileri anonimleştirilir, görseller/oturumlar kaldırılır; randevu geçmişi korunur. Ekranda yazılı onay ve mevcut şifre gerekir.

## Kurulum ve doğrulama

Node 22.13+ veya 24 kullanın; mevcut Orval sürümü sistemdeki Node 20.11 ile çalışmıyor.

```powershell
pnpm --filter @workspace/db run migrate:p0
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/api-server run build
```

Migrasyon eklemelidir, tekrar çalıştırılabilir ve eski verileri silmez. API başlamadan uygulanmalıdır. Migrasyon yerel API `.env` dosyasını kullanır; ortamda verilen `DATABASE_URL` önceliklidir. Bu değişiklikler için `push-force` kullanmayın.

API bütünleşme testi için ayrı portta yeni sunucuyu başlatın; test kendi benzersiz hesaplarını oluşturup yalnızca onları temizler. Test adresini canlı üretime yönlendirmeyin.

```powershell
# artifacts/api-server içinde, ayrı terminalde
$env:PORT='8083'
$env:NODE_ENV='development'
node dist/index.mjs

# başka terminalde
pnpm --filter @workspace/api-server run test:p0
```

`artifacts/mobile/p0.web-smoke.cjs` yerel 8081 web uygulamasını 8083 test API'sine yönlendirerek başsız Edge ile giriş ve yeni profil bölümlerini sınar. `PLAYWRIGHT_MODULE` ile Playwright paket yolu ayarlanabilir; mevcut kullanıcı tarayıcı profiline erişmez.

## Harici servis gerektiren parçalar

- Gerçek e-posta/SMS doğrulaması için API ortamına `CONTACT_EMAIL_WEBHOOK_URL`, `CONTACT_SMS_WEBHOOK_URL` ve isteğe bağlı `CONTACT_WEBHOOK_TOKEN` girilir. Webhook `{ purpose: "contact_verification", channel, to, code }` alır, başarılı HTTP yanıtı dönmelidir. Yapılandırma yoksa 503 ve anlaşılır kullanıcı mesajı döner; gönderilmiş gibi davranılmaz. Kod 10 dakika geçerli, 5 doğrulama denemesi; 15 dakikada kullanıcı başına en fazla 5 gönderim.
- Mobil push için mevcut Expo/EAS cihaz kaydı ve düzenli `pnpm --filter @workspace/api-server run scheduler` çalıştırılması gerekir. Yeni olaylar kalıcı kuyruğa yazılır; uygulama içi bildirimler scheduler olmadan da görünür. Fiziksel cihazda gerçek push teslimi ayrıca doğrulanmalıdır.
- Görseller başlangıç sürümünde veritabanında veri URL'si olarak saklanır (görsel başına yaklaşık 1 MB, galeri en fazla 6). Büyük ölçek için nesne depolamaya taşınabilir.

## Bilinen ürün sınırları

- Toplu izin girişi belirli tarih aralığı içindir; süresiz yinelenen mola kuralı eklenmedi.
- Mevcut manuel, yalnızca isimle girilmiş müşteriler randevu geçmişi listesinde kalır; hesaplı müşteriyle otomatik isim eşleştirmesi yapılmaz.
- Randevu geçmişi bulunan slotlar silinemez, kapatılabilir. Müşteri kimlik bilgileri ve notları yalnızca ilgili berberin yetkili slot yanıtında bulunur.
