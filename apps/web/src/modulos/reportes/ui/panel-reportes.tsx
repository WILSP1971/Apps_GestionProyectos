'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, RefreshCw, Table2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Boton, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import { InsigniaNota } from '@/modulos/evaluacion/ui/insignia-nota';
import { aCsv, agruparPorEtapa, duracion, ETAPAS, etiquetaMes } from '../dominio/indicadores';
import { fuenteAnalitica, fuenteDemo, type DatosReportes } from '../infraestructura/fuente-reportes';
import { BarrasApiladas, BarrasSimples, GraficoLineas, SERIES } from './graficos';

const PERIODOS = [{ dias: 30, etiqueta: '30 días' }, { dias: 90, etiqueta: '90 días' }, { dias: 365, etiqueta: '12 meses' }];

function descargar(nombre: string, contenido: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BotonCsv({ alPulsar }: { alPulsar: () => void }) {
  return (
    <button onClick={alPulsar} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-atenuado hover:bg-panel-2 hover:text-texto" title="Descargar CSV (Excel)">
      <Download className="size-3.5" /> CSV
    </button>
  );
}

function BotonTabla({ activo, alPulsar }: { activo: boolean; alPulsar: () => void }) {
  return (
    <button onClick={alPulsar} aria-pressed={activo}
      className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-panel-2', activo ? 'text-teal-200' : 'text-atenuado hover:text-texto')}>
      <Table2 className="size-3.5" /> Tabla
    </button>
  );
}

function Indicador({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle?: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border border-borde bg-panel/80 p-4">
      <p className="text-xs text-atenuado">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {detalle && (
        <p className={cn('mt-0.5 flex items-center gap-1 text-xs', alerta ? 'text-amber-300' : 'text-atenuado')}>
          {alerta && <AlertTriangle className="size-3.5" />}{detalle}
        </p>
      )}
    </div>
  );
}

/** Reportes y analítica (M7): indicadores del servicio Python, con exportación a CSV. */
export function PanelReportes() {
  const { modoDemo } = useUsuario();
  const fuente = modoDemo ? fuenteDemo : fuenteAnalitica;
  const [dias, setDias] = useState(90);
  const [datos, setDatos] = useState<DatosReportes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [tablas, setTablas] = useState<Record<string, boolean>>({});
  const [version, setVersion] = useState(0);

  useEffect(() => {
    setCargando(true);
    fuente.cargar(dias)
      .then((d) => { setDatos(d); setError(null); })
      .catch((e: Error) => setError(navigator.onLine ? e.message : 'sin-conexion'))
      .finally(() => setCargando(false));
  }, [fuente, dias, version]);

  const porEtapa = useMemo(() => agruparPorEtapa(datos?.departamentos ?? []), [datos]);
  const alternar = (k: string) => setTablas((t) => ({ ...t, [k]: !t[k] }));

  if (error) {
    return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'Los reportes necesitan conexión' : 'No se pudieron cargar los reportes'}
      texto={error === 'sin-conexion' ? 'Los indicadores se calculan en el servidor con los datos de todos los departamentos.' : `${error}. Verifica que el servicio de analítica esté activo.`}
      accion={<Boton tamano="sm" variante="secundario" onClick={() => setVersion((v) => v + 1)}>Reintentar</Boton>} />;
  }
  if (!datos) return <div className="h-96 animate-pulse rounded-xl bg-panel/60" />;

  const { resumen, sla, tendencia, tiempos, carga, calificaciones } = datos;
  const total = tiempos.find((t) => t.departamento === 'Total');
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-borde p-1" role="group" aria-label="Periodo de los tiempos de ciclo">
          {PERIODOS.map((p) => (
            <button key={p.dias} onClick={() => setDias(p.dias)}
              className={cn('rounded-md px-3 py-1 text-xs transition', dias === p.dias ? 'bg-primario/15 font-medium text-teal-200' : 'text-atenuado hover:text-texto')}>
              {p.etiqueta}
            </button>
          ))}
        </div>
        <Boton tamano="sm" variante="fantasma" onClick={() => setVersion((v) => v + 1)} disabled={cargando}>
          <RefreshCw className={cn('size-4', cargando && 'animate-spin')} /> Actualizar
        </Boton>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Indicador titulo="Solicitudes" valor={String(resumen.total)} detalle={`${resumen.cerradas} cerradas`} />
        <Indicador titulo="En ejecución" valor={String(resumen.en_ejecucion)} detalle="Asignadas, en desarrollo o validación" />
        <Indicador titulo="Prioritarias abiertas" valor={String(resumen.prioritarias)} detalle="Prioridad alta o crítica" />
        <Indicador titulo="Tiempo de entrega" valor={duracion(total?.lead_time_horas ?? resumen.lead_time_horas)} detalle={`Del envío al cierre · ${PERIODOS.find((p) => p.dias === dias)!.etiqueta}`} />
        <Indicador titulo="Cumplimiento de SLA" valor={sla.cumplimiento_pct != null ? `${sla.cumplimiento_pct}%` : '—'}
          detalle={sla.vencidas_abiertas ? `${sla.vencidas_abiertas} vencida(s) sin respuesta` : 'Respuesta dentro del plazo'} alerta={sla.vencidas_abiertas > 0} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Tarjeta titulo="Solicitudes por departamento y etapa"
          acciones={<div className="flex gap-1">
            <BotonTabla activo={!!tablas.deptos} alPulsar={() => alternar('deptos')} />
            <BotonCsv alPulsar={() => descargar(`solicitudes-por-departamento-${hoy}.csv`, aCsv(
              porEtapa.map((d) => ({ departamento: d.departamento, ...d.porEtapa, total: d.total })),
              [{ clave: 'departamento', titulo: 'Departamento' }, ...ETAPAS.map((e) => ({ clave: e.clave, titulo: e.etiqueta })), { clave: 'total', titulo: 'Total' }]))} />
          </div>}>
          {porEtapa.length === 0 ? <p className="text-sm text-atenuado">Sin solicitudes enviadas todavía.</p>
            : tablas.deptos ? (
              <table className="w-full text-xs">
                <thead className="text-atenuado"><tr><th className="py-1 text-left font-normal">Departamento</th>{ETAPAS.map((e) => <th key={e.clave} className="py-1 text-right font-normal">{e.etiqueta}</th>)}<th className="py-1 text-right font-normal">Total</th></tr></thead>
                <tbody className="divide-y divide-borde/40 tabular-nums">
                  {porEtapa.map((d) => (
                    <tr key={d.departamento}><td className="py-1.5">{d.departamento}</td>{ETAPAS.map((e) => <td key={e.clave} className="text-right">{d.porEtapa[e.clave]}</td>)}<td className="text-right font-medium">{d.total}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <BarrasApiladas datos={porEtapa} />}
        </Tarjeta>

        <Tarjeta titulo="Tendencia mensual"
          acciones={<div className="flex gap-1">
            <BotonTabla activo={!!tablas.tendencia} alPulsar={() => alternar('tendencia')} />
            <BotonCsv alPulsar={() => descargar(`tendencia-mensual-${hoy}.csv`, aCsv(tendencia,
              [{ clave: 'mes', titulo: 'Mes' }, { clave: 'creadas', titulo: 'Creadas' }, { clave: 'cerradas', titulo: 'Cerradas' }, { clave: 'rechazadas', titulo: 'Rechazadas' }]))} />
          </div>}>
          {tablas.tendencia ? (
            <table className="w-full text-xs">
              <thead className="text-atenuado"><tr><th className="py-1 text-left font-normal">Mes</th><th className="text-right font-normal">Creadas</th><th className="text-right font-normal">Cerradas</th><th className="text-right font-normal">Rechazadas</th></tr></thead>
              <tbody className="divide-y divide-borde/40 tabular-nums">
                {tendencia.map((t) => <tr key={t.mes}><td className="py-1">{etiquetaMes(t.mes)}</td><td className="text-right">{t.creadas}</td><td className="text-right">{t.cerradas}</td><td className="text-right">{t.rechazadas}</td></tr>)}
              </tbody>
            </table>
          ) : (
            <GraficoLineas meses={tendencia.map((t) => t.mes)} series={[
              { nombre: 'Creadas', color: SERIES[0], valores: tendencia.map((t) => t.creadas) },
              { nombre: 'Cerradas', color: SERIES[1], valores: tendencia.map((t) => t.cerradas) },
              { nombre: 'Rechazadas', color: SERIES[2], valores: tendencia.map((t) => t.rechazadas) },
            ]} />
          )}
        </Tarjeta>

        <Tarjeta titulo="Carga por ingeniero"
          acciones={<BotonCsv alPulsar={() => descargar(`carga-ingenieros-${hoy}.csv`, aCsv(carga, [
            { clave: 'nombre_completo', titulo: 'Ingeniero' }, { clave: 'solicitudes_activas', titulo: 'Solicitudes activas' },
            { clave: 'horas_pendientes', titulo: 'Horas pendientes' }, { clave: 'capacidad_semana', titulo: 'Capacidad semanal' }, { clave: 'carga_pct', titulo: 'Carga %' }]))} />}>
          {carga.length === 0 ? <p className="text-sm text-atenuado">No hay usuarios con rol INGENIERO.</p> : (
            <BarrasSimples maximo={100} formato={(v) => `${v}%`} alerta={(v) => (v >= 100 ? 'Sobrecargado' : null)}
              filas={carga.map((c) => ({
                etiqueta: `${c.nombre_completo} · ${c.solicitudes_activas} activa(s)`, valor: c.carga_pct,
                detalle: `${c.horas_pendientes} h pendientes de ${c.capacidad_semana} h/semana`,
              }))} />
          )}
        </Tarjeta>

        <Tarjeta titulo={`Tiempos de ciclo · ${PERIODOS.find((p) => p.dias === dias)!.etiqueta}`}
          acciones={<BotonCsv alPulsar={() => descargar(`tiempos-ciclo-${dias}d-${hoy}.csv`, aCsv(tiempos, [
            { clave: 'departamento', titulo: 'Departamento' }, { clave: 'cerradas', titulo: 'Cerradas' },
            { clave: 'respuesta_horas', titulo: 'Respuesta (h)' }, { clave: 'lead_time_horas', titulo: 'Entrega total (h)' }, { clave: 'cycle_time_horas', titulo: 'Desarrollo (h)' }]))} />}>
          {!total?.cerradas ? <p className="text-sm text-atenuado">No hay solicitudes cerradas en este periodo.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-atenuado">
                <tr className="border-b border-borde/60">
                  <th className="py-2 font-normal">Departamento</th><th className="py-2 text-right font-normal">Cerradas</th>
                  <th className="py-2 text-right font-normal" title="Del envío a la aprobación">Respuesta</th>
                  <th className="py-2 text-right font-normal" title="Del envío al cierre (lead time)">Entrega</th>
                  <th className="py-2 text-right font-normal" title="Del inicio de desarrollo al cierre (cycle time)">Desarrollo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde/40 tabular-nums">
                {tiempos.map((t) => (
                  <tr key={t.departamento} className={cn(t.departamento === 'Total' && 'font-medium')}>
                    <td className="py-2"><span className="inline-flex items-center gap-1.5">{t.color_hex && <span className="size-2 rounded-full" style={{ background: t.color_hex }} />}{t.departamento}</span></td>
                    <td className="text-right">{t.cerradas}</td>
                    <td className="text-right">{duracion(t.respuesta_horas)}</td>
                    <td className="text-right">{duracion(t.lead_time_horas)}</td>
                    <td className="text-right">{duracion(t.cycle_time_horas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Desempeño y calificaciones"
        acciones={<BotonCsv alPulsar={() => descargar(`calificaciones-ingenieros-${hoy}.csv`, aCsv(calificaciones.ingenieros, [
          { clave: 'nombre_completo', titulo: 'Ingeniero' }, { clave: 'evaluaciones', titulo: 'Evaluaciones' },
          { clave: 'promedio_1a5', titulo: 'Promedio (1-5)' }, { clave: 'promedio_0a10', titulo: 'Promedio (0-10)' }]))} />}>
        {calificaciones.distribucion.every((d) => d.total === 0) && calificaciones.ingenieros.length === 0 ? (
          <p className="text-sm text-atenuado">Aún no hay evaluaciones. Se registran en Gestión → Evaluación.</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-atenuado">Notas (última evaluación por solicitud)</p>
              <ul className="space-y-2">
                {calificaciones.distribucion.map((d) => {
                  const max = Math.max(1, ...calificaciones.distribucion.map((x) => x.total));
                  return (
                    <li key={d.letra} className="flex items-center gap-2 text-xs">
                      <span className="w-9"><InsigniaNota letra={d.letra} /></span>
                      <div className="h-2 flex-1 rounded bg-panel-2"><div className="h-full rounded bg-primario" style={{ width: `${(d.total / max) * 100}%` }} /></div>
                      <span className="w-6 text-right tabular-nums text-atenuado">{d.total}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-atenuado">Por ingeniero (0–10)</p>
              {calificaciones.ingenieros.length === 0 ? <p className="text-xs text-atenuado">Sin calificaciones individuales.</p> : (
                <BarrasSimples maximo={10} formato={(v) => v.toFixed(1)}
                  filas={calificaciones.ingenieros.map((i) => ({ etiqueta: `${i.nombre_completo} · ${i.evaluaciones} eval.`, valor: i.promedio_0a10 }))} />
              )}
            </div>
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-atenuado">Por departamento (0–10)</p>
              {calificaciones.departamentos.length === 0 ? <p className="text-xs text-atenuado">Sin solicitudes evaluadas.</p> : (
                <BarrasSimples maximo={10} formato={(v) => v.toFixed(1)}
                  filas={calificaciones.departamentos.map((d) => ({ etiqueta: `${d.departamento} · ${d.solicitudes_evaluadas}`, valor: d.promedio_global }))} />
              )}
            </div>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
