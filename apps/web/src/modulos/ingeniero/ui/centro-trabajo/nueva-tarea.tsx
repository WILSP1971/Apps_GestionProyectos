'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';
import { esquemaNuevaTarea, type ContextoTrabajo, type OpcionesNuevaTarea } from '@sierraflow/contratos';
import { Boton } from '@/componentes/ui/primitivos';
import type { Actor, FuenteAvances } from '../../infraestructura/fuente-avances';

/**
 * El ingeniero propone una tarea propia en una solicitud de su equipo o en un proyecto donde participa.
 * Queda a su nombre; el líder la ve en Evaluación y puede ajustarla o reasignarla.
 */
export function NuevaTarea({ fuente, actor, contextoInicial, alCrear, alCerrar }: {
  fuente: FuenteAvances; actor: Actor; contextoInicial?: string | null; alCrear: () => void; alCerrar: () => void;
}) {
  const [opciones, setOpciones] = useState<OpcionesNuevaTarea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ contexto: contextoInicial ?? '', titulo: '', descripcion: '', grupoId: '', peso: '2', horas: '', inicio: '', fin: '', subtareas: '' });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fuente.opciones(actor).then((o) => {
      setOpciones(o);
      setF((x) => ({ ...x, contexto: o.contextos.some((c) => clave(c) === x.contexto) ? x.contexto : o.contextos[0] ? clave(o.contextos[0]) : '' }));
    }).catch((e) => setError((e as Error).message));
  }, [fuente, actor]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  const fechasMal = !!f.inicio && !!f.fin && f.fin < f.inicio;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    const ctx = opciones?.contextos.find((c) => clave(c) === f.contexto);
    if (!ctx) return;
    const datos = esquemaNuevaTarea.safeParse({
      titulo: f.titulo, descripcion: f.descripcion.trim() || undefined, grupoId: f.grupoId || null, peso: Number(f.peso),
      horasEstimadas: f.horas ? Number(f.horas.replace(',', '.')) : null, fechaInicio: f.inicio || null, fechaFinPlan: f.fin || null,
    });
    if (!datos.success) { toast.error(datos.error.issues[0]?.message ?? 'Revisa los datos'); return; }
    setGuardando(true);
    try {
      const id = await fuente.crearTarea(ctx, datos.data, actor);
      // Checklist inicial (una subtarea por línea)
      const lineas = f.subtareas.split('\n').map((l) => l.replace(/^[-*•\s]+/, '').trim()).filter((l) => l.length >= 2).slice(0, 20);
      for (const l of lineas) await fuente.crearSubtarea(id, l, actor);
      toast.success('Tarea creada: ya aparece en tu lista');
      alCrear();
    } catch (err) {
      toast.error((err as Error).message);
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Nueva tarea">
      <button type="button" aria-label="Cerrar" tabIndex={-1} onClick={alCerrar} className="entrada-fondo absolute inset-0 bg-black/60" />
      <form onSubmit={enviar} className="entrada-subir relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-borde bg-panel p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nueva tarea</h2>
          <button type="button" onClick={alCerrar} aria-label="Cerrar"><X className="size-5 text-atenuado" /></button>
        </div>
        <p className="mb-5 text-sm text-atenuado">Queda a tu nombre. El líder técnico la verá en Evaluación y puede ajustarla o reasignarla.</p>

        {error ? <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>
          : !opciones ? <div className="h-48 animate-pulse rounded-xl bg-panel-2/60" />
          : !opciones.contextos.length ? (
            <p className="rounded-lg border border-dashed border-borde p-6 text-center text-sm text-atenuado">
              No tienes solicitudes en curso ni proyectos activos donde crear tareas. Pídele al líder que te asigne a una.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2"><span className="etiqueta">¿Dónde?</span>
                <select className="campo" required {...campo('contexto')}>
                  <optgroup label="Solicitudes de mi equipo">
                    {opciones.contextos.filter((c) => c.tipo === 'SOLICITUD').map((c) => (
                      <option key={clave(c)} value={clave(c)}>{c.codigo} · {c.titulo}{c.proyecto ? ` (${c.proyecto})` : ''}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Mis proyectos (tareas del proyecto)">
                    {opciones.contextos.filter((c) => c.tipo === 'PROYECTO').map((c) => (
                      <option key={clave(c)} value={clave(c)}>{c.codigo} · {c.titulo}</option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <label className="sm:col-span-2"><span className="etiqueta">Título</span>
                <input required minLength={3} maxLength={200} autoFocus className="campo" {...campo('titulo')} placeholder="Ej.: Configurar base de datos local IndexedDB" /></label>
              <label className="sm:col-span-2"><span className="etiqueta">Descripción <span className="text-atenuado">(opcional)</span></span>
                <textarea rows={2} maxLength={4000} className="campo resize-y" {...campo('descripcion')} /></label>
              <label><span className="etiqueta">Frente</span>
                <select className="campo" {...campo('grupoId')}>
                  <option value="">Sin frente</option>
                  {opciones.grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                </select>
              </label>
              <label><span className="etiqueta">Peso en el avance</span>
                <select className="campo" {...campo('peso')}>
                  {[1, 2, 3, 5, 8].map((p) => <option key={p} value={p}>{p} {p === 1 ? '· pequeña' : p >= 5 ? '· grande' : ''}</option>)}
                </select>
              </label>
              <label><span className="etiqueta">Inicio</span><input type="date" className="campo" {...campo('inicio')} /></label>
              <label><span className="etiqueta">Entrega</span><input type="date" className="campo" min={f.inicio || undefined} {...campo('fin')} /></label>
              {fechasMal && <p className="text-xs text-red-300 sm:col-span-2">La entrega no puede ser anterior al inicio.</p>}
              <label><span className="etiqueta">Horas estimadas</span>
                <input inputMode="decimal" className="campo" {...campo('horas')} placeholder="Ej.: 16" /></label>
              <label className="sm:col-span-2"><span className="etiqueta">Checklist inicial <span className="text-atenuado">(una subtarea por línea, opcional)</span></span>
                <textarea rows={3} className="campo resize-y font-mono text-xs" {...campo('subtareas')}
                  placeholder={'Esquema inicial en IndexedDB\nRepositorios locales\nPruebas sin conexión'} /></label>
            </div>
          )}

        <div className="mt-6 flex justify-end gap-2">
          <Boton type="button" variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" disabled={guardando || !opciones?.contextos.length || fechasMal || f.titulo.trim().length < 3}>
            {guardando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}Crear tarea
          </Boton>
        </div>
      </form>
    </div>
  );
}

const clave = (c: ContextoTrabajo) => `${c.tipo}:${c.id}`;
