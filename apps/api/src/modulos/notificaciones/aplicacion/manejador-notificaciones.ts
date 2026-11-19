import { Injectable } from '@nestjs/common';
import { GRUPOS_NOTIFICACION, type Canal, type EventoNotificacion } from '@sierraflow/contratos';
import { canalesActivos, extracto, PLANTILLAS, type ContextoEvento } from '../dominio/plantillas';
import { RepositorioNotificaciones } from '../infraestructura/repositorio-notificaciones';

export interface EventoOutbox {
  id: number;
  agregado: string;
  agregado_id: string;
  tipo_evento: string;
  payload: Record<string, unknown>;
}

/** Entrega pendiente por correo o push, que se hace DESPUÉS de confirmar la transacción. */
export interface EnvioExterno {
  usuarioId: string;
  canales: Canal[];
  notificacion: EventoNotificacion;
}

/**
 * Convierte un evento de dominio en notificaciones:
 *  1. busca la plantilla del evento,
 *  2. resuelve los destinatarios (sin repetir y sin incluir a quien hizo la acción),
 *  3. guarda la notificación in-app (llega por SSE gracias al trigger NOTIFY),
 *  4. devuelve los envíos por correo/push según las preferencias de cada usuario.
 * Debe ejecutarse dentro de una transacción.
 */
@Injectable()
export class ManejadorNotificaciones {
  constructor(private readonly repo: RepositorioNotificaciones) {}

  async manejar(ev: EventoOutbox): Promise<EnvioExterno[]> {
    const reglas = PLANTILLAS[ev.tipo_evento];
    if (!reglas?.length || ev.agregado !== 'Solicitud') return [];

    const p = ev.payload ?? {};
    const solicitud = await this.repo.contextoSolicitud(ev.agregado_id);
    const actorId = (p.actorId ?? p.autorId ?? null) as string | null;
    const ctx: ContextoEvento = {
      codigo: solicitud?.codigo ?? String(p.codigo ?? ''),
      titulo: solicitud?.titulo ?? String(p.titulo ?? ''),
      actor: await this.repo.nombreUsuario(actorId),
      comentario: (p.comentario as string | null) ?? null,
      consumoPct: typeof p.consumoPct === 'number' ? p.consumoPct : null,
      extracto: ev.tipo_evento === 'comentario.creado'
        ? extracto((await this.repo.contenidoComentario(p.comentarioId as string)) ?? '')
        : typeof p.tarea === 'string' ? extracto(p.tarea, 80) : null,
      nota: typeof p.nota === 'number' ? `${String(p.letra ?? '')} (${p.nota.toFixed(1)}/10)`.trim() : null,
      avancePct: typeof p.avancePct === 'number' ? p.avancePct : null,
      tipoEvaluacion: p.tipo === 'AVANCE' || p.tipo === 'CIERRE' ? p.tipo : null,
    };
    const solicitanteId = solicitud?.solicitanteId ?? (p.solicitanteId as string | undefined) ?? null;
    const enlace = `/solicitudes/${ev.agregado_id}`;

    const yaNotificados = new Set<string>(actorId ? [actorId] : []);
    const envios: EnvioExterno[] = [];

    for (const regla of reglas) {
      const grupo = GRUPOS_NOTIFICACION.find((g) => g.codigo === regla.grupo)!;
      const explicitos = Array.isArray(p.nuevos) ? (p.nuevos as string[]) : [];
      for (const usuarioId of await this.repo.destinatarios(regla.quien, ev.agregado_id, solicitanteId, explicitos)) {
        if (yaNotificados.has(usuarioId)) continue;
        yaNotificados.add(usuarioId);

        const titulo = regla.titulo(ctx);
        const mensaje = regla.mensaje(ctx);
        const id = await this.repo.insertar({
          usuarioId, tipoEvento: ev.tipo_evento, titulo, mensaje, enlace, severidad: regla.severidad,
          datos: { solicitudId: ev.agregado_id, grupo: regla.grupo, eventoId: ev.id },
        });
        const canales = canalesActivos(grupo.porDefecto, await this.repo.preferencias(usuarioId, regla.grupo))
          .filter((c) => c !== 'APP');
        if (canales.length) {
          envios.push({ usuarioId, canales, notificacion: { id, titulo, mensaje, enlace, severidad: regla.severidad } });
        }
      }
    }
    return envios;
  }
}
