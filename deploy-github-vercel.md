# Швидкий деплой

## GitHub

```bash
git init
git add .
git commit -m "doggo coach pwa"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/doggo-coach-family.git
git push -u origin main
```

## Vercel

1. Зайди на Vercel.
2. Import Git Repository.
3. Обери створений GitHub repo.
4. Додай Environment Variables з `.env.example`:
   - `GROQ_API_KEY` або інший AI provider key.
   - `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.
   - `CRON_SECRET` для `/api/send-push`.
5. Deploy.

## Firebase Auth для Vercel

У Firebase Console відкрий Authentication -> Settings -> Authorized domains і додай домени, з яких відкривається застосунок:

- production-домен Vercel, наприклад `your-app.vercel.app`;
- custom domain, якщо підключений;
- `localhost` для локальної перевірки.

Preview-домени Vercel мають окремі URL. Якщо тестуєш логін на preview deployment, додай і цей preview-домен або тестуй Google login тільки на production-домені.

Після першого деплою також задеплой Firestore rules з папки `firebase/`.
