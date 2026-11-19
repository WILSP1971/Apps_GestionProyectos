import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subscription, filter } from 'rxjs';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { CANAL_CONECTADO, CANAL_EVENTOS, EscuchaPg } from '../infraestructura/escucha-pg';
import { RepositorioNotificaciones } from '../infraestructura/repositorio-notificaciones';
import { ServicioCorreo } from '../infraestructura/servicio-correo';
import { ServicioWebPush } from '../infraestructura/servicio-web-push';
import { EnvioExterno, EventoOutbox, ManejadorNotificaciones } from './manejador-notificaciones';

const LOTE = 20;
const MAX_INTENTOS = 5;

/**
 * Transactional Outbox → notificaciones.
 * Se despierta con NOTIFY 'eventos_dominio' (inmediato) y además cada 30 s (red de seguridad).
 * Cada evento se procesa con un SAVEPOINT: si falla, se reintenta luego sin afectar a los demás.
 * FOR UPDATE SKIP LOCKED permite varios procesos sin duplicar notificaciones.
 */
@Injectable()
export class DespachadorOutbox implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('DespachadorOutbox');
  private suscripcion?: Subscription;
  private intervalo?: ReturnType<typeof setInterval>;
  private procesando = false;
  private otraVuelta = false;

  constructor(
    private readonly escucha: EscuchaPg,
    private readonly manejador: ManejadorNotificaciones,
    private readonly repo: RepositorioNotificaciones,
    private readonly push: ServicioWebPush,
    private readonly correo: ServicioCorreo,
  ) {}

  onModuleInit() {
    this.suscripcion = this.escucha.flujo
      .pipe(filter((a) => a.canal === CANAL_EVENTOS || a.canal === CANAL_CONECTADO))
      .subscribe(() => void this.procesarPendientes());
    this.intervalo = setInterval(() => void this.procesarPendientes(), 30_000);
  }

  onModuleDestroy() {
    this.suscripcion?.unsubscribe();
    clearInterval(this.intervalo);
  }

  async procesarPendientes(): Promise<void> {
    if (this.procesando) {
      this.otraVuelta = true;
      return;
    }
    this.procesando = true;
    try {
      do {
        this.otraVuelta = false;
        let procesados: number;
        do {
          const envios: EnvioExterno[] = [];
          procesados = await enTransaccion(null, async () => {
            const { rows } = await db().query<EventoOutbox>(
              `SELECT id, agregado, agregado_id, tipo_evento, payload FROM gestion.eventos_outbox
                WHERE procesado_en IS NULL AND intentos < $1
                ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`, [MAX_INTENTOS, LOTE]);
            for (const ev of rows) {
              await db().query('SAVEPOINT evento');
              try {
                envios.push(...(await this.manejador.manejar(ev)));
                await db().query(`UPDATE gestion.eventos_outbox SET procesado_en = now() WHERE id = $1`, [ev.id]);
                await db().query('RELEASE SAVEPOINT evento');
              } catch (e) {
                await db().query('ROLLBACK TO SAVEPOINT evento');
                await db().query(
                  `UPDATE gestion.eventos_outbox SET intentos = intentos + 1, ultimo_error = $2 WHERE id = $1`,
                  [ev.id, String((e as Error).message ?? e).slice(0, 500)]);
                this.log.warn(`Evento ${ev.id} (${ev.tipo_evento}) falló: ${(e as Error).message}`);
              }
            }
            return rows.length;
          });
          await this.entregar(envios); // correo y push solo después de confirmar la transacción
        } while (procesados === LOTE);
      } while (this.otraVuelta);
    } catch (e) {
      this.log.error(`Error procesando el outbox: ${(e as Error).message}`);
    } finally {
      this.procesando = false;
    }
  }

  private async entregar(envios: EnvioExterno[]) {
    for (const envio of envios) {
      if (envio.canales.includes('PUSH')) {
        await this.push.enviar(envio.usuarioId, envio.notificacion).catch((e) => this.log.warn(`Push: ${e.message}`));
      }
      if (envio.canales.includes('EMAIL') && this.correo.disponible) {
        const contacto = await this.repo.contacto(envio.usuarioId);
        if (contacto) {
          await this.correo.enviarNotificacion(contacto, envio.notificacion)
            .catch((e) => this.log.warn(`Correo a ${contacto.email}: ${e.message}`));
        }
      }
    }
  }
}
