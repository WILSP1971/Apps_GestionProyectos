import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NuevaSolicitud } from '@sierraflow/contratos';
import { ErrorDominio, SinPermiso } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { Solicitud } from '../dominio/solicitud.agregado';
import { REPOSITORIO_SOLICITUDES, RepositorioSolicitudes } from '../dominio/solicitud.repositorio';

@Injectable()
export class CrearSolicitudCasoUso {
  constructor(@Inject(REPOSITORIO_SOLICITUDES) private readonly repo: RepositorioSolicitudes) {}

  async ejecutar(dto: NuevaSolicitud, usuario: UsuarioActual): Promise<{ id: string; estado: string }> {
    if (!usuario.departamentoId) {
      throw new ErrorDominio('SIN_DEPARTAMENTO', 'Su usuario no tiene un departamento asignado');
    }
    return enTransaccion(usuario.id, async () => {
      // Idempotencia básica para clientes offline que reintentan con el mismo UUID
      if (dto.id) {
        const existente = await this.repo.porId(dto.id);
        if (existente) return { id: existente.id, estado: existente.estado };
      }
      if (dto.proyectoId) await this.validarProyecto(dto.proyectoId, usuario);
      // La solicitud hereda las tecnologías de la aplicación: con ellas se recomiendan ingenieros
      const tecnologiasApp = dto.aplicacionId ? await this.validarAplicacion(dto.aplicacionId, dto.tipo) : [];
      const s = Solicitud.crear(dto.id ?? randomUUID(), {
        titulo: dto.titulo,
        descripcion: dto.descripcion,
        objetivos: dto.objetivos ?? null,
        justificacion: dto.justificacion ?? null,
        tipo: dto.tipo,
        prioridad: dto.prioridad,
        solicitanteId: usuario.id,
        departamentoId: usuario.departamentoId!,
        proyectoId: dto.proyectoId ?? null,
        aplicacionId: dto.aplicacionId ?? null,
        fechaDeseada: dto.fechaDeseada || null,
        criterios: dto.criterios,
        tecnologias: dto.tecnologias.length ? dto.tecnologias : tecnologiasApp,
      });
      if (dto.enviar) s.cambiarEstado('ENVIADA', usuario);
      await this.repo.guardar(s);
      return { id: s.id, estado: s.estado };
    });
  }

  /** La aplicación existe, está activa y está asignada al tipo de requerimiento. Devuelve sus tecnologías. */
  private async validarAplicacion(aplicacionId: string, tipo: NuevaSolicitud['tipo']): Promise<string[]> {
    const { rows: [a] } = await db().query(
      `SELECT a.nombre, a.activo,
              EXISTS (SELECT 1 FROM gestion.aplicacion_tipos xt WHERE xt.aplicacion_id = a.id AND xt.tipo = $2::gestion.tipo_solicitud) AS del_tipo,
              coalesce((SELECT array_agg(t.nombre ORDER BY t.nombre) FROM gestion.aplicacion_tecnologias x
                          JOIN gestion.tecnologias t ON t.id = x.tecnologia_id WHERE x.aplicacion_id = a.id), '{}') AS tecnologias
         FROM gestion.aplicaciones a WHERE a.id = $1`, [aplicacionId, tipo]);
    if (!a) throw new ErrorDominio('APLICACION_INEXISTENTE', 'La aplicación indicada no existe');
    if (!a.activo) throw new ErrorDominio('APLICACION_INACTIVA', `La aplicación "${a.nombre}" ya no está disponible`);
    if (!a.del_tipo) throw new ErrorDominio('APLICACION_OTRO_TIPO', `La aplicación "${a.nombre}" no está asignada a este tipo de requerimiento`);
    return a.tecnologias;
  }

  /** Regla 2: crear la solicitud ya dentro de un proyecto (desde la pantalla del proyecto). */
  private async validarProyecto(proyectoId: string, usuario: UsuarioActual) {
    if (!usuario.roles.some((r) => r === 'DIRECTOR' || r === 'LIDER' || r === 'ADMIN')) {
      throw new SinPermiso('Solo líderes y directores crean solicitudes dentro de un proyecto');
    }
    const { rows: [p] } = await db().query(
      `SELECT estado::text AS estado FROM gestion.proyectos WHERE id = $1 AND NOT eliminado`, [proyectoId]);
    if (!p) throw new ErrorDominio('PROYECTO_INEXISTENTE', 'El proyecto indicado no existe');
    if (p.estado === 'CERRADO' || p.estado === 'CANCELADO') {
      throw new ErrorDominio('PROYECTO_CERRADO', 'No se pueden agregar solicitudes a un proyecto cerrado o cancelado');
    }
  }
}
