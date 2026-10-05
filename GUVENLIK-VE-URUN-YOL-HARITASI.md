# Güvenlik ve ürün yol haritası

Bu belge, projede çalışacak ajanlar için authentication, authorization, API/sunucu güvenliği ve ürün geliştirmelerinin uygulama sırasını tanımlar. Bir madde tamamlandığında kabul kriterleri ve testleriyle birlikte işaretlenmelidir.

## Öncelik kuralları

- **Güvenlik P0:** İnternete açık üretim ortamından veya ödeme/kişisel veri özelliklerinden önce tamamlanması gereken işler.
- **Güvenlik P1:** P1 ürün özellikleri yayına alınmadan önce veya aynı geliştirme içinde tamamlanması gereken savunmalar.
- **Güvenlik P2:** Ölçek, operasyon ve ileri seviye hesap güvenliği işleri.
- **Ürün P1:** Solo berber kullanımını doğrudan iyileştiren bir sonraki özellik grubu.
- **Ürün P2:** Çoklu çalışan/şube ve harici platform entegrasyonları.

Yeni bir ürün özelliği, bağlı güvenlik maddeleri tamamlanmadan üretime hazır kabul edilmez. İstemci tarafındaki rol veya ekran kontrolü güvenlik sınırı değildir; karar her zaman API ve veritabanı erişiminde uygulanır.

## Mevcut güvenlik durumu

### Mevcut ve korunması gerekenler

- Parolalar bcrypt ile hash’leniyor; düz parola saklanmıyor.
- Üretimde `SESSION_SECRET` olmadan API başlamıyor.
- JWT doğrulaması, `authVersion` ile tüm oturumları geçersiz kılma ve hash’lenmiş token tabanlı oturum iptali var.
- `authenticate`, `requireBarber` ve `requireCustomer` middleware’leri mevcut.
- Randevu ve işletme rotalarında rol/sahiplik kontrolleri bulunuyor.
- Parola sıfırlama kodları hash’li, kısa ömürlü ve tek kullanımlık; hesap keşfini azaltan genel yanıt kullanılıyor.
- Parola sıfırlamada IP ve kullanıcı tanımlayıcısı bazlı sınırlama var.
- İletişim doğrulama kodlarında süre, kullanıcı başına gönderim ve deneme sınırı var.
- Hassas authorization/cookie başlıkları uygulama loglarında redakte ediliyor.
- Hesap iletişim bilgisi, parola değişikliği ve hesap silme işlemleri mevcut parola doğrulaması istiyor.

### Bilinen açıklar ve teknik borçlar

- `cors()` şu anda genel izin veriyor; üretim origin allowlist’i yok.
- Helmet veya eşdeğer güvenlik başlıkları yok.
- Login, kayıt, genel API, medya ve randevu yazma uçlarında merkezi rate limiting yok.
- Parola sıfırlama limiti proses belleğinde; çoklu instance/restart durumunda tutarlı değil.
- Erişim tokenı 30 gün geçerli. Kısa ömürlü access token + dönen refresh token mimarisi yok.
- Global JSON limiti 12 MB; medya dışındaki uçlar için gereğinden yüksek.
- Route bazında ortak Zod doğrulama ve standart hata gövdesi tam uygulanmış değil.
- Proxy arkasında güvenilir istemci IP’sinin nasıl üretileceği belgelenmemiş.
- Güvenlik olayları için kalıcı audit log, alarm ve dashboard yok.
- Bağımlılık, secret ve statik güvenlik taramaları CI kapısı değil.

## Güvenlik P0 — üretim öncesi zorunlu kapı

### SEC-P0-01 — Ortam ve secret güvenliği

- [ ] `.env` dosyalarını git takibinden çıkar; yalnızca `.env.example` içinde sahte değer ve açıklama bırak.
- [ ] Git geçmişindeki gerçek/veritabanı/JWT/webhook sırlarını döndür ve geçmişten temizle.
- [ ] `SESSION_SECRET` ve `PASSWORD_RESET_SECRET` için en az 32 rastgele bayt zorunluluğu getir.
- [ ] Üretimde development fallback’lerinin kullanılamadığını başlangıç testiyle doğrula.
- [ ] Secret’ları hosting secret manager üzerinden enjekte et; loglama ve hata yanıtlarında göstermeme testi ekle.

**Kabul kriteri:** Eksik veya zayıf secret ile production API başlamaz; repoda gerçek secret bulunmaz; secret taraması CI’da başarılıdır.

### SEC-P0-02 — CORS, proxy ve güvenlik başlıkları

- [ ] `cors()` yerine `ALLOWED_ORIGINS` allowlist’i kullan; development origin’lerini ayrı tanımla.
- [ ] Tanımsız origin’i reddet. Native istemcinin originsiz isteklerini bilinçli politika ile ele al.
- [ ] `helmet` ekle; HSTS yalnızca HTTPS üretimde, ayrıca `X-Content-Type-Options`, frame, referrer ve uygun CSP politikalarını etkinleştir.
- [ ] Hosting proxy sayısı/CIDR’si kesinleşince Express `trust proxy` değerini sabit ve sınırlı ayarla.
- [ ] HTTPS yönlendirmesi ve güvenli transport politikası ekle.

**Kabul kriteri:** İzinli web origin’i çalışır, izinsiz origin CORS başlığı alamaz, sahte `X-Forwarded-For` rate limit’i aşamaz ve güvenlik başlıkları entegrasyon testinde doğrulanır.

### SEC-P0-03 — Merkezi ve dağıtık rate limiting

- [ ] Redis veya yönetilen eşdeğer ortak store kullan. Proses içi `Map` yalnızca test/development fallback’i olabilir.
- [ ] Anahtarları ham e-posta/telefon yerine HMAC/hash ile tut; IP ve hesap/tanımlayıcı limitlerini birlikte uygula.
- [ ] Başarılı login sonrası ilgili başarısız-login sayacını güvenli biçimde temizle; dağıtık parola denemelerini IP limiti yanında hesap limitiyle durdur.
- [ ] Her `429` yanıtında `Retry-After` ve standart hata kodu döndür.
- [ ] Proxy IP çözümlemesini SEC-P0-02 ile birlikte tamamla.
- [ ] Store erişilemezse auth ve ödeme uçlarında kontrollü fail-closed, düşük riskli okuma uçlarında gözlemlenebilir fallback politikası tanımla.

Başlangıç limitleri aşağıdaki gibi uygulanmalı ve metriklere göre ayarlanmalıdır:

| Uç grubu                     |                           Başlangıç sınırı | Anahtar                  |
| ---------------------------- | -----------------------------------------: | ------------------------ |
| Tüm API                      |                             300 / 5 dakika | IP                       |
| Login                        |                             10 / 15 dakika | IP + hesap tanımlayıcısı |
| Kayıt                        |                                 5 / 1 saat | IP                       |
| Parola sıfırlama isteği      |                  5 / 15 dakika; IP için 50 | tanımlayıcı + IP         |
| OTP/doğrulama gönderimi      |                  5 / 15 dakika; IP için 20 | kullanıcı + IP           |
| OTP doğrulama                | challenge başına 5; IP için 20 / 15 dakika | challenge + IP           |
| Randevu oluşturma/değiştirme |                              20 / 1 dakika | kullanıcı + IP           |
| QR/kod ile berbere katılma   |                              30 / 1 dakika | kullanıcı + IP           |
| Medya yükleme                |                                10 / 1 saat | kullanıcı                |
| Public liste/slot okuma      |                             120 / 1 dakika | IP                       |

**Kabul kriteri:** Tek ve çoklu API instance testlerinde limit aşılamaz; süre sonunda erişim geri gelir; log ve store anahtarlarında PII bulunmaz.

### SEC-P0-04 — Login, kayıt ve parola politikası

- [ ] Minimum parolayı 6’dan en az 10 karaktere yükselt; maksimum 72 bayt bcrypt sınırını koru.
- [ ] Yaygın/ele geçirilmiş parola engeli ekle; karmaşık karakter sınıfı zorunluluğu koyma.
- [ ] Login başarısızlığında kullanıcı var/yok ayrımı yapmayan aynı durum ve yaklaşık eşit süreli yanıt kullan.
- [ ] Artan gecikme veya kısa hesap cooldown politikası ekle; kalıcı hesap kilidi ile saldırganın kullanıcıyı kilitlemesine izin verme.
- [ ] Kayıt sırasında e-posta/telefon doğrulaması ve yeniden gönderim akışını kesinleştir.
- [ ] Normalizasyonu tek modülde tut; kayıt, login, güncelleme ve recovery aynı kuralları kullansın.

**Kabul kriteri:** Enumeration, brute-force, Unicode/uzunluk ve eşzamanlı duplicate kayıt testleri geçer.

### SEC-P0-05 — Token ve oturum mimarisi

- [ ] 30 günlük JWT yerine 10–15 dakikalık access token ve 30 günlük rastgele opaque refresh token kullan.
- [ ] Refresh tokenı yalnızca hash’li sakla; her kullanımda rotation yap ve eski token tekrar kullanılırsa token ailesini iptal et.
- [ ] JWT’ye `iss`, `aud`, `sub`, `iat`, `exp`, `jti` ekle ve doğrulamada sabit algoritma/issuer/audience kontrol et.
- [ ] Web istemcisinde refresh tokenı `HttpOnly`, `Secure`, `SameSite` cookie’de; native istemcide OS secure storage’da sakla.
- [ ] Cookie kullanılan yenileme/logout uçları için CSRF savunması ve origin kontrolü uygula.
- [ ] Oturum oluşturmayı login anında yap; her authenticated istekte eksik oturum satırı oluşturma davranışını kaldır.
- [ ] Süresi dolmuş/revoke oturumlar ve recovery kayıtları için düzenli temizlik işi ekle.

**Kabul kriteri:** Logout, logout-all, parola değişimi, cihaz iptali, refresh rotation/reuse ve süresi dolma senaryoları çoklu cihaz entegrasyon testinden geçer.

### SEC-P0-06 — Authorization ve nesne sahipliği

- [ ] Her korumalı route için aşağıdaki matrisi kod ve testte tamamla.
- [ ] Sayısal ID almak yeterli olmasın; sorgu mutlaka authenticated kullanıcının barber/customer ilişkisiyle filtrelensin.
- [ ] Liste yanıtlarında rol bazlı alan seçimi yap; özel not, telefon ve müşteri bilgileri public yanıta sızmasın.
- [ ] Var olmayan ve başkasına ait kaynaklar için bilgi sızıntısını azaltan tutarlı `404/403` politikası belirle.
- [ ] Yönetim paneli gelene kadar istemciden `admin`/rol kabul etme; rol değişikliği için ayrı, denetlenen operasyon tasarla.

| Kaynak/işlem                   | Public  | Müşteri | Berber  | Ek sahiplik şartı                       |
| ------------------------------ | ------- | ------- | ------- | --------------------------------------- |
| Aktif berber/hizmet/slot okuma | sınırlı | evet    | evet    | private alan yok                        |
| Randevu oluşturma              | hayır   | evet    | evet    | müşteri kendisi; berber kendi işletmesi |
| Randevu görüntüleme/değiştirme | hayır   | tarafsa | tarafsa | randevunun tarafı olmalı                |
| Hizmet/takvim/izin yönetimi    | hayır   | hayır   | evet    | yalnızca kendi barber kaydı             |
| Müşteri özel not/etiket        | hayır   | hayır   | evet    | yalnızca kendi müşteri ilişkisi         |
| Hesap/oturum/medya             | hayır   | kendi   | kendi   | `req.user.id` ile filtre                |
| Bildirim okuma                 | hayır   | kendi   | kendi   | bildirim `userId` eşleşmeli             |

**Kabul kriteri:** Her mutasyon için customer A/customer B/barber A/barber B çapraz erişim testleri bulunur ve IDOR denemeleri başarısız olur.

### SEC-P0-07 — Girdi, dosya ve hata güvenliği

- [ ] OpenAPI’den veya ortak Zod şemalarından route bazlı body/query/param doğrulama middleware’i üret.
- [ ] Bilinmeyen alanları reddet veya temizle; sayı, tarih, saat, pagination ve metin üst sınırlarını merkezi tanımla.
- [ ] Global JSON limitini 256 KB düzeyine indir; medya rotasına ayrı ve kontrollü limit uygula.
- [ ] Base64 medya yerine object storage geçişine kadar gerçek MIME imzası, piksel/boyut, decode ve sıkıştırma kontrolleri ekle.
- [ ] Merkezi async error handler ile üretimde stack trace/SQL ayrıntısı döndürme; hata gövdesini `{ error, code, requestId }` olarak standartlaştır.
- [ ] Bilinmeyen route için standart `404`; malformed JSON için kontrollü `400` döndür.
- [ ] Randevu oluşturma ve ödeme gibi tekrarlanabilir mutasyonlara idempotency key ekle.

**Kabul kriteri:** Fazla büyük body, bozuk JSON, sahte görsel, bilinmeyen alan, SQL/XSS metni ve duplicate istek testleri kontrollü yanıt üretir.

### SEC-P0-08 — Veritabanı ve dağıtım temeli

- [ ] API için migration yetkisi olmayan en düşük yetkili DB kullanıcısı oluştur; migrasyon hesabını ayır.
- [ ] Üretim PostgreSQL bağlantısında TLS doğrulamasını zorunlu kıl.
- [ ] Foreign key’lere uygun `onDelete`, unique/check constraint ve sorgu indekslerini gözden geçir.
- [ ] Point-in-time recovery veya günlük şifreli yedek kur; geri yükleme tatbikatı yap.
- [ ] Production seed/demo hesap oluşturmayı kapat; seed yalnızca açık development/test bayrağıyla çalışsın.
- [ ] Readiness/liveness uçlarını ayır; readiness gerekli DB/Redis bağımlılığını güvenli biçimde kontrol etsin.

**Kabul kriteri:** API hesabı şema değiştiremez; demo hesap production’da oluşmaz; yedekten geri yükleme ve readiness testi belgelenir.

## Güvenlik P1 — P1 ürünleriyle birlikte

### SEC-P1-01 — Audit log ve gözlemlenebilirlik

- [ ] Login başarı/başarısızlık, rate limit, parola/iletişim/rol değişikliği, oturum iptali, hesap silme, randevu durum değişimi, ödeme/iade ve admin işlemlerini append-only audit log’a yaz.
- [ ] IP’yi gerekirse kısalt/hash’le; parola, token, OTP, tam ödeme verisi ve gereksiz PII loglama.
- [ ] `requestId`, actor, action, resource, result ve timestamp alanlarını standartlaştır.
- [ ] Ani login hatası, rate-limit artışı, webhook/ödeme imza hatası ve 5xx oranı için alarm kur.

### SEC-P1-02 — CI güvenlik kapıları

- [ ] Typecheck, API build ve entegrasyon testlerini her PR’da çalıştır.
- [ ] Secret scanning, dependency audit, SAST ve lisans kontrolü ekle.
- [ ] OpenAPI değiştiğinde generated dosyaların güncel olduğunu CI’da doğrula.
- [ ] Kritik/yüksek güvenlik açığında merge/deploy’u engelle; istisna süresi ve sahibi belgeli olsun.

### SEC-P1-03 — Veri gizliliği ve yaşam döngüsü

- [ ] Veri sınıflandırması ve saklama süreleri tanımla: hesap, randevu, audit, doğrulama, bildirim, medya ve ödeme referansları.
- [ ] KVKK aydınlatma, açık rıza gereksinimleri, veri dışa aktarma ve silme taleplerini tasarla.
- [ ] Analitik ve raporlamada mümkün olduğunca toplulaştırılmış veri kullan.
- [ ] Eski OTP, session, push token, bildirim ve geçici medya kayıtlarını otomatik temizle.

### SEC-P1-04 — Webhook ve dış servis güvenliği

- [ ] Ödeme, SMS/e-posta ve takvim webhook’larında imza, timestamp ve replay kontrolü yap.
- [ ] Webhook URL’lerini kullanıcı girdisinden alma; outbound timeout, allowlist ve kontrollü retry/dead-letter kuyruğu kullan.
- [ ] Provider event ID üzerinde unique constraint ile idempotency sağla.
- [ ] Dış servis anahtarlarını ayrı ortam ve en düşük yetki ile yönet.

## Güvenlik P2 — ileri seviye ve ölçek

- [ ] Kullanıcılar için TOTP/passkey tabanlı MFA; SMS’i tek başına güçlü ikinci faktör sayma.
- [ ] Riskli login ve yeni cihaz bildirimi; oturum/cihaz geçmişi.
- [ ] Yönetim paneli için ayrı admin kimliği, MFA, ince taneli RBAC ve zorunlu audit log.
- [ ] WAF/bot yönetimi, DDoS koruması ve gerektiğinde CAPTCHA/Turnstile challenge.
- [ ] Düzenli yetki gözden geçirmesi, tehdit modelleme ve bağımsız penetrasyon testi.
- [ ] Çoklu tenant/şube yapısında tenant izolasyon testleri; gerekirse PostgreSQL RLS değerlendirmesi.

## Ürün P1

P1 işleri aşağıdaki sırayla yapılabilir; her biri ilgili güvenlik bağımlılıklarını tamamlamalıdır.

### P1-01 — Raporlama

- Randevu, iptal, no-show, yoğun saat, müşteri dönüşü ve ciro metrikleri.
- Yalnızca ilgili berberin verisi; tarih aralığı ve timezone açık tanımlanmalı.
- **Güvenlik bağımlılığı:** SEC-P0-06, SEC-P1-01, SEC-P1-03.

### P1-02 — Bekleme listesi

- Hizmet, tarih/saat aralığı ve berber bazlı bekleme talebi.
- Slot açılınca sıraya/politikaya göre bildirim; rezervasyon için süreli hak ve yarış koşulu koruması.
- **Güvenlik bağımlılığı:** SEC-P0-03, SEC-P0-07; bildirim tercihi ve teslim verisi politikası.

### P1-03 — Favoriler ve hızlı tekrar

- Favori berberler, son hizmeti tekrar seçme ve güncel fiyat/süreyi açıkça onaylatma.
- Eski randevunun fiyatını sessizce yeni randevuya taşımama.
- **Güvenlik bağımlılığı:** SEC-P0-06, SEC-P1-03.

### P1-04 — Yorum ve puanlama

- Yalnızca tamamlanmış randevunun müşterisi, randevu başına bir doğrulanmış yorum yazabilir.
- Düzenleme/silme, raporlama ve berber yanıtı; spam ve hakaret moderasyonu.
- **Güvenlik bağımlılığı:** SEC-P0-03, SEC-P0-06, SEC-P1-01.

### P1-05 — Konum ve arama

- İlçe/konum, hizmet, fiyat ve müsait saate göre filtreleme; harita ve yol tarifi.
- Hassas müşteri konumunu varsayılan olarak saklamama; izin ve yaklaşık konum ilkesi.
- **Güvenlik bağımlılığı:** SEC-P1-03, harita sağlayıcısı anahtar kısıtlamaları.

### P1-06 — Kampanya ve sadakat

- Kupon, puan, ücretsiz hizmet, arkadaşını getir ve kampanya bildirimleri.
- Puan bakiyesi ledger mantığında tutulmalı; çift harcama ve kupon yarış koşulları engellenmeli.
- Pazarlama izni, ileti ret kaydı ve gönderim sıklığı uygulanmalı.
- **Güvenlik bağımlılığı:** SEC-P0-03, SEC-P0-07, SEC-P1-01, SEC-P1-03.

### P1-07 — Kapora ve ödeme

- Online kapora, ödeme durumu, iade ve iptal politikası; kart verisi uygulama sunucusuna alınmamalı.
- Provider-hosted checkout/tokenization, imzalı webhook, idempotency, immutable ödeme ledger’ı ve mutabakat işi kullanılmalı.
- Para tutarı integer kuruş ve para birimiyle saklanmalı; istemciden gelen tutara güvenilmemeli.
- İade/iptal yetkisi, parçalı iade, başarısız webhook retry ve anlaşmazlık akışları tasarlanmalı.
- **Güvenlik bağımlılığı:** Tüm Güvenlik P0, SEC-P1-01, SEC-P1-02, SEC-P1-04. Bu kapılar tamamlanmadan canlı ödeme açılmaz.

### P1-08 — Misafir randevusu

- Hesap açmadan doğrulanmış telefon ve kısa ömürlü işlem tokenı ile randevu.
- Misafir randevusunu sonradan hesaba güvenli bağlama; telefon sahipliği tekrar doğrulanmalı.
- Enumeration, toplu SMS kötüye kullanımı ve bot rezervasyonuna karşı koruma.
- **Güvenlik bağımlılığı:** SEC-P0-03, SEC-P0-04, SEC-P0-05, SEC-P0-06.

## Ürün P2

### P2-01 — Çoklu çalışan ve şube

- İşletme, şube, çalışan, hizmet yetkinliği, vardiya ve izin modelleri.
- Owner/manager/staff rolleri ve şube kapsamlı izinler; tenant izolasyonu.
- Solo berber ana hedef olarak kalıyorsa ertelenebilir.
- **Güvenlik bağımlılığı:** SEC-P0-06, SEC-P1-01 ve tenant izolasyon testleri.

### P2-02 — Takvim entegrasyonu

- Google/Apple Calendar’a ekleme; daha sonra çift yönlü senkronizasyon.
- OAuth PKCE/state, minimum scope, şifreli refresh token, revoke ve webhook doğrulama.
- Çakışma çözümü, timezone ve tekrarlanan event davranışı belgelenmeli.
- **Güvenlik bağımlılığı:** SEC-P0-05, SEC-P1-03, SEC-P1-04.

### P2-03 — Yönetim paneli

- Kullanıcı, işletme, randevu, şikâyet, moderasyon ve sistem durumu yönetimi.
- Ayrı admin yetkilendirmesi; MFA, ince taneli RBAC, gerekçeli işlem ve değiştirilemez audit log zorunlu.
- Kullanıcı olarak giriş/taklit özelliği varsayılan olarak yapılmamalı; gerekirse süreli, onaylı ve görünür destek oturumu tasarlanmalı.
- **Güvenlik bağımlılığı:** Tüm Güvenlik P0/P1 ve SEC-P2 admin maddeleri.

## Ajan çalışma protokolü

1. İşe başlamadan bu dosyada görev kodunu ve güvenlik bağımlılıklarını belirle.
2. Önce tehdit/abuse senaryolarını, ardından OpenAPI ve veri modelini güncelle.
3. Şema değişikliğinde ileri yönlü, tekrar çalıştırılabilir ve veri kaybetmeyen migrasyon yaz; `push-force` kullanma.
4. Generated istemcileri elle değiştirme; OpenAPI üzerinden yeniden üret.
5. Her mutasyonda authentication, rol, sahiplik, doğrulama, rate limit, idempotency ve audit gereksinimlerini kontrol et.
6. En az başarı, unauthenticated `401`, yanlış rol `403`, başka kullanıcı kaynağı, validation `400`, conflict `409` ve limit `429` testlerini ekle.
7. `pnpm run typecheck`, API build ve ilgili entegrasyon testlerini çalıştır.
8. Tamamlanan checkbox’ları yalnızca kod, migrasyon, test ve operasyon ayarı birlikte hazırsa işaretle.
9. Yeni environment değişkenini `.env.example` ve operasyon notlarına ekle; gerçek değer commit etme.
10. Güvenlik kararını zayıflatan geçici çözüm gerekiyorsa checkbox’ı kapatma; borcu, riski ve kaldırma koşulunu aynı görev altında yaz.

## Definition of Done

Bir güvenlik veya ürün görevi ancak aşağıdakilerin tümü sağlandığında tamamdır:

- API authorization sunucu tarafında uygulanmış ve çapraz kullanıcı testleri eklenmiş.
- OpenAPI, generated istemciler ve hata kodları uyumlu.
- Gerekli migrasyon güvenli ve tekrar çalıştırılabilir.
- Rate limit, audit, veri saklama ve idempotency etkileri değerlendirilmiş.
- Typecheck, build ve entegrasyon testleri başarılı.
- Secret/PII loglanmıyor; üretim ortam değişkenleri belgelenmiş.
- Kullanıcıya gösterilen hata güvenli ve anlaşılır; iç hata ayrıntısı yalnızca redakte logda.
- Rollback veya özelliği kapatma yöntemi tanımlanmış.
