import { importPKCS8, importSPKI, KeyLike } from 'jose';

/** Las claves PEM se guardan en .env en una sola línea con "\n" literales. */
const normalizar = (pem?: string) => (pem ?? '').replace(/\\n/g, '\n').trim();

let privada: Promise<KeyLike> | undefined;
let publica: Promise<KeyLike> | undefined;

export const clavePrivada = () => {
  if (!process.env.JWT_CLAVE_PRIVADA) throw new Error('Falta JWT_CLAVE_PRIVADA en el entorno');
  return (privada ??= importPKCS8(normalizar(process.env.JWT_CLAVE_PRIVADA), 'RS256'));
};

export const clavePublica = () => {
  if (!process.env.JWT_CLAVE_PUBLICA) throw new Error('Falta JWT_CLAVE_PUBLICA en el entorno');
  return (publica ??= importSPKI(normalizar(process.env.JWT_CLAVE_PUBLICA), 'RS256'));
};

export const EMISOR = () => process.env.JWT_EMISOR ?? 'https://proyectos.sierrainnova.tech';
export const AUDIENCIA = () => process.env.JWT_AUDIENCIA ?? 'sierraflow-api';
