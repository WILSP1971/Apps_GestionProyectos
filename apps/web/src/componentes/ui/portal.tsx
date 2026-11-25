'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Saca su contenido al final de <body>. Las ventanas modales (position: fixed) lo necesitan cuando se
 * abren dentro de un contenedor con backdrop-blur o transform (p. ej. Tarjeta): sin él, el modal queda
 * recortado al tamaño de ese contenedor en lugar de cubrir la pantalla.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  return montado ? createPortal(children, document.body) : null;
}
