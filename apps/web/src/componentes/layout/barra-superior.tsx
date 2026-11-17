'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Bell, CloudOff, Loader2, Plus, RefreshCcw, Search, Wifi } from 'lucide-react';
import type { Rol } from '@sierraflow/contratos';
import { dbLocal } from '@/lib/offline/db';
import { cn, haceTiempo } from '@/lib/utils';
import { reiniciarDemo } from '@/modulos/solicitudes/infraestructura/datos-demo';
import { Avatar, Boton } from '@/componentes/ui/primitivos';
import { useUsuario } from './proveedores';

const VISTAS: { etiqueta: string; roles: Rol[] }[] = [
  { etiqueta: 'Todos los roles', roles: ['SOLICITANTE', 'INGENIERO', 'LIDER', 'DIRECTOR'] },
  { etiqueta: 'Solicitante', roles: ['SOLICITANTE'] },
  { etiqueta: 'Ingeniero', roles: ['INGENIERO'] },
  { etiqueta: 'Líder técnico', roles: ['LIDER'] },
  { etiqueta: 'Director', roles: ['DIRECTOR', 'LIDER'] },
];

function IndicadorConexion() {
  const [enLinea, setEnLinea] = useState(true);
  const pendientes = useLiveQuery(() => dbLocal.bandejaSalida.count(), []) ?? 0;
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine);
    actualizar();
    window.addEventListener('online', actualizar);
    window.addEventListener('offline', actualizar);
    return () => {
      window.removeEventListener('online', actualizar);
      window.removeEventListener('offline', actualizar);
    };
  }, []);
  return (
    <span
      title={pendientes ? `${pendientes} cambios guardados en este equipo, pendientes de sincronizar` : 'Todo sincronizado'}
      className={cn(
        'hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs md:inline-flex',
        enLinea ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/15 text-amber-300',
      )}
    >
      {enLinea ? (pendientes ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />) : <CloudOff className="size-3.5" />}
      {enLinea ? (pendientes ? `${pendientes} por sincronizar` : 'En línea') : `Sin conexión · ${pendientes} pendientes`}
    </span>
  );
}

function Campana() {
  const [abierta, setAbierta] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const noLeidas = useLiveQuery(() => dbLocal.notificaciones.where('leida').equals(0).count(), []) ?? 0;
  const ultimas = useLiveQuery(() => dbLocal.notificaciones.orderBy('creadoEn').reverse().limit(8).toArray(), []) ?? [];

  useEffect(() => {
    const cerrar = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierta(false);
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  const color = { INFO: 'bg-sky-400', EXITO: 'bg-emerald-400', ALERTA: 'bg-amber-400', CRITICA: 'bg-red-400' } as const;

  return (
    <div className="relative" ref={ref}>
      <button aria-label={`Notificaciones (${noLeidas} sin leer)`} onClick={() => setAbierta((v) => !v)}
        className="relative rounded-lg p-2 text-atenuado transition hover:bg-panel-2 hover:text-texto">
        <Bell className="size-5" />
        {noLeidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-peligro text-[10px] font-bold text-white">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>
      {abierta && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-borde bg-panel shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-borde px-4 py-2.5">
            <p className="text-sm font-semibold">Notificaciones</p>
            {noLeidas > 0 && (
              <button className="text-xs text-primario hover:underline"
                onClick={() => dbLocal.notificaciones.where('leida').equals(0).modify({ leida: 1 })}>
                Marcar todo como leído
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {ultimas.length === 0 && <li className="px-4 py-8 text-center text-sm text-atenuado">Sin notificaciones</li>}
            {ultimas.map((n) => (
              <li key={n.id}>
                <button
                  onClick={async () => { await dbLocal.notificaciones.update(n.id, { leida: 1 }); setAbierta(false); router.push(n.enlace); }}
                  className={cn('flex w-full gap-3 px-4 py-3 text-left transition hover:bg-panel-2', !n.leida && 'bg-primario/5')}>
                  <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.leida ? 'bg-transparent' : color[n.severidad])} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{n.titulo}</span>
                    <span className="line-clamp-2 text-xs text-atenuado">{n.mensaje}</span>
                    <span className="mt-0.5 block text-[11px] text-atenuado/70">{haceTiempo(n.creadoEn)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function BarraSuperior() {
  const { usuario, modoDemo, rolesVista, cambiarVista } = useUsuario();
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const vistaActual = VISTAS.find((v) => v.roles.join() === rolesVista.join())?.etiqueta ?? VISTAS[0]!.etiqueta;

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-borde bg-fondo/80 px-4 backdrop-blur md:px-6">
      <form className="relative max-w-md flex-1" onSubmit={(e) => { e.preventDefault(); router.push(`/mis-solicitudes?q=${encodeURIComponent(texto)}`); }}>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-atenuado" />
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar solicitudes, códigos…" className="campo pl-9" aria-label="Buscar" />
      </form>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <IndicadorConexion />
        {modoDemo && (
          <div className="hidden items-center gap-1 xl:flex">
            <select
              aria-label="Ver como"
              value={vistaActual}
              onChange={(e) => cambiarVista(VISTAS.find((v) => v.etiqueta === e.target.value)!.roles)}
              className="campo h-8 w-auto py-0 text-xs"
            >
              {VISTAS.map((v) => <option key={v.etiqueta}>{v.etiqueta}</option>)}
            </select>
            <button title="Reiniciar datos demo" onClick={() => reiniciarDemo(usuario.id, usuario.nombre)}
              className="rounded-lg p-2 text-atenuado hover:bg-panel-2 hover:text-texto">
              <RefreshCcw className="size-4" />
            </button>
          </div>
        )}
        <Campana />
        <div className="hidden items-center gap-2.5 sm:flex">
          <Avatar nombre={usuario.nombre} />
          <div className="leading-tight">
            <p className="text-sm font-medium">{usuario.nombre}</p>
            <p className="text-[11px] text-atenuado">{usuario.cargo || usuario.departamento}</p>
          </div>
        </div>
        <Link href="/solicitudes/nueva">
          <Boton tamano="sm"><Plus className="size-4" /> <span className="hidden md:inline">Crear nueva solicitud</span></Boton>
        </Link>
      </div>
    </header>
  );
}
