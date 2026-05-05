import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import App from './App';
import './index.css';

if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ('caches' in window) {
      const cacheKeys = await window.caches.keys();
      await Promise.all(
        cacheKeys
          .filter(
            (key) =>
              key.includes('workbox') ||
              key.includes('asset-cache') ||
              key.includes('supabase-api-cache') ||
              key.includes('pokernight')
          )
          .map((key) => window.caches.delete(key))
      );
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
