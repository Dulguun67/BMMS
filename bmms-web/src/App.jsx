import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import Login from './pages/Login';
import AccountSetup from './pages/AccountSetup';
import ResetPassword from './pages/ResetPassword';
import Home from './pages/Home';
import Register from './pages/Register';
import Classroom from './pages/Classroom';
import Assessment from './pages/Assessment';
import Plans from './pages/Plans';
import Reports from './pages/Reports';
import Individual from './pages/Individual';
import Profile from './pages/Profile';
import Settings from './pages/Settings';

function Gate() {
  const { status, isAdmin, me } = useAuth();
  const loc = useLocation();
  // Имэйлийн холбоос нэвтэрсэн эсэхээс үл хамааран ажиллана
  if (loc.pathname === '/nuuts-ug-sergeeh') return <ResetPassword />;
  if (status === 'loading') return <div className="login"><Loading /></div>;
  if (status === 'anon') return <Login />;
  if (me.hyazgaarlalt) return <AccountSetup />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={isAdmin ? <Navigate to="/tohirgoo" replace /> : <Home />} />
        <Route path="burtgel/:tab?" element={<Register />} />
        <Route path="angi/:tab?" element={<Classroom />} />
        <Route path="unelgee/:tab?" element={<Assessment />} />
        <Route path="tuluvluguu" element={<Plans />} />
        <Route path="tailan/:tab?" element={<Reports />} />
        <Route path="gantsaarchilsan" element={<Individual />} />
        <Route path="hereglegch" element={<Profile />} />
        <Route path="tohirgoo/:tab?" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider><Gate /></AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
