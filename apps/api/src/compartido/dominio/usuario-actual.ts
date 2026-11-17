export type Rol = 'SOLICITANTE' | 'INGENIERO' | 'LIDER' | 'DIRECTOR' | 'ADMIN';

/** Actor autenticado que ejecuta un caso de uso (extraído del access token). */
export interface UsuarioActual {
  id: string;
  roles: Rol[];
  departamentoId: string | null;
}
