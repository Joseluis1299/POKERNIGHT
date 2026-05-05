import { QRCodeSVG } from 'qrcode.react';

import { buildWhatsappShareUrl, copyToClipboard } from '../lib/utils';

interface QRShareModalProps {
  onClose: () => void;
  open: boolean;
  roomCode: string;
  roomName: string;
  shareText: string;
  shareUrl: string;
}

export default function QRShareModal({
  onClose,
  open,
  roomCode,
  roomName,
  shareText,
  shareUrl
}: QRShareModalProps): JSX.Element | null {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-4 backdrop-blur-sm sm:items-center">
      <div className="glass-card w-full max-w-md p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Compartir sala</p>
            <h3 className="mt-2 text-2xl font-bold text-white">{roomName}</h3>
            <p className="mt-1 text-sm text-slate-400">Codigo {roomCode}</p>
          </div>
          <button className="secondary-button px-4" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div className="mt-6 flex justify-center rounded-3xl border border-white/10 bg-white p-6">
          <QRCodeSVG value={shareUrl} size={220} includeMargin />
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/80 p-4 text-sm text-slate-300">
          {shareUrl}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button className="primary-button" onClick={() => void copyToClipboard(shareUrl)}>
            Copiar enlace
          </button>
          <a
            className="secondary-button"
            href={buildWhatsappShareUrl(shareText)}
            rel="noreferrer"
            target="_blank"
          >
            Compartir por WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
