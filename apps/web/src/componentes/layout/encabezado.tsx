export function Encabezado({
  antetitulo, titulo, descripcion, acciones,
}: { antetitulo?: string; titulo: React.ReactNode; descripcion?: string; acciones?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {antetitulo && <p className="text-xs font-medium uppercase tracking-wider text-primario">{antetitulo}</p>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="mt-1 text-sm text-atenuado">{descripcion}</p>}
      </div>
      {acciones}
    </div>
  );
}
