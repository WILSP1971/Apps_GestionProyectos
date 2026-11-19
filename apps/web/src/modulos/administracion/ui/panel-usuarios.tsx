'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Search, ShieldAlert, WifiOff } from 'lucide-react';
import type { CambioUsuario, CatalogosAdmin, UsuarioAdmin } from '@sierraflow/contratos';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Avatar, Boton, Tarjeta, Vacio } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';

/** Administración de usuarios (solo ADMIN, requiere conexión): roles, departamento, grupos, tecnologías y capacidad. */
export function PanelUsuarios() {
  const { modoDemo, usuario: yo } = useUsuario();
  const [catalogos, setCatalogos] = useState<CatalogosAdmin | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (modoDemo) return;
    Promise.all([apiFetch<CatalogosAdmin>('/admin/catalogos'), apiFetch<UsuarioAdmin[]>('/admin/usuarios')])
      .then(([c, u]) => { setCatalogos(c); setUsuarios(u); })
      .catch((e: Error) => setError(navigator.onLine ? e.message : 'sin-conexion'));
  }, [modoDemo]);

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (usuarios ?? []).filter((u) => !t || u.nombre.toLowerCase().includes(t) || u.email.toLowerCase().includes(t));
  }, [usuarios, q]);

  const depto = (id: string | null) => catalogos?.departamentos.find((d) => d.id === id);

  const guardar = async () => {
    if (!editando) return;
    setGuardando(true);
    try {
      const cambio: CambioUsuario = {
        cargo: editando.cargo || null, departamentoId: editando.departamentoId, activo: editando.activo,
        roles: editando.roles as CambioUsuario['roles'], grupos: editando.grupos, tecnologias: editando.tecnologias,
        capacidadHoras: editando.capacidadHoras,
      };
      const actualizado = await apiFetch<UsuarioAdmin>(`/admin/usuarios/${editando.id}`, { method: 'PATCH', body: cambio });
      setUsuarios((l) => l?.map((u) => (u.id === actualizado.id ? actualizado : u)) ?? null);
      setEditando(null);
      toast.success('Usuario actualizado. Los cambios de rol aplican en su próximo inicio de sesión.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGuardando(false);
    }
  };

  if (modoDemo) return <Vacio icono={<ShieldAlert className="size-8" />} titulo="No disponible en modo demostración" texto="La administración de usuarios trabaja directamente con la base de datos del servidor." />;
  if (error) return <Vacio icono={<WifiOff className="size-8" />} titulo={error === 'sin-conexion' ? 'Necesitas conexión' : 'No se pudo cargar'} texto={error === 'sin-conexion' ? 'La administración de usuarios no funciona sin conexión.' : error} />;
  if (!usuarios || !catalogos) return <div className="h-64 animate-pulse rounded-xl bg-panel/60" />;

  const alternar = <K extends 'roles' | 'grupos' | 'tecnologias'>(campo: K, valor: UsuarioAdmin[K][number]) =>
    setEditando((u) => u && ({ ...u, [campo]: (u[campo] as unknown[]).includes(valor) ? (u[campo] as unknown[]).filter((x) => x !== valor) : [...(u[campo] as unknown[]), valor] }));

  const chip = (activo: boolean) => cn('rounded-full border px-2.5 py-1 text-xs transition', activo ? 'border-primario bg-primario/15 text-teal-100' : 'border-borde text-atenuado hover:border-borde-fuerte');

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
      <Tarjeta cuerpoClassName="p-0" titulo={`Usuarios (${usuarios.length})`}
        acciones={<div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-atenuado" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o correo" className="campo h-8 w-52 py-0 pl-8 text-xs" /></div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-atenuado">
              <tr className="border-b border-borde/60"><th className="px-5 py-2 font-normal">Usuario</th><th className="px-3 py-2 font-normal">Departamento</th><th className="px-3 py-2 font-normal">Roles</th><th className="px-3 py-2 font-normal">Último acceso</th></tr>
            </thead>
            <tbody className="divide-y divide-borde/40">
              {filtrados.map((u) => {
                const d = depto(u.departamentoId);
                return (
                  <tr key={u.id} onClick={() => setEditando({ ...u })}
                    className={cn('cursor-pointer hover:bg-panel-2/60', editando?.id === u.id && 'bg-primario/5', !u.activo && 'opacity-50')}>
                    <td className="px-5 py-2.5"><div className="flex items-center gap-2.5"><Avatar nombre={u.nombre} />
                      <div className="min-w-0"><p className="truncate font-medium">{u.nombre}{u.id === yo.id && <span className="ml-1 text-xs text-atenuado">(tú)</span>}</p><p className="truncate text-xs text-atenuado">{u.email}</p></div></div></td>
                    <td className="px-3 py-2.5 text-xs">{d ? <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: d.colorHex }} />{d.nombre}</span> : <span className="text-atenuado">—</span>}</td>
                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{u.roles.map((r) => <span key={r} className="rounded bg-panel-2 px-1.5 py-0.5 text-[10px]">{r}</span>)}</div></td>
                    <td className="px-3 py-2.5 text-xs text-atenuado">{u.ultimoAcceso ? new Date(u.ultimoAcceso).toLocaleDateString('es-CO') : 'Nunca'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      {editando ? (
        <Tarjeta titulo={editando.nombre}>
          <div className="space-y-4 text-sm">
            <label className="block"><span className="mb-1 block text-xs text-atenuado">Cargo</span>
              <input className="campo" value={editando.cargo ?? ''} onChange={(e) => setEditando({ ...editando, cargo: e.target.value })} /></label>
            <label className="block"><span className="mb-1 block text-xs text-atenuado">Departamento</span>
              <select className="campo" value={editando.departamentoId ?? ''} onChange={(e) => setEditando({ ...editando, departamentoId: e.target.value || null })}>
                <option value="">Sin departamento</option>
                {catalogos.departamentos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
              </select></label>
            <div><span className="mb-1.5 block text-xs text-atenuado">Roles</span>
              <div className="flex flex-wrap gap-1.5">{catalogos.roles.map((r) => (
                <button key={r.codigo} type="button" className={chip(editando.roles.includes(r.codigo))} onClick={() => alternar('roles', r.codigo)}>{r.nombre}</button>))}</div></div>
            <div><span className="mb-1.5 block text-xs text-atenuado">Grupos de trabajo</span>
              <div className="flex flex-wrap gap-1.5">{catalogos.grupos.map((g) => (
                <button key={g.id} type="button" className={chip(editando.grupos.includes(g.id))} onClick={() => alternar('grupos', g.id)}>{g.nombre}</button>))}</div></div>
            <div><span className="mb-1.5 block text-xs text-atenuado">Tecnologías que domina</span>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">{catalogos.tecnologias.map((t) => (
                <button key={t.id} type="button" className={chip(editando.tecnologias.includes(t.id))} onClick={() => alternar('tecnologias', t.id)}>{t.nombre}</button>))}</div></div>
            <label className="block"><span className="mb-1 block text-xs text-atenuado">Capacidad semanal (horas)</span>
              <input type="number" min={1} max={80} className="campo w-32" value={editando.capacidadHoras}
                onChange={(e) => setEditando({ ...editando, capacidadHoras: Number(e.target.value) || 40 })} /></label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="size-4 accent-teal-500" checked={editando.activo} disabled={editando.id === yo.id}
                onChange={(e) => setEditando({ ...editando, activo: e.target.checked })} />
              Usuario activo {editando.id === yo.id && <span className="text-xs text-atenuado">(no puedes desactivarte)</span>}
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Boton variante="secundario" onClick={() => setEditando(null)}>Cancelar</Boton>
              <Boton onClick={guardar} disabled={guardando}>{guardando && <Loader2 className="size-4 animate-spin" />}Guardar cambios</Boton>
            </div>
          </div>
        </Tarjeta>
      ) : (
        <Vacio icono={<Search className="size-8" />} titulo="Selecciona un usuario" texto="Asigna roles (p. ej. INGENIERO o LIDER), su departamento, grupos, tecnologías y capacidad semanal." />
      )}
    </div>
  );
}
