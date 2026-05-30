# Doggo Coach Family PWA

Мобільний PWA-застосунок для домашнього тренування собаки: туалет, пелюшка, вигул, тренування, здоров'я, сімейний спільний трекінг.

## Що вже є

- PWA-структура: `manifest.webmanifest`, `sw.js`, іконки 192/512.
- Адаптивний single-page UI для телефону й десктопа.
- Локальне збереження як demo local-first режим.
- Архітектурні заготовки під Firebase Auth + Cloud Firestore.
- Firestore rules та indexes для household-моделі.
- Vercel-ready статичний деплой із директорії `public/`.

## Структура

```text
public/
  index.html
  manifest.webmanifest
  sw.js
  assets/
firebase/
  firestore.rules
  firestore.indexes.json
vercel.json
.env.example
```

## GitHub → Vercel деплой

Vercel підтримує імпорт Git-репозиторію, а кожен push у підключений GitHub-репозиторій автоматично створює новий deployment. [1][2][3]

### 1. Створи GitHub repo

```bash
git init
git add .
git commit -m "init doggo coach pwa"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/doggo-coach-family.git
git push -u origin main
```

### 2. Імпортуй репозиторій у Vercel

- Відкрий Vercel dashboard.
- Натисни **Add New Project**.
- Обери GitHub repo.
- Root directory: проектна папка.
- Framework preset: **Other**.
- Output directory: `public` не потрібен окремо для статичного сайту, достатньо стандартного деплою з repo structure. [1][2]

### 3. Env variables

Додай Firebase значення з `.env.example` у Vercel Project Settings → Environment Variables.

## Firebase setup

Firebase Email Link Auth для web підтримується через Authentication, а Firestore Security Rules будуються разом із Firebase Authentication для user-based і role-based доступу. [4][5]

### Рекомендована модель даних

- `users/{uid}` → profile, householdId, role
- `households/{householdId}`
- `households/{householdId}/dogs/{dogId}`
- `households/{householdId}/events/{eventId}`
- `households/{householdId}/routines/{routineId}`
- `households/{householdId}/reminders/{reminderId}`
- `households/{householdId}/notes/{noteId}`

### Мінімальний production roadmap

1. Firebase Auth: sign-in with email link.
2. Firestore: household bootstrap.
3. enable offline persistence on web.
4. realtime listeners for `events` and `reminders`.
5. share invite flow for spouse/co-owner.

Cloud Firestore має підтримку офлайн-доступу для web, що робить його зручним для сімейного трекінгу зі збереженням локальних змін і подальшою синхронізацією. [6]

## Що доробити далі

- Розбити `index.html` на модулі або Vite app.
- Додати Firebase SDK imports.
- Замінити demo local state на Firestore sync.
- Додати invite flow для дружини.
- Додати push notifications.
