'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bell, BellOff, BellRing, CheckCircle2, Info, Loader2, Mail, MonitorSmartphone, Send, WifiOff } from 'lucide-react';
import type { PreferenciaGrupo } from '@sierraflow/contratos';
import { apiFetch } from '@/lib/api';
import { activarPush, desactivarPush, estadoPush, type EstadoPush } from '@/lib/push';
import { cn } from '@/lib/utils';
import { Boton, Tarjeta } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';

interface Canales {
  app: boolean;
  push: boolean;
  email: boolean;
  clavePublicaPush: string | null;
}

function Interruptor({ activo, alCambiar, deshabilitado, etiqueta }: { activo: boolean; alCambiar: (v: boolean) => void; deshabilitado?: boolean; etiqueta: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      disabled={deshabilitado}
      onClick={() => alCambiar(!activo)}
      className={cn('relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40',
        activo ? 'bg-primario' : 'bg-borde-fuerte')}
    >
      <span className={cn('inline-block size-5 rounded-full bg-white shadow transition', activo ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

const TEXTO_PUSH: Record<EstadoPush, string> = {
  'no-soportado': 'Este navegador no admite notificaciones push.',
  'no-configurado': 'El servidor aún no tiene claves para notificaciones push.',
  'sin-service-worker': 'El Service Worker no está activo en esta página. Recarga e intenta de nuevo.',
  bloqueado: 'Bloqueaste las notificaciones para este sitio. Actívalas en el candado de la barra de direcciones → Notificaciones → Permitir.',
  inactivo: 'Este equipo no recibe notificaciones push.',
  activo: 'Este equipo recibe notificaciones push, aunque SierraFlow esté cerrado.',
};

export function PanelPreferencias() {
  const { modoDemo } = useUsuario();
  const [canales, setCanales] = useState<Canales | null>(null);
  const [preferencias, setPreferencias] = useState<PreferenciaGrupo[] | null>(null);
  const [estado, setEstado] = useState<EstadoPush>('inactivo');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoPush, setCambiandoPush] = useState(false);
  const [probando, setProbando] = useState(false);
  const [sucio, setSucio] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [c, p] = await Promise.all([
        apiFetch<Canales>('/notificaciones/canales'),
        apiFetch<PreferenciaGrupo[]>('/notificaciones/preferencias'),
      ]);
      setCanales(c);
      setPreferencias(p);
      setEstado(await estadoPush(c.clavePublicaPush));
    } catch (e) {
      setError(navigator.onLine ? (e as Error).message : 'Sin conexión');
    }
  }, []);

  useEffect(() => {
    if (!modoDemo) void cargar();
  }, [modoDemo, cargar]);

  if (modoDemo) {
    return (
      <Tarjeta>
        <p className="flex items-center gap-2 text-sm text-atenuado">
          <Info className="size-4 text-primario" /> En modo demo las notificaciones solo existen en este navegador; no hay correo ni push.
        </p>
      </Tarjeta>
    );
  }

  if (error) {
    return (
      <Tarjeta>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <WifiOff className="size-8 text-atenuado" />
          <p className="text-sm">{error === 'Sin conexión' ? 'Necesitas conexión para ver y cambiar tus preferencias.' : `No se pudieron cargar las preferencias: ${error}`}</p>
          <Boton tamano="sm" variante="secundario" onClick={cargar}>Reintentar</Boton>
        </div>
      </Tarjeta>
    );
  }

  if (!canales || !preferencias) return <div className="h-72 animate-pulse rounded-xl bg-panel/50" />;

  const cambiar = (grupo: string, campo: 'email' | 'push', valor: boolean) => {
    setPreferencias((p) => p!.map((x) => (x.grupo === grupo ? { ...x, [campo]: valor } : x)));
    setSucio(true);
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await apiFetch<PreferenciaGrupo[]>('/notificaciones/preferencias', {
        method: 'PUT',
        body: preferencias.map(({ grupo, email, push }) => ({ grupo, email, push })),
      });
      setPreferencias(r);
      setSucio(false);
      toast.success('Preferencias guardadas');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  const alternarPush = async () => {
    setCambiandoPush(true);
    try {
      if (estado === 'activo') {
        await desactivarPush();
        toast.info('Este equipo ya no recibirá notificaciones push');
      } else {
        await activarPush(canales.clavePublicaPush!);
        toast.success('Notificaciones push activadas en este equipo');
      }
      setEstado(await estadoPush(canales.clavePublicaPush));
    } catch (e) {
      toast.error((e as Error).message);
      setEstado(await estadoPush(canales.clavePublicaPush));
    } finally {
      setCambiandoPush(false);
    }
  };

  const probar = async () => {
    setProbando(true);
    try {
      const r = await apiFetch<{ app: boolean; push: number; email: boolean | string }>('/notificaciones/prueba', { method: 'POST' });
      const partes = ['en la app ✓', `push: ${r.push > 0 ? `${r.push} equipo(s) ✓` : 'ningún equipo suscrito'}`,
        `correo: ${r.email === true ? 'enviado ✓' : r.email === false ? 'no enviado' : r.email}`];
      toast.success('Notificación de prueba enviada', { description: partes.join(' · ') });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProbando(false);
    }
  };

  const IconoPush = estado === 'activo' ? BellRing : estado === 'bloqueado' ? BellOff : Bell;
  const puedeAlternar = estado === 'activo' || estado === 'inactivo';

  return (
    <div className="space-y-5">
      <Tarjeta titulo={<span className="inline-flex items-center gap-2"><MonitorSmartphone className="size-4 text-primario" />Notificaciones push en este equipo</span>}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex max-w-2xl items-start gap-2 text-sm">
            <IconoPush className={cn('mt-0.5 size-4 shrink-0', estado === 'activo' ? 'text-emerald-300' : 'text-atenuado')} />
            {TEXTO_PUSH[estado]}
          </p>
          <div className="flex gap-2">
            {puedeAlternar && (
              <Boton tamano="sm" variante={estado === 'activo' ? 'secundario' : 'primario'} onClick={alternarPush} disabled={cambiandoPush}>
                {cambiandoPush && <Loader2 className="size-4 animate-spin" />}
                {estado === 'activo' ? 'Desactivar en este equipo' : 'Activar en este equipo'}
              </Boton>
            )}
            <Boton tamano="sm" variante="secundario" onClick={probar} disabled={probando}>
              {probando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Enviar prueba
            </Boton>
          </div>
        </div>
      </Tarjeta>

      <Tarjeta titulo="¿Qué notificaciones quieres recibir?" cuerpoClassName="p-0"
        acciones={sucio ? <Boton tamano="sm" onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="size-4 animate-spin" />}Guardar cambios</Boton> : null}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borde/70 text-left text-xs text-atenuado">
              <th className="px-5 py-3 font-medium">Tipo</th>
              <th className="px-3 py-3 text-center font-medium"><span className="inline-flex items-center gap-1"><Bell className="size-3.5" />App</span></th>
              <th className="px-3 py-3 text-center font-medium"><span className="inline-flex items-center gap-1"><Mail className="size-3.5" />Correo</span></th>
              <th className="px-5 py-3 text-center font-medium"><span className="inline-flex items-center gap-1"><BellRing className="size-3.5" />Push</span></th>
            </tr>
          </thead>
          <tbody>
            {preferencias.map((p) => (
              <tr key={p.grupo} className="border-b border-borde/40 last:border-0">
                <td className="px-5 py-4">
                  <p className="font-medium">{p.nombre}</p>
                  <p className="mt-0.5 max-w-xl text-xs text-atenuado">{p.descripcion}</p>
                </td>
                <td className="px-3 py-4 text-center" title="Las notificaciones dentro de la app siempre están activas">
                  <CheckCircle2 className="mx-auto size-5 text-primario/70" />
                </td>
                <td className="px-3 py-4 text-center" title={canales.email ? '' : 'El servidor no tiene correo configurado'}>
                  <Interruptor etiqueta={`Correo: ${p.nombre}`} activo={p.email} deshabilitado={!canales.email} alCambiar={(v) => cambiar(p.grupo, 'email', v)} />
                </td>
                <td className="px-5 py-4 text-center" title={canales.push ? '' : 'El servidor no tiene push configurado'}>
                  <Interruptor etiqueta={`Push: ${p.nombre}`} activo={p.push} deshabilitado={!canales.push} alCambiar={(v) => cambiar(p.grupo, 'push', v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!canales.email && (
          <p className="border-t border-borde/70 px-5 py-3 text-xs text-atenuado">
            El correo está desactivado en el servidor (falta configurar SMTP en el archivo .env). Las preferencias de correo se aplicarán cuando se configure.
          </p>
        )}
      </Tarjeta>
    </div>
  );
}
