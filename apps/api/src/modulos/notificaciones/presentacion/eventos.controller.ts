import { Controller, MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { filter, from, interval, map, merge, mergeMap, Observable, of, throttleTime } from 'rxjs';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { Usuario } from '../../../compartido/presentacion/decoradores';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { CANAL_EVENTOS, CANAL_NOTIFICACIONES, EscuchaPg } from '../infraestructura/escucha-pg';
import { RepositorioNotificaciones } from '../infraestructura/repositorio-notificaciones';

function leer(payload: string): { usuarioId?: string; id?: string } {
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
}

/**
 * Canal de tiempo real (Server-Sent Events): GET /api/eventos/stream?token=<access token>
 *  - "notificacion": una notificación nueva para este usuario (se muestra como aviso)
 *  - "cambios": algo cambió en el sistema; el cliente sincroniza (pull) para verlo al instante
 *  - "latido": cada 25 s, mantiene viva la conexión a través de proxies
 */
@Controller('eventos')
export class EventosController {
  constructor(
    private readonly escucha: EscuchaPg,
    private readonly repo: RepositorioNotificaciones,
  ) {}

  @Sse('stream')
  @UseGuards(JwtGuard)
  stream(@Usuario() u: UsuarioActual): Observable<MessageEvent> {
    const notificaciones = this.escucha.flujo.pipe(
      filter((a) => a.canal === CANAL_NOTIFICACIONES),
      map((a) => leer(a.payload)),
      filter((p) => p.usuarioId === u.id && !!p.id),
      mergeMap((p) => from(this.repo.porId(p.id!, u.id))),
      filter((n): n is NonNullable<typeof n> => n !== null),
      map((n) => ({ type: 'notificacion', data: n }) as MessageEvent),
    );
    const cambios = this.escucha.flujo.pipe(
      filter((a) => a.canal === CANAL_EVENTOS),
      throttleTime(1_000, undefined, { leading: true, trailing: true }),
      map(() => ({ type: 'cambios', data: {} }) as MessageEvent),
    );
    const latido = interval(25_000).pipe(map(() => ({ type: 'latido', data: {} }) as MessageEvent));
    return merge(of({ type: 'conectado', data: {} } as MessageEvent), notificaciones, cambios, latido);
  }
}
