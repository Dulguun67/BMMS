'use strict';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const wrap = (body) => `<!doctype html><html lang="mn"><body style="font-family:Arial,sans-serif;color:#18213A;line-height:1.5;max-width:560px">${body}
<p style="color:#62708A;font-size:12px;margin-top:28px">Бүлгийн менежментийн систем (БММС). Энэ имэйлд хариу бичих шаардлагагүй.</p></body></html>`;

function resetLink({ ner, link, minutes, byAdmin }) {
  const hello = ner ? `Сайн байна уу, ${ner}.` : 'Сайн байна уу.';
  const why = byAdmin ? 'Систем хариуцагч таны бүртгэлд нууц үг тохируулах холбоос илгээлээ.' : 'Таны бүртгэлийн нууц үгийг сэргээх хүсэлт ирлээ.';
  const text = `${hello}\n\n${why}\nДоорх холбоосоор ${minutes} минутын дотор шинэ нууц үгээ тохируулна уу. Холбоос нэг л удаа ажиллана.\n\n${link}\n\nХэрэв та энэ хүсэлтийг гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу. Таны нууц үг өөрчлөгдөхгүй.`;
  const html = wrap(`<p>${esc(hello)}</p><p>${esc(why)}</p>
<p>Доорх товчоор <b>${minutes} минутын</b> дотор шинэ нууц үгээ тохируулна уу. Холбоос нэг л удаа ажиллана.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#1B53C5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Нууц үг тохируулах</a></p>
<p style="font-size:13px;color:#62708A">Товч ажиллахгүй бол энэ хаягийг хөтөчдөө хуулна уу:<br>${esc(link)}</p>
<p>Хэрэв та энэ хүсэлтийг гаргаагүй бол энэ имэйлийг үл тоомсорлоно уу. Таны нууц үг өөрчлөгдөхгүй.</p>`);
  return { subject: 'БММС: нууц үг тохируулах', text, html };
}

function passwordChanged({ ner, when, ip }) {
  const hello = ner ? `Сайн байна уу, ${ner}.` : 'Сайн байна уу.';
  const text = `${hello}\n\nТаны БММС-ийн нууц үг ${when}-д солигдлоо${ip ? ` (IP: ${ip})` : ''}. Бүх төхөөрөмж дээрх сесс хаагдсан.\n\nХэрэв та өөрөө солиогүй бол цэцэрлэгийн систем хариуцагчид нэн даруй мэдэгдэнэ үү.`;
  const html = wrap(`<p>${esc(hello)}</p><p>Таны БММС-ийн нууц үг <b>${esc(when)}</b>-д солигдлоо${ip ? ` (IP: ${esc(ip)})` : ''}. Бүх төхөөрөмж дээрх сесс хаагдсан.</p>
<p><b>Хэрэв та өөрөө солиогүй бол</b> цэцэрлэгийн систем хариуцагчид нэн даруй мэдэгдэнэ үү.</p>`);
  return { subject: 'БММС: нууц үг солигдлоо', text, html };
}

module.exports = { resetLink, passwordChanged };
