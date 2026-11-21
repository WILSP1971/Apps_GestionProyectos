/**
 * Adjuntos de solicitudes y evidencias de avance: imágenes, PDF, documentos de oficina y archivos de
 * código. El tipo MIME lo decide el servidor por la extensión (nunca el navegador), y el código se
 * entrega siempre como texto plano descargable, de modo que un archivo nunca se ejecute en el navegador.
 */
export const TAMANO_MAX_ADJUNTO = 10 * 1024 * 1024; // 10 MB
export const MAX_ADJUNTOS_POR_ENVIO = 10;

const IMAGEN: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const DOCUMENTO: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv', txt: 'text/plain', md: 'text/plain', log: 'text/plain', zip: 'application/zip',
};
/** Archivos de código y configuración: se guardan y entregan como texto plano. */
const CODIGO = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'py', 'cs', 'csproj', 'sln', 'java', 'kt', 'go', 'php', 'rb', 'sql',
  'html', 'htm', 'css', 'scss', 'xml', 'yml', 'yaml', 'toml', 'ini', 'env.example', 'sh', 'ps1', 'bat', 'dockerfile', 'vue', 'razor', 'cshtml', 'config'];

export const EXTENSIONES_ADJUNTO: Readonly<Record<string, string>> = {
  ...IMAGEN, ...DOCUMENTO, ...Object.fromEntries(CODIGO.map((e) => [e, 'text/plain'])),
};

/** Para el selector de archivos del navegador. */
export const ACEPTAR_ADJUNTOS = Object.keys(EXTENSIONES_ADJUNTO).map((e) => `.${e}`).join(',');

export type CategoriaAdjunto = 'imagen' | 'pdf' | 'documento' | 'codigo';

export interface AdjuntoVista {
  id: string;
  nombre: string;
  mime: string;
  tamano: number;
  subidoPor: string;
  creadoEn: string;
  avanceId: string | null;
}

export function extensionDe(nombre: string): string {
  const n = nombre.toLowerCase().trim();
  if (n.endsWith('.env.example')) return 'env.example';
  if (n === 'dockerfile') return 'dockerfile';
  const i = n.lastIndexOf('.');
  return i > 0 ? n.slice(i + 1) : '';
}

/** Valida nombre y tamaño; devuelve el MIME que usará el servidor. */
export function validarAdjunto(nombre: string, tamano: number): { ok: true; mime: string } | { ok: false; error: string } {
  const limpio = nombre.trim();
  if (!limpio || limpio.length > 200) return { ok: false, error: 'El nombre del archivo debe tener entre 1 y 200 caracteres' };
  const mime = EXTENSIONES_ADJUNTO[extensionDe(limpio)];
  if (!mime) return { ok: false, error: `"${limpio}": tipo de archivo no permitido` };
  if (tamano <= 0) return { ok: false, error: `"${limpio}" está vacío` };
  if (tamano > TAMANO_MAX_ADJUNTO) return { ok: false, error: `"${limpio}" supera el máximo de 10 MB` };
  return { ok: true, mime };
}

export function categoriaAdjunto(nombre: string, mime: string): CategoriaAdjunto {
  if (mime.startsWith('image/')) return 'imagen';
  if (mime === 'application/pdf') return 'pdf';
  return CODIGO.includes(extensionDe(nombre)) ? 'codigo' : 'documento';
}

/** Firma binaria esperada (primeros bytes) para los formatos que el navegador muestra en línea. */
export function firmaValida(mime: string, cabecera: Uint8Array): boolean {
  const empieza = (...b: number[]) => b.every((x, i) => cabecera[i] === x);
  switch (mime) {
    case 'image/png': return empieza(0x89, 0x50, 0x4e, 0x47);
    case 'image/jpeg': return empieza(0xff, 0xd8, 0xff);
    case 'image/gif': return empieza(0x47, 0x49, 0x46, 0x38);
    case 'image/webp': return empieza(0x52, 0x49, 0x46, 0x46) && cabecera[8] === 0x57 && cabecera[9] === 0x45;
    case 'application/pdf': return empieza(0x25, 0x50, 0x44, 0x46);
    default: return true;
  }
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
