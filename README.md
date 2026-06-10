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

1. Створи GitHub repo.
2. Імпортуй repo у Vercel.
3. Додай env variables.
4. Deploy.

## Firebase setup

Рекомендована модель:
- `users/{uid}`
- `households/{householdId}`
- `households/{householdId}/dogs/{dogId}`
- `households/{householdId}/events/{eventId}`
- `households/{householdId}/routines/{routineId}`
- `households/{householdId}/reminders/{reminderId}`
- `households/{householdId}/notes/{noteId}`
