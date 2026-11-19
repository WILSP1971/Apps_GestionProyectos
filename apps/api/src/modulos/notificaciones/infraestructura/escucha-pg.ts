import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client } from 'pg';
import { Observable, Subject } from 'rxjs';

export const CANAL_EVENTOS = 'eventos_dominio';
export const CANAL_NOTIFICACIONES = 'notificaciones_usuario';
export const CANAL_CONECTADO = '__conectado';

export interface AvisoPg {
  canal: string;
  payload: string;
}

/**
 * Una sola conexión dedicada a LISTEN/NOTIFY de PostgreSQL, compartida por el despachador del
 * outbox y por el canal de tiempo real (SSE). Se reconecta sola si la conexión se cae.
 */
@Injectable()
export class EscuchaPg implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('EscuchaPg');
  private readonly avisos = new Subject<AvisoPg>();
  private cliente?: Client;
  private cerrando = false;
  private reconectando = false;

  readonly flujo: Observable<AvisoPg> = this.avisos.asObservable();

  async onModuleInit() {
    await this.conectar();
  }

  async onModuleDestroy() {
    this.cerrando = true;
    await this.cliente?.end().catch(() => undefined);
  }

  private async conectar() {
    const cliente = new Client({ connectionString: process.env.DATABASE_URL });
    cliente.on('notification', (n) => this.avisos.next({ canal: n.channel, payload: n.payload ?? '' }));
    cliente.on('error', (e) => {
      this.log.warn(`Conexión LISTEN con error: ${e.message}`);
      this.reconectar();
    });
    cliente.on('end', () => this.reconectar());
    try {
      await cliente.connect();
      await cliente.query(`LISTEN ${CANAL_EVENTOS}`);
      await cliente.query(`LISTEN ${CANAL_NOTIFICACIONES}`);
      this.cliente = cliente;
      this.log.log('Escuchando eventos de PostgreSQL');
      // Permite procesar lo que quedó pendiente mientras no había conexión
      this.avisos.next({ canal: CANAL_CONECTADO, payload: '' });
    } catch (e) {
      this.log.warn(`No se pudo conectar para LISTEN: ${(e as Error).message}`);
      this.reconectar();
    }
  }

  private reconectar() {
    if (this.cerrando || this.reconectando) return;
    this.reconectando = true;
    const anterior = this.cliente;
    this.cliente = undefined;
    anterior?.removeAllListeners();
    anterior?.end().catch(() => undefined);
    setTimeout(() => {
      this.reconectando = false;
      void this.conectar();
    }, 5_000);
  }
}
