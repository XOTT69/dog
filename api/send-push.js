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

      // Get all pets in workspace (multi-pet support)
      const petsSnap = await db.collection('workspaces').doc(workspaceId).collection('dogs').get();
      if (petsSnap.empty) continue;

      const pets = petsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const petName = pets[0].name || 'Песик';

      // Check calendar reminders for today/tomorrow
      const remindersSnap = await db.collection('workspaces').doc(workspaceId).collection('reminders')
        .where('date', '>=', today)
        .limit(20).get();

      for (const reminderDoc of remindersSnap.docs) {
        const reminder = reminderDoc.data();
        if (!reminder.date || reminder.done) continue;
        const nextDate = new Date(reminder.date);
        const daysUntil = Math.floor((nextDate - now) / 86400000);

        if (daysUntil === 0) {
          notifications.push({ token, title: `⏰ ${reminder.title}`, body: `Сьогодні: ${reminder.title}` });
        } else if (daysUntil === 1) {
          notifications.push({ token, title: `📅 Завтра: ${reminder.title}`, body: `Нагадування: завтра ${reminder.title}` });
        }
      }

      // Check if no events today -> motivational push
      const todayStart = new Date(today); todayStart.setHours(0, 0, 0, 0);
      const eventsSnap = await db.collection('workspaces').doc(workspaceId).collection('events')
        .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(todayStart))
        .limit(1).get();

      if (eventsSnap.empty && now.getHours() >= 10) {
        notifications.push({ token, title: `🐾 ${petName} чекає!`, body: 'Сьогодні ще немає записів. Як справи?' });
      }

      // Deworming & vaccine check for all pets
      for (const pet of pets) {
        const name = pet.name || 'Тварина';

        if (pet.lastDeworming) {
          const lastDew = new Date(pet.lastDeworming);
          const daysSince = Math.floor((now - lastDew) / 86400000);
          if (daysSince >= 88 && daysSince <= 90) {
            notifications.push({ token, title: `💊 Час дегельмінтизації!`, body: `${name}: пройшло ${daysSince} днів з останньої обробки.` });
          }
        }

        if (pet.lastVaccine) {
          const lastVac = new Date(pet.lastVaccine);
          const daysSince = Math.floor((now - lastVac) / 86400000);
          if (daysSince >= 358 && daysSince <= 365) {
            notifications.push({ token, title: `💉 Вакцинація!`, body: `${name}: минув майже рік з останньої вакцини.` });
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
