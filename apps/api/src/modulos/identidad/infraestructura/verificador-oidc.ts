import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose';

export type ProveedorOidc = 'google' | 'microsoft-entra-id';

export interface IdentidadExterna {
  proveedor: ProveedorOidc;
  sub: string;
  email: string;
  nombre: string;
  avatar?: string;
}

interface ConfigProveedor {
  emisor: string;
  jwks: string;
  audiencia: string;
}

function configuracion(p: ProveedorOidc): ConfigProveedor | null {
  if (p === 'google' && process.env.AUTH_GOOGLE_ID) {
    return {
      emisor: 'https://accounts.google.com',
      jwks: 'https://www.googleapis.com/oauth2/v3/certs',
      audiencia: process.env.AUTH_GOOGLE_ID,
    };
  }
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER?.replace(/\/$/, '');
  if (p === 'microsoft-entra-id' && issuer && process.env.AUTH_MICROSOFT_ENTRA_ID_ID) {
    return {
      emisor: issuer,
      jwks: issuer.replace(/\/v2\.0$/, '') + '/discovery/v2.0/keys',
      audiencia: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    };
  }
  return null;
}

const cacheJwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Verifica el id_token OIDC del proveedor (firma JWKS, emisor, audiencia y expiración). */
@Injectable()
export class VerificadorOidc {
  async verificar(proveedor: ProveedorOidc, idToken: string): Promise<IdentidadExterna> {
    const cfg = configuracion(proveedor);
    if (!cfg) throw new UnauthorizedException(`Proveedor ${proveedor} no configurado`);

    let jwks = cacheJwks.get(cfg.jwks);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(cfg.jwks));
      cacheJwks.set(cfg.jwks, jwks);
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(idToken, jwks, { issuer: cfg.emisor, audience: cfg.audiencia }));
    } catch {
      throw new UnauthorizedException('id_token inválido o expirado');
    }

    const email = String(payload.email ?? payload.preferred_username ?? '').toLowerCase();
    if (!email) throw new UnauthorizedException('El proveedor no entregó un correo');
    if (proveedor === 'google' && payload.email_verified === false) {
      throw new UnauthorizedException('Correo no verificado');
    }
    const dominio = process.env.DOMINIO_PERMITIDO;
    if (dominio && !email.endsWith('@' + dominio)) {
      throw new UnauthorizedException('Dominio de correo no autorizado');
    }
    return {
      proveedor,
      sub: String(payload.sub),
      email,
      nombre: String(payload.name ?? email),
      avatar: payload.picture ? String(payload.picture) : undefined,
    };
  }
}
