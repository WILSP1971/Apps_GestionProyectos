import { AgregadoRaiz } from '../../../compartido/dominio/agregado-raiz';
import { ErrorDominio, SinPermiso } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { buscarRegla, EstadoSolicitud } from './estado-solicitud.vo';

export type Prioridad = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type TipoSolicitud = 'FUNCIONAL' | 'TECNICA' | 'MEJORA' | 'INCIDENTE' | 'CAMBIO';
/** Regla 1: mismo valor que TIPOS_REQUIEREN_PROYECTO de @sierraflow/contratos (el dominio no depende de paquetes). */
const requiereProyecto = (tipo: TipoSolicitud) => tipo === 'FUNCIONAL';

export interface CriterioAceptacion {
  id: string;
  orden: number;
  descripcion: string;
  cumplido: boolean;
}

export interface PropsSolicitud {
  codigo?: string;
  titulo: string;
  descripcion: string;
  objetivos?: string | null;
  justificacion?: string | null;
  tipo: TipoSolicitud;
  prioridad: Prioridad;
  estado: EstadoSolicitud;
  solicitanteId: string;
  departamentoId: string;
  proyectoId?: string | null;
  fechaDeseada?: string | null; // AAAA-MM-DD
  criterios: CriterioAceptacion[];
  tecnologias: string[];
}

type DatosCreacion = Omit<PropsSolicitud, 'estado' | 'codigo'>;
type CamposEditables = Partial<Pick<PropsSolicitud,
  'titulo' | 'descripcion' | 'objetivos' | 'justificacion' | 'prioridad' | 'tipo' | 'fechaDeseada' | 'criterios' | 'tecnologias'>>;

/** Agregado raíz: Solicitud de requerimiento. Concentra las reglas del ciclo de vida. */
export class Solicitud extends AgregadoRaiz<PropsSolicitud> {
  static crear(id: string, datos: DatosCreacion): Solicitud {
    Solicitud.validarContenido(datos);
    const s = new Solicitud(id, { ...datos, estado: 'BORRADOR' });
    s.registrar({
      tipo: 'solicitud.creada', agregado: 'Solicitud', agregadoId: id, ocurridoEn: new Date(),
      payload: { solicitanteId: datos.solicitanteId, titulo: datos.titulo, prioridad: datos.prioridad },
    });
    return s;
  }

  static reconstituir(id: string, props: PropsSolicitud, version: number): Solicitud {
    return new Solicitud(id, props, version);
  }

  get estado(): EstadoSolicitud {
    return this.props.estado;
  }

  get datos(): Readonly<PropsSolicitud> {
    return this.props;
  }

  editar(cambios: CamposEditables, actor: UsuarioActual): void {
    if (this.props.estado !== 'BORRADOR') {
      throw new ErrorDominio('NO_EDITABLE', 'Solo se pueden editar solicitudes en borrador');
    }
    if (actor.id !== this.props.solicitanteId && !actor.roles.some((r) => r === 'LIDER' || r === 'DIRECTOR')) {
      throw new SinPermiso('Solo el solicitante o un líder puede editar la solicitud');
    }
    const nuevas = { ...this.props, ...cambios };
    Solicitud.validarContenido(nuevas);
    this.props = nuevas;
  }

  cambiarEstado(hacia: EstadoSolicitud, actor: UsuarioActual, comentario?: string): void {
    const desde = this.props.estado;
    const regla = buscarRegla(desde, hacia);
    if (!regla) {
      throw new ErrorDominio('TRANSICION_INVALIDA', `No se puede pasar de ${desde} a ${hacia}`);
    }
    if (!regla.roles.some((r) => actor.roles.includes(r))) {
      throw new SinPermiso(`Su rol no permite la transición a ${hacia}`);
    }
    // El solicitante solo actúa sobre sus propias solicitudes
    const soloComoSolicitante = !actor.roles.some((r) => r !== 'SOLICITANTE' && regla.roles.includes(r));
    if (soloComoSolicitante && actor.id !== this.props.solicitanteId) {
      throw new SinPermiso('Solo el solicitante puede realizar esta acción sobre su solicitud');
    }
    if (regla.requiereComentario && !comentario?.trim()) {
      throw new ErrorDominio('COMENTARIO_REQUERIDO', 'Esta transición requiere un comentario');
    }
    if (hacia === 'ENVIADA' && this.props.criterios.length === 0) {
      throw new ErrorDominio('SIN_CRITERIOS', 'Agregue al menos un criterio de aceptación antes de enviar');
    }
    if (hacia === 'ASIGNADA' && requiereProyecto(this.props.tipo) && !this.props.proyectoId) {
      throw new ErrorDominio('REQUIERE_PROYECTO',
        'Los requerimientos funcionales deben pertenecer a un proyecto antes de asignar el equipo. Agrégalo desde Proyectos → Solicitudes.');
    }
    if (hacia === 'CERRADA' && this.props.criterios.some((c) => !c.cumplido)) {
      throw new ErrorDominio('CRITERIOS_PENDIENTES', 'Todos los criterios de aceptación deben estar cumplidos para cerrar');
    }

    this.props.estado = hacia;
    this.registrar({
      tipo: `solicitud.${hacia.toLowerCase()}`, agregado: 'Solicitud', agregadoId: this.id, ocurridoEn: new Date(),
      payload: {
        anterior: desde, nuevo: hacia, actorId: actor.id, comentario: comentario ?? null,
        solicitanteId: this.props.solicitanteId, titulo: this.props.titulo,
      },
    });
  }

  marcarCriterio(criterioId: string, cumplido: boolean, actor: UsuarioActual): void {
    if (!['EN_DESARROLLO', 'EN_VALIDACION'].includes(this.props.estado)) {
      throw new ErrorDominio('ESTADO_INVALIDO', 'Los criterios se verifican durante desarrollo o validación');
    }
    if (!actor.roles.some((r) => ['INGENIERO', 'LIDER', 'DIRECTOR'].includes(r)) && actor.id !== this.props.solicitanteId) {
      throw new SinPermiso('No puede verificar criterios de esta solicitud');
    }
    const c = this.props.criterios.find((x) => x.id === criterioId);
    if (!c) throw new ErrorDominio('CRITERIO_INEXISTENTE', 'El criterio no pertenece a la solicitud');
    c.cumplido = cumplido;
  }

  private static validarContenido(d: Pick<PropsSolicitud, 'titulo' | 'descripcion' | 'criterios'>): void {
    if (d.titulo.trim().length < 5) throw new ErrorDominio('TITULO_INVALIDO', 'El título debe tener al menos 5 caracteres');
    if (d.titulo.length > 200) throw new ErrorDominio('TITULO_INVALIDO', 'El título no puede superar 200 caracteres');
    if (!d.descripcion.trim()) throw new ErrorDominio('DESCRIPCION_REQUERIDA', 'La descripción es obligatoria');
    const ordenes = new Set(d.criterios.map((c) => c.orden));
    if (ordenes.size !== d.criterios.length) throw new ErrorDominio('CRITERIOS_DUPLICADOS', 'El orden de los criterios no puede repetirse');
  }
}
