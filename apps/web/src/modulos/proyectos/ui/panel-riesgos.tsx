'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  ESTADOS_RIESGO, ETIQUETA_ESTADO_RIESGO, ETIQUETA_EXPOSICION, nivelExposicion,
  type DetalleProyecto, type EstadoRiesgo, type NivelExposicion, type RiesgoVista,
} from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { Boton, Tarjeta } from '@/componentes/ui/primitivos';
import type { FuenteProyectos } from '../infraestructura/fuente-proyectos';
import { COLOR_EXPOSICION, InsigniaExposicion } from './comunes';

const ESCALA_P = ['', 'Rara', 'Improbable', 'Posible', 'Probable', 'Casi segura'];
const ESCALA_I = ['', 'Mínimo', 'Menor', 'Moderado', 'Mayor', 'Severo'];
const ACTIVOS: EstadoRiesgo[] = ['ABIERTO', 'MATERIALIZADO'];

/** Matriz probabilidad × impacto (5×5) con el número de riesgos activos en cada celda. */
function Matriz({ riesgos, seleccion, alElegir }: {
  riesgos: RiesgoVista[]; seleccion: { p: number; i: number } | null; alElegir: (c: { p: number; i: number } | null) => void;
}) {
  const activos = riesgos.filter((r) => ACTIVOS.includes(r.estado));
  return (
    <div>
      <div className="flex">
        <div className="flex w-6 items-center justify-center">
          <span className="-rotate-90 whitespace-nowrap text-[11px] text-atenuado">Probabilidad →</span>
        </div>
        <div className="grid flex-1 grid-cols-[auto_repeat(5,minmax(0,1fr))] gap-[3px]">
          {[5, 4, 3, 2, 1].map((p) => (
            <div key={p} className="contents">
              <div className="flex items-center justify-end pr-2 text-[10px] text-atenuado" title={ESCALA_P[p]}>{p}</div>
              {[1, 2, 3, 4, 5].map((i) => {
                const n = activos.filter((r) => r.probabilidad === p && r.impacto === i).length;
                const nivel = nivelExposicion(p, i);
                const elegida = seleccion?.p === p && seleccion?.i === i;
                return (
                  <button key={i} type="button" onClick={() => alElegir(elegida ? null : { p, i })}
                    aria-label={`Probabilidad ${p} (${ESCALA_P[p]}), impacto ${i} (${ESCALA_I[i]}): ${n} riesgo(s), nivel ${ETIQUETA_EXPOSICION[nivel]}`}
                    className={cn('flex aspect-[4/3] items-center justify-center rounded text-sm font-semibold tabular-nums transition',
                      COLOR_EXPOSICION[nivel].celda, n ? COLOR_EXPOSICION[nivel].texto : 'text-transparent',
                      elegida ? 'ring-2 ring-primario' : 'hover:ring-1 hover:ring-borde-fuerte')}>
                    {n || '·'}
                  </button>
                );
              })}
            </div>
          ))}
          <div />
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="pt-1 text-center text-[10px] text-atenuado" title={ESCALA_I[i]}>{i}</div>)}
        </div>
      </div>
      <p className="mt-1 text-center text-[11px] text-atenuado">Impacto →</p>
      <ul className="mt-3 flex flex-wrap justify-center gap-3 text-[11px] text-atenuado">
        {(['BAJO', 'MEDIO', 'ALTO', 'CRITICO'] as NivelExposicion[]).map((n) => (
          <li key={n} className="inline-flex items-center gap-1.5"><span className={cn('size-2.5 rounded-sm', COLOR_EXPOSICION[n].punto)} />{ETIQUETA_EXPOSICION[n]}</li>
        ))}
      </ul>
    </div>
  );
}

function Escala({ valor, onChange, etiquetas, nombre }: { valor: number; onChange: (v: number) => void; etiquetas: string[]; nombre: string }) {
  return (
    <div role="radiogroup" aria-label={nombre} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} title={etiquetas[n]} onClick={() => onChange(n)}
          className={cn('h-8 flex-1 rounded-md border text-xs transition', valor === n ? 'border-primario bg-primario/20 font-semibold' : 'border-borde hover:border-borde-fuerte')}>
          {n}
        </button>
      ))}
    </div>
  );
}

type Persona = { id: string; nombre: string };

function FormularioRiesgo({ inicial, proyecto, responsables, alGuardar, alCancelar }: {
  inicial?: RiesgoVista; proyecto: DetalleProyecto; responsables: Persona[]; alGuardar: (d: Omit<RiesgoVista, 'id' | 'exposicion' | 'responsable' | 'solicitudCodigo' | 'version' | 'actualizadoEn' | 'estado'> & { estado?: EstadoRiesgo }) => Promise<void>; alCancelar: () => void;
}) {
  const [f, setF] = useState({
    titulo: inicial?.titulo ?? '', descripcion: inicial?.descripcion ?? '', probabilidad: inicial?.probabilidad ?? 3,
    impacto: inicial?.impacto ?? 3, planMitigacion: inicial?.planMitigacion ?? '', solicitudId: inicial?.solicitudId ?? '',
    responsableId: inicial?.responsableId ?? '', estado: inicial?.estado ?? ('ABIERTO' as EstadoRiesgo),
  });
  const [guardando, setGuardando] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await alGuardar({
        titulo: f.titulo.trim(), descripcion: f.descripcion.trim() || null, probabilidad: f.probabilidad, impacto: f.impacto,
        planMitigacion: f.planMitigacion.trim() || null, solicitudId: f.solicitudId || null, responsableId: f.responsableId || null,
        ...(inicial ? { estado: f.estado } : {}),
      });
    } finally {
      setGuardando(false);
    }
  };
  return (
    <form onSubmit={enviar} className="space-y-3 rounded-lg border border-borde bg-fondo/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{inicial ? 'Editar riesgo' : 'Nuevo riesgo'}</p>
        <button type="button" onClick={alCancelar} aria-label="Cancelar"><X className="size-4 text-atenuado" /></button>
      </div>
      <input required minLength={3} maxLength={200} className="campo" placeholder="¿Qué podría pasar?" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div><span className="etiqueta">Probabilidad · {ESCALA_P[f.probabilidad]}</span>
          <Escala nombre="Probabilidad" valor={f.probabilidad} etiquetas={ESCALA_P} onChange={(v) => setF({ ...f, probabilidad: v })} /></div>
        <div><span className="etiqueta">Impacto · {ESCALA_I[f.impacto]}</span>
          <Escala nombre="Impacto" valor={f.impacto} etiquetas={ESCALA_I} onChange={(v) => setF({ ...f, impacto: v })} /></div>
      </div>
      <p className="text-xs text-atenuado">Exposición: <InsigniaExposicion probabilidad={f.probabilidad} impacto={f.impacto} /></p>
      <textarea rows={2} className="campo resize-y" placeholder="Plan de mitigación (qué se hará para reducirlo)" value={f.planMitigacion} onChange={(e) => setF({ ...f, planMitigacion: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-3">
        <select className="campo" aria-label="Solicitud relacionada" value={f.solicitudId} onChange={(e) => setF({ ...f, solicitudId: e.target.value })}>
          <option value="">Todo el proyecto</option>
          {proyecto.solicitudesDetalle.map((s) => <option key={s.id} value={s.id}>{s.codigo} · {s.titulo}</option>)}
        </select>
        <select className="campo" aria-label="Responsable" value={f.responsableId} onChange={(e) => setF({ ...f, responsableId: e.target.value })}>
          <option value="">Sin responsable</option>
          {responsables.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {inicial && (
          <select className="campo" aria-label="Estado del riesgo" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as EstadoRiesgo })}>
            {ESTADOS_RIESGO.map((s) => <option key={s} value={s}>{ETIQUETA_ESTADO_RIESGO[s]}</option>)}
          </select>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Boton type="button" variante="fantasma" tamano="sm" onClick={alCancelar}>Cancelar</Boton>
        <Boton type="submit" tamano="sm" disabled={guardando || f.titulo.trim().length < 3}>{guardando && <Loader2 className="size-4 animate-spin" />}Guardar</Boton>
      </div>
    </form>
  );
}

export function PanelRiesgos({ proyecto, responsables, fuente, alCambiar }: {
  proyecto: DetalleProyecto; responsables: Persona[]; fuente: FuenteProyectos; alCambiar: () => Promise<void>;
}) {
  const [celda, setCelda] = useState<{ p: number; i: number } | null>(null);
  const [editando, setEditando] = useState<RiesgoVista | 'nuevo' | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);

  const lista = proyecto.riesgos
    .filter((r) => verCerrados || ACTIVOS.includes(r.estado))
    .filter((r) => !celda || (r.probabilidad === celda.p && r.impacto === celda.i));

  const ejecutar = async (accion: () => Promise<unknown>, ok: string) => {
    try {
      await accion();
      toast.success(ok);
      setEditando(null);
      await alCambiar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
      <Tarjeta titulo="Matriz de riesgos activos">
        <Matriz riesgos={proyecto.riesgos} seleccion={celda} alElegir={setCelda} />
        {celda && <button onClick={() => setCelda(null)} className="mt-3 w-full text-center text-xs text-primario hover:underline">Quitar filtro de la celda</button>}
      </Tarjeta>

      <Tarjeta titulo={`Registro de riesgos (${lista.length})`} cuerpoClassName="p-0"
        acciones={<div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-atenuado">
            <input type="checkbox" className="size-3.5 accent-teal-500" checked={verCerrados} onChange={(e) => setVerCerrados(e.target.checked)} />Ver mitigados y cerrados
          </label>
          {editando === null && <Boton tamano="sm" variante="secundario" onClick={() => setEditando('nuevo')}><Plus className="size-4" /> Riesgo</Boton>}
        </div>}>
        {editando === 'nuevo' && (
          <div className="border-b border-borde/60 p-4">
            <FormularioRiesgo proyecto={proyecto} responsables={responsables} alCancelar={() => setEditando(null)}
              alGuardar={(d) => ejecutar(() => fuente.crearRiesgo(proyecto.id, d), 'Riesgo registrado')} />
          </div>
        )}
        {lista.length === 0 && editando !== 'nuevo' ? (
          <p className="px-5 py-10 text-center text-sm text-atenuado">{celda ? 'No hay riesgos activos en esta celda.' : 'Sin riesgos activos registrados.'}</p>
        ) : (
          <ul className="divide-y divide-borde/50">
            {lista.map((r) => editando !== 'nuevo' && editando?.id === r.id ? (
              <li key={r.id} className="p-4">
                <FormularioRiesgo inicial={r} proyecto={proyecto} responsables={responsables} alCancelar={() => setEditando(null)}
                  alGuardar={(d) => ejecutar(() => fuente.actualizarRiesgo(r.id, { ...d, version: r.version }), 'Riesgo actualizado')} />
              </li>
            ) : (
              <li key={r.id} className={cn('flex items-start gap-3 px-5 py-3', !ACTIVOS.includes(r.estado) && 'opacity-60')}>
                <InsigniaExposicion probabilidad={r.probabilidad} impacto={r.impacto} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.titulo}</p>
                  <p className="text-xs text-atenuado">
                    P{r.probabilidad} × I{r.impacto} · {ETIQUETA_ESTADO_RIESGO[r.estado]}
                    {r.solicitudCodigo && ` · ${r.solicitudCodigo}`}{r.responsable && ` · ${r.responsable}`}
                  </p>
                  {r.planMitigacion && <p className="mt-1 text-xs"><span className="text-atenuado">Mitigación:</span> {r.planMitigacion}</p>}
                </div>
                <button onClick={() => setEditando(r)} aria-label={`Editar ${r.titulo}`} className="rounded p-1.5 text-atenuado hover:bg-panel-2 hover:text-texto"><Pencil className="size-4" /></button>
                <button onClick={() => ejecutar(() => fuente.eliminarRiesgo(r.id), 'Riesgo eliminado')} aria-label={`Eliminar ${r.titulo}`}
                  className="rounded p-1.5 text-atenuado hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}
