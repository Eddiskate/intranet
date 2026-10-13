# Intranet Helpdesk

Modernizacja systemu helpdesk szpitala (Angular + Node.js + MongoDB).

## Stack

- **Frontend:** Angular 19 (`frontend/`)
- **Backend:** Node.js + Express + native MongoDB driver (`backend/`)
- **Baza:** MongoDB (standalone OK — bez replica set)

## Uruchomienie lokalne (dev)

```bash
# API — lokalny env + SMTP
cd backend
cp .env.example .env                 # lokalnie
# cp .env.production.example .env.production   # prod (plik) albo EasyPanel Env
# uzupełnij DATABASE_URL + SMTP_*
npm install
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
| `SEED_ON_START` | `true` / `false` / _(puste=auto)_ | `true` = zawsze seed; `false` = nigdy; puste = seed tylko gdy baza bez grup |
| `JWT_SECRET` | losowy string | Sekret tokenów logowania (ustaw własne na prod) |
| `CORS_ORIGIN` | _(opcjonalnie)_ | np. `https://intranet.twoja-domena.pl` |

Przykład `DATABASE_URL` / `MONGO_URL` (EasyPanel):

```text
mongodb://USER:HASLO@home-stack_mongo-db:27017/intranet?authSource=admin
```

Uwagi:
- znaki specjalne w haśle URL-encode (`$` → `%24`, `@` → `%40`)
- zwykle wymagane `authSource=admin`
- **nie trzeba** replica setu
- baza `intranet` powstaje automatycznie przy pierwszym zapisie
- jeśli wcześniej dodałeś `&replicaSet=rs0`, możesz to usunąć (albo zostawić — nie szkodzi, gdy RS działa)

6. Deploy → otwórz domenę.

Po pierwszym starcie ze seedem ustaw `SEED_ON_START=false` (albo użyj przycisku „Wgraj domyślne grupy” w UI).

### Logowanie i role

- Publiczne: formularz zgłoszenia, podgląd, komentarze
- Przy **pierwszym** zgłoszeniu z danego e-maila tworzone jest konto roli **USER** + mail z hasłem tymczasowym (wymaga SMTP)
- Po zalogowaniu:
  - **USER** → **Moje zgłoszenia** (status + timeline + komentarze)
  - **AGENT / ADMIN** → **Dashboard** i **Użytkownicy**
- Konta ze seeda (agenci): e-mail + hasło **`helpdesk`**
- Timeline w zgłoszeniu: utworzenie, zmiana statusu, przypisanie, komentarze

### Maile (SMTP)

Pliki:
- lokalnie: `backend/.env` (wzorzec: `.env.example`)
- produkcja: `backend/.env.production` (wzorzec: `.env.production.example`) **albo** zmienne w EasyPanel

Przy utworzeniu zgłoszenia wysyłane są maile:
1. do zgłaszającego — potwierdzenie + link (+ hasło konta przy pierwszym zgłoszeniu)
2. do agentów grupy — powiadomienie o nowym zgłoszeniu
3. komentarze — powiadomienie uczestników wątku

| Zmienna | Opis |
|---|---|
| `APP_URL` | Publiczny URL aplikacji (linki w mailach), np. `https://intranet.example.pl` |
| `SMTP_HOST` | Serwer SMTP (bez tego maile są pomijane) |
| `SMTP_PORT` | np. `587` (lub `465` + `SMTP_SECURE=true`) |
| `SMTP_SECURE` | `true` dla 465 |
| `SMTP_USER` / `SMTP_PASS` | Logowanie SMTP |
| `SMTP_FROM` | Nadawca, np. `Helpdesk <helpdesk@szpital.local>` |

## Moduł helpdesk

- 4 grupy zgłoszeń + domyślni agenci
- Workers: auto-dodawanie zgłaszającego (imię, nazwisko, email, telefon) przy nowym zgłoszeniu
- Komentarze do zgłoszenia (e-mail autora wymagany), najnowsze u góry
- Formularz zgłoszenia z polami z legacy systemu
- Dashboard agenta: tylko zgłoszenia z przypisanych grup
