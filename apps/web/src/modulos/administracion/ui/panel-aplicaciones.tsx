'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AppWindow, Check, Loader2, Pencil, Plus, Search, WifiOff } from 'lucide-react';
import {
  DESCRIPCION_TIPO, esquemaAplicacion, ETIQUETA_TIPO, TIPOS_SOLICITUD, type AplicacionVista, type TipoSolicitud,
} from '@sierraflow/contratos';
import { cn } from '@/lib/utils';
import { Boton, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import { adminApi, adminDemo } from '@/modulos/solicitudes/infraestructura/catalogo-aplicaciones';

type Edicion = { id: string | null; nombre: string; descripcion: string; tipos: TipoSolicitud[]; tecnologias: string[]; activo: boolean };

/**
 * Catálogo de aplicaciones de software (ADMIN): a qué tipos de requerimiento se asigna cada una y
 * qué tecnologías usa. El solicitante elige de esta lista al crear la solicitud.
 */
export function PanelAplicaciones() {
  const { modoDemo } = useUsuario();
  const fuente = modoDemo ? adminDemo : adminApi;
  const [apps, setApps] = useState<AplicacionVista[] | null>(null);
  const [tecnologias, setTecnologias] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState<Edicion | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    Promise.all([fuente.listar(), fuente.tecnologias()])
      .then(([a, t]) => { setApps(a); setTecnologias(t); })
      .catch((e: Error) => setError(navigator.onLine ? e.message : 'sin-conexion'));
  }, [fuente]);

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (apps ?? []).filter((a) => !t || a.nombre.toLowerCase().includes(t)).sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre, 'es'));
  }, [apps, q]);

  const guardar = async () => {
    if (!editando) return;
    const datos = esquemaAplicacion.safeParse({ ...editando, descripcion: editando.descripcion || null });
    if (!datos.success) { toast.error(datos.error.issues[0]?.message ?? 'Revisa los datos'); return; }
    setGuardando(true);
    try {
      const app = await fuente.guardar(editando.id, datos.data);
      setApps((l) => (editando.id ? (l ?? []).map((a) => (a.id === app.id ? app : a)) : [...(l ?? []), app]));
      toast.success(editando.id ? 'Aplicación actualizada' : 'Aplicación agregada');
      setEditando(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  if (error) return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'Necesitas conexión' : 'No se pudo cargar'} texto={error === 'sin-conexion' ? 'La administración no funciona sin conexión.' : error} />;
  if (!apps) return <div className="h-64 animate-pulse rounded-xl bg-panel/60" />;

  const alternar = <K extends 'tipos' | 'tecnologias'>(campo: K, v: Edicion[K][number]) =>
    setEditando((e) => e && ({ ...e, [campo]: (e[campo] as string[]).includes(v) ? (e[campo] as string[]).filter((x) => x !== v) : [...(e[campo] as string[]), v] }));
  const chip = (activo: boolean) => cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition',
    activo ? 'border-primario bg-primario/15 text-teal-200' : 'border-borde text-atenuado hover:border-borde-fuerte hover:text-texto');

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Tarjeta cuerpoClassName="p-0" titulo={<span className="flex items-center gap-2"><AppWindow className="size-4 text-atenuado" />Aplicaciones ({apps.length})</span>}
        acciones={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="campo h-8 w-40 py-0 pl-8 text-xs" aria-label="Buscar aplicaciones" />
            </div>
            <Boton tamano="sm" onClick={() => setEditando({ id: null, nombre: '', descripcion: '', tipos: ['MEJORA', 'INCIDENTE'], tecnologias: [], activo: true })}>
              <Plus className="size-4" />Agregar
            </Boton>
          </div>
        }>
        {filtradas.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-atenuado">
            {apps.length ? 'Ninguna coincide con la búsqueda.' : 'Aún no hay aplicaciones. Agrega las que usa tu organización para que el solicitante pueda elegirlas.'}
          </p>
        ) : (
          <ul className="divide-y divide-borde/50">
            {filtradas.map((a) => (
              <li key={a.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3', !a.activo && 'opacity-55')}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">{a.nombre}{!a.activo && <span className="rounded-full bg-panel-2 px-2 py-0.5 text-[10px] text-atenuado">Inactiva</span>}</p>
                  <p className="mt-0.5 flex flex-wrap gap-1">
                    {a.tipos.map((t) => <span key={t} className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-200">{ETIQUETA_TIPO[t]}</span>)}
                    {a.tecnologias.length > 0 && <span className="ml-1 text-[11px] text-atenuado">{a.tecnologias.join(' · ')}</span>}
                  </p>
                </div>
                <Boton tamano="sm" variante="secundario" onClick={() => setEditando({ ...a, descripcion: a.descripcion ?? '' })}><Pencil className="size-3.5" />Editar</Boton>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {editando ? (
        <Tarjeta titulo={editando.id ? `Editar ${editando.nombre}` : 'Agregar aplicación'}>
          <div className="space-y-4">
            <label className="block"><span className="etiqueta">Nombre *</span>
              <input autoFocus className="campo" maxLength={120} value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })}
                placeholder="Ej.: Esculapio (historia clínica)" /></label>
            <label className="block"><span className="etiqueta">Descripción</span>
              <textarea rows={2} className="campo resize-y" maxLength={1000} value={editando.descripcion} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} /></label>
            <div>
              <span className="etiqueta">Tipos de requerimiento en los que aparece *</span>
              <div className="space-y-1.5">
                {TIPOS_SOLICITUD.map((t) => (
                  <label key={t} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-borde px-3 py-2 hover:border-borde-fuerte">
                    <input type="checkbox" className="mt-0.5 size-4 accent-teal-500" checked={editando.tipos.includes(t)} onChange={() => alternar('tipos', t)} />
                    <span><span className="text-sm font-medium">{ETIQUETA_TIPO[t]}</span><span className="block text-[11px] text-atenuado">{DESCRIPCION_TIPO[t]}</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="etiqueta">Tecnologías <span className="text-atenuado">(la solicitud las hereda para recomendar ingenieros)</span></span>
              <div className="flex flex-wrap gap-2">
                {tecnologias.map((t) => (
                  <button key={t} type="button" className={chip(editando.tecnologias.includes(t))} onClick={() => alternar('tecnologias', t)}>
                    {editando.tecnologias.includes(t) && <Check className="size-3" />}{t}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-teal-500" checked={editando.activo} onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
              Activa (se ofrece al crear solicitudes)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Boton variante="secundario" onClick={() => setEditando(null)}>Cancelar</Boton>
              <Boton disabled={guardando} onClick={() => void guardar()}>{guardando && <Loader2 className="size-4 animate-spin" />}Guardar</Boton>
            </div>
          </div>
        </Tarjeta>
      ) : (
        <Tarjeta titulo="¿Para qué sirve?">
          <ul className="space-y-2 text-sm text-atenuado">
            <li>• Al crear una solicitud, el solicitante elige el <b className="text-texto">tipo</b> y luego la <b className="text-texto">aplicación</b> de esta lista.</li>
            <li>• Solo aparecen las aplicaciones activas asignadas a ese tipo.</li>
            <li>• Las tecnologías de la aplicación pasan a la solicitud y mejoran la recomendación de ingenieros en la asignación.</li>
            <li>• Para desarrollos que aún no existen, crea una entrada como “Nueva aplicación o módulo” asignada al tipo <b className="text-texto">Nuevo</b>.</li>
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}
