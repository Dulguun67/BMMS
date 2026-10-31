import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../api/hooks';
import { ROLE_LABEL } from '../lib/constants';
import Brand from './Brand';
import Icon from './Icon';

const MAIN = [['/', 'home', 'Нүүр'], ['/burtgel', 'register', 'Бүртгэл'], ['/angi', 'classroom', 'Анги, танхим'], ['/unelgee', 'assess', 'Үнэлгээ'],
  ['/tuluvluguu', 'plan', 'Төлөвлөгөө'], ['/tailan', 'report', 'Тайлан'], ['/gantsaarchilsan', 'individual', 'Ганцаарчилсан']];
const BOTTOM = [['/hereglegch', 'profile', 'Хэрэглэгч'], ['/tohirgoo', 'settings', 'Тохиргоо']];
export const TITLES = Object.fromEntries([...MAIN, ...BOTTOM].map(([p, , t]) => [p, t]));

export default function Layout() {
  const { me, groups, group, setGroupId, logout, isAdmin, isMethod } = useAuth();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const approvals = useApi(isMethod ? '/approvals' : null);
  const pending = approvals.data ? approvals.data.length : 0;
  const section = `/${loc.pathname.split('/')[1]}`;
  const items = isAdmin ? [] : MAIN;
  const link = ([to, icon, label]) => (
    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
      <Icon name={icon} /><span>{label}</span>
      {to === '/tuluvluguu' && pending > 0 && <span className="badge" title="Батлах хүлээгдэж буй">{pending}</span>}
    </NavLink>
  );
  return (
    <div className="app">
      <aside className={`side ${open ? 'open' : ''}`} aria-label="Үндсэн цэс">
        <Brand />
        <nav className="nav">{items.map(link)}</nav>
        <nav className="nav nav-bottom">{BOTTOM.map(link)}</nav>
      </aside>
      <div className={`scrim ${open ? 'on' : ''}`} onClick={() => setOpen(false)} />
      <div className="main">
        <header className="top">
          <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Цэс нээх"><Icon name="menu" /></button>
          <div className="crumb">
            {group && !isAdmin && <><span>{group.ner}</span><span className="sep">›</span></>}
            <span className="cur">{TITLES[section] || ''}</span>
          </div>
          <div className="top-right">
            {!isAdmin && groups.length > 1 && (
              <select className="group-select" value={group ? group.buleg_id : ''} onChange={(e) => setGroupId(Number(e.target.value))} aria-label="Бүлэг сонгох">
                {groups.map((g) => <option key={g.buleg_id} value={g.buleg_id}>{g.ner} ({g.ehleh_on}–{g.ehleh_on + 1})</option>)}
              </select>
            )}
            <div className="who">
              <span className="avatar">{(me.ner || me.nevtreh_ner || '?').slice(0, 1).toUpperCase()}</span>
              <span>{me.ner ? `${me.ovog ? `${me.ovog.slice(0, 1)}.` : ''}${me.ner}` : me.nevtreh_ner}<br /><span className="role-badge">{ROLE_LABEL[me.uureg]}</span></span>
            </div>
            <button className="btn ghost sm" onClick={logout} title="Гарах" aria-label="Гарах"><Icon name="logout" /></button>
          </div>
        </header>
        <main className="content">
          {!isAdmin && !group && section !== '/hereglegch' && section !== '/tohirgoo'
            ? <div className="panel"><div className="empty"><h3>Танд хариуцсан бүлэг алга</h3><p>Заах арга зүйч эсвэл систем хариуцагч таныг бүлэгт томилсны дараа энд харагдана.</p></div></div>
            : <Outlet />}
        </main>
      </div>
    </div>
  );
}
