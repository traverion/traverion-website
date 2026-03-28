import { useState } from 'react';
import { Eye, EyeOff, Lock, User, Key } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import LuxuryInput from './ui/LuxuryInput';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';

interface AdminAccessProps {
  onAccessGranted: () => void;
}

export default function AdminAccess({ onAccessGranted }: AdminAccessProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simple authentication - in production, this would be a real API call
    if (credentials.username === 'admin' && credentials.password === 'traverion2024') {
      setTimeout(() => {
        setIsLoading(false);
        onAccessGranted();
      }, 1000);
    } else {
      setTimeout(() => {
        setIsLoading(false);
        setError('Invalid credentials. Please try again.');
      }, 1000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <LuxuryCard variant="glass" className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <img
            src={BRAND_LOGO_SRC}
            alt=""
            className="h-16 w-16 object-contain mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-white mb-2">Admin Access</h1>
          <p className="text-gray-300">Enter your credentials to access the admin dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <LuxuryInput
              type="text"
              placeholder="Username"
              value={credentials.username}
              onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
              icon={<User className="w-5 h-5" />}
              required
              className="w-full"
            />
          </div>

          <div className="relative">
            <LuxuryInput
              type={isVisible ? 'text' : 'password'}
              placeholder="Password"
              value={credentials.password}
              onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
              icon={<Lock className="w-5 h-5" />}
              required
              className="w-full pr-12"
            />
            <button
              type="button"
              onClick={() => setIsVisible(!isVisible)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {isVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          <LuxuryButton
            type="submit"
            variant="gradient"
            size="lg"
            disabled={isLoading || !credentials.username || !credentials.password}
            className="w-full"
          >
            {isLoading ? (
              <div className="flex items-center">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Authenticating...
              </div>
            ) : (
              <div className="flex items-center">
                <Key className="w-5 h-5 mr-2" />
                Access Dashboard
              </div>
            )}
          </LuxuryButton>
        </form>

        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-medium text-blue-900 mb-2">Demo Credentials</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p><strong>Username:</strong> admin</p>
            <p><strong>Password:</strong> traverion2024</p>
          </div>
          <p className="text-xs text-blue-600 mt-2">
            In production, these would be secure credentials with proper authentication.
          </p>
        </div>
      </LuxuryCard>
    </div>
  );
}



