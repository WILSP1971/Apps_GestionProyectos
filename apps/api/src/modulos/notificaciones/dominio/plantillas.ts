import type { Canal, GrupoNotificacion } from '@sierraflow/contratos';

/**
 * Reglas de notificación por evento de dominio (lógica pura, sin BD: se prueba con node:test).
 * Cada evento puede generar notificaciones para varios tipos de destinatario, con textos distintos.
 */
export type Destinatario = 'SOLICITANTE' | 'GESTORES' | 'ASIGNADOS' | 'PARTICIPANTES' | 'NUEVOS_ASIGNADOS';
export type Severidad = 'INFO' | 'EXITO' | 'ALERTA' | 'CRITICA';

export interface ContextoEvento {
  codigo: string;
  titulo: string;
  actor?: string | null;
  comentario?: string | null;
  extracto?: string | null;
  consumoPct?: number | null;
  /** Evaluaciones: "B+ (8.2/10)" */
  nota?: string | null;
  avancePct?: number | null;
  tipoEvaluacion?: 'AVANCE' | 'CIERRE' | null;
}

export interface Regla {
  quien: Destinatario;
  grupo: GrupoNotificacion;
  severidad: Severidad;
  titulo: (c: ContextoEvento) => string;
  mensaje: (c: ContextoEvento) => string;
}

const por = (c: ContextoEvento) => (c.actor ? ` por ${c.actor}` : '');
const motivo = (c: ContextoEvento) => (c.comentario ? ` Motivo: ${c.comentario}` : '');

export const PLANTILLAS: Record<string, Regla[]> = {
  'solicitud.enviada': [{
    quien: 'GESTORES', grupo: 'POR_REVISAR', severidad: 'INFO',
    titulo: (c) => `Recibiste una solicitud nueva: ${c.codigo}`,
    mensaje: (c) => `"${c.titulo}" fue enviada${por(c)} y está esperando revisión.`,
  }],
  'solicitud.en_revision': [{
    quien: 'SOLICITANTE', grupo: 'MIS_SOLICITUDES', severidad: 'INFO',
    titulo: (c) => `${c.codigo} está en revisión`,
    mensaje: (c) => `Tu solicitud "${c.titulo}" fue tomada en revisión${por(c)}.`,
  }],
  'solicitud.aprobada': [{
    quien: 'SOLICITANTE', grupo: 'MIS_SOLICITUDES', severidad: 'EXITO',
    titulo: (c) => `${c.codigo} fue aprobada`,
    mensaje: (c) => `Tu solicitud "${c.titulo}" fue aprobada${por(c)}. Pronto se asignará al equipo.`,
  }],
  'solicitud.rechazada': [{
    quien: 'SOLICITANTE', grupo: 'MIS_SOLICITUDES', severidad: 'ALERTA',
    titulo: (c) => `${c.codigo} fue rechazada`,
    mensaje: (c) => `Tu solicitud "${c.titulo}" fue rechazada${por(c)}.${motivo(c)}`,
  }],
  'solicitud.borrador': [{
    quien: 'SOLICITANTE', grupo: 'MIS_SOLICITUDES', severidad: 'ALERTA',
    titulo: (c) => `${c.codigo} requiere ajustes`,
    mensaje: (c) => `Tu solicitud "${c.titulo}" fue devuelta para ajustes${por(c)}.${motivo(c)}`,
  }],
  'solicitud.asignada': [
    {
      quien: 'SOLICITANTE', grupo: 'MIS_SOLICITUDES', severidad: 'INFO',
      titulo: (c) => `${c.codigo} ya tiene equipo asignado`,
      mensaje: (c) => `Tu solicitud "${c.titulo}" fue asignada al equipo de desarrollo.`,
    },
    {
      quien: 'ASIGNADOS', grupo: 'ASIGNACIONES', severidad: 'INFO',
      titulo: (c) => `Recibiste una nueva asignación: ${c.codigo}`,
      mensaje: (c) => `Te asignaron la solicitud "${c.titulo}"${por(c)}.`,
    },
  ],
  'solicitud.equipo_actualizado': [{
    quien: 'NUEVOS_ASIGNADOS', grupo: 'ASIGNACIONES', severidad: 'INFO',
    titulo: (c) => `Recibiste una nueva asignación: ${c.codigo}`,
    mensaje: (c) => `Te sumaron al equipo de la solicitud "${c.titulo}"${por(c)}.`,
  }],
  'solicitud.en_desarrollo': [{
    quien: 'SOLICITANTE', grupo: 'MIS_SOLICITUDES', severidad: 'INFO',
    titulo: (c) => `${c.codigo} está en desarrollo`,
    mensaje: (c) => `El equipo comenzó a trabajar en "${c.titulo}".`,
  }],
  'solicitud.en_validacion': [{
    quien: 'SOLICITANTE', grupo: 'MIS_SOLICITUDES', severidad: 'ALERTA',
    titulo: (c) => `${c.codigo} está lista para validar`,
    mensaje: (c) => `Revisa "${c.titulo}" y confirma los criterios de aceptación para cerrarla.`,
  }],
  'solicitud.cerrada': [{
    quien: 'ASIGNADOS', grupo: 'ASIGNACIONES', severidad: 'EXITO',
    titulo: (c) => `${c.codigo} fue cerrada`,
    mensaje: (c) => `"${c.titulo}" fue aceptada y cerrada${por(c)}. ¡Buen trabajo!`,
  }],
  'solicitud.cancelada': [
    {
      quien: 'GESTORES', grupo: 'POR_REVISAR', severidad: 'INFO',
      titulo: (c) => `${c.codigo} fue cancelada`,
      mensaje: (c) => `"${c.titulo}" fue cancelada${por(c)}.${motivo(c)}`,
    },
    {
      quien: 'ASIGNADOS', grupo: 'ASIGNACIONES', severidad: 'INFO',
      titulo: (c) => `${c.codigo} fue cancelada`,
      mensaje: (c) => `"${c.titulo}" fue cancelada${por(c)}.${motivo(c)}`,
    },
  ],
  'comentario.creado': [{
    quien: 'PARTICIPANTES', grupo: 'COMENTARIOS', severidad: 'INFO',
    titulo: (c) => `Nuevo comentario en ${c.codigo}`,
    mensaje: (c) => `${c.actor ?? 'Alguien'}: "${c.extracto ?? ''}"`,
  }],
  'evaluacion.registrada': [
    {
      quien: 'ASIGNADOS', grupo: 'ASIGNACIONES', severidad: 'INFO',
      titulo: (c) => `${c.tipoEvaluacion === 'CIERRE' ? 'Evaluación de cierre' : 'Seguimiento'} de ${c.codigo}: ${c.nota ?? ''}`.trim(),
      mensaje: (c) => `${c.actor ?? 'El líder'} calificó "${c.titulo}" con ${c.nota ?? 'una nueva nota'}` +
        `${c.avancePct != null ? ` · avance ${Math.round(c.avancePct)}%` : ''}.${c.comentario ? ` "${c.comentario}"` : ''}`,
    },
    {
      quien: 'SOLICITANTE', grupo: 'MIS_SOLICITUDES', severidad: 'INFO',
      titulo: (c) => `Avance de ${c.codigo}: ${c.avancePct != null ? `${Math.round(c.avancePct)}%` : 'actualizado'}`,
      mensaje: (c) => `Se registró ${c.tipoEvaluacion === 'CIERRE' ? 'la evaluación de cierre' : 'un seguimiento'} de "${c.titulo}".`,
    },
  ],
  'tarea.asignada': [{
    quien: 'NUEVOS_ASIGNADOS', grupo: 'ASIGNACIONES', severidad: 'INFO',
    titulo: (c) => `Recibiste una nueva asignación: ${c.codigo}`,
    mensaje: (c) => `${c.actor ?? 'El líder'} te asignó la tarea "${c.extracto ?? ''}" de la solicitud "${c.titulo}".`,
  }],
  // Agregado 'Proyecto': tarea propia del proyecto asignada a un ingeniero
  'proyecto.tarea_asignada': [{
    quien: 'NUEVOS_ASIGNADOS', grupo: 'ASIGNACIONES', severidad: 'INFO',
    titulo: (c) => `Recibiste una nueva asignación: ${c.codigo}`,
    mensaje: (c) => `${c.actor ?? 'El líder'} te asignó la tarea "${c.extracto ?? ''}" del proyecto "${c.titulo}".`,
  }],
  'sla.en_riesgo': [{
    quien: 'GESTORES', grupo: 'SLA', severidad: 'ALERTA',
    titulo: (c) => `SLA en riesgo: ${c.codigo}`,
    mensaje: (c) => `"${c.titulo}" lleva el ${c.consumoPct ?? 80}% de su tiempo de respuesta sin decisión.`,
  }],
  'sla.vencido': [{
    quien: 'GESTORES', grupo: 'SLA', severidad: 'CRITICA',
    titulo: (c) => `SLA vencido: ${c.codigo}`,
    mensaje: (c) => `"${c.titulo}" superó su tiempo de respuesta (${c.consumoPct ?? 100}%). Requiere atención.`,
  }],
};

/** Recorta un texto para mostrarlo en una notificación. */
export function extracto(texto: string, max = 120): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

/**
 * Canales por los que se entrega una notificación de un grupo, según las preferencias del usuario.
 * APP siempre está activo. Sin preferencia guardada se usa el valor por defecto del grupo.
 */
export function canalesActivos(
  porDefecto: { EMAIL: boolean; PUSH: boolean },
  preferencias: { canal: Canal; activo: boolean }[],
): Canal[] {
  const valor = (canal: 'EMAIL' | 'PUSH') => preferencias.find((p) => p.canal === canal)?.activo ?? porDefecto[canal];
  return ['APP', ...(valor('EMAIL') ? ['EMAIL' as const] : []), ...(valor('PUSH') ? ['PUSH' as const] : [])];
}
