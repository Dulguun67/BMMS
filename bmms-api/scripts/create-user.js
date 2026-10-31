'use strict';
// Анхны admin (эсвэл бусад) хэрэглэгч үүсгэх CLI.
//
// 1) Санал болгох (production): нууц үг огт дамжуулахгүй. Санамсаргүй нууц үгтэй үүсгээд,
//    нууц үг тохируулах холбоосыг имэйлээр илгээнэ (SES):
//      ADMIN_EMAIL=admin@tsetserleg.mn node scripts/create-user.js --send-reset
//    (AWS дээр: bmms-<env>-createadmin task, ADMIN_EMAIL-ийг run-task.sh-ийн RUN_TASK_ENV-ээр)
//
// 2) Локал/туршилт: нууц үгийг орчны хувьсагчаар (shell history-д үлдэхгүй):
//      BMMS_NEW_PASSWORD='...' node scripts/create-user.js admin@tsetserleg.mn admin
const crypto = require('crypto');
const config = require('../src/config');
const db = require('../src/db');
const pw = require('../src/security/password');

(async () => {
  const args = process.argv.slice(2);
  const sendReset = args.includes('--send-reset');
  const pos = args.filter((a) => !a.startsWith('--'));
  const email = (pos[0] || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const role = pos[1] || 'admin';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !['admin', 'bagsh', 'arga_zuich'].includes(role)) {
    console.error('Хэрэглээ: ADMIN_EMAIL=<имэйл> node scripts/create-user.js --send-reset\n   эсвэл: BMMS_NEW_PASSWORD=... node scripts/create-user.js <имэйл> [admin|bagsh|arga_zuich]');
    process.exit(2);
  }
  const cfg = config.load();
  let plain = process.env.BMMS_NEW_PASSWORD;
  if (sendReset) {
    plain = `${crypto.randomBytes(24).toString('base64url')}Aa1!`; // хэн ч мэдэхгүй; холбоосоор солино
  } else {
    if (!plain) { console.error('BMMS_NEW_PASSWORD заана уу (эсвэл --send-reset)'); process.exit(2); }
    const problems = pw.checkPolicy(plain, cfg.PASSWORD_MIN_LENGTH);
    if (problems.length) { console.error(problems.join('; ')); process.exit(2); }
  }
  db.init(cfg);
  try {
    const hash = await pw.hashPassword(plain);
    const id = await db.run(null, async (c) => {
      const exists = await db.one(c, 'SELECT hereglegch_id FROM hereglegch WHERE nevtreh_ner = ?', [email]);
      if (exists) throw new Error(`${email} аль хэдийн бүртгэлтэй (id=${exists.hereglegch_id})`);
      const [x] = await c.query('INSERT INTO hereglegch (nevtreh_ner, nuuts_ug_hash, nuuts_ug_solih, uureg) VALUES (?, ?, ?, ?)',
        [email, hash, sendReset, role]);
      await c.query("INSERT INTO audit_log (uildel, husnegt, bichlegiin_id, delgerengui) VALUES ('INSERT', 'hereglegch', ?, ?)",
        [String(x.insertId), JSON.stringify({ action: 'cli_create_user', role })]);
      return x.insertId;
    });
    console.log(`Хэрэглэгч үүслээ: id=${id}, ${email}, ${role}`);
    if (sendReset) {
      require('../src/mail/mailer').init(cfg);
      const reset = require('../src/routes/passwordReset');
      reset.init(cfg);
      const sent = await reset.createAndSend({ userId: id, byAdmin: true });
      console.log(sent ? `Нууц үг тохируулах холбоос ${email} руу илгээгдлээ (${cfg.PASSWORD_RESET_TTL_MIN} минут хүчинтэй).`
        : 'Холбоос илгээгдсэнгүй.');
    }
    if (role !== 'admin') console.log('Анхаар: багш, арга зүйчийг POST /api/v1/admin/users-ээр (профайлтай) үүсгэвэл тохиромжтой.');
  } finally { await db.close(); }
})().catch((e) => { console.error(e.sqlMessage || e.message); process.exit(1); });
