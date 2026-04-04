import { useAuth } from '../contexts/AuthContext';
import { canAccessTraverionAdmin } from '../lib/adminAuth';
import AdminAccess from './AdminAccess';
import AdminDashboard from '../pages/AdminDashboard';
import { Loader2 } from 'lucide-react';

export default function AdminGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-900 text-gray-300">
        <Loader2 className="w-8 h-8 animate-spin text-sky-400" aria-hidden />
        <p className="text-sm">Checking session…</p>
      </div>
    );
  }

  if (canAccessTraverionAdmin(user)) {
    return <AdminDashboard />;
  }

  return <AdminAccess />;
}
