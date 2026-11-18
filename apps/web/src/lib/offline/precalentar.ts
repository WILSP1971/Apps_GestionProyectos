/**
 * Precalentado de la caché del Service Worker: visita en segundo plano las pantallas principales
 * para que se puedan abrir aunque se pierda la conexión antes de haberlas visitado.
 * El SW reconoce la cabecera X-Precalentar y guarda la respuesta HTML en la caché "paginas".
 */
export const ID_PLANTILLA_DETALLE = '00000000-0000-4000-8000-000000000000';

const RUTAS = [
  '/dashboard',
  '/mis-solicitudes',
  '/solicitudes',
  '/solicitudes/nueva',
  // Plantilla del detalle: sirve para abrir sin conexión cualquier solicitud (el id se lee de la URL)
  `/solicitudes/${ID_PLANTILLA_DETALLE}`,
];

export function precalentarPaginas() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !navigator.onLine) return;
  try {
    if (sessionStorage.getItem('sierraflow.precalentado')) return;
    sessionStorage.setItem('sierraflow.precalentado', '1');
  } catch {
    /* sin sessionStorage: se precalienta igual */
  }
  navigator.serviceWorker.ready
    .then(() => new Promise((r) => setTimeout(r, 3_000))) // no competir con la carga inicial
    .then(() =>
      Promise.allSettled(
        RUTAS.map((ruta) => fetch(ruta, { headers: { 'X-Precalentar': '1' }, credentials: 'same-origin', cache: 'no-store' })),
      ),
    )
    .catch(() => undefined);
}
