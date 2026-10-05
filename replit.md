# Tıraş — Berber Randevu SaaS

A full-stack Turkish barber appointment SaaS with two user roles: barber and customer.

## Architecture

**Monorepo** (pnpm workspaces):
- `artifacts/api-server` — Express + Drizzle ORM REST API
- `artifacts/mobile` — Expo Router React Native app (iOS/Android/Web)
- `lib/db` — Shared PostgreSQL schema (Drizzle ORM)
- `lib/api-spec` — OpenAPI spec + Orval codegen config
- `lib/api-client-react` — Generated React Query hooks
- `lib/api-zod` — Generated Zod validation schemas

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Express 5, Drizzle ORM, PostgreSQL |
| Auth | bcryptjs + jsonwebtoken (JWT, 30-day tokens) |
| Frontend | Expo 54, Expo Router 6 (file-based routing) |
| State | @tanstack/react-query |
| Codegen | Orval (OpenAPI → React Query hooks + Zod schemas) |
| Styling | React Native StyleSheet, Inter font family |

## Color Palette (Tıraş Theme)

- **Primary**: `#1C3461` (deep navy)
- **Accent**: `#C8A84B` (warm gold)
- **Background**: `#F7F5F0` (warm off-white)
- **Card**: `#FFFFFF`

## Database Schema

Core tables include `users`, `barbers`, `customers`, `availability`, `appointment_slots`, `appointments`, and `no_show_blocks`.

**Enums**: `role` (barber | customer), `appointment_status` (pending | confirmed | cancelled | completed | no_show)

## API Routes

All routes prefixed with `/api`:

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /healthz | — | Health check |
| POST | /auth/register | — | Register (barber or customer) |
| POST | /auth/login | — | Login |
| GET | /auth/me | JWT | Current user |
| GET | /barbers | — | List active barbers |
| GET | /barbers/me | Barber | My profile |
| PUT | /barbers/me | Barber | Update profile |
| GET | /barbers/me/availability | Barber | My availability |
| PUT | /barbers/me/availability | Barber | Set availability |
| GET | /barbers/me/dashboard | Barber | Dashboard stats |
| POST | /barbers/me/slots | Barber | Create slot |
| PATCH | /barbers/me/slots/:id | Barber | Toggle slot availability |
| DELETE | /barbers/me/slots/:id | Barber | Delete slot |
| GET | /barbers/me/blocks | Barber | No-show blocks |
| POST | /barbers/me/blocks | Barber | Block customer |
| DELETE | /barbers/me/blocks/:id | Barber | Remove block |
| GET | /barbers/:id | — | Get barber by ID |
| GET | /barbers/:id/slots?date= | — | Get slots for date |
| GET | /appointments | JWT | List appointments |
| POST | /appointments | JWT | Book appointment |
| GET | /appointments/:id | JWT | Get appointment |
| PATCH | /appointments/:id | JWT | Update status/reschedule |
| GET | /customers/me/upcoming | Customer | Upcoming appointments |

## Mobile Screens

**Auth**: Login, Register (role selector: Berber / Müşteri)

**Barber tabs**:
- `(barber)/index` — Dashboard with today's stats + appointment list
- `(barber)/slots` — Slot management (horizontal date scroll + grid buttons)
- `(barber)/profile` — Edit shop info + manage no-show blocks

**Customer tabs**:
- `(customer)/index` — Upcoming appointments
- `(customer)/barbers` — Browse barbers
- `(customer)/profile` — Account info

**Detail screens**:
- `book/[barberId]` — Date + time slot selection (Trendyol-style)
- `appointment/[id]` — Full appointment detail with status actions

## Development Workflows

```bash
# Push DB schema
pnpm --filter @workspace/db run push

# Re-run API codegen
pnpm --filter @workspace/api-spec run codegen

# Type check everything
pnpm run typecheck
```

## Demo Accounts (seeded)

| Role | Telefon | Şifre |
|---|---|---|
| Berber | 05550000001 | 123456 |
| Müşteri | 05550000002 | 123456 |

## Environment Variables

- `SESSION_SECRET` — JWT signing secret (already set)
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned)

## Bildirim Sistemi (Faz 1B)

Minimal gerçek push bildirim sistemi. **Kapsam: yalnızca müşteri randevu hatırlatmaları** — randevudan 1 gün ve 1 saat önce. Daha fazlası (berber bildirimleri, mesaj bildirimleri, vb.) bu fazın dışındadır.

### Nasıl çalışır

1. **Token kaydı** — Mobil uygulama açıldığında, giriş yapmış **müşteri** için Expo push token alınır ve `POST /api/push-tokens` ile sunucuya kaydedilir (`push_tokens` tablosu, upsert). Web, izin reddi, simülatör veya EAS projectId yoksa sessizce atlanır; uygulama asla çökmez.
2. **Hatırlatma planlama** — Müşteri randevu aldığında (`POST /api/appointments`), 1 gün ve 1 saat öncesi için `scheduled_notifications` tablosuna `pending` kayıtlar eklenir. Geçmişte kalan hatırlatma zamanları atlanır. Manuel randevularda (müşteri hesabı yok) hatırlatma oluşturulmaz.
3. **İptal** — Randevu iptal edilince (`PATCH /api/appointments/:id` → `cancelled`) bekleyen hatırlatmalar `cancelled` yapılır.
4. **Gönderim** — `src/scheduler.ts` tek seferlik çalışır: zamanı gelmiş (`pending`, `scheduled_for <= now`) hatırlatmaları bulur, Expo Push API'ye gönderir, sonucu `sent`/`failed` olarak işaretler ve çıkar. Token yoksa veya Expo reddederse `failed` olur (uygulama/scheduler çökmez).

### Veritabanı tabloları

- `push_tokens` — kullanıcı başına Expo push token (token unique, upsert ile güncellenir).
- `scheduled_notifications` — planlanmış hatırlatmalar. Enumlar: `notification_type` (`reminder_1d` | `reminder_1h`), `notification_status` (`pending` | `processing` | `sent` | `failed` | `cancelled`).

### Scheduler kurulumu (Replit Scheduled Deployment)

Hatırlatmaların gönderilmesi için zamanlanmış bir deployment gerekir:

```bash
# Tek seferlik çalıştırma komutu (5 dakikada bir önerilir):
pnpm --filter @workspace/api-server run scheduler
```

- Replit'te **Scheduled Deployment** oluştur, komut olarak yukarıdakini ver, periyot ~5 dakika.
- Kurulum 5–15 dakika sürer. Scheduler her çalıştığında zamanı gelmiş hatırlatmaları gönderip çıkar (tek seferlik, sürekli çalışmaz).
- **Çift gönderim koruması:** Hatırlatmalar tek atomik `UPDATE pending → processing` ile "claim" edilir; üst üste binen çalıştırmalar aynı kaydı iki kez gönderemez. Her kayıt `status='processing'` koşuluyla `sent`/`failed`/`cancelled` olarak kapatılır. Bir çalıştırma claim ile kapatma arasında çökerse, kayıt `processing`'te kalır; sonraki çalıştırma 15 dakikalık lease süresini aşmış `processing` kayıtları `pending`'e geri alıp yeniden dener (hiçbir kayıt kalıcı olarak takılı kalmaz).

### Test sınırlaması

**Push bildirimleri Expo Go'da test edilemez.** Gerçek push token almak için EAS development build veya standalone build gerekir. `app.json` içinde EAS `projectId` tanımlı değildir; tanımlanana kadar token alımı sessizce başarısız olur (beklenen davranış). Sunucu tarafı (planlama, iptal, scheduler) Expo Go'dan bağımsız olarak çalışır ve test edilebilir.

### İlgili komutlar

```bash
# Scheduler'ı bir kez elle çalıştır (lokal test)
pnpm --filter @workspace/api-server run scheduler
```
