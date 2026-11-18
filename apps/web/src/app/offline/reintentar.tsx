'use client';

import { useEffect, useState } from 'react';
import { RefreshCcw } from 'lucide-react';

export function ReintentarConexion() {
  const [enLinea, setEnLinea] = useState(false);
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);
  return (
    <button
      onClick={() => location.reload()}
      className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-primario px-4 text-sm font-medium text-slate-950 hover:bg-primario-hover"
    >
      <RefreshCcw className="size-4" /> {enLinea ? 'Conexión recuperada: recargar' : 'Reintentar'}
    </button>
  );
}
