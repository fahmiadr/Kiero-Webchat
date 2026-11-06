import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import useAuthStore from '@/stores/useAuthStore';
import LoginPage from '@/pages/Login';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Loader2 } from 'lucide-react';
import ChatInterface from '@/pages/ChatInterface';
import WidgetClients from '@/pages/WidgetClients';
import AuditLogs from '@/pages/AuditLogs';
import WidgetThemeBuilder from '@/pages/WidgetThemeBuilder';

const AdminRoute = () => {
  const { user, isLoading } = useAuthStore();

  if (isLoading) return null; // Or loader

  // If not authenticated, ProtectedRoute handles it. Here we check role.
  // But strict check:
  return user?.role === 'admin' ? <Outlet /> : <Navigate to="/" replace />;
};

const ProtectedRoute = () => {
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<ChatInterface />} />
            <Route path="/dashboard" element={<div className="p-8 text-slate-400">Dashboard Coming Soon</div>} />
            <Route path="/calendar" element={<div className="p-8 text-slate-400">Calendar Coming Soon</div>} />

            {/* Admin Routes */}
            <Route element={<AdminRoute />}>
              <Route path="/widget-clients" element={<WidgetClients />} />
              <Route path="/widget-clients/:clientId/theme" element={<WidgetThemeBuilder />} />
              <Route path="/audit-logs" element={<AuditLogs />} />
            </Route>

            <Route path="/notifications" element={<div className="p-8 text-slate-400">Notifications Coming Soon</div>} />
            <Route path="/settings" element={<div className="p-8 text-slate-400">Settings Coming Soon</div>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
