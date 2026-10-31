import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client';

/** Authenticator апп-д нэмэх (QR эсвэл түлхүүр) → кодоор идэвхжүүлэх → нөөц код харуулах */
export default function MfaSetup({ onDone }) {
  const [setup, setSetup] = useState(null);
  const [qr, setQr] = useState('');
  const [codes, setCodes] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    api.post('/auth/mfa/setup').then((s) => {
      if (!alive) return;
      setSetup(s);
      // SVG-г өөрсдийн сангаас үүсгэдэг (гадны сервис рүү нууц илгээхгүй)
      QRCode.toString(s.otpauth_uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then((svg) => alive && setQr(svg), () => {});
    }, (e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, []);

  async function activate(e) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { const r = await api.post('/auth/mfa/activate', { kod: String(new FormData(e.currentTarget).get('kod')).trim() }); setCodes(r.noots_kod); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  function download() {
    const blob = new Blob([`БММС нөөц код (нэг удаагийн)\n\n${codes.join('\n')}\n`], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'bmms-noots-kod.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  if (codes) {
    return (
      <div className="stack" style={{ gap: 12 }}>
        <p className="note good"><b>Хоёр шатлалт баталгаажуулалт идэвхжлээ.</b> Утсаа алдсан үед доорх нөөц кодоор нэвтэрнэ. Код бүрийг нэг л удаа ашиглана.</p>
        <p className="note warn">Эдгээр кодыг зөвхөн одоо харуулна. Хэвлэж эсвэл татаж аваад аюулгүй газар хадгална уу.</p>
        <div className="tbl-wrap"><table><tbody>
          {Array.from({ length: codes.length / 2 }, (_, i) => <tr key={i}><td className="name">{codes[i * 2]}</td><td className="name">{codes[i * 2 + 1]}</td></tr>)}
        </tbody></table></div>
        <div className="row"><button className="btn" onClick={download}>Татаж авах</button><button className="btn" onClick={() => window.print()}>Хэвлэх</button></div>
        <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> Нөөц кодоо хадгалсан</label>
        <div><button className="btn primary" disabled={!saved} onClick={onDone}>Үргэлжлүүлэх</button></div>
      </div>
    );
  }
  if (!setup) return err ? <div className="err">{err}</div> : <div className="loading-row"><span className="spin" /> Бэлтгэж байна…</div>;
  return (
    <div className="stack" style={{ gap: 12 }}>
      <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>Утсандаа Google Authenticator эсвэл Microsoft Authenticator апп суулгана.</li>
        <li>Апп-аар доорх QR кодыг уншуулна. Уншуулж чадахгүй бол түлхүүрийг гараар оруулна.</li>
        <li>Апп дээр гарсан 6 оронтой кодыг оруулж баталгаажуулна.</li>
      </ol>
      <div className="row" style={{ alignItems: 'flex-start', gap: 18 }}>
        <div aria-label="QR код" style={{ width: 180, height: 180, background: '#fff', borderRadius: 12, padding: 6 }} dangerouslySetInnerHTML={{ __html: qr }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <p className="muted small" style={{ fontWeight: 700 }}>Түлхүүр</p>
          <code data-testid="mfa-secret" style={{ wordBreak: 'break-all', fontWeight: 800, letterSpacing: '.05em' }}>{setup.tulhuur.match(/.{1,4}/g).join(' ')}</code>
          <form onSubmit={activate} className="stack" style={{ gap: 10, marginTop: 14 }}>
            <label className="field"><span>Апп дээрх код</span><input className="input" name="kod" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" placeholder="123456" /></label>
            {err && <div className="err" role="alert">{err}</div>}
            <div><button className="btn primary" disabled={busy}>Баталгаажуулах</button></div>
          </form>
        </div>
      </div>
    </div>
  );
}
