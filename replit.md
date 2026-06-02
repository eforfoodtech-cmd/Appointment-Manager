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

8 tables: `users`, `barbers`, `customers`, `availability`, `appointment_slots`, `appointments`, `no_show_blocks`, `messages`

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
| GET | /messages | JWT | List messages |
| POST | /messages | JWT | Send message |
| GET | /customers/me/upcoming | Customer | Upcoming appointments |

## Mobile Screens

**Auth**: Login, Register (role selector: Berber / Müşteri)

**Barber tabs**:
- `(barber)/index` — Dashboard with today's stats + appointment list
- `(barber)/slots` — Slot management (horizontal date scroll + grid buttons)
- `(barber)/messages` — Inbox + compose
- `(barber)/profile` — Edit shop info + manage no-show blocks

**Customer tabs**:
- `(customer)/index` — Upcoming appointments
- `(customer)/barbers` — Browse barbers
- `(customer)/messages` — Message inbox
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
