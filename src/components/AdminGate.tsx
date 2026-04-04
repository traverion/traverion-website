import { useAuth } from '../contexts/AuthContext';
import { isTraverionAdminUser } from '../lib/adminAuth';
import AdminAccess from './AdminAccess';
import AdminDashboard from '../pages/AdminDashboard';
import { Loader2 } from 'lucide-react';

export default function AdminGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-gray-600">
        <Loader2 className="w-8 h-8 animate-spin text-sky-600" aria-hidden />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (isTraverionAdminUser(user)) {
    return <AdminDashboard />;
  }

  return <AdminAccess />;
}
