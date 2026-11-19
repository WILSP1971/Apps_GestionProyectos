import type { EventoNotificacion } from '@sierraflow/contratos';
import { obtenerToken } from '@/lib/api';
import { motorSync } from '@/lib/offline/sync/motor-sync';

/**
 * Canal de tiempo real con la API (Server-Sent Events).
 *  - "notificacion" → aviso en pantalla + sincronización inmediata
 *  - "cambios"      → otro usuario cambió algo: se sincroniza para verlo al instante
 * Si la conexión se corta (red, reinicio del servidor, token vencido) se reabre con un token nuevo
 * y espera creciente (2 s … 60 s). Sin conexión a internet espera al evento "online".
 */
export const EVENTO_NOTIFICACION = 'sierraflow:notificacion';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

class ConexionTiempoReal {
  private fuente?: EventSource;
  private activo = false;
  private reintentos = 0;
  private temporizador?: ReturnType<typeof setTimeout>;

  private readonly alConectar = () => {
    this.reintentos = 0;
    this.programar(500);
  };

  iniciar() {
    if (this.activo || typeof window === 'undefined' || !('EventSource' in window)) return;
    this.activo = true;
    window.addEventListener('online', this.alConectar);
    void this.abrir();
  }

  detener() {
    this.activo = false;
    window.removeEventListener('online', this.alConectar);
    clearTimeout(this.temporizador);
    this.fuente?.close();
    this.fuente = undefined;
  }

  private programar(ms: number) {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => void this.abrir(), ms);
  }

  private reprogramar() {
    this.reintentos++;
    this.programar(Math.min(60_000, 2_000 * 2 ** Math.min(this.reintentos, 5)));
  }

  private async abrir() {
    if (!this.activo) return;
    this.fuente?.close();
    this.fuente = undefined;
    if (!navigator.onLine) return; // se reabre con el evento "online"

    let token: string;
    try {
      token = await obtenerToken(this.reintentos > 0); // tras un error se pide un token nuevo
    } catch {
      this.reprogramar();
      return;
    }

    const fuente = new EventSource(`${BASE}/eventos/stream?token=${encodeURIComponent(token)}`);
    this.fuente = fuente;

    fuente.addEventListener('conectado', () => {
      this.reintentos = 0;
      motorSync.programar(0); // ponerse al día con lo ocurrido mientras no había conexión
    });
    fuente.addEventListener('notificacion', (e) => {
      try {
        const n = JSON.parse((e as MessageEvent<string>).data) as EventoNotificacion;
        window.dispatchEvent(new CustomEvent<EventoNotificacion>(EVENTO_NOTIFICACION, { detail: n }));
      } catch {
        /* evento mal formado: se ignora */
      }
      motorSync.programar(0);
    });
    fuente.addEventListener('cambios', () => motorSync.programar(300));
    fuente.onerror = () => {
      fuente.close();
      if (this.fuente === fuente) this.fuente = undefined;
      this.reprogramar();
    };
  }
}

export const tiempoReal = new ConexionTiempoReal();
