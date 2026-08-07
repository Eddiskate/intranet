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

Przykład `DATABASE_URL`:

```text
mongodb://USER:PASSWORD@host:27017/intranet?authSource=admin
```

lub Atlas:

```text
mongodb+srv://USER:PASSWORD@cluster.mongodb.net/intranet?retryWrites=true&w=majority
```

6. Deploy → otwórz domenę.

Po pierwszym starcie ze seedem ustaw `SEED_ON_START=false`.

### Lokalnie z compose

```bash
docker compose up --build
# http://localhost:3000
```

## Moduł helpdesk

- 4 grupy zgłoszeń (Informatyka, Aparatura medyczna, Telefony i kontrola dostępu, Dział Techniczny)
- Użytkownicy: imię, nazwisko, dział (select), przypisanie do grup
- Formularz zgłoszenia z polami z legacy systemu
- Dashboard agenta: tylko zgłoszenia z przypisanych grup
