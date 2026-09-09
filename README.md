# Intranet Helpdesk

Modernizacja systemu helpdesk szpitala (Angular + Node.js + MongoDB).

## Stack

- **Frontend:** Angular 19 (`frontend/`)
- **Backend:** Node.js + Express + Prisma (`backend/`)
- **Baza:** MongoDB

## Uruchomienie lokalne (dev)

```bash
# API — ustaw DATABASE_URL w backend/.env
cd backend
cp .env.example .env   # i uzupełnij Mongo URL
npm install
npx prisma db push
npm run db:seed
npm run dev
# http://localhost:3000

# UI
cd frontend
npm install
npm start
# http://localhost:4200
```

## Docker / EasyPanel

Jeden kontener serwuje API + zbudowany frontend. Baza = zewnętrzne MongoDB.

### EasyPanel

1. Utwórz aplikację typu **App** (Dockerfile).
2. Kontekst: root repo (`Dockerfile`).
3. **Port:** `3000`
4. **Persistent Storage:** mount `/data` (załączniki)
5. **Environment:**

| Zmienna | Wartość | Opis |
|---|---|---|
| `PORT` | `3000` | Port HTTP |
| `DATABASE_URL` lub `MONGO_URL` | `mongodb://...` | Connection string do Mongo |
| `UPLOADS_DIR` | `/data/uploads` | Załączniki na wolumenie |
| `SEED_ON_START` | `true` (tylko 1. start) | Seed grup/userów |
| `CORS_ORIGIN` | _(opcjonalnie)_ | np. `https://intranet.twoja-domena.pl` |

Przykład `DATABASE_URL` / `MONGO_URL` (EasyPanel):

```text
mongodb://USER:HASLO@home-stack_mongo-db:27017/intranet?authSource=admin
```

Uwagi:
- znaki specjalne w haśle URL-encode (`$` → `%24`, `@` → `%40`)
- zwykle wymagane `authSource=admin`
- baza `intranet` powstaje automatycznie przy pierwszym zapisie — nie trzeba jej tworzyć ręcznie

lub Atlas:

```text
mongodb+srv://USER:PASSWORD@cluster.mongodb.net/intranet?retryWrites=true&w=majority
```
6. Deploy → otwórz domenę.

Po pierwszym starcie ze seedem ustaw `SEED_ON_START=false`.

### Maile (SMTP)

Przy utworzeniu zgłoszenia wysyłane są **2 maile**:
1. do zgłaszającego — potwierdzenie + link do zgłoszenia
2. do agentów grupy — powiadomienie o nowym zgłoszeniu

| Zmienna | Opis |
|---|---|
| `APP_URL` | Publiczny URL aplikacji (linki w mailach), np. `https://intranet.example.pl` |
| `SMTP_HOST` | Serwer SMTP (bez tego maile są pomijane) |
| `SMTP_PORT` | np. `587` |
| `SMTP_SECURE` | `true` dla 465 |
| `SMTP_USER` / `SMTP_PASS` | Logowanie SMTP |
| `SMTP_FROM` | Nadawca, np. `Helpdesk <helpdesk@szpital.local>` |

## Moduł helpdesk

- 4 grupy zgłoszeń + domyślni agenci
- Workers: auto-dodawanie zgłaszającego (imię, nazwisko, email, telefon) przy nowym zgłoszeniu
- Komentarze do zgłoszenia (e-mail autora wymagany), najnowsze u góry
- Formularz zgłoszenia z polami z legacy systemu
- Dashboard agenta: tylko zgłoszenia z przypisanych grup
