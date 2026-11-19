'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFieldArray, useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { toast } from 'sonner';
import { AlertCircle, Check, CopyCheck, Plus, Save, Send, Sparkles, Trash2 } from 'lucide-react';
import {
  esquemaNuevaSolicitud, ETIQUETA_PRIORIDAD, ETIQUETA_TIPO, PRIORIDADES, TIPOS_SOLICITUD, type NuevaSolicitud,
} from '@sierraflow/contratos';
import { dbLocal } from '@/lib/offline/db';
import { cn, nuevoId } from '@/lib/utils';
import { Boton, Tarjeta } from '@/componentes/ui/primitivos';
import { useActor } from '@/componentes/layout/proveedores';
import { buscarSimilares, crearSolicitud } from '../aplicacion/casos-uso';
import { InsigniaPrioridad } from './insignias';

type Formulario = z.input<typeof esquemaNuevaSolicitud>;
type Form = UseFormReturn<Formulario>;

const PASOS = [
  { titulo: 'Información básica', campos: ['titulo', 'tipo', 'descripcion', 'objetivos'] },
  { titulo: 'Prioridad y detalle técnico', campos: ['prioridad', 'fechaDeseada', 'tecnologias', 'justificacion'] },
  { titulo: 'Criterios de aceptación', campos: ['criterios'] },
  { titulo: 'Revisión y envío', campos: [] },
] as const;

const TECNOLOGIAS = ['Next.js', 'React', 'Node.js', 'NestJS', 'Python/FastAPI', 'PostgreSQL', 'Stripe API', 'MercadoPago API', 'Nginx'];
const CLAVE_BORRADOR = 'borrador-nueva-solicitud';

const VALORES_INICIALES: Formulario = {
  titulo: '', descripcion: '', objetivos: '', justificacion: '', tipo: 'FUNCIONAL', prioridad: 'MEDIA',
  fechaDeseada: '', tecnologias: [], criterios: [], enviar: false,
};

function Error({ mensaje }: { mensaje?: string }) {
  return mensaje ? <p className="error-campo flex items-center gap-1"><AlertCircle className="size-3" />{mensaje}</p> : null;
}

function Segmentado<T extends string>({ opciones, valor, etiquetas, onChange }: { opciones: readonly T[]; valor: T; etiquetas: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-borde bg-fondo/60 p-1" role="radiogroup">
      {opciones.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={valor === o} onClick={() => onChange(o)}
          className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition',
            valor === o ? 'bg-primario text-slate-950' : 'text-atenuado hover:bg-panel-2 hover:text-texto')}>
          {etiquetas[o]}
        </button>
      ))}
    </div>
  );
}

function Stepper({ actual, irA }: { actual: number; irA: (i: number) => void }) {
  return (
    <ol className="mb-8 grid grid-cols-4 gap-2">
      {PASOS.map((p, i) => (
        <li key={p.titulo}>
          <button type="button" disabled={i > actual} onClick={() => irA(i)} className="group w-full text-left disabled:cursor-default">
            <div className={cn('h-1 rounded-full transition', i <= actual ? 'bg-primario' : 'bg-borde')} />
            <p className={cn('mt-2 text-[11px] font-medium uppercase tracking-wide', i === actual ? 'text-primario' : 'text-atenuado')}>Paso {i + 1}</p>
            <p className={cn('hidden text-xs sm:block', i === actual ? 'text-texto' : 'text-atenuado')}>{p.titulo}</p>
          </button>
        </li>
      ))}
    </ol>
  );
}

function PasoInformacion({ form }: { form: Form }) {
  const { register, watch, setValue, formState: { errors } } = form;
  return (
    <div className="space-y-5">
      <div>
        <label className="etiqueta" htmlFor="titulo">Título de la solicitud *</label>
        <input id="titulo" className="campo" placeholder="Ej.: Integración API Pagos Regionales (COP/USD)" {...register('titulo')} />
        <Error mensaje={errors.titulo?.message} />
      </div>
      <div>
        <span className="etiqueta">Tipo de requerimiento *</span>
        <Segmentado opciones={TIPOS_SOLICITUD} etiquetas={ETIQUETA_TIPO} valor={watch('tipo')} onChange={(v) => setValue('tipo', v, { shouldDirty: true })} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="descripcion">Descripción detallada *</label>
        <textarea id="descripcion" rows={5} className="campo resize-y" placeholder="¿Qué se necesita y para quién? Describe el contexto y el problema actual." {...register('descripcion')} />
        <Error mensaje={errors.descripcion?.message} />
      </div>
      <div>
        <label className="etiqueta" htmlFor="objetivos">Objetivos</label>
        <textarea id="objetivos" rows={2} className="campo resize-y" placeholder="Resultado esperado, medible si es posible." {...register('objetivos')} />
      </div>
    </div>
  );
}

function PasoDetalle({ form }: { form: Form }) {
  const { register, watch, setValue } = form;
  const seleccionadas = watch('tecnologias') ?? [];
  const alternar = (t: string) =>
    setValue('tecnologias', seleccionadas.includes(t) ? seleccionadas.filter((x) => x !== t) : [...seleccionadas, t], { shouldDirty: true });
  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <span className="etiqueta">Prioridad *</span>
          <Segmentado opciones={PRIORIDADES} etiquetas={ETIQUETA_PRIORIDAD} valor={watch('prioridad')} onChange={(v) => setValue('prioridad', v, { shouldDirty: true })} />
        </div>
        <div>
          <label className="etiqueta" htmlFor="fechaDeseada">Fecha deseada</label>
          <input id="fechaDeseada" type="date" className="campo" min={new Date().toISOString().slice(0, 10)} {...register('fechaDeseada')} />
        </div>
      </div>
      <div>
        <span className="etiqueta">Stack tecnológico sugerido</span>
        <div className="flex flex-wrap gap-2">
          {TECNOLOGIAS.map((t) => {
            const activa = seleccionadas.includes(t);
            return (
              <button key={t} type="button" onClick={() => alternar(t)} aria-pressed={activa}
                className={cn('inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition',
                  activa ? 'border-primario bg-primario/15 text-teal-200' : 'border-borde text-atenuado hover:border-borde-fuerte hover:text-texto')}>
                {activa && <Check className="size-3" />}{t}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="etiqueta" htmlFor="justificacion">Justificación / impacto en el negocio</label>
        <textarea id="justificacion" rows={3} className="campo resize-y" placeholder="¿Por qué es importante ahora? ¿Qué pasa si no se hace?" {...register('justificacion')} />
      </div>
    </div>
  );
}

function PasoCriterios({ form }: { form: Form }) {
  const { control, register, formState: { errors } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'criterios' });
  const agregar = () => append({ id: nuevoId(), orden: fields.length + 1, descripcion: '', cumplido: false });
  return (
    <div className="space-y-4">
      <p className="text-sm text-atenuado">Define cómo se comprobará que la solicitud quedó bien resuelta. Serán la base de la validación y del cierre.</p>
      <ul className="space-y-2">
        {fields.map((f, i) => (
          <li key={f.id} className="flex items-start gap-2">
            <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-primario/15 text-xs font-semibold text-teal-200">{i + 1}</span>
            <div className="flex-1">
              <input className="campo" placeholder="Ej.: Validación de transacciones exitosas" {...register(`criterios.${i}.descripcion` as const)} />
              <Error mensaje={errors.criterios?.[i]?.descripcion?.message} />
            </div>
            <button type="button" onClick={() => remove(i)} aria-label={`Quitar criterio ${i + 1}`} className="mt-1.5 rounded-lg p-1.5 text-atenuado hover:bg-peligro/10 hover:text-red-300">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <Boton type="button" variante="secundario" tamano="sm" onClick={agregar}><Plus className="size-4" /> Agregar criterio</Boton>
      <Error mensaje={errors.criterios?.message ?? errors.criterios?.root?.message} />
    </div>
  );
}

function PasoRevision({ valores }: { valores: Formulario }) {
  const fila = (etiqueta: string, valor: React.ReactNode) => (
    <div className="grid grid-cols-3 gap-4 border-b border-borde/50 py-2.5 text-sm last:border-0">
      <dt className="text-atenuado">{etiqueta}</dt><dd className="col-span-2">{valor || '—'}</dd>
    </div>
  );
  return (
    <dl>
      {fila('Título', valores.titulo)}
      {fila('Tipo', ETIQUETA_TIPO[valores.tipo])}
      {fila('Prioridad', <InsigniaPrioridad prioridad={valores.prioridad} />)}
      {fila('Fecha deseada', valores.fechaDeseada)}
      {fila('Descripción', <span className="whitespace-pre-line">{valores.descripcion}</span>)}
      {fila('Objetivos', valores.objetivos)}
      {fila('Justificación', valores.justificacion)}
      {fila('Stack', valores.tecnologias?.join(', '))}
      {fila('Criterios', (
        <ol className="list-decimal space-y-1 pl-4">{valores.criterios.map((c) => <li key={c.id}>{c.descripcion}</li>)}</ol>
      ))}
    </dl>
  );
}

export function AsistenteNuevaSolicitud() {
  const [paso, setPaso] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [similares, setSimilares] = useState<Awaited<ReturnType<typeof buscarSimilares>>>([]);
  const actor = useActor();
  const router = useRouter();
  const form = useForm<Formulario>({ resolver: zodResolver(esquemaNuevaSolicitud), defaultValues: VALORES_INICIALES, mode: 'onTouched' });
  const titulo = form.watch('titulo');

  // Restaura el borrador guardado en este equipo (sobrevive a recargas y a la falta de red)
  useEffect(() => {
    dbLocal.meta.get(CLAVE_BORRADOR).then((b) => {
      const v = b?.valor as Partial<Formulario> | undefined;
      const tieneContenido = !!(v?.titulo?.trim() || v?.descripcion?.trim() || v?.objetivos?.trim() || v?.criterios?.length);
      if (v && tieneContenido) {
        form.reset({ ...VALORES_INICIALES, ...v });
        toast.info('Se restauró tu borrador sin enviar');
      }
    });
  }, [form]);

  // Autoguardado
  useEffect(() => {
    const sub = form.watch((v) => { dbLocal.meta.put({ clave: CLAVE_BORRADOR, valor: v }); });
    return () => sub.unsubscribe();
  }, [form]);

  // Detección de duplicados (local, funciona offline)
  useEffect(() => {
    const t = setTimeout(() => buscarSimilares(titulo ?? '').then(setSimilares), 400);
    return () => clearTimeout(t);
  }, [titulo]);

  const siguiente = async () => {
    const ok = await form.trigger(PASOS[paso]!.campos as unknown as (keyof Formulario)[]);
    if (ok) setPaso((p) => p + 1);
  };

  const guardar = (enviar: boolean) => form.handleSubmit(async (v) => {
    setEnviando(true);
    try {
      // El orden se renumera aquí para que quede consecutivo aunque se hayan quitado criterios
      const criterios = (v.criterios ?? []).map((c, i) => ({ ...c, orden: i + 1, cumplido: false }));
      const id = await crearSolicitud({ ...(v as NuevaSolicitud), criterios, enviar }, actor);
      await dbLocal.meta.delete(CLAVE_BORRADOR);
      toast.success(enviar
        ? navigator.onLine ? 'Solicitud enviada para revisión' : 'Guardada sin conexión: se enviará al reconectar'
        : 'Borrador guardado');
      router.push(`/solicitudes/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setEnviando(false);
    }
  }, () => toast.error('Revisa los campos marcados'))();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Tarjeta>
        <Stepper actual={paso} irA={setPaso} />
        <h2 className="mb-5 text-lg font-semibold">{PASOS[paso]!.titulo}</h2>
        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {paso === 0 && <PasoInformacion form={form} />}
          {paso === 1 && <PasoDetalle form={form} />}
          {paso === 2 && <PasoCriterios form={form} />}
          {paso === 3 && <PasoRevision valores={form.getValues()} />}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-borde pt-5">
            <Link href="/mis-solicitudes" className="text-sm text-atenuado hover:text-texto">Cancelar</Link>
            <div className="flex gap-2">
              {paso > 0 && <Boton type="button" variante="fantasma" onClick={() => setPaso((p) => p - 1)}>Atrás</Boton>}
              {paso < PASOS.length - 1 ? (
                <Boton type="button" onClick={siguiente}>Siguiente</Boton>
              ) : (
                <>
                  <Boton type="button" variante="secundario" disabled={enviando} onClick={() => guardar(false)}><Save className="size-4" /> Guardar borrador</Boton>
                  <Boton type="button" disabled={enviando} onClick={() => guardar(true)}><Send className="size-4" /> Enviar solicitud</Boton>
                </>
              )}
            </div>
          </div>
        </form>
      </Tarjeta>

      <aside className="space-y-4">
        {similares.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-200"><CopyCheck className="size-4" /> Posibles solicitudes similares</p>
            <ul className="mt-3 space-y-2">
              {similares.map((s) => (
                <li key={s.id}>
                  <Link href={`/solicitudes/${s.id}`} target="_blank" className="block rounded-lg bg-fondo/50 p-2 text-xs hover:bg-fondo">
                    <span className="font-mono text-sky-300">{s.codigo}</span> · {s.titulo}
                    <span className="ml-1 text-amber-300">({Math.round(s.similitud * 100)}%)</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-amber-200/70">Revísalas antes de enviar para evitar duplicados.</p>
          </div>
        )}
        <div className="rounded-xl border border-borde bg-panel/60 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><Sparkles className="size-4 text-primario" /> Consejos</p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-xs text-atenuado">
            <li>Un buen título dice <em>qué</em> y <em>para quién</em>.</li>
            <li>Los criterios de aceptación deben poder verificarse con un sí o un no.</li>
            <li>Tu avance se guarda solo en este equipo, incluso sin conexión.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
