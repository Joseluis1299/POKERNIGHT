import { useEffect, useMemo, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';

import { supabaseConfigError } from './lib/supabase';
import { APP_STORAGE_KEYS } from './lib/utils';
import CreateGame from './pages/CreateGame';
import Home from './pages/Home';
import JoinGame from './pages/JoinGame';
import Room from './pages/Room';
import Summary from './pages/Summary';

function detectStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function InstallBanner(): JSX.Element | null {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.localStorage.getItem(APP_STORAGE_KEYS.installBannerDismissed) === 'true';
  });
  const [isStandalone, setIsStandalone] = useState(() => detectStandalone());
  const isIos = useMemo(() => detectIos(), []);

  useEffect(() => {
    const handlePrompt = (event: Event): void => {
      const promptEvent = event as BeforeInstallPromptEvent;
      promptEvent.preventDefault();
      setDeferredPrompt(promptEvent);
    };

    const handleInstalled = (): void => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  if (dismissed || isStandalone) {
    return null;
  }

  async function handleInstall(): Promise<void> {
    if (!deferredPrompt) {
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  function handleDismiss(): void {
    window.localStorage.setItem(APP_STORAGE_KEYS.installBannerDismissed, 'true');
    setDismissed(true);
  }

  return (
    <div className="sticky top-3 z-50 mx-auto w-full max-w-6xl px-4 pt-3">
      <div className="glass-card flex flex-col gap-4 border-emerald-500/20 bg-slate-950/95 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-emerald-300">Anade PokerNight a tu pantalla de inicio</p>
          <p className="text-sm text-slate-300">
            {deferredPrompt
              ? 'Instalala como si fuera una app para abrirla mas rapido y verla en modo solo lectura sin conexion.'
              : isIos
                ? 'En iPhone: Safari > Compartir > Anadir a pantalla de inicio.'
                : 'Usa el menu del navegador para instalar la app desde esta pagina.'}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          {deferredPrompt ? (
            <button className="primary-button" onClick={() => void handleInstall()}>
              Instalar app
            </button>
          ) : null}
          <button className="secondary-button" onClick={handleDismiss}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function AppShell(): JSX.Element {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = (): void => setIsOnline(true);
    const goOffline = (): void => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute right-0 top-40 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      <div className="relative z-10">
        <InstallBanner />

        {!isOnline ? (
          <div className="mx-auto mt-3 w-full max-w-6xl px-4">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Estas sin conexion. Las salas en cache siguen siendo visibles, pero las
              actualizaciones quedan en modo solo lectura hasta que vuelva la conexion.
            </div>
          </div>
        ) : null}

        {supabaseConfigError ? (
          <div className="mx-auto mt-3 w-full max-w-6xl px-4">
            <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {supabaseConfigError}
            </div>
          </div>
        ) : null}

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<CreateGame />} />
          <Route path="/join" element={<JoinGame />} />
          <Route path="/room/:code" element={<Room />} />
          <Route path="/room/:code/summary" element={<Summary />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
