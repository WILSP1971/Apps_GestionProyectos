'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { MONEDAS, type CatalogosProyecto, type DetalleProyecto, type NuevoProyecto } from '@sierraflow/contratos';
import { Boton } from '@/componentes/ui/primitivos';

const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Number(v.replace(/[^\d.]/g, '')) || 0));

/** Crear o editar los datos generales, el plan y las finanzas de un proyecto (ventana modal). */
export function FormularioProyecto({ inicial, catalogos, alGuardar, alCerrar }: {
  inicial?: DetalleProyecto;
  catalogos: CatalogosProyecto | null;
  alGuardar: (datos: NuevoProyecto) => Promise<void>;
  alCerrar: () => void;
}) {
  const [f, setF] = useState({
    nombre: inicial?.nombre ?? '', descripcion: inicial?.descripcion ?? '',
    departamentoId: inicial?.departamentoId ?? '', directorId: inicial?.directorId ?? '',
    fechaInicio: inicial?.fechaInicio ?? '', fechaFinPlan: inicial?.fechaFinPlan ?? '',
    presupuesto: inicial?.presupuesto?.toString() ?? '', costoOtros: inicial?.costoOtros?.toString() ?? '',
    tarifaHora: inicial?.tarifaHora?.toString() ?? '', beneficioEsperado: inicial?.beneficioEsperado?.toString() ?? '',
    moneda: (inicial?.moneda ?? 'COP') as (typeof MONEDAS)[number],
  });
  const [guardando, setGuardando] = useState(false);
  const campo = (k: keyof typeof f) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  const fechasMal = !!f.fechaInicio && !!f.fechaFinPlan && f.fechaFinPlan < f.fechaInicio;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await alGuardar({
        nombre: f.nombre.trim(), descripcion: f.descripcion.trim() || null,
        departamentoId: f.departamentoId || null, directorId: f.directorId || null,
        fechaInicio: f.fechaInicio || null, fechaFinPlan: f.fechaFinPlan || null,
        presupuesto: num(f.presupuesto), costoOtros: num(f.costoOtros) ?? 0, tarifaHora: num(f.tarifaHora),
        beneficioEsperado: num(f.beneficioEsperado), moneda: f.moneda,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={inicial ? 'Editar proyecto' : 'Nuevo proyecto'}>
      <form onSubmit={enviar} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-borde bg-panel p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{inicial ? `Editar ${inicial.codigo}` : 'Nuevo proyecto'}</h2>
          <button type="button" onClick={alCerrar} aria-label="Cerrar"><X className="size-5 text-atenuado" /></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="etiqueta">Nombre</span>
            <input required minLength={3} maxLength={160} className="campo" {...campo('nombre')} placeholder="Ej.: Plataforma de pagos regionales" /></label>
          <label className="sm:col-span-2"><span className="etiqueta">Descripción y objetivo</span>
            <textarea rows={3} className="campo resize-y" {...campo('descripcion')} /></label>
          <label><span className="etiqueta">Departamento</span>
            <select className="campo" {...campo('departamentoId')}>
              <option value="">Sin departamento</option>
              {catalogos?.departamentos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select></label>
          <label><span className="etiqueta">Director del proyecto</span>
            <select className="campo" {...campo('directorId')}>
              <option value="">{inicial ? 'Sin director' : 'Yo'}</option>
              {catalogos?.directores.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select></label>
          <label><span className="etiqueta">Inicio planeado</span><input type="date" className="campo" {...campo('fechaInicio')} /></label>
          <label><span className="etiqueta">Fin planeado</span>
            <input type="date" className="campo" min={f.fechaInicio || undefined} {...campo('fechaFinPlan')} />
            {fechasMal && <span className="mt-1 block text-xs text-red-300">Debe ser posterior al inicio</span>}</label>

          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-atenuado sm:col-span-2">Presupuesto y retorno</p>
          <label><span className="etiqueta">Moneda</span>
            <select className="campo" {...campo('moneda')}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select></label>
          <label><span className="etiqueta">Presupuesto aprobado</span>
            <input inputMode="numeric" className="campo tabular-nums" {...campo('presupuesto')} placeholder="0" /></label>
          <label><span className="etiqueta">Costo por hora del equipo</span>
            <input inputMode="numeric" className="campo tabular-nums" {...campo('tarifaHora')} placeholder="Ej.: 85000" />
            <span className="mt-1 block text-[11px] text-atenuado">Costo de trabajo = horas reales de las tareas × esta tarifa.</span></label>
          <label><span className="etiqueta">Otros gastos</span>
            <input inputMode="numeric" className="campo tabular-nums" {...campo('costoOtros')} placeholder="Licencias, servicios, proveedores" /></label>
          <label className="sm:col-span-2"><span className="etiqueta">Beneficio esperado</span>
            <input inputMode="numeric" className="campo tabular-nums" {...campo('beneficioEsperado')} placeholder="Ahorros o ingresos que genera el proyecto" />
            <span className="mt-1 block text-[11px] text-atenuado">ROI = (beneficio − costo total) ÷ costo total.</span></label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Boton type="button" variante="secundario" onClick={alCerrar}>Cancelar</Boton>
          <Boton type="submit" disabled={guardando || f.nombre.trim().length < 3 || fechasMal}>
            {guardando && <Loader2 className="size-4 animate-spin" />}{inicial ? 'Guardar cambios' : 'Crear proyecto'}
          </Boton>
        </div>
      </form>
    </div>
  );
}
