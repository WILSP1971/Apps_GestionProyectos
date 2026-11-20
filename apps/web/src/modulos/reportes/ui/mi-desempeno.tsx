'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { BarraProgreso, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useActor, useUsuario } from '@/componentes/layout/proveedores';
import { fuenteDemo as evaluacionDemo } from '@/modulos/evaluacion/infraestructura/fuente-evaluacion';
import { InsigniaNota } from '@/modulos/evaluacion/ui/insignia-nota';
import { letraCalificacion } from '@sierraflow/contratos';
import { etiquetaMes } from '../dominio/indicadores';

/** Respuesta de /analitica/kpis/mi-desempeno (solo los datos de quien consulta). */
interface MiDesempeno {
  resumen: {
    tareas_abiertas: number; tareas_bloqueadas: number; tareas_vencidas: number; completadas_30d: number;
    horas_reales: number; horas_estimadas_completadas: number; horas_reales_completadas: number;
    solicitudes_activas: number; carga_pct: number; horas_pendientes: number; capacidad_semana: number;
    calificacion_promedio: number | null; evaluaciones: number;
  };
  completadas_por_mes: { mes: string; completadas: number }[];
  calificaciones: { codigo: string; titulo: string; tipo: string; fecha: string; puntaje: number; letra_equipo: string }[];
}

async function demo(usuarioId: string): Promise<MiDesempeno> {
  const t = await evaluacionDemo.misTareas(usuarioId);
  const abiertas = t.filter((x) => x.estado !== 'COMPLETADA');
  const hoy = new Date();
  return {
    resumen: {
      tareas_abiertas: abiertas.length, tareas_bloqueadas: abiertas.filter((x) => x.estado === 'BLOQUEADA').length,
      tareas_vencidas: abiertas.filter((x) => x.fechaFinPlan && x.fechaFinPlan < hoy.toISOString().slice(0, 10)).length,
      completadas_30d: t.length - abiertas.length, horas_reales: t.reduce((a, x) => a + x.horasReales, 0),
      horas_estimadas_completadas: t.filter((x) => x.estado === 'COMPLETADA').reduce((a, x) => a + (x.horasEstimadas ?? 0), 0),
      horas_reales_completadas: t.filter((x) => x.estado === 'COMPLETADA').reduce((a, x) => a + x.horasReales, 0),
      solicitudes_activas: new Set(abiertas.map((x) => x.solicitudId)).size, carga_pct: 55, horas_pendientes: 22, capacidad_semana: 40,
      calificacion_promedio: null, evaluaciones: 0,
    },
    completadas_por_mes: Array.from({ length: 6 }, (_, i) => {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - 5 + i, 1);
      return { mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, completadas: i === 5 ? t.length - abiertas.length : 0 };
    }),
    calificaciones: [],
  };
}

function Dato({ titulo, valor, detalle, tono }: { titulo: string; valor: string; detalle?: string; tono?: string }) {
  return (
    <div className="rounded-xl border border-borde bg-panel/80 p-4">
      <p className="text-xs text-atenuado">{titulo}</p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tono)}>{valor}</p>
      {detalle && <p className="mt-0.5 text-[11px] text-atenuado">{detalle}</p>}
    </div>
  );
}

/** Reporte personal del ingeniero: su carga, cumplimiento, precisión de estimación y calificaciones. */
export function MiDesempenoPanel() {
  const actor = useActor();
  const { modoDemo } = useUsuario();
  const [d, setD] = useState<MiDesempeno | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (modoDemo ? demo(actor.id) : apiFetch<MiDesempeno>('/kpis/mi-desempeno', { servicio: 'analitica' }))
      .then(setD).catch((e: Error) => setError(navigator.onLine ? e.message : 'sin-conexion'));
  }, [modoDemo, actor.id]);

  if (error) {
    return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'El reporte necesita conexión' : 'No se pudo cargar tu reporte'} texto={error === 'sin-conexion' ? 'Se calcula en el servidor.' : error} />;
  }
  if (!d) return <div className="h-72 animate-pulse rounded-xl bg-panel/60" />;

  const r = d.resumen;
  // Precisión de estimación: horas reales vs estimadas en tareas terminadas (100 % = exacto; > 100 % = tomó más)
  const precision = r.horas_estimadas_completadas > 0 ? Math.round((r.horas_reales_completadas / r.horas_estimadas_completadas) * 100) : null;
  const maxMes = Math.max(1, ...d.completadas_por_mes.map((m) => m.completadas));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Dato titulo="Tareas por hacer" valor={String(r.tareas_abiertas)}
          detalle={`${r.tareas_vencidas} vencida(s) · ${r.tareas_bloqueadas} bloqueada(s)`} tono={r.tareas_vencidas ? 'text-red-300' : undefined} />
        <Dato titulo="Completadas (30 días)" valor={String(r.completadas_30d)} tono="text-emerald-300" />
        <Dato titulo="Horas registradas" valor={`${r.horas_reales.toLocaleString('es-CO')} h`} detalle={`${r.solicitudes_activas} solicitud(es) activa(s)`} />
        <Dato titulo="Precisión de estimación" valor={precision != null ? `${precision}%` : '—'}
          detalle={precision == null ? 'Aún sin tareas terminadas con horas estimadas' : precision > 120 ? 'Tus tareas toman más de lo estimado' : precision < 80 ? 'Terminas antes de lo estimado' : 'Estimaciones acertadas'}
          tono={precision != null && (precision > 120 || precision < 80) ? 'text-amber-200' : undefined} />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Tarjeta titulo="Mi carga de trabajo">
          <p className="text-3xl font-semibold tabular-nums">{r.carga_pct}%</p>
          <BarraProgreso valor={r.carga_pct} className="mt-2" color={r.carga_pct >= 100 ? 'bg-red-500' : r.carga_pct >= 80 ? 'bg-amber-500' : undefined} />
          <p className="mt-2 text-xs text-atenuado">{r.horas_pendientes} h pendientes de {r.capacidad_semana} h por semana</p>
        </Tarjeta>

        <Tarjeta titulo="Tareas completadas por mes">
          <ul className="space-y-2" aria-label="Tareas completadas por mes">
            {d.completadas_por_mes.map((m) => (
              <li key={m.mes} className="flex items-center gap-2 text-xs">
                <span className="w-14 text-atenuado">{etiquetaMes(m.mes)}</span>
                <div className="h-2 flex-1 rounded bg-panel-2"><div className="h-full rounded bg-primario" style={{ width: `${(m.completadas / maxMes) * 100}%` }} /></div>
                <span className="w-6 text-right tabular-nums">{m.completadas}</span>
              </li>
            ))}
          </ul>
        </Tarjeta>

        <Tarjeta titulo="Mis calificaciones">
          {r.calificacion_promedio != null ? (
            <div className="flex items-center gap-3">
              <InsigniaNota letra={letraCalificacion(r.calificacion_promedio)} grande />
              <div><p className="text-xl font-semibold tabular-nums">{r.calificacion_promedio.toFixed(1)}<span className="text-sm text-atenuado">/10</span></p>
                <p className="text-xs text-atenuado">Promedio de {r.evaluaciones} evaluación(es)</p></div>
            </div>
          ) : <p className="text-sm text-atenuado">Aún no tienes calificaciones individuales.</p>}
          {d.calificaciones.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-xs">
              {d.calificaciones.map((c) => (
                <li key={`${c.codigo}${c.fecha}`} className="flex justify-between gap-2">
                  <span className="truncate"><span className="font-mono text-sky-300">{c.codigo}</span> · {new Date(c.fecha).toLocaleDateString('es-CO')}</span>
                  <span className="tabular-nums">{c.puntaje}/5</span>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
