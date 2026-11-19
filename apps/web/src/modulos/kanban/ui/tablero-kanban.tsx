'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { MoreHorizontal, X } from 'lucide-react';
import { ETIQUETA_ESTADO, transicionesDisponibles, type EstadoSolicitud, type ReglaTransicion } from '@sierraflow/contratos';
import { dbLocal, type SolicitudLocal } from '@/lib/offline/db';
import { cn } from '@/lib/utils';
import { Avatar, BarraProgreso, Boton } from '@/componentes/ui/primitivos';
import { useActor } from '@/componentes/layout/proveedores';
import { cambiarEstado } from '@/modulos/solicitudes/aplicacion/casos-uso';
import { InsigniaPrioridad } from '@/modulos/solicitudes/ui/insignias';

const COLUMNAS: EstadoSolicitud[] = ['ENVIADA', 'EN_REVISION', 'APROBADA', 'ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION', 'CERRADA'];

interface Pendiente { solicitud: SolicitudLocal; regla: ReglaTransicion }

export function TableroKanban() {
  const actor = useActor();
  const router = useRouter();
  const [depto, setDepto] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [texto, setTexto] = useState('');
  const [arrastrando, setArrastrando] = useState<SolicitudLocal | null>(null);
  const [sobre, setSobre] = useState<EstadoSolicitud | null>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [comentario, setComentario] = useState('');
  const [menuAbierto, setMenuAbierto] = useState<string | null>(null);

  const todas = useLiveQuery(() => dbLocal.solicitudes.where('estado').anyOf(COLUMNAS).toArray(), []) ?? [];
  const departamentos = useMemo(() => {
    const m = new Map<string, string>();
    todas.forEach((s) => m.set(s.departamento, s.departamentoColor ?? '#64748b'));
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'));
  }, [todas]);

  const q = texto.trim().toLowerCase();
  const visibles = todas.filter((s) =>
    (!depto || s.departamento === depto) && (!prioridad || s.prioridad === prioridad) &&
    (!q || s.titulo.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)));

  const reglaHacia = (s: SolicitudLocal, hacia: EstadoSolicitud) =>
    transicionesDisponibles(s.estado, actor.roles).find((r) => r.hacia === hacia);

  const mover = async (s: SolicitudLocal, regla: ReglaTransicion, coment?: string) => {
    if (regla.hacia === 'ASIGNADA') {
      router.push(`/gestion/asignacion?solicitud=${s.id}`);
      return;
    }
    if (regla.requiereComentario && !coment) {
      setComentario(''); setPendiente({ solicitud: s, regla });
      return;
    }
    try {
      await cambiarEstado(s.id, regla.hacia, actor, coment);
      toast.success(`${s.codigo} → ${ETIQUETA_ESTADO[regla.hacia]}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const soltar = (col: EstadoSolicitud) => {
    const s = arrastrando;
    setArrastrando(null); setSobre(null);
    if (!s || s.estado === col) return;
    const regla = reglaHacia(s, col);
    if (!regla) {
      toast.error(`No puede pasar de ${ETIQUETA_ESTADO[s.estado]} a ${ETIQUETA_ESTADO[col]} con su rol`);
      return;
    }
    void mover(s, regla);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar código o título" className="campo h-9 w-56 py-0 text-sm" />
        <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="campo h-9 w-auto py-0 text-sm">
          <option value="">Todas las prioridades</option>
          {['CRITICA', 'ALTA', 'MEDIA', 'BAJA'].map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
        </select>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setDepto('')} className={cn('rounded-full border px-3 py-1 text-xs', !depto ? 'border-primario bg-primario/15' : 'border-borde text-atenuado')}>Todos</button>
          {departamentos.map(([d, color]) => (
            <button key={d} onClick={() => setDepto(depto === d ? '' : d)}
              className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs', depto === d ? 'border-primario bg-primario/15' : 'border-borde text-atenuado')}>
              <span className="size-2 rounded-full" style={{ background: color }} />{d}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3">
        {COLUMNAS.map((col) => {
          const tarjetas = visibles.filter((s) => s.estado === col);
          const valida = arrastrando && arrastrando.estado !== col ? !!reglaHacia(arrastrando, col) : null;
          return (
            <section key={col} aria-label={ETIQUETA_ESTADO[col]}
              onDragOver={(e) => { if (valida) { e.preventDefault(); setSobre(col); } }}
              onDragLeave={() => setSobre((x) => (x === col ? null : x))}
              onDrop={(e) => { e.preventDefault(); soltar(col); }}
              className={cn('flex w-72 shrink-0 flex-col rounded-xl border bg-panel/60 transition',
                sobre === col ? 'border-primario bg-primario/5' : 'border-borde/70',
                arrastrando && valida === false && 'opacity-50')}>
              <header className="flex items-center justify-between px-3 py-2.5">
                <h3 className="text-sm font-medium">{ETIQUETA_ESTADO[col]}</h3>
                <span className="rounded-md bg-panel-2 px-1.5 text-xs tabular-nums text-atenuado">{tarjetas.length}</span>
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {tarjetas.map((s) => {
                  const opciones = transicionesDisponibles(s.estado, actor.roles);
                  return (
                    <li key={s.id} draggable={opciones.length > 0}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setArrastrando(s); }}
                      onDragEnd={() => { setArrastrando(null); setSobre(null); }}
                      className={cn('relative rounded-lg border border-borde/70 bg-panel-2/70 p-3 text-sm shadow-sm',
                        opciones.length > 0 && 'cursor-grab active:cursor-grabbing', arrastrando?.id === s.id && 'opacity-40')}
                      style={{ borderLeft: `4px solid ${s.departamentoColor ?? '#64748b'}` }}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono text-sky-300">{s.codigo}</span>
                        <div className="flex items-center gap-1">
                          <InsigniaPrioridad prioridad={s.prioridad} />
                          {opciones.length > 0 && (
                            <button aria-label="Mover a…" onClick={() => setMenuAbierto(menuAbierto === s.id ? null : s.id)}
                              className="rounded p-0.5 text-atenuado hover:bg-panel hover:text-texto"><MoreHorizontal className="size-4" /></button>
                          )}
                        </div>
                      </div>
                      {menuAbierto === s.id && (
                        <div className="absolute right-2 top-8 z-10 w-48 rounded-lg border border-borde bg-panel p-1 shadow-xl">
                          <p className="px-2 py-1 text-[11px] text-atenuado">Mover a…</p>
                          {opciones.map((r) => (
                            <button key={r.hacia} onClick={() => { setMenuAbierto(null); void mover(s, r); }}
                              className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-panel-2">
                              {r.accion} <span className="text-atenuado">→ {ETIQUETA_ESTADO[r.hacia]}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <Link href={`/solicitudes/${s.id}`} className="mt-1.5 line-clamp-2 block font-medium hover:text-teal-200">{s.titulo}</Link>
                      <p className="mt-1 text-[11px] text-atenuado">{s.departamento}</p>
                      {['ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'].includes(s.estado) && (
                        <BarraProgreso valor={s.avancePct} className="mt-2" />
                      )}
                      {s.asignados.length > 0 && (
                        <div className="mt-2 flex -space-x-1.5">
                          {s.asignados.slice(0, 4).map((a) => <Avatar key={a.nombre} nombre={a.nombre} className="size-6 text-[10px] ring-2 ring-panel" />)}
                          {s.asignados.length > 4 && <span className="pl-3 text-[11px] text-atenuado">+{s.asignados.length - 4}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {pendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-borde bg-panel p-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{pendiente.regla.accion}</h3>
                <p className="text-xs text-atenuado">{pendiente.solicitud.codigo} → {ETIQUETA_ESTADO[pendiente.regla.hacia]}</p>
              </div>
              <button onClick={() => setPendiente(null)} aria-label="Cerrar"><X className="size-4" /></button>
            </div>
            <textarea autoFocus rows={4} className="campo mt-4 resize-y" value={comentario} onChange={(e) => setComentario(e.target.value)}
              placeholder="Esta acción requiere un comentario" />
            <div className="mt-4 flex justify-end gap-2">
              <Boton variante="secundario" onClick={() => setPendiente(null)}>Cancelar</Boton>
              <Boton disabled={!comentario.trim()} onClick={() => { const p = pendiente; setPendiente(null); void mover(p.solicitud, p.regla, comentario.trim()); }}>
                Confirmar
              </Boton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
