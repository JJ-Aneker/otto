// Cifrado AES-256-GCM de claves de usuario. La MASTER_KEY solo existe en el servidor.
const crypto = require('crypto');

function key() {
  const k = process.env.MASTER_KEY;
  if (!k) throw new Error('MASTER_KEY no configurada');
  const buf = Buffer.from(k, 'base64');
  if (buf.length !== 32) throw new Error('MASTER_KEY debe ser de 32 bytes en base64');
  return buf;
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]).toString('base64'), iv: iv.toString('base64') };
}

function decrypt(ciphertext, iv) {
  const raw = Buffer.from(ciphertext, 'base64');
  const tag = raw.subarray(raw.length - 16);
  const data = raw.subarray(0, raw.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

function hint(value) {
  const v = String(value);
  return '…' + v.slice(-4);
}

module.exports = { encrypt, decrypt, hint };
