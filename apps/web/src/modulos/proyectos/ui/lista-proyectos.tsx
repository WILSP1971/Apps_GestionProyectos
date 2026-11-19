'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FolderKanban, Plus, ShieldAlert, Wrench, WifiOff } from 'lucide-react';
import type { CatalogosProyecto, ResumenProyecto } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { BarraProgreso, Boton, Vacio } from '@/componentes/ui/primitivos';
import { useActor, useUsuario } from '@/componentes/layout/proveedores';
import { fuenteApi, fuenteDemo } from '../infraestructura/fuente-proyectos';
import { dineroCorto, fechaCorta, InsigniaEstadoProyecto, InsigniaSalud } from './comunes';
import { FormularioProyecto } from './formulario-proyecto';

/** Portafolio de proyectos: salud del cronograma, avance, presupuesto, ROI, riesgos y deuda técnica. */
export function ListaProyectos() {
  const { modoDemo } = useUsuario();
  const actor = useActor();
  const router = useRouter();
  const fuente = modoDemo ? fuenteDemo : fuenteApi;
  const puedeCrear = actor.roles.some((r) => r === 'DIRECTOR' || r === 'ADMIN');
  const [proyectos, setProyectos] = useState<ResumenProyecto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [catalogos, setCatalogos] = useState<CatalogosProyecto | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [verCerrados, setVerCerrados] = useState(false);

  useEffect(() => {
    fuente.listado().then(setProyectos).catch((e: Error) => setError(navigator.onLine ? e.message : 'sin-conexion'));
  }, [fuente]);

  const abrirNuevo = async () => {
    setNuevo(true);
    if (!catalogos) fuente.catalogos().then(setCatalogos).catch(() => undefined);
  };

  if (error) {
    return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'La PM Suite necesita conexión' : 'No se pudieron cargar los proyectos'}
      texto={error === 'sin-conexion' ? 'Presupuesto, riesgos y cronograma se consultan en el servidor.' : error} />;
  }
  if (!proyectos) return <div className="h-72 animate-pulse rounded-xl bg-panel/60" />;

  const visibles = proyectos.filter((p) => verCerrados || !['CERRADO', 'CANCELADO'].includes(p.estado));
  const cerrados = proyectos.length - proyectos.filter((p) => !['CERRADO', 'CANCELADO'].includes(p.estado)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-atenuado">
          <input type="checkbox" className="size-4 accent-teal-500" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} />
          Mostrar cerrados y cancelados ({cerrados})
        </label>
        {puedeCrear && <Boton onClick={abrirNuevo}><Plus className="size-4" /> Nuevo proyecto</Boton>}
      </div>

      {visibles.length === 0 ? (
        <Vacio icono={<FolderKanban className="size-8" />} titulo="Aún no hay proyectos"
          texto="Un proyecto agrupa solicitudes relacionadas para seguir su cronograma (Gantt), presupuesto, ROI, riesgos y deuda técnica." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {visibles.map((p) => {
            const consumo = p.finanzas.consumoPresupuestoPct;
            return (
              <Link key={p.id} href={`/proyectos/${p.id}`}
                className="group rounded-xl border border-borde bg-panel/80 p-5 transition hover:border-primario/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-xs text-atenuado">
                      {p.departamentoColor && <span className="size-2 rounded-full" style={{ background: p.departamentoColor }} />}
                      <span className="font-mono text-sky-300">{p.codigo}</span>{p.departamento && <>· {p.departamento}</>}
                    </p>
                    <h3 className="mt-1 truncate font-semibold group-hover:text-teal-200">{p.nombre}</h3>
                  </div>
                  <InsigniaEstadoProyecto estado={p.estado} />
                </div>

                <div className="mt-4">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <InsigniaSalud salud={p.salud.salud} />
                    <span className="tabular-nums text-atenuado">{Math.round(p.avancePct)}% avance
                      {p.salud.tiempoPct != null && ` · ${Math.round(Math.min(p.salud.tiempoPct, 100))}% del plazo`}</span>
                  </div>
                  <BarraProgreso valor={p.avancePct} />
                  <p className="mt-1 text-[11px] text-atenuado">{fechaCorta(p.fechaInicio)} → {fechaCorta(p.fechaFinPlan)} · {p.solicitudes} solicitud(es)</p>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-borde/60 pt-3 text-xs">
                  <div>
                    <dt className="text-atenuado">Presupuesto</dt>
                    <dd className={cn('mt-0.5 font-medium tabular-nums', consumo != null && consumo > 100 && 'text-red-300')}>
                      {consumo != null ? `${Math.round(consumo)}% usado` : dineroCorto(p.presupuesto, p.moneda)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-atenuado">ROI esperado</dt>
                    <dd className="mt-0.5 font-medium tabular-nums">{p.finanzas.roiPct != null ? `${Math.round(p.finanzas.roiPct)}%` : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-atenuado">Alertas</dt>
                    <dd className="mt-0.5 flex items-center gap-2 font-medium">
                      <span className={cn('inline-flex items-center gap-1', p.riesgosAltos ? 'text-orange-200' : 'text-atenuado')} title="Riesgos altos o críticos abiertos">
                        <ShieldAlert className="size-3.5" />{p.riesgosAltos}</span>
                      <span className={cn('inline-flex items-center gap-1', p.deudaPendiente ? 'text-amber-200' : 'text-atenuado')} title="Story points de deuda técnica pendientes">
                        <Wrench className="size-3.5" />{p.deudaPendiente}</span>
                    </dd>
                  </div>
                </dl>
              </Link>
            );
          })}
        </div>
      )}

      {nuevo && (
        <FormularioProyecto catalogos={catalogos} alCerrar={() => setNuevo(false)}
          alGuardar={async (datos) => {
            try {
              const p = await fuente.crear(datos);
              toast.success(`Proyecto ${p.codigo} creado`);
              router.push(`/proyectos/${p.id}`);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }} />
      )}
    </div>
  );
}
