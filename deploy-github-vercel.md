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

Після першого деплою також задеплой Firestore rules з папки `firebase/`.

## Google login / redirect_uri_mismatch

Якщо Google показує `Error 400: redirect_uri_mismatch`, це не помилка UI. Треба додати домени й redirect URI у Firebase/Google Console.

### Firebase Console

Authentication → Settings → Authorized domains:

- `dogs-55f5e.firebaseapp.com`
- `dogs-55f5e.web.app`
- домен Vercel без `https://`, наприклад `your-app.vercel.app`
- кастомний домен без `https://`, якщо він є
- `localhost` для локального тесту

### Google Cloud Console

APIs & Services → Credentials → OAuth 2.0 Client IDs → Web client.

Authorized redirect URIs:

- `https://dogs-55f5e.firebaseapp.com/__/auth/handler`
- `https://dogs-55f5e.web.app/__/auth/handler`
- `https://your-app.vercel.app/__/auth/handler`, тільки якщо окремо налаштований custom auth domain на Vercel
- `https://your-custom-domain.com/__/auth/handler`, якщо є кастомний домен

Authorized JavaScript origins:

- `https://your-app.vercel.app`
- `https://your-custom-domain.com`
- `http://localhost:4177` для локального тесту

У коді `authDomain` фіксований:

```text
dogs-55f5e.firebaseapp.com
```

Тому головний redirect URI для Google OAuth має бути саме `https://dogs-55f5e.firebaseapp.com/__/auth/handler`.

Після зміни OAuth налаштувань зачекай 2-5 хвилин, зроби hard refresh або відкрий застосунок у приватному вікні.
