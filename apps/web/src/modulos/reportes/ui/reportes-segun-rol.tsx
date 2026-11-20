'use client';

import { useUsuario } from '@/componentes/layout/proveedores';
import { perfilDe } from '@/componentes/layout/perfil';
import { MiDesempenoPanel } from './mi-desempeno';
import { PanelReportes } from './panel-reportes';

/** Gestión ve los reportes de toda la organización; el ingeniero, su reporte personal. */
export function ReportesSegunRol() {
  const { rolesVista } = useUsuario();
  return perfilDe(rolesVista) === 'GESTION' ? <PanelReportes /> : <MiDesempenoPanel />;
}
