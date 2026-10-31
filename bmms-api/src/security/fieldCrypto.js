'use strict';
// Ганцаарчилсан сургалтын *_enc баганын шифрлэлт (SR107).
//   Хэлбэр: [12 байт IV][ciphertext][16 байт GCM tag], key_id баганад түлхүүрийн хувилбар.
//   AAD (нэмэлт баталгаажуулах өгөгдөл) нь шифрлэгдсэн утгыг тухайн мөр, баганад уяна:
//   нэг хүүхдийн оношийг өөр хүүхдийн мөрөнд хуулбал тайлагдахгүй.
const crypto = require('crypto');

let keys = {}; let activeId;
function init(cfg) {
  keys = Object.fromEntries(Object.entries(cfg.FIELD_KEYS).map(([k, v]) => [k, Buffer.from(v, 'base64')]));
  activeId = cfg.FIELD_KEY_ACTIVE;
}

function encrypt(plain, aad) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keys[activeId], iv);
  c.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}

function decrypt(buf, keyId, aad) {
  if (buf == null) return null;
  const key = keys[keyId];
  if (!key) throw new Error(`Шифрлэлтийн түлхүүр олдсонгүй: ${keyId}`);
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
  d.setAAD(Buffer.from(aad, 'utf8'));
  d.setAuthTag(b.subarray(b.length - 16));
  return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString('utf8');
}

const activeKeyId = () => activeId;

module.exports = { init, encrypt, decrypt, activeKeyId };
