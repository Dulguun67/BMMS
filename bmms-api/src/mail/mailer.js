'use strict';
// Имэйл илгээх.
//   ses     — AWS SES v2. ECS task role-оор баталгаажна (статик нууц түлхүүр хадгалахгүй). Production-д заавал.
//   console — хөгжүүлэлтэд stdout-д хэвлэнэ. Production-д хориотой (сэргээх холбоос логт үлдэнэ).
//   memory  — тестэд: outbox массивт хадгална.
let provider = 'console';
let from = '';
let client;
let configSet;
const outbox = [];

function init(cfg) {
  provider = cfg.MAIL_PROVIDER;
  from = cfg.MAIL_FROM;
  configSet = cfg.SES_CONFIGURATION_SET || undefined;
  if (provider === 'ses') {
    const { SESv2Client } = require('@aws-sdk/client-sesv2');
    client = new SESv2Client({ region: cfg.AWS_REGION });
  }
}

async function send({ to, subject, text, html }) {
  if (provider === 'memory') { outbox.push({ to, subject, text, html, at: Date.now() }); return; }
  if (provider === 'console') {
    console.log(`MAIL to=${to} subject=${JSON.stringify(subject)}\n${text}`);
    return;
  }
  const { SendEmailCommand } = require('@aws-sdk/client-sesv2');
  await client.send(new SendEmailCommand({
    FromEmailAddress: from,
    Destination: { ToAddresses: [to] },
    ConfigurationSetName: configSet,
    Content: { Simple: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Text: { Data: text, Charset: 'UTF-8' }, Html: { Data: html, Charset: 'UTF-8' } },
    } },
  }));
}

module.exports = { init, send, outbox };
