'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Search, WifiOff } from 'lucide-react';
import type { EstadoSolicitud, ResumenEvaluable } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { BarraProgreso, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import { InsigniaEstado } from '@/modulos/solicitudes/ui/insignias';
import { fuenteApi, fuenteDemo } from '../infraestructura/fuente-evaluacion';
import { InsigniaNota } from './insignia-nota';

const FILTROS: { clave: string; etiqueta: string; estados: EstadoSolicitud[] }[] = [
  { clave: 'curso', etiqueta: 'En curso', estados: ['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'] },
  { clave: 'validacion', etiqueta: 'Por cerrar', estados: ['EN_VALIDACION'] },
  { clave: 'cerradas', etiqueta: 'Cerradas (90 días)', estados: ['CERRADA'] },
];

/** Tablero de seguimiento: avance y última calificación de cada solicitud en curso. */
export function ListaEvaluacion() {
  const { modoDemo } = useUsuario();
  const fuente = modoDemo ? fuenteDemo : fuenteApi;
  const [datos, setDatos] = useState<ResumenEvaluable[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('curso');
  const [q, setQ] = useState('');

  useEffect(() => {
    fuente.listado().then(setDatos).catch((e: Error) => setError(navigator.onLine ? e.message : 'sin-conexion'));
  }, [fuente]);

  const visibles = useMemo(() => {
    const estados = FILTROS.find((f) => f.clave === filtro)!.estados;
    const t = q.trim().toLowerCase();
    return (datos ?? []).filter((s) => estados.includes(s.estado)
      && (!t || s.titulo.toLowerCase().includes(t) || s.codigo.toLowerCase().includes(t) || s.departamento.toLowerCase().includes(t)));
  }, [datos, filtro, q]);

  if (error) {
    return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'La evaluación necesita conexión' : 'No se pudo cargar'}
      texto={error === 'sin-conexion' ? 'El avance del equipo y las notas se consultan en el servidor.' : error} />;
  }

  return (
    <Tarjeta cuerpoClassName="p-0"
      titulo={
        <div className="flex gap-1">
          {FILTROS.map((f) => (
            <button key={f.clave} onClick={() => setFiltro(f.clave)}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-normal transition', filtro === f.clave ? 'bg-primario/15 font-medium text-teal-200' : 'text-atenuado hover:text-texto')}>
              {f.etiqueta}{datos ? ` (${datos.filter((s) => f.estados.includes(s.estado)).length})` : ''}
            </button>
          ))}
        </div>
      }
      acciones={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, título o departamento" className="campo h-8 w-60 py-0 pl-8 text-xs" />
        </div>
      }>
      {!datos ? (
        <div className="h-64 animate-pulse" />
      ) : visibles.length === 0 ? (
        <div className="px-5 py-14 text-center text-sm text-atenuado">
          <ClipboardCheck className="mx-auto mb-2 size-8 opacity-60" />
          No hay solicitudes en esta vista. Las solicitudes aparecen aquí cuando tienen equipo asignado.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-atenuado">
              <tr className="border-b border-borde/60">
                <th className="px-5 py-2 font-normal">Solicitud</th>
                <th className="px-3 py-2 font-normal">Estado</th>
                <th className="w-56 px-3 py-2 font-normal">Avance</th>
                <th className="px-3 py-2 font-normal">Tareas</th>
                <th className="px-3 py-2 font-normal">Última nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde/40">
              {visibles.map((s) => (
                <tr key={s.id} className="hover:bg-panel-2/60">
                  <td className="px-5 py-3">
                    <Link href={`/gestion/evaluacion/${s.id}`} className="group block">
                      <span className="flex items-center gap-2 text-xs">
                        <span className="size-2 rounded-full" style={{ background: s.departamentoColor ?? '#64748b' }} />
                        <span className="font-mono text-sky-300">{s.codigo}</span>
                        <span className="text-atenuado">{s.departamento}</span>
                      </span>
                      <span className="mt-0.5 block font-medium group-hover:text-teal-200">{s.titulo}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3"><InsigniaEstado estado={s.estado} /></td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <BarraProgreso valor={s.avancePct} className="flex-1" />
                      <span className="w-10 text-right text-xs tabular-nums">{Math.round(s.avancePct)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums text-atenuado">{s.tareasCompletadas}/{s.tareas}</td>
                  <td className="px-3 py-3">
                    {s.ultimaNota != null ? (
                      <span className="flex items-center gap-2">
                        <InsigniaNota letra={s.ultimaLetra!} />
                        <span className="text-xs tabular-nums text-atenuado">{s.ultimaNota.toFixed(1)}/10</span>
                      </span>
                    ) : <span className="text-xs text-atenuado">Sin evaluar</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
