'use client';

import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock4, Inbox, Layers } from 'lucide-react';
import { ESTADOS, ETIQUETA_ESTADO, type EstadoSolicitud } from '@sierraflow/contratos';
import { dbLocal } from '@/lib/offline/db';
import { cn, haceTiempo } from '@/lib/utils';
import { Avatar, BarraProgreso, Tarjeta } from '@/componentes/ui/primitivos';
import { COLOR_ESTADO, InsigniaEstado } from '@/modulos/solicitudes/ui/insignias';
import { useUsuario } from '@/componentes/layout/proveedores';
import { perfilDe } from '@/componentes/layout/perfil';

const EN_CURSO: EstadoSolicitud[] = ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'];
const ABIERTAS: EstadoSolicitud[] = ['ENVIADA', 'EN_REVISION', 'APROBADA', ...EN_CURSO];

function Kpi({ etiqueta, valor, detalle, icono: Icono, color }: { etiqueta: string; valor: number | string; detalle: string; icono: React.ElementType; color: string }) {
  return (
    <div className="rounded-xl border border-borde bg-panel/80 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-atenuado">{etiqueta}</p>
        <span className={cn('rounded-lg p-1.5', color)}><Icono className="size-4" /></span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{valor}</p>
      <p className="mt-1 text-xs text-atenuado">{detalle}</p>
    </div>
  );
}

/** Panel de gestión: alerta permanente mientras haya solicitudes recibidas sin revisar. */
function AlertaSolicitudesNuevas({ nuevas }: { nuevas: { id: string; codigo: string; titulo: string; solicitanteNombre: string; actualizadoEn: string }[] }) {
  if (!nuevas.length) return null;
  const ultima = nuevas[0]!;
  return (
    <Link href="/solicitudes?estado=ENVIADA"
      className="group flex flex-wrap items-center gap-4 rounded-xl border border-primario/40 bg-gradient-to-r from-primario/15 via-primario/5 to-transparent px-5 py-4 transition hover:border-primario/70">
      <span className="relative grid size-11 shrink-0 place-items-center rounded-xl bg-primario/20 text-teal-200">
        <Inbox className="size-5" />
        <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-primario px-1 text-[11px] font-bold text-slate-950">{nuevas.length}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{nuevas.length === 1 ? 'Tienes 1 solicitud nueva por revisar' : `Tienes ${nuevas.length} solicitudes nuevas por revisar`}</p>
        <p className="truncate text-sm text-atenuado">
          Última: <span className="font-mono text-sky-300">{ultima.codigo}</span> · {ultima.titulo} · de {ultima.solicitanteNombre} · {haceTiempo(ultima.actualizadoEn)}
        </p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-200">Ir a la bandeja<ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

export function PanelDashboard() {
  const { rolesVista } = useUsuario();
  const solicitudes = useLiveQuery(() => dbLocal.solicitudes.toArray(), []);
  if (!solicitudes) return <div className="h-96 animate-pulse rounded-xl bg-panel/50" />;
  const nuevas = perfilDe(rolesVista) === 'GESTION'
    ? solicitudes.filter((s) => s.estado === 'ENVIADA').sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))
    : [];

  const porEstado = ESTADOS.map((e) => ({ estado: e, total: solicitudes.filter((s) => s.estado === e).length }));
  const maximo = Math.max(1, ...porEstado.map((p) => p.total));
  const enCurso = solicitudes.filter((s) => EN_CURSO.includes(s.estado));
  const prioritarias = solicitudes.filter((s) => ABIERTAS.includes(s.estado) && (s.prioridad === 'ALTA' || s.prioridad === 'CRITICA'));
  const cerradas = solicitudes.filter((s) => s.estado === 'CERRADA').length;
  const actividad = solicitudes
    .flatMap((s) => s.historial.map((h) => ({ ...h, solicitud: s })))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 7);

  return (
    <div className="space-y-6">
      <AlertaSolicitudesNuevas nuevas={nuevas} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Kpi etiqueta="Total solicitudes" valor={solicitudes.length} detalle="Registradas en el sistema" icono={Layers} color="bg-sky-500/15 text-sky-300" />
        <Kpi etiqueta="En ejecución" valor={enCurso.length} detalle="Asignadas, en desarrollo o validación" icono={Activity} color="bg-blue-500/15 text-blue-300" />
        <Kpi etiqueta="Prioritarias abiertas" valor={prioritarias.length} detalle="Prioridad alta o crítica" icono={AlertTriangle} color="bg-orange-500/15 text-orange-300" />
        <Kpi etiqueta="Cerradas" valor={cerradas} detalle="Aceptadas por el solicitante" icono={CheckCircle2} color="bg-emerald-500/15 text-emerald-300" />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Tarjeta titulo="Distribución de requerimientos por estado" className="xl:col-span-3">
          <div className="flex h-56 items-end gap-3">
            {porEstado.map(({ estado, total }) => (
              <div key={estado} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-xs font-medium tabular-nums text-atenuado group-hover:text-texto">{total}</span>
                <div
                  className={cn('w-full max-w-10 rounded-t-md transition-all group-hover:brightness-125', COLOR_ESTADO[estado].barra)}
                  style={{ height: `${Math.max(total ? 6 : 2, (total / maximo) * 100)}%`, opacity: total ? 1 : 0.25 }}
                />
                <span className="h-8 text-center text-[10px] leading-tight text-atenuado">{ETIQUETA_ESTADO[estado]}</span>
              </div>
            ))}
          </div>
        </Tarjeta>

        <Tarjeta titulo="Progreso de solicitudes activas" className="xl:col-span-2">
          {enCurso.length === 0 ? (
            <p className="py-10 text-center text-sm text-atenuado">No hay solicitudes en ejecución.</p>
          ) : (
            <ul className="space-y-4">
              {enCurso.map((s) => (
                <li key={s.id}>
                  <Link href={`/solicitudes/${s.id}`} className="group block">
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate group-hover:text-primario">{s.titulo}</span>
                      <span className="tabular-nums text-atenuado">{s.avancePct}%</span>
                    </div>
                    <BarraProgreso valor={s.avancePct} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Tarjeta titulo="Solicitudes prioritarias" className="xl:col-span-3" cuerpoClassName="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-atenuado">
              <tr className="border-b border-borde/70">
                <th className="px-5 py-2.5 font-medium">Código</th>
                <th className="px-2 py-2.5 font-medium">Título</th>
                <th className="hidden px-2 py-2.5 font-medium md:table-cell">Departamento</th>
                <th className="px-5 py-2.5 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {prioritarias.slice(0, 6).map((s) => (
                <tr key={s.id} className="border-b border-borde/40 last:border-0 hover:bg-panel-2/60">
                  <td className="px-5 py-3 font-mono text-xs text-sky-300"><Link href={`/solicitudes/${s.id}`}>{s.codigo}</Link></td>
                  <td className="max-w-64 truncate px-2 py-3"><Link href={`/solicitudes/${s.id}`} className="hover:text-primario">{s.titulo}</Link></td>
                  <td className="hidden px-2 py-3 text-atenuado md:table-cell">{s.departamento}</td>
                  <td className="px-5 py-3"><InsigniaEstado estado={s.estado} /></td>
                </tr>
              ))}
              {prioritarias.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-10 text-center text-atenuado">Sin solicitudes prioritarias abiertas.</td></tr>
              )}
            </tbody>
          </table>
        </Tarjeta>

        <Tarjeta titulo="Actividad reciente" className="xl:col-span-2">
          <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-borde">
            {actividad.map((a, i) => (
              <li key={i} className="relative flex gap-3">
                <Avatar nombre={a.usuario} />
                <div className="min-w-0 text-sm">
                  <p className="truncate">
                    <span className="font-medium">{a.usuario}</span>{' '}
                    <span className="text-atenuado">{a.estadoAnterior ? 'movió a' : 'creó'}</span>{' '}
                    {a.estadoAnterior && <span>{ETIQUETA_ESTADO[a.estadoNuevo]}</span>}
                  </p>
                  <Link href={`/solicitudes/${a.solicitud.id}`} className="block truncate text-xs text-atenuado hover:text-primario">
                    {a.solicitud.codigo} · {a.solicitud.titulo}
                  </Link>
                </div>
                <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px] text-atenuado"><Clock4 className="size-3" />{haceTiempo(a.fecha)}</span>
              </li>
            ))}
          </ol>
        </Tarjeta>
      </div>
    </div>
  );
}
