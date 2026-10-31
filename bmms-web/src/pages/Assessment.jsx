import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { useApi } from '../api/hooks';
import { BarChart } from '../components/Charts';
import { useToast } from '../components/Toast';
import { Chip, Empty, ErrorBox, Loading, PageHead, RouteTabs, Seg, useTab } from '../components/ui';
import { DIRS, DIR_IDS, UYE_TURUL } from '../lib/constants';
import { avg, fullName, r2, today } from '../lib/format';

export default function Assessment() {
  const { group } = useAuth();
  const tab = useTab('rubric');
  const periods = useApi(`/school-years/${group.jil_id}/periods`);
  const ref = useApi('/reference');
  const [uye, setUye] = useState(null);
  useEffect(() => {
    if (!periods.data || !periods.data.length) return;
    const t = today();
    const cur = periods.data.find((p) => p.ehleh_ognoo <= t && t <= p.duusah_ognoo) || periods.data[0];
    setUye((u) => (periods.data.some((p) => p.uye_id === u) ? u : cur.uye_id));
  }, [periods.data]);
  const body = () => {
    if (periods.loading || ref.loading) return <Loading />;
    if (periods.error || ref.error) return <ErrorBox error={periods.error || ref.error} />;
    if (!periods.data.length) return <Empty title="Үнэлгээний үе тохируулаагүй байна">Заах арга зүйч Тохиргоо хэсгээс энэ хичээлийн жилийн эхлэлийн, явцын, төгсгөлийн үеийг үүсгэнэ.</Empty>;
    if (!uye) return <Loading />;
    const props = { uye, periods: periods.data, refData: ref.data };
    return tab === 'checklist' ? <Checklist {...props} /> : tab === 'self' ? <SelfEval {...props} /> : <Rubric {...props} />;
  };
  return (
    <>
      <PageHead title="Үнэлгээ" sub="Эхлэлийн үнэлгээг явцын үнэлгээтэй харьцуулж ахицыг хянана" />
      <section className="panel">
        <RouteTabs base="/unelgee" tabs={[['rubric', 'Рубрик үнэлгээ'], ['checklist', 'Хяналтын хуудас'], ['self', 'Багш өөрийн үнэлгээ']]} />
        {periods.data && periods.data.length > 0 && (
          <div className="toolbar">
            <Seg wide label="Үнэлгээний үе" value={uye} onChange={(v) => v && setUye(v)}
              options={[...periods.data].sort((a, b) => UYE_TURUL.indexOf(a.turul) - UYE_TURUL.indexOf(b.turul)).map((p) => [p.uye_id, `${p.turul} үнэлгээ`])} />
          </div>
        )}
        {body()}
      </section>
    </>
  );
}

function Rubric({ uye, periods, refData }) {
  const { group, canWrite } = useAuth();
  const toast = useToast();
  const gid = group.buleg_id;
  const roster = useApi(`/groups/${gid}/children`);
  const data = useApi(`/groups/${gid}/rubric?uye_id=${uye}`);
  const summary = useApi(`/groups/${gid}/rubric/summary`);
  const progress = useApi(`/groups/${gid}/rubric/progress`);
  const map = useMemo(() => new Map((data.data || []).map((r) => [`${r.suraltsagch_id}|${r.chiglel_id}`, r.tuvshin])), [data.data]);
  if (roster.loading || data.loading) return <Loading />;
  if (roster.error || data.error) return <ErrorBox error={roster.error || data.error} onRetry={data.reload} />;
  if (!roster.data.length) return <Empty>Бүлэгт хүүхэд алга.</Empty>;

  async function set(cid, ch, v) {
    data.mutate((d) => [...d.filter((x) => !(x.suraltsagch_id === cid && x.chiglel_id === ch)), ...(v ? [{ suraltsagch_id: cid, chiglel_id: ch, tuvshin: v }] : [])]);
    try { await api.put(`/groups/${gid}/rubric`, { uye_id: uye, items: [{ suraltsagch_id: cid, chiglel_id: ch, tuvshin: v }] }); summary.reload(); progress.reload(); } catch (e) { toast(e.message, 'error'); data.reload(); }
  }
  const colAvg = DIR_IDS.map((ch) => avg(roster.data.map((c) => map.get(`${c.suraltsagch_id}|${ch}`) ?? null)));
  const ordered = [...periods].sort((a, b) => UYE_TURUL.indexOf(a.turul) - UYE_TURUL.indexOf(b.turul));
  const used = ordered.filter((p) => (summary.data || []).some((s) => s.uye_id === p.uye_id));
  const op = { Эхлэлийн: 0.3, Явцын: 0.6, Төгсгөлийн: 1 };
  const prog = (progress.data || []).filter((p) => p.ahits != null);
  return (
    <>
      <div className="tbl-wrap"><table>
        <thead><tr><th className="sticky-col">Хүүхэд</th>{DIR_IDS.map((ch) => <th key={ch}><span className="row" style={{ gap: 6 }}><i className="dot" style={{ background: DIRS[ch].color }} />{DIRS[ch].short}</span></th>)}<th className="num">Дундаж</th></tr></thead>
        <tbody>{roster.data.map((c) => (
          <tr key={c.suraltsagch_id}><td className="name sticky-col">{fullName(c)}</td>
            {DIR_IDS.map((ch) => <td key={ch}><Seg label={`${c.ner} ${DIRS[ch].short}`} value={map.get(`${c.suraltsagch_id}|${ch}`) ?? null} disabled={!canWrite} color={DIRS[ch].color} ink={DIRS[ch].ink} options={[[1, 1], [2, 2], [3, 3]]} onChange={(v) => set(c.suraltsagch_id, ch, v)} /></td>)}
            <td className="num"><b>{r2(avg(DIR_IDS.map((ch) => map.get(`${c.suraltsagch_id}|${ch}`) ?? null)))}</b></td></tr>
        ))}</tbody>
        <tfoot><tr><td className="sticky-col">Бүлгийн дундаж</td>{colAvg.map((v, i) => <td key={DIR_IDS[i]}>{r2(v)} {v != null && v < 2 && <Chip c="red">Анхаарах</Chip>}</td>)}<td className="num">{r2(avg(colAvg))}</td></tr></tfoot>
      </table></div>
      <div className="panel-pad" style={{ borderTop: '1px solid var(--line)' }}>
        <details className="crit"><summary>Түвшний шалгуур харах</summary>
          <div className="tbl-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Чиглэл</th><th>I</th><th>II</th><th>III</th></tr></thead><tbody>
            {refData.chiglel.map((ch) => <tr key={ch.chiglel_id}><td className="name">{ch.ner}</td>{[1, 2, 3].map((t) => <td key={t}>{(refData.rubric_shalguur.find((x) => x.chiglel_id === ch.chiglel_id && x.tuvshin === t) || {}).tailbar}</td>)}</tr>)}
          </tbody></table></div>
        </details>
        <div className="grid2" style={{ marginTop: 16 }}>
          <div>
            <h3>Үе шатуудын харьцуулалт</h3><p className="muted small">Бүлгийн дундаж түвшин, суралцахуйн чиглэлээр</p>
            {used.length ? <>
              <BarChart labels={DIR_IDS.map((ch) => DIRS[ch].short)} series={used.map((p) => ({ name: p.turul, color: 'var(--primary)', opacity: op[p.turul], values: DIR_IDS.map((ch) => { const s = summary.data.find((x) => x.uye_id === p.uye_id && x.chiglel_id === ch); return s ? s.dundaj : null; }) }))} />
              <div className="legend" style={{ marginTop: 6 }}>{used.map((p) => <span key={p.uye_id}><i className="cell" style={{ background: 'var(--primary)', opacity: op[p.turul] }} />{p.turul}</span>)}</div>
            </> : <p className="muted">Үнэлгээ оруулаагүй байна.</p>}
          </div>
          <div>
            <h3>Хүүхдийн ахиц</h3><p className="muted small">{prog.length ? 'Эхлэлийн үнэлгээнээс сүүлийн үнэлгээ хүртэлх дундаж түвшний өөрчлөлт' : 'Хоёр ба түүнээс дээш үеийн үнэлгээ хийгдмэгц ахиц харагдана.'}</p>
            {prog.length > 0 && <ul className="list-plain">{prog.map((r) => (
              <li key={r.suraltsagch_id}><span style={{ flex: 1, fontWeight: 700 }}>{fullName(r)}</span><span className="muted">{r2(r.ehlel)} → {r2(r.tugsgul ?? r.yavts)}</span><Chip c={r.ahits > 0 ? 'green' : r.ahits < 0 ? 'red' : ''}>{r.ahits > 0 ? '+' : ''}{r2(r.ahits)}</Chip></li>
            ))}</ul>}
          </div>
        </div>
      </div>
    </>
  );
}

function Checklist({ uye, refData }) {
  const { group, canWrite } = useAuth();
  const toast = useToast();
  const gid = group.buleg_id;
  const roster = useApi(`/groups/${gid}/children`);
  const data = useApi(`/groups/${gid}/checklist?uye_id=${uye}`);
  const summary = useApi(`/groups/${gid}/checklist/summary?uye_id=${uye}`);
  const [cid, setCid] = useState(null);
  const map = useMemo(() => new Map((data.data || []).map((r) => [`${r.suraltsagch_id}|${r.asuult_id}`, r.chaddag])), [data.data]);
  if (roster.loading || data.loading) return <Loading />;
  if (roster.error || data.error) return <ErrorBox error={roster.error || data.error} onRetry={data.reload} />;
  if (!roster.data.length) return <Empty>Бүлэгт хүүхэд алга.</Empty>;
  const items = refData.hyanaltyn_asuult;
  const cur = cid || roster.data[0].suraltsagch_id;
  const child = roster.data.find((c) => c.suraltsagch_id === cur);
  async function set(qid, v) {
    const val = v === null ? null : v === 1;
    data.mutate((d) => [...d.filter((x) => !(x.suraltsagch_id === cur && x.asuult_id === qid)), ...(val === null ? [] : [{ suraltsagch_id: cur, asuult_id: qid, chaddag: val ? 1 : 0 }])]);
    try { await api.put(`/groups/${gid}/checklist`, { uye_id: uye, items: [{ suraltsagch_id: cur, asuult_id: qid, chaddag: val }] }); summary.reload(); } catch (e) { toast(e.message, 'error'); data.reload(); }
  }
  const done = (c) => items.filter((q) => map.has(`${c.suraltsagch_id}|${q.asuult_id}`)).length;
  return (
    <>
      <div className="grid-side panel-pad">
        <div><p className="muted small" style={{ fontWeight: 700, marginBottom: 6 }}>Хүүхэд сонгох</p>
          <div className="pick">{roster.data.map((c) => <button key={c.suraltsagch_id} aria-pressed={c.suraltsagch_id === cur} onClick={() => setCid(c.suraltsagch_id)}><span>{fullName(c)}</span><span className="muted small">{done(c)}/{items.length}</span></button>)}</div>
        </div>
        <div>
          <h3 style={{ marginBottom: 8 }}>{child.ovog} {child.ner}: эзэмшсэн байх чадварууд</h3>
          <div className="tbl-wrap"><table><thead><tr><th>№</th><th>Чадвар</th><th>Чиглэл</th><th>Үнэлгээ</th></tr></thead><tbody>
            {items.map((q, i) => {
              const v = map.get(`${cur}|${q.asuult_id}`);
              const val = v === undefined ? null : v ? 1 : 0;
              return (
                <tr key={q.asuult_id}><td className="sub">{i + 1}</td><td>{q.asuult}</td><td><i className="dot" style={{ background: DIRS[q.chiglel_id].color }} title={DIRS[q.chiglel_id].short} /></td>
                  <td><Seg wide label={q.asuult} value={val} disabled={!canWrite} color={val === 1 ? 'var(--green)' : 'var(--yellow)'} ink={val === 1 ? '#fff' : '#3A2A00'} options={[[1, 'Чаддаг'], [0, 'Хараахан']]} onChange={(x) => set(q.asuult_id, x)} /></td></tr>
              );
            })}
          </tbody></table></div>
        </div>
      </div>
      <div className="panel-pad" style={{ borderTop: '1px solid var(--line)' }}>
        <h3>Бүлгийн дүн: чадвар бүрийг эзэмшсэн хүүхдийн хувь</h3>
        <p className="muted small" style={{ marginBottom: 10 }}>60%-иас доош бол дараагийн сарын төлөвлөгөөнд анхаарна.</p>
        <div className="tbl-wrap"><table><tbody>{items.map((q, i) => {
          const s = (summary.data || []).find((x) => x.asuult_id === q.asuult_id);
          return (
            <tr key={q.asuult_id}><td className="sub">{i + 1}</td><td>{q.asuult}</td>
              <td style={{ width: 180 }}>{s ? <div className="row" style={{ flexWrap: 'nowrap' }}><div className={`bar ${s.anhaarah ? 'low' : ''}`} style={{ flex: 1 }}><i style={{ width: `${s.chaddag_huvi}%` }} /></div><b className="small">{s.chaddag_huvi}%</b></div> : <span className="muted small">Үнэлээгүй</span>}</td></tr>
          );
        })}</tbody></table></div>
      </div>
    </>
  );
}

function SelfEval({ uye, refData }) {
  const { me } = useAuth();
  const toast = useToast();
  const data = useApi(me.bagsh_id ? `/self-eval?uye_id=${uye}` : null);
  if (!me.bagsh_id) return <Empty>Багшийн профайлтай хэрэглэгч бөглөнө.</Empty>;
  if (data.loading) return <Loading />;
  if (data.error) return <ErrorBox error={data.error} onRetry={data.reload} />;
  const get = (id) => { const x = data.data.find((r) => r.shalguur_id === id); return x ? x.onoo : null; };
  async function set(id, v) {
    data.mutate((d) => [...d.filter((x) => x.shalguur_id !== id), ...(v ? [{ shalguur_id: id, onoo: v }] : [])]);
    try { await api.put('/self-eval', { uye_id: uye, items: [{ shalguur_id: id, onoo: v }] }); } catch (e) { toast(e.message, 'error'); data.reload(); }
  }
  const color = (v) => (v === 1 ? ['var(--red)', '#fff'] : v === 2 ? ['var(--yellow)', '#3A2A00'] : ['var(--green)', '#fff']);
  return (
    <>
      <div className="toolbar"><span className="muted small">1 – хангалтгүй, 2 – дунд зэрэг, 3 – хангалттай. Зөвхөн та өөрөө харна.</span></div>
      <div className="tbl-wrap"><table><thead><tr><th>№</th><th>Хүүхдэд эзэмшүүлсэн чадвар</th><th>Үнэлгээ</th></tr></thead><tbody>
        {refData.bagshlahui_shalguur.map((q, i) => {
          const v = get(q.shalguur_id); const [c, ink] = color(v);
          return <tr key={q.shalguur_id}><td className="sub">{i + 1}</td><td>{q.shalguur}</td><td><Seg label={q.shalguur} value={v} color={c} ink={ink} options={[[1, 1], [2, 2], [3, 3]]} onChange={(x) => set(q.shalguur_id, x)} /></td></tr>;
        })}
      </tbody><tfoot><tr><td /><td>Дундаж</td><td>{r2(avg(data.data.map((x) => x.onoo)))}</td></tr></tfoot></table></div>
    </>
  );
}
