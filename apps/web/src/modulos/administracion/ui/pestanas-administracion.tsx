'use client';

import { useState } from 'react';
import { AppWindow, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PanelAplicaciones } from './panel-aplicaciones';
import { PanelUsuarios } from './panel-usuarios';

/** Administración: usuarios y equipos, y catálogo de aplicaciones de software. */
export function PestanasAdministracion() {
  const [pestana, setPestana] = useState<'usuarios' | 'aplicaciones'>('usuarios');
  return (
    <div className="space-y-5">
      <div className="inline-flex gap-1 rounded-xl border border-borde bg-panel/60 p-1" role="tablist">
        {([['usuarios', 'Usuarios y equipos', UsersRound], ['aplicaciones', 'Aplicaciones', AppWindow]] as const).map(([k, t, I]) => (
          <button key={k} role="tab" type="button" aria-selected={pestana === k} onClick={() => setPestana(k)}
            className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition', pestana === k ? 'bg-primario/15 font-medium text-teal-100' : 'text-atenuado hover:text-texto')}>
            <I className="size-4" />{t}
          </button>
        ))}
      </div>
      {pestana === 'usuarios' ? <PanelUsuarios /> : <PanelAplicaciones />}
    </div>
  );
}
