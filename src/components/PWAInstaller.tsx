import { useState, useEffect } from 'react';
import { Download, Smartphone, Wifi, WifiOff, Bell, BellOff, Share2, X, CheckCircle, AlertCircle } from 'lucide-react';
import LuxuryButton from './ui/LuxuryButton';
import LuxuryCard from './ui/LuxuryCard';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [showOfflineMessage, setShowOfflineMessage] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Check if app is already installed
    const checkInstalled = () => {
      if (window.matchMedia('(display-mode: standalone)').matches || 
          (window.navigator as any).standalone === true) {
        setIsInstalled(true);
      }
    };

    checkInstalled();

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallPrompt(true);
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true);
      setShowOfflineMessage(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowOfflineMessage(true);
    };

    // Register service worker
    const registerServiceWorker = async () => {
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.register('/sw.js');
          setRegistration(reg);
          console.log('Service Worker registered successfully:', reg);
        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      }
    };

    // Check notification permission
    const checkNotificationPermission = () => {
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    };

    // Add event listeners
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initialize
    registerServiceWorker();
    checkNotificationPermission();

    // Cleanup
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('PWA installation accepted');
      } else {
        console.log('PWA installation dismissed');
      }
      
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    } catch (error) {
      console.error('Error installing PWA:', error);
    }
  };

  const handleNotificationToggle = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications');
      return;
    }

    if (notificationPermission === 'default') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === 'granted') {
        // Show a test notification
        new Notification('Traverion', {
          body: 'You will now receive travel updates and deals!',
          icon: BRAND_LOGO_SRC,
          tag: 'traverion-notification'
        });
      }
    } else if (notificationPermission === 'granted') {
      // Disable notifications
      setNotificationPermission('denied');
    }
  };

  const shareApp = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Traverion - Luxury Travel',
          text: 'Check out Traverion for premium luxury travel experiences!',
          url: window.location.origin
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(window.location.origin);
        alert('Link copied to clipboard!');
      } catch (error) {
        console.error('Error copying to clipboard:', error);
      }
    }
  };

  if (isInstalled) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <LuxuryCard variant="glass" className="p-4 bg-green-50 border-green-200">
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-800">App Installed</p>
              <p className="text-xs text-green-600">Traverion is ready to use!</p>
            </div>
          </div>
        </LuxuryCard>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-3">
      {/* Offline Message */}
      {showOfflineMessage && (
        <LuxuryCard variant="glass" className="p-4 bg-yellow-50 border-yellow-200 animate-fade-in-up">
          <div className="flex items-center space-x-3">
            <WifiOff className="w-6 h-6 text-yellow-600" />
            <div>
              <p className="text-sm font-medium text-yellow-800">You're Offline</p>
              <p className="text-xs text-yellow-600">Some features may be limited</p>
            </div>
          </div>
        </LuxuryCard>
      )}

      {/* Install Prompt */}
      {showInstallPrompt && (
        <LuxuryCard variant="glass" className="p-6 bg-gradient-to-r from-sky-50 to-blue-50 border-sky-200 animate-fade-in-up max-w-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center">
                <Smartphone className="w-6 h-6 text-sky-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Install Traverion</h3>
                <p className="text-sm text-gray-600">Get the app experience</p>
              </div>
            </div>
            <button
              onClick={() => setShowInstallPrompt(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex items-center text-sm text-gray-600">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span>Offline access to tours</span>
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span>Push notifications</span>
            </div>
            <div className="flex items-center text-sm text-gray-600">
              <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              <span>App-like experience</span>
            </div>
          </div>

          <div className="flex space-x-2">
            <LuxuryButton
              variant="gradient"
              size="sm"
              onClick={handleInstallClick}
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-2" />
              Install
            </LuxuryButton>
            <LuxuryButton
              variant="outline"
              size="sm"
              onClick={() => setShowInstallPrompt(false)}
            >
              Later
            </LuxuryButton>
          </div>
        </LuxuryCard>
      )}

      {/* PWA Controls */}
      <LuxuryCard variant="glass" className="p-4 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          {/* Connection Status */}
          <div className={`p-2 rounded-full ${isOnline ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
            {isOnline ? <Wifi size={16} /> : <WifiOff size={16} />}
          </div>

          {/* Notifications */}
          <button
            onClick={handleNotificationToggle}
            className={`p-2 rounded-full transition-colors ${
              notificationPermission === 'granted' 
                ? 'bg-blue-100 text-blue-600' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {notificationPermission === 'granted' ? <Bell size={16} /> : <BellOff size={16} />}
          </button>

          {/* Share */}
          <button
            onClick={shareApp}
            className="p-2 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <Share2 size={16} />
          </button>

          {/* Install Button */}
          {deferredPrompt && (
            <LuxuryButton
              variant="gradient"
              size="sm"
              onClick={handleInstallClick}
              className="ml-2"
            >
              <Download className="w-4 h-4 mr-1" />
              Install
            </LuxuryButton>
          )}
        </div>
      </LuxuryCard>
    </div>
  );
}



