import { getAdmin } from './_firebase-admin.js';

export default async function handler(req, res) {
  // Verify cron secret (security)
  const authHeader = req.headers.authorization;
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const admin = getAdmin();
    const db = admin.firestore();
    const messaging = admin.messaging();
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ].join('-');
    const notifications = [];

    // Get all workspaces with push tokens
    const tokensSnap = await db.collectionGroup('members').where('pushToken', '!=', '').get();

    for (const memberDoc of tokensSnap.docs) {
      const member = memberDoc.data();
      const token = member.pushToken;
      if (!token) continue;

      const workspaceId = memberDoc.ref.parent.parent.id;

      // Get pet data — use newer UUID format (skip 'primary')
      const petsSnap = await db.collection('workspaces').doc(workspaceId).collection('dogs')
        .where('name', '>', '')
        .limit(1)
        .get();
      if (petsSnap.empty) continue;
      const petDoc = petsSnap.docs[0];
      const pet = petDoc.data();
      const petName = pet.name || 'Песик';

      // Check reminders
      const reminders = pet.reminders || [];
      for (const reminder of reminders) {
        if (!reminder.nextDate) continue;
        const nextDate = new Date(reminder.nextDate);
        const daysUntil = Math.floor((nextDate - now) / 86400000);

        if (daysUntil === 0) {
          notifications.push({ token, title: `⏰ ${reminder.label}`, body: `Сьогодні потрібно: ${reminder.label} для ${petName}!` });
        } else if (daysUntil === 1) {
          notifications.push({ token, title: `📅 Завтра: ${reminder.label}`, body: `Нагадування: завтра ${reminder.label} для ${petName}` });
        }
      }

      // Check if no events today → motivational push
      const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
      const eventsSnap = await db.collection('workspaces').doc(workspaceId).collection('events')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
        .limit(1).get();

      if (eventsSnap.empty && now.getHours() >= 10) {
        notifications.push({ token, title: `🐾 ${petName} чекає!`, body: 'Сьогодні ще немає записів. Як справи з горшиком?' });
      }

      // ===== VACCINATION & DEWORMING AUTO-CHECK =====
      // Deworming check (last recorded)
      if (pet.lastDeworming) {
        const lastDew = new Date(pet.lastDeworming);
        const daysSince = Math.floor((now - lastDew) / 86400000);
        if (daysSince >= 88 && daysSince <= 90) {
          notifications.push({ token, title: `💊 Час дегельмінтизації!`, body: `${petName}: пройшло ${daysSince} днів з останньої обробки. Заплануйте прийом препарату.` });
        } else if (daysSince >= 91 && daysSince <= 95) {
          notifications.push({ token, title: `💊 Прострочено дегельмінтизацію!`, body: `${petName}: потребує обробки. Зробіть сьогодні!` });
        }
      }

      // Vaccine check (last recorded)
      if (pet.lastVaccine) {
        const lastVac = new Date(pet.lastVaccine);
        const daysSince = Math.floor((now - lastVac) / 86400000);
        if (daysSince >= 358 && daysSince <= 365) {
          notifications.push({ token, title: `💉 Річна вакцинація!`, body: `${petName}: час планової ревакцинації. Запишіться до ветеринара.` });
        } else if (daysSince > 365 && daysSince <= 375) {
          notifications.push({ token, title: `⚠️ Вакцинація прострочена!`, body: `${petName}: термін вакцинації минув. Зверніться до ветеринара.` });
        }
      }

      // Puppy vaccination schedule auto-check (if no lastVaccine but pet is young)
      if (!pet.lastVaccine && pet.birthDate) {
        const birthDate = new Date(pet.birthDate);
        const ageInWeeks = Math.floor((now - birthDate) / (7 * 86400000));
        
        // DHPP 1 (8 weeks)
        if (ageInWeeks >= 7 && ageInWeeks <= 9) {
          notifications.push({ token, title: `💉 Перша вакцинація!`, body: `${petName}: ${ageInWeeks} тижнів. Пора на DHPP-1!` });
        }
        // DHPP 2 (12 weeks)
        else if (ageInWeeks >= 11 && ageInWeeks <= 13) {
          notifications.push({ token, title: `💉 Друга вакцинація!`, body: `${petName}: ${ageInWeeks} тижнів. Пора на DHPP-2!` });
        }
        // DHPP 3 + Rabies (16 weeks)
        else if (ageInWeeks >= 15 && ageInWeeks <= 17) {
          notifications.push({ token, title: `💉 Третя вакцинація + Сказ!`, body: `${petName}: ${ageInWeeks} тижнів. Фінальна вакцинація!` });
        }
        // Deworming for puppies (every 2 weeks until 3 months)
        else if (ageInWeeks <= 12 && ageInWeeks >= 4 && ageInWeeks % 2 === 0) {
          const puppyDewDaysSince = pet.lastDeworming ? Math.floor((now - new Date(pet.lastDeworming)) / 86400000) : 999;
          if (puppyDewDaysSince >= 12) {
            notifications.push({ token, title: `💊 Дегельмінтизація цуценяти!`, body: `${petName}: ${ageInWeeks} тижнів — обробіть від глистів (кожні 2 тижні до 12 тижнів).` });
          }
        }
      }
    }

    // Send all notifications
    let sent = 0;
    let failed = 0;

    for (const notif of notifications) {
      try {
        await messaging.send({
          token: notif.token,
          notification: { title: notif.title, body: notif.body },
          webpush: {
            notification: { icon: '/assets/icon-192.png', badge: '/assets/icon-192.png', vibrate: [100, 50, 100] },
            fcmOptions: { link: '/' }
          }
        });
        sent++;
      } catch (e) {
        failed++;
        // Remove invalid tokens
        if (e.code === 'messaging/registration-token-not-registered' || e.code === 'messaging/invalid-registration-token') {
          // Token expired — можна видалити з Firestore
          console.log('Invalid token, should remove:', notif.token.slice(0, 20));
        }
      }
    }

    res.status(200).json({ ok: true, sent, failed, total: notifications.length });
  } catch (error) {
    console.error('Push error:', error);
    res.status(500).json({ error: error.message });
  }
}
