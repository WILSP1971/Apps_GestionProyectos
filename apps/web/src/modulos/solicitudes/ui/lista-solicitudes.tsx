'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudUpload, FilePlus2, Inbox } from 'lucide-react';
import { ESTADOS, ETIQUETA_ESTADO, type EstadoSolicitud } from '@sierraflow/contratos';
import { dbLocal } from '@/lib/offline/db';
import { cn, fecha, haceTiempo } from '@/lib/utils';
import { Avatar, BarraProgreso, Boton, Vacio } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import { InsigniaEstado, InsigniaPrioridad } from './insignias';

type Filtro = 'TODAS' | 'ABIERTAS' | EstadoSolicitud;
const ABIERTAS: EstadoSolicitud[] = ['BORRADOR', 'ENVIADA', 'EN_REVISION', 'APROBADA', 'ASIGNADA', 'EN_DESARROLLO', 'EN_VALIDACION'];

/**
 * Panel de seguimiento.
 *  - alcance "mias": las solicitudes del usuario final (Mis solicitudes)
 *  - alcance "todas": bandeja de gestión para líderes y directores
 */
export function ListaSolicitudes({ alcance }: { alcance: 'mias' | 'todas' }) {
  const { usuario } = useUsuario();
  const params = useSearchParams();
  const [filtro, setFiltro] = useState<Filtro>('ABIERTAS');
  const [texto, setTexto] = useState(params.get('q') ?? '');

  const solicitudes = useLiveQuery(
    () => (alcance === 'mias'
      ? dbLocal.solicitudes.where('solicitanteId').equals(usuario.id).toArray()
      : dbLocal.solicitudes.toArray()
    ).then((l) => l.sort((a, b) => b.actualizadoEn.localeCompare(a.actualizadoEn))),
    [alcance, usuario.id],
  );

  const conteo = useMemo(() => {
    const c: Record<string, number> = { TODAS: solicitudes?.length ?? 0, ABIERTAS: 0 };
    for (const s of solicitudes ?? []) {
      c[s.estado] = (c[s.estado] ?? 0) + 1;
      if (ABIERTAS.includes(s.estado)) c.ABIERTAS = (c.ABIERTAS ?? 0) + 1;
    }
    return c;
  }, [solicitudes]);

  if (!solicitudes) return <div className="h-64 animate-pulse rounded-xl bg-panel/50" />;

  const q = texto.trim().toLowerCase();
  const visibles = solicitudes.filter((s) =>
    (filtro === 'TODAS' || (filtro === 'ABIERTAS' ? ABIERTAS.includes(s.estado) : s.estado === filtro)) &&
    (!q || s.titulo.toLowerCase().includes(q) || s.codigo.toLowerCase().includes(q)));

  const chips: Filtro[] = ['ABIERTAS', 'TODAS', ...ESTADOS.filter((e) => conteo[e])];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={cn('rounded-full border px-3 py-1 text-xs transition',
              filtro === f ? 'border-primario bg-primario/15 text-teal-200' : 'border-borde text-atenuado hover:text-texto')}>
            {f === 'TODAS' ? 'Todas' : f === 'ABIERTAS' ? 'Abiertas' : ETIQUETA_ESTADO[f]}
            <span className="ml-1.5 tabular-nums opacity-70">{conteo[f] ?? 0}</span>
          </button>
        ))}
        <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Filtrar por título o código"
          className="campo ml-auto h-8 w-full py-0 text-xs sm:w-64" aria-label="Filtrar" />
      </div>

      {visibles.length === 0 ? (
        <Vacio
          icono={alcance === 'mias' ? <FilePlus2 className="size-8" /> : <Inbox className="size-8" />}
          titulo="No hay solicitudes con este filtro"
          texto={alcance === 'mias' ? 'Crea una solicitud y haz seguimiento a su avance desde aquí.' : 'Cuando lleguen solicitudes nuevas aparecerán en esta bandeja.'}
          accion={alcance === 'mias' ? <Link href="/solicitudes/nueva"><Boton tamano="sm">Crear solicitud</Boton></Link> : undefined}
        />
      ) : (
        <ul className="grid gap-3">
          {visibles.map((s) => (
            <li key={s.id}>
              <Link href={`/solicitudes/${s.id}`}
                className="group grid gap-4 rounded-xl border border-borde bg-panel/70 p-4 transition hover:border-primario/50 hover:bg-panel md:grid-cols-[1fr_200px_160px] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono text-sky-300">{s.codigo}</span>
                    <InsigniaEstado estado={s.estado} />
                    <InsigniaPrioridad prioridad={s.prioridad} />
                    {s.pendienteSync === 1 && (
                      <span className="inline-flex items-center gap-1 text-amber-300" title="Guardado en este equipo; pendiente de sincronizar">
                        <CloudUpload className="size-3.5" /> sin sincronizar
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate font-medium group-hover:text-teal-200">{s.titulo}</p>
                  <p className="mt-0.5 truncate text-xs text-atenuado">
                    {alcance === 'todas' ? `${s.solicitanteNombre} · ${s.departamento}` : s.departamento} · actualizada {haceTiempo(s.actualizadoEn)}
                  </p>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-atenuado"><span>Avance</span><span className="tabular-nums">{s.avancePct}%</span></div>
                  <BarraProgreso valor={s.avancePct} />
                </div>
                <div className="flex items-center justify-between gap-2 md:justify-end">
                  <div className="flex -space-x-2">
                    {s.asignados.slice(0, 3).map((a) => <Avatar key={a.nombre} nombre={a.nombre} className="size-7" />)}
                    {s.asignados.length === 0 && <span className="text-xs text-atenuado">Sin asignar</span>}
                  </div>
                  <span className="text-xs text-atenuado">{s.fechaDeseada ? `Para ${fecha(s.fechaDeseada)}` : ''}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
