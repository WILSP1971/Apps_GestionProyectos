'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Sparkles, UserPlus, X } from 'lucide-react';
import type { IngenieroCarga } from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { Avatar, BarraProgreso, Boton } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import type { NivelCarga, Puntuacion } from '../dominio/recomendacion';

type Recomendado = IngenieroCarga & { puntuacion: Puntuacion };

const COLOR_CARGA: Record<NivelCarga, string> = {
  baja: 'bg-emerald-500', media: 'bg-sky-500', alta: 'bg-amber-500', sobrecargado: 'bg-red-500',
};

/**
 * Agregar ingenieros a una solicitud en curso: muestra los que aún no están en el equipo, ordenados
 * por afinidad con las tecnologías y por carga, y los agrega en un solo paso.
 */
export function DialogoAgregarIngenieros({ candidatos, codigo, alAgregar, alCerrar }: {
  candidatos: Recomendado[]; codigo: string; alAgregar: (ids: string[]) => Promise<void>; alCerrar: () => void;
}) {
  const { rolesVista } = useUsuario();
  const [filtro, setFiltro] = useState('');
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [alCerrar]);

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return candidatos.filter((i) => !q || i.nombre.toLowerCase().includes(q) || i.tecnologias.some((t) => t.toLowerCase().includes(q))
      || i.grupos.some((g) => g.toLowerCase().includes(q)));
  }, [candidatos, filtro]);
  const alternar = (id: string) => setElegidos((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Agregar ingenieros">
      <button type="button" tabIndex={-1} aria-label="Cerrar" onClick={alCerrar} className="entrada-fondo absolute inset-0 bg-black/60" />
      <div className="entrada-subir relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-borde bg-panel shadow-2xl">
        <div className="border-b border-borde/70 px-6 pb-4 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold"><UserPlus className="size-5 text-primario" />Agregar ingenieros a {codigo}</h2>
              <p className="mt-1 text-sm text-atenuado">Los recomendados dominan las tecnologías de la solicitud y tienen carga disponible.</p>
            </div>
            <button type="button" onClick={alCerrar} aria-label="Cerrar"><X className="size-5 text-atenuado" /></button>
          </div>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />
            <input autoFocus value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por nombre, grupo o tecnología"
              className="campo h-9 pl-9 text-sm" aria-label="Buscar ingenieros" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {candidatos.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-atenuado">
              <p className="font-medium text-texto">Todos los ingenieros registrados ya están en el equipo.</p>
              {rolesVista.includes('ADMIN')
                ? <p className="mt-1">Puedes registrar más en <Link href="/administracion/usuarios" className="text-primario hover:underline">Usuarios y equipos → Agregar usuario</Link>.</p>
                : <p className="mt-1">Pide al administrador que registre más ingenieros en Usuarios y equipos.</p>}
            </div>
          ) : visibles.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-atenuado">Ningún ingeniero coincide con la búsqueda.</p>
          ) : (
            <ul className="divide-y divide-borde/50">
              {visibles.map((i, idx) => {
                const sel = elegidos.includes(i.usuarioId);
                const recomendado = idx < 3 && !filtro && i.puntuacion.puntaje >= 50 && i.puntuacion.nivel !== 'sobrecargado';
                return (
                  <li key={i.usuarioId}>
                    <label className={cn('flex cursor-pointer items-center gap-3 px-6 py-3 transition hover:bg-panel-2/50', sel && 'bg-primario/10')}>
                      <input type="checkbox" className="size-4 accent-teal-500" checked={sel} onChange={() => alternar(i.usuarioId)} />
                      <Avatar nombre={i.nombre} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {i.nombre}
                          {recomendado && <span className="inline-flex items-center gap-1 rounded-full bg-primario/15 px-2 py-0.5 text-[10px] font-medium text-teal-200"><Sparkles className="size-3" />Recomendado</span>}
                        </span>
                        <span className="block truncate text-xs text-atenuado">
                          {i.grupos.join(', ') || 'Sin grupo'} · {i.tecnologias.map((t) => (
                            <span key={t} className={cn(i.puntuacion.coincidencias.includes(t) && 'font-medium text-teal-300')}>{t}{' '}</span>
                          ))}
                        </span>
                      </span>
                      <span className="hidden w-32 sm:block" title={`${i.horasPendientes} h pendientes de ${i.capacidadSemana} h/semana`}>
                        <span className="mb-1 flex justify-between text-[11px] text-atenuado"><span>Carga</span><span className="tabular-nums">{i.cargaPct}%</span></span>
                        <BarraProgreso valor={i.cargaPct} color={COLOR_CARGA[i.puntuacion.nivel]} />
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-borde/70 px-6 py-4">
          <span className="text-xs text-atenuado">{elegidos.length ? `${elegidos.length} seleccionado(s)` : 'Selecciona uno o varios'}</span>
          <div className="flex gap-2">
            <Boton variante="secundario" onClick={alCerrar}>Cancelar</Boton>
            <Boton disabled={!elegidos.length || guardando} onClick={async () => {
              setGuardando(true);
              try { await alAgregar(elegidos); } catch { setGuardando(false); }
            }}>
              {guardando ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}Agregar al equipo
            </Boton>
          </div>
        </div>
      </div>
    </div>
  );
}
