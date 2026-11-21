import type { EstadoSolicitud } from '@sierraflow/contratos';
import { dbLocal, type SolicitudLocal } from '@/lib/offline/db';

/** Datos de ejemplo (inspirados en los mockups) para revisar el diseño en modo demo. */
const DIAS = 86_400_000;
const hace = (dias: number) => new Date(Date.now() - dias * DIAS).toISOString();

function historial(estados: EstadoSolicitud[], inicioDias: number, usuarios: string[]) {
  return estados.map((estado, i) => ({
    estadoAnterior: i === 0 ? null : estados[i - 1]!,
    estadoNuevo: estado,
    usuario: usuarios[Math.min(i, usuarios.length - 1)]!,
    fecha: hace(inicioDias - i * (inicioDias / Math.max(estados.length, 1))),
  }));
}

const criterios = (lista: string[], cumplidos = 0) =>
  lista.map((descripcion, i) => ({ id: crypto.randomUUID(), orden: i + 1, descripcion, cumplido: i < cumplidos }));

export function solicitudesDemo(usuarioId: string, usuarioNombre: string): SolicitudLocal[] {
  const base = { version: 1, pendienteSync: 0 as const, solicitanteId: usuarioId, solicitanteNombre: usuarioNombre };
  return [
    {
      ...base,
      id: crypto.randomUUID(), codigo: 'SOL-000234',
      titulo: 'Integración API Pagos Regionales (COP/USD)',
      descripcion: 'Implementar pasarela de pagos regionales para el canal web y móvil.',
      objetivos: 'Aceptar pagos en COP y USD para Colombia y Perú.',
      justificacion: 'Reducir la fricción del checkout y abrir el mercado peruano.',
      tipo: 'NUEVO', prioridad: 'ALTA', estado: 'EN_DESARROLLO', avancePct: 65,
      departamento: 'Finanzas y Contabilidad', departamentoColor: '#EAB308', fechaDeseada: '2026-12-15',
      tecnologias: ['Node.js', 'Next.js', 'JavaScript'],
      criterios: criterios(['Integración con API de MercadoPago', 'Validación de transacciones exitosas', 'Panel de reportes de cobro'], 2),
      historial: historial(['BORRADOR', 'ENVIADA', 'EN_REVISION', 'APROBADA', 'ASIGNADA', 'EN_DESARROLLO'], 20, [usuarioNombre, usuarioNombre, 'Carlos Ruiz']),
      asignados: [{ nombre: 'Luis F.', grupo: 'Backend' }, { nombre: 'María T.', grupo: 'Frontend' }],
      creadoEn: hace(20), actualizadoEn: hace(1),
    },
    {
      ...base,
      id: crypto.randomUUID(), codigo: 'SOL-000815',
      titulo: 'Desarrollo de Módulo de Pagos con Next.js/Stripe',
      descripcion: 'Integración completa de Stripe en la tienda Next.js con suscripciones.',
      justificacion: 'Reducir fricción de checkout.',
      tipo: 'NUEVO', prioridad: 'ALTA', estado: 'EN_REVISION', avancePct: 0,
      departamento: 'Desarrollo y TI', departamentoColor: '#22C55E', fechaDeseada: '2027-01-20',
      tecnologias: ['Next.js', 'Python/FastAPI', 'HTML/CSS'],
      criterios: criterios(['Checkout con tarjeta y PSE', 'Webhooks de confirmación', 'Pruebas end-to-end del flujo']),
      historial: historial(['BORRADOR', 'ENVIADA', 'EN_REVISION'], 6, [usuarioNombre, usuarioNombre, 'Carlos Ruiz']),
      asignados: [],
      creadoEn: hace(6), actualizadoEn: hace(0.2),
    },
    {
      ...base,
      id: crypto.randomUUID(), codigo: 'SOL-000235',
      titulo: 'Actualización Flujo de Cobro (COP)',
      descripcion: 'Ajustar el flujo de cobro para facturación electrónica DIAN.',
      tipo: 'NORMATIVO', prioridad: 'MEDIA', estado: 'ENVIADA', avancePct: 0, aplicacionId: 'app-facturacion', aplicacionNombre: 'Facturación electrónica',
      departamento: 'Finanzas y Contabilidad', departamentoColor: '#EAB308', tecnologias: ['Node.js', 'PostgreSQL'],
      criterios: criterios(['Factura electrónica validada por la DIAN', 'Notas crédito automáticas']),
      historial: historial(['BORRADOR', 'ENVIADA'], 3, [usuarioNombre]),
      asignados: [], creadoEn: hace(3), actualizadoEn: hace(3),
    },
    {
      ...base,
      id: crypto.randomUUID(), codigo: 'SOL-000236',
      titulo: 'Landing Page de Producto',
      descripcion: 'Landing para el lanzamiento del nuevo producto con formulario de leads.',
      tipo: 'MEJORA', prioridad: 'MEDIA', estado: 'EN_VALIDACION', avancePct: 90, aplicacionId: 'app-portal', aplicacionNombre: 'Portal de pacientes',
      departamento: 'Marketing y Ventas', departamentoColor: '#3B82F6', tecnologias: ['Next.js'],
      criterios: criterios(['Puntaje Lighthouse ≥ 90', 'Formulario conectado al CRM', 'Versión móvil'], 3),
      historial: historial(['BORRADOR', 'ENVIADA', 'EN_REVISION', 'APROBADA', 'ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'], 30, [usuarioNombre, usuarioNombre, 'Carlos Ruiz', 'Carlos Ruiz', 'Carlos Ruiz', 'María T.']),
      asignados: [{ nombre: 'María T.', grupo: 'Frontend' }],
      creadoEn: hace(30), actualizadoEn: hace(2),
    },
    {
      ...base,
      id: crypto.randomUUID(), codigo: 'SOL-000237',
      titulo: 'Portal de Empleados',
      descripcion: 'Portal de autoservicio para certificados laborales y vacaciones.',
      tipo: 'NUEVO', prioridad: 'BAJA', estado: 'APROBADA', avancePct: 0,
      departamento: 'Recursos Humanos', departamentoColor: '#EF4444', tecnologias: ['Next.js', 'NestJS', 'PostgreSQL'],
      criterios: criterios(['Descarga de certificados en PDF', 'Solicitud de vacaciones con aprobación']),
      historial: historial(['BORRADOR', 'ENVIADA', 'EN_REVISION', 'APROBADA'], 12, [usuarioNombre, usuarioNombre, 'Carlos Ruiz']),
      asignados: [], creadoEn: hace(12), actualizadoEn: hace(4),
    },
    {
      ...base,
      id: crypto.randomUUID(), codigo: 'SOL-000231',
      titulo: 'Reportes Node.js por Departamento',
      descripcion: 'Reportes consolidados de ejecución presupuestal por departamento.',
      tipo: 'INCIDENTE', prioridad: 'CRITICA', estado: 'CERRADA', avancePct: 100, aplicacionId: 'app-nomina', aplicacionNombre: 'Nómina y talento humano',
      departamento: 'Finanzas y Contabilidad', departamentoColor: '#EAB308', tecnologias: ['Node.js', 'PostgreSQL'],
      criterios: criterios(['Exportación a Excel', 'Filtro por centro de costo'], 2),
      historial: historial(['BORRADOR', 'ENVIADA', 'EN_REVISION', 'APROBADA', 'ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION', 'CERRADA'], 45, [usuarioNombre, usuarioNombre, 'Carlos Ruiz', 'Carlos Ruiz', 'Carlos Ruiz', 'Andrés S.', 'Andrés S.', usuarioNombre]),
      asignados: [{ nombre: 'Andrés S.', grupo: 'Backend' }],
      creadoEn: hace(45), actualizadoEn: hace(8),
    },
  ];
}

/** Carga los datos demo una sola vez por navegador. */
const VERSION_DEMO = 2; // 2: tipos Nuevo/Normativo/Mejora/Incidente

export async function sembrarDemoSiVacio(usuarioId: string, usuarioNombre: string) {
  const sembrado = await dbLocal.meta.get('demo-sembrado');
  if (sembrado && sembrado.valor !== VERSION_DEMO) {
    // Demo creado antes del cambio de tipos: se convierten sin borrar lo que el usuario hizo
    const conversion: Record<string, SolicitudLocal['tipo']> = { FUNCIONAL: 'NUEVO', TECNICA: 'MEJORA', CAMBIO: 'NORMATIVO' };
    await dbLocal.solicitudes.toCollection().modify((x) => { const n = conversion[x.tipo as string]; if (n) x.tipo = n; });
    await dbLocal.meta.put({ clave: 'demo-sembrado', valor: VERSION_DEMO });
    return;
  }
  if (sembrado) return;
  await dbLocal.transaction('rw', dbLocal.solicitudes, dbLocal.notificaciones, dbLocal.meta, async () => {
    await dbLocal.solicitudes.bulkAdd(solicitudesDemo(usuarioId, usuarioNombre));
    await dbLocal.notificaciones.bulkAdd([
      { id: crypto.randomUUID(), titulo: 'SOL-000815 en revisión', mensaje: 'Carlos Ruiz tomó tu solicitud en revisión.', enlace: '/mis-solicitudes', severidad: 'INFO', leida: 0, creadoEn: hace(0.2) },
      { id: crypto.randomUUID(), titulo: 'SOL-000236 lista para validar', mensaje: 'La landing está lista: valida y acepta los criterios.', enlace: '/mis-solicitudes', severidad: 'ALERTA', leida: 0, creadoEn: hace(2) },
    ]);
    await dbLocal.meta.put({ clave: 'demo-sembrado', valor: VERSION_DEMO });
  });
}

export async function reiniciarDemo(usuarioId: string, usuarioNombre: string) {
  await Promise.all([dbLocal.solicitudes.clear(), dbLocal.comentarios.clear(), dbLocal.notificaciones.clear(),
    dbLocal.bandejaSalida.clear(), dbLocal.conflictos.clear(), dbLocal.adjuntos.clear()]);
  await dbLocal.meta.delete('demo-sembrado');
  await sembrarDemoSiVacio(usuarioId, usuarioNombre);
}
