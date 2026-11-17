import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NuevaSolicitud } from '@sierraflow/contratos';
import { ErrorDominio } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { enTransaccion } from '../../../compartido/infraestructura/base-datos';
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
        fechaDeseada: dto.fechaDeseada || null,
        criterios: dto.criterios,
        tecnologias: dto.tecnologias,
      });
      if (dto.enviar) s.cambiarEstado('ENVIADA', usuario);
      await this.repo.guardar(s);
      return { id: s.id, estado: s.estado };
    });
  }
}
