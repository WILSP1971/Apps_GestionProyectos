'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Briefcase, Inbox, X } from 'lucide-react';
import { TIPO_SOLICITUD_NUEVA, TIPOS_ASIGNACION_NUEVA } from '@sierraflow/contratos';
import { dbLocal, type NotificacionLocal } from '@/lib/offline/db';
import { haceTiempo } from '@/lib/utils';
import { Boton } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import { perfilDe, type Perfil } from '@/componentes/layout/perfil';
import { marcarNotificacionLeida } from '../aplicacion/casos-uso';

/** ¿La notificación es el aviso de una solicitud recibida? (las antiguas no traían tipo) */
export const esSolicitudNueva = (n: Pick<NotificacionLocal, 'tipo' | 'titulo'>) =>
  n.tipo === TIPO_SOLICITUD_NUEVA || (!n.tipo && /^(Recibiste una solicitud nueva|Nueva solicitud por revisar)/.test(n.titulo));

/** ¿La notificación es una asignación nueva para el ingeniero (solicitud, tarea o tarea de proyecto)? */
export const esAsignacionNueva = (n: Pick<NotificacionLocal, 'tipo' | 'titulo'>) =>
  (!!n.tipo && TIPOS_ASIGNACION_NUEVA.includes(n.tipo)) || (!n.tipo && /^(Recibiste una nueva asignación|Te asignaron|Te sumaron)/.test(n.titulo));

interface ConfigAviso {
  perfil: Perfil;
  claveSesion: string;
  coincide: (n: NotificacionLocal) => boolean;
  Icono: typeof Inbox;
  titulo: (n: number) => string;
  texto: (n: number) => string;
  lista: { destino: string; etiqueta: string };
  abrir: string;
}

const AVISOS: ConfigAviso[] = [
  {
    perfil: 'GESTION', claveSesion: 'sierraflow.avisos-solicitud-vistos', coincide: esSolicitudNueva, Icono: Inbox,
    titulo: (n) => (n === 1 ? 'Recibiste una solicitud nueva' : `Recibiste ${n} solicitudes nuevas`),
    texto: (n) => (n === 1 ? 'Está esperando revisión en la bandeja de solicitudes.' : 'Están esperando revisión en la bandeja de solicitudes.'),
    lista: { destino: '/solicitudes?estado=ENVIADA', etiqueta: 'Ir a la bandeja' }, abrir: 'Revisar solicitud',
  },
  {
    perfil: 'INGENIERO', claveSesion: 'sierraflow.avisos-asignacion-vistos', coincide: esAsignacionNueva, Icono: Briefcase,
    titulo: (n) => (n === 1 ? 'Recibiste una nueva asignación' : `Recibiste ${n} asignaciones nuevas`),
    texto: (n) => (n === 1 ? 'Te asignaron trabajo en una solicitud o proyecto.' : 'Te asignaron trabajo en solicitudes o proyectos.'),
    lista: { destino: '/mis-asignaciones', etiqueta: 'Ver mis asignaciones' }, abrir: 'Abrir',
  },
];

/**
 * Avisos modales en línea según el perfil: gestión ve "Recibiste una solicitud nueva" y el ingeniero
 * "Recibiste una nueva asignación". Se alimentan de las notificaciones guardadas en el navegador:
 * aparecen al instante cuando llegan por tiempo real y, si la persona no estaba conectada, al entrar
 * mientras sigan sin leer. "Más tarde" los oculta en esta sesión; siguen en la campana.
 */
export function AvisosEnLinea() {
  const { rolesVista } = useUsuario();
  const config = AVISOS.find((a) => a.perfil === perfilDe(rolesVista));
  return config ? <AvisoModal key={config.perfil} config={config} /> : null;
}

const codigoDe = (n: NotificacionLocal) => n.titulo.split(': ').pop() ?? '';

function AvisoModal({ config }: { config: ConfigAviso }) {
  const router = useRouter();
  const [vistos, setVistos] = useState<Set<string>>(() => new Set());
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try { setVistos(new Set(JSON.parse(sessionStorage.getItem(config.claveSesion) ?? '[]') as string[])); } catch { /* sin almacenamiento */ }
  }, [config.claveSesion]);

  const noLeidas = useLiveQuery(() => dbLocal.notificaciones.where('leida').equals(0).toArray(), []) ?? [];
  const pendientes = useMemo(
    () => noLeidas.filter((n) => config.coincide(n) && !vistos.has(n.id)).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn)),
    [noLeidas, vistos, config]);
  const abierto = pendientes.length > 0;

  const ocultar = () => {
    const nuevos = new Set([...vistos, ...pendientes.map((n) => n.id)]);
    setVistos(nuevos);
    try { sessionStorage.setItem(config.claveSesion, JSON.stringify([...nuevos])); } catch { /* sin almacenamiento */ }
  };
  const ir = async (destino: string, leer: NotificacionLocal[]) => {
    await Promise.all(leer.map((n) => marcarNotificacionLeida(n.id)));
    ocultar();
    router.push(destino);
  };

  useEffect(() => {
    if (!abierto) return;
    boton.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && ocultar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, pendientes.length]);

  if (!abierto) return null;
  const una = pendientes.length === 1 ? pendientes[0]! : null;
  const { Icono } = config;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="alertdialog" aria-modal="true"
      aria-labelledby="aviso-en-linea-titulo" aria-describedby="aviso-en-linea-texto">
      <div className="entrada-fondo absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={ocultar} aria-hidden />
      <div className="entrada-subir relative w-full max-w-md overflow-hidden rounded-2xl border border-primario/40 bg-panel shadow-2xl shadow-black/60">
        <div className="h-1 bg-gradient-to-r from-primario via-sky-400 to-primario" aria-hidden />
        <button type="button" onClick={ocultar} aria-label="Cerrar" className="absolute right-3 top-4 rounded-lg p-1 text-atenuado hover:text-texto"><X className="size-4" /></button>
        <div className="px-6 pb-5 pt-6 text-center">
          <span className="relative mx-auto grid size-14 place-items-center rounded-2xl bg-primario/15 text-teal-200">
            <span className="absolute inset-0 animate-ping rounded-2xl bg-primario/20 motion-reduce:hidden" aria-hidden />
            <Icono className="relative size-7" />
          </span>
          <h2 id="aviso-en-linea-titulo" className="mt-4 text-lg font-semibold">{config.titulo(pendientes.length)}</h2>
          <p id="aviso-en-linea-texto" className="mt-1 text-sm text-atenuado">{config.texto(pendientes.length)}</p>
        </div>

        <ul className="mx-6 max-h-56 divide-y divide-borde/60 overflow-y-auto rounded-xl border border-borde bg-fondo/40">
          {pendientes.slice(0, 6).map((n) => (
            <li key={n.id}>
              <Link href={n.enlace} onClick={(e) => { e.preventDefault(); void ir(n.enlace, [n]); }}
                className="group flex items-start gap-3 px-4 py-3 text-left transition hover:bg-panel-2/60">
                <span className="mt-0.5 rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[11px] text-sky-300">{codigoDe(n)}</span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm">{n.mensaje}</span>
                  <span className="text-[11px] text-atenuado">{haceTiempo(n.creadoEn)}</span>
                </span>
                <ArrowRight className="mt-1 size-4 shrink-0 text-atenuado transition group-hover:translate-x-0.5 group-hover:text-teal-200" />
              </Link>
            </li>
          ))}
          {pendientes.length > 6 && <li className="px-4 py-2 text-center text-xs text-atenuado">y {pendientes.length - 6} más</li>}
        </ul>

        <div className="flex flex-wrap justify-end gap-2 px-6 py-5">
          <Boton variante="fantasma" onClick={ocultar}>Más tarde</Boton>
          {una ? (
            <>
              <Boton variante="secundario" onClick={() => void ir(config.lista.destino, pendientes)}>{config.lista.etiqueta}</Boton>
              <Boton ref={boton} onClick={() => void ir(una.enlace, [una])}>{config.abrir}</Boton>
            </>
          ) : (
            <Boton ref={boton} onClick={() => void ir(config.lista.destino, pendientes)}>{config.lista.etiqueta}</Boton>
          )}
        </div>
      </div>
    </div>
  );
}
