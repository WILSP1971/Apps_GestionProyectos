import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import type { EventoNotificacion } from '@sierraflow/contratos';
import { RepositorioNotificaciones } from './repositorio-notificaciones';

/**
 * Web Push (estándar W3C + VAPID): llega al navegador o celular aunque la app esté cerrada.
 * Las claves VAPID las genera deploy/desplegar.sh si no existen en el .env.
 */
@Injectable()
export class ServicioWebPush {
  private readonly log = new Logger('WebPush');
  private readonly configurado: boolean;

  constructor(private readonly repo: RepositorioNotificaciones) {
    const publica = process.env.VAPID_PUBLICA;
    const privada = process.env.VAPID_PRIVADA;
    this.configurado = Boolean(publica && privada);
    if (this.configurado) {
      webpush.setVapidDetails(process.env.VAPID_CONTACTO || 'mailto:soporte@sierrainnova.tech', publica!, privada!);
    } else {
      this.log.warn('VAPID_PUBLICA/VAPID_PRIVADA no configuradas: las notificaciones push están desactivadas');
    }
  }

  get disponible(): boolean {
    return this.configurado;
  }

  get clavePublica(): string | null {
    return this.configurado ? process.env.VAPID_PUBLICA! : null;
  }

  /** Envía a todos los navegadores suscritos del usuario. Devuelve cuántos la recibieron. */
  async enviar(usuarioId: string, datos: EventoNotificacion): Promise<number> {
    if (!this.configurado) return 0;
    let entregadas = 0;
    for (const s of await this.repo.suscripciones(usuarioId)) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.clave_p256dh, auth: s.clave_auth } },
          JSON.stringify(datos),
          { TTL: 24 * 60 * 60, urgency: datos.severidad === 'CRITICA' ? 'high' : 'normal' },
        );
        entregadas++;
        await this.repo.marcarUsoSuscripcion(s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await this.repo.eliminarSuscripcion(s.endpoint); // el navegador anuló la suscripción
        } else {
          this.log.warn(`No se pudo enviar push a ${usuarioId}: ${(e as Error).message}`);
        }
      }
    }
    return entregadas;
  }
}
