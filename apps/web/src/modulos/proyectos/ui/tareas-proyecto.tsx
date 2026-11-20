'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import {
  ESTADOS_TAREA, ETIQUETA_ESTADO_TAREA,
  type CatalogosProyecto, type DetalleProyecto, type EstadoTarea, type TareaVista,
} from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { BarraProgreso, Boton, Tarjeta } from '@/componentes/ui/primitivos';
import { useActor } from '@/componentes/layout/proveedores';
import type { FuenteProyectos } from '../infraestructura/fuente-proyectos';
import { fechaCorta } from './comunes';

const COLOR_ESTADO: Record<EstadoTarea, string> = {
  PENDIENTE: 'text-atenuado', EN_PROGRESO: 'text-sky-300', BLOQUEADA: 'text-red-300', COMPLETADA: 'text-emerald-300',
};

/**
 * Regla 3: tareas propias del proyecto, que no vienen de una solicitud (gestión, capacitación, despliegue,
 * migración de datos…). Cuentan en el avance, en las horas/costo y en el Gantt del proyecto.
 */
export function TareasProyecto({ proyecto, catalogos, fuente, alCambiar }: {
  proyecto: DetalleProyecto; catalogos: CatalogosProyecto | null; fuente: FuenteProyectos; alCambiar: () => Promise<void>;
}) {
  const actor = useActor();
  const abierto = !['CERRADO', 'CANCELADO'].includes(proyecto.estado);
  const gestiona = actor.roles.some((r) => r === 'LIDER' || r === 'DIRECTOR' || r === 'ADMIN');
  const [nueva, setNueva] = useState(false);

  return (
    <Tarjeta titulo={`Tareas del proyecto (${proyecto.tareasProyecto.length})`} cuerpoClassName="p-0"
      acciones={gestiona && abierto && !nueva && (
        <Boton tamano="sm" variante="secundario" onClick={() => setNueva(true)}><Plus className="size-4" /> Tarea del proyecto</Boton>
      )}>
      {nueva && <Formulario proyecto={proyecto} catalogos={catalogos} fuente={fuente}
        alTerminar={async (ok) => { setNueva(false); if (ok) await alCambiar(); }} />}
      {proyecto.tareasProyecto.length === 0 && !nueva ? (
        <p className="px-5 py-6 text-sm text-atenuado">
          Actividades que no son de una solicitud: gestión, capacitación, despliegue, migración de datos…
          Suman al avance, a las horas y al costo del proyecto.
        </p>
      ) : (
        <ul className="divide-y divide-borde/50">
          {proyecto.tareasProyecto.map((t) => (
            <Fila key={`${t.id}:${t.version}`} tarea={t} fuente={fuente} alCambiar={alCambiar}
              editable={abierto && (gestiona || t.responsableId === actor.id)} puedeEliminar={abierto && gestiona} />
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function Fila({ tarea: t, fuente, alCambiar, editable, puedeEliminar }: {
  tarea: TareaVista; fuente: FuenteProyectos; alCambiar: () => Promise<void>; editable: boolean; puedeEliminar: boolean;
}) {
  const [avance, setAvance] = useState(String(Math.round(t.avancePct)));
  const [horas, setHoras] = useState(String(t.horasReales));
  const [guardando, setGuardando] = useState(false);
  const ejecutar = async (accion: () => Promise<unknown>) => {
    setGuardando(true);
    try {
      await accion();
      await alCambiar();
    } catch (e) {
      toast.error((e as Error).message);
      setAvance(String(Math.round(t.avancePct))); setHoras(String(t.horasReales));
      setGuardando(false);
    }
  };
  const confirmarAvance = () => {
    const v = Math.max(0, Math.min(100, Number(avance) || 0));
    if (v !== Math.round(t.avancePct)) void ejecutar(() => fuente.actualizarTareaProyecto(t.id, { version: t.version, avancePct: v }));
  };
  const confirmarHoras = () => {
    const v = Math.max(0, Number(horas) || 0);
    if (v !== t.horasReales) void ejecutar(() => fuente.actualizarTareaProyecto(t.id, { version: t.version, horasReales: v }));
  };

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-60">
          <p className="text-sm font-medium">{t.titulo}</p>
          <p className="text-xs text-atenuado">
            {t.grupo ?? 'Sin frente'} · {t.responsable ?? 'Sin responsable'} · peso {t.peso}
            {(t.fechaInicio || t.fechaFinPlan) && ` · ${fechaCorta(t.fechaInicio)} → ${fechaCorta(t.fechaFinPlan)}`}
          </p>
        </div>
        {editable ? (
          <>
            <select aria-label="Estado" className={cn('campo h-8 w-36 py-0 text-xs', COLOR_ESTADO[t.estado])} value={t.estado} disabled={guardando}
              onChange={(e) => void ejecutar(() => fuente.actualizarTareaProyecto(t.id, { version: t.version, estado: e.target.value as EstadoTarea }))}>
              {ESTADOS_TAREA.map((e) => <option key={e} value={e}>{ETIQUETA_ESTADO_TAREA[e]}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-atenuado">
              <input type="number" min={0} max={100} step={5} value={avance} disabled={guardando} aria-label="Avance %"
                onChange={(e) => setAvance(e.target.value)} onBlur={confirmarAvance}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} className="campo h-8 w-16 py-0 text-right text-xs" />%
            </label>
            <label className="flex items-center gap-1.5 text-xs text-atenuado">
              <input type="number" min={0} step={0.5} value={horas} disabled={guardando} aria-label="Horas reales"
                onChange={(e) => setHoras(e.target.value)} onBlur={confirmarHoras}
                onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} className="campo h-8 w-16 py-0 text-right text-xs" />h
            </label>
          </>
        ) : (
          <span className={cn('text-xs', COLOR_ESTADO[t.estado])}>{ETIQUETA_ESTADO_TAREA[t.estado]} · {Math.round(t.avancePct)}%</span>
        )}
        {puedeEliminar && (
          <button onClick={() => void ejecutar(() => fuente.eliminarTareaProyecto(t.id, t.version))} disabled={guardando} aria-label={`Eliminar ${t.titulo}`}
            className="rounded p-1.5 text-atenuado hover:bg-red-500/10 hover:text-red-300"><Trash2 className="size-4" /></button>
        )}
        {guardando && <Loader2 className="size-4 animate-spin text-atenuado" />}
      </div>
      <BarraProgreso valor={t.avancePct} className="mt-2 h-1"
        color={t.estado === 'BLOQUEADA' ? 'bg-red-500' : t.estado === 'COMPLETADA' ? 'bg-emerald-500' : undefined} />
    </li>
  );
}

function Formulario({ proyecto, catalogos, fuente, alTerminar }: {
  proyecto: DetalleProyecto; catalogos: CatalogosProyecto | null; fuente: FuenteProyectos; alTerminar: (ok: boolean) => Promise<void>;
}) {
  const [f, setF] = useState({ titulo: '', grupoId: '', responsableId: '', peso: '1', horas: '', inicio: '', fin: '' });
  const [guardando, setGuardando] = useState(false);
  const fechasMal = !!f.inicio && !!f.fin && f.fin < f.inicio;
  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await fuente.crearTareaProyecto(proyecto.id, {
        titulo: f.titulo.trim(), grupoId: f.grupoId || null, responsableId: f.responsableId || null, peso: Number(f.peso) || 1,
        horasEstimadas: f.horas ? Number(f.horas) : null, fechaInicio: f.inicio || null, fechaFinPlan: f.fin || null,
      });
      toast.success('Tarea del proyecto creada');
      await alTerminar(true);
    } catch (err) {
      toast.error((err as Error).message);
      setGuardando(false);
    }
  };
  return (
    <form onSubmit={crear} className="grid gap-3 border-b border-borde/60 bg-fondo/30 px-5 py-4 sm:grid-cols-6">
      <div className="flex items-center gap-2 sm:col-span-6">
        <input autoFocus required minLength={3} maxLength={200} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })}
          placeholder="Ej.: Capacitación a usuarios finales, despliegue en producción…" className="campo flex-1" />
        <button type="button" onClick={() => void alTerminar(false)} aria-label="Cancelar"><X className="size-4 text-atenuado" /></button>
      </div>
      <select value={f.grupoId} onChange={(e) => setF({ ...f, grupoId: e.target.value })} className="campo sm:col-span-2" aria-label="Frente">
        <option value="">Sin frente</option>
        {catalogos?.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
      </select>
      <select value={f.responsableId} onChange={(e) => setF({ ...f, responsableId: e.target.value })} className="campo sm:col-span-2" aria-label="Responsable">
        <option value="">Sin responsable</option>
        {catalogos?.responsables.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
      </select>
      <label className="flex items-center gap-2 text-xs text-atenuado sm:col-span-2">Peso
        <input type="number" min={1} max={10} value={f.peso} onChange={(e) => setF({ ...f, peso: e.target.value })} className="campo w-20" /></label>
      <label className="flex items-center gap-2 text-xs text-atenuado sm:col-span-2">Horas est.
        <input type="number" min={0} step={0.5} value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} className="campo" /></label>
      <label className="flex items-center gap-2 text-xs text-atenuado sm:col-span-2">Inicio
        <input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} className="campo" /></label>
      <label className="flex items-center gap-2 text-xs text-atenuado sm:col-span-2">Entrega
        <input type="date" min={f.inicio || undefined} value={f.fin} onChange={(e) => setF({ ...f, fin: e.target.value })} className="campo" /></label>
      <div className="flex items-center justify-end gap-2 sm:col-span-6">
        {fechasMal && <span className="mr-auto text-xs text-red-300">La entrega debe ser posterior al inicio</span>}
        <Boton type="submit" tamano="sm" disabled={guardando || f.titulo.trim().length < 3 || fechasMal}>
          {guardando && <Loader2 className="size-4 animate-spin" />}Crear tarea
        </Boton>
      </div>
    </form>
  );
}
