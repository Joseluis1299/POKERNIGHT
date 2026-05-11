import { Link } from 'react-router-dom';

import { useLocalPlayer } from '../hooks/useLocalPlayer';

export default function Home(): JSX.Element {
  const { roomCode } = useLocalPlayer();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-12">
      <div className="grid w-full gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <section className="space-y-8">
          <div className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-emerald-200">
            PWA privada de poker
          </div>
          <div className="space-y-5">
            <h1 className="max-w-3xl text-5xl font-black tracking-tight text-white sm:text-6xl">
              Organiza tu partida de poker sin hojas de calculo, sin lios y sin cuentas por chat.
            </h1>
            <p className="max-w-2xl text-lg text-slate-300">
              Crea una sala privada, controla compras y recompras en directo y cierra la partida
              con pagos claros que todos pueden compartir al instante.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Link className="primary-button px-6" to="/create">
              Crear partida
            </Link>
            <Link className="secondary-button px-6" to="/join">
              Unirse a partida
            </Link>
            <Link className="secondary-button px-6" to="/stats">
              Ver estadisticas
            </Link>
            {roomCode ? (
              <Link className="secondary-button px-6" to={`/room/${roomCode}`}>
                Volver a {roomCode}
              </Link>
            ) : null}
          </div>
        </section>

        <section className="glass-card p-6 sm:p-8">
          <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-emerald-500/15 to-slate-900/60 p-6">
            <div className="grid gap-4 text-sm text-slate-200 sm:grid-cols-2">
              <Feature title="Sala en tiempo real" body="Todos ven al instante las entradas, recompras y cambios de estado." />
              <Feature title="Control del anfitrion" body="Empieza la partida, cierra la mesa, elimina jugadores y ajusta los totales finales." />
              <Feature title="Compartir facil" body="Comparte por codigo, enlace directo, QR o WhatsApp en segundos." />
              <Feature title="App instalable" body="Anadela a la pantalla de inicio y reabrila como si fuera una app nativa." />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

interface FeatureProps {
  body: string;
  title: string;
}

function Feature({ body, title }: FeatureProps): JSX.Element {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-5">
      <p className="text-lg font-semibold text-white">{title}</p>
      <p className="mt-2 text-slate-400">{body}</p>
    </div>
  );
}
