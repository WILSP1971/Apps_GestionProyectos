'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { Boton } from '@/componentes/ui/primitivos';
import { useUsuario } from '@/componentes/layout/proveedores';
import { creaSolicitudes } from '@/componentes/layout/perfil';

/** Botón "Nueva solicitud": solo para el solicitante (gestión las recibe en la bandeja). */
export function BotonNuevaSolicitud() {
  const { rolesVista } = useUsuario();
  if (!creaSolicitudes(rolesVista)) return null;
  return <Link href="/solicitudes/nueva"><Boton><Plus className="size-4" /> Nueva solicitud</Boton></Link>;
}
