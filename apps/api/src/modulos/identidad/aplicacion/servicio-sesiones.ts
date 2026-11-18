import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { db, enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { AUDIENCIA, clavePrivada, EMISOR } from '../infraestructura/claves-jwt';
import { PerfilUsuario, RepositorioUsuarios } from '../infraestructura/repositorio-usuarios';
import { ProveedorOidc, VerificadorOidc } from '../infraestructura/verificador-oidc';

const DURACION_ACCESS_SEG = 15 * 60;
const DURACION_REFRESH_DIAS = 30;
/**
 * Periodo de gracia: si dos procesos (middleware, página, otra pestaña) renuevan casi al mismo
 * tiempo con el mismo refresh token, el segundo no se trata como robo.
 */
const GRACIA_REUSO_MS = 2 * 60 * 1000;
const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export interface TokensSesion {
  accessToken: string;
  refreshToken: string;
  expiraEn: number; // epoch ms del access token
  usuario: PerfilUsuario;
}

/**
 * OAuth 2.0: intercambia el id_token del IdP por tokens propios de la API
 * (access JWT RS256 de 15 min + refresh token opaco rotativo con detección de reutilización).
 */
@Injectable()
export class ServicioSesiones {
  constructor(
    private readonly oidc: VerificadorOidc,
    private readonly usuarios: RepositorioUsuarios,
  ) {}

  async intercambiar(proveedor: ProveedorOidc, idToken: string, meta: { ua?: string; ip?: string }): Promise<TokensSesion> {
    const ext = await this.oidc.verificar(proveedor, idToken);
    return enTransaccion(null, async () => {
      const usuario = await this.usuarios.registrarAcceso(ext);
      if (!usuario.activo) throw new UnauthorizedException('Usuario inactivo');
      const refreshToken = await this.crearRefresh(usuario.id, randomUUID(), meta);
      return { ...(await this.emitirAccess(usuario)), refreshToken, usuario };
    });
  }

  async refrescar(refreshToken: string): Promise<TokensSesion> {
    return enTransaccion(null, async () => {
      const { rows: [s] } = await db().query(
        `SELECT * FROM gestion.sesiones_refresh WHERE token_hash = $1 FOR UPDATE`, [hash(refreshToken)]);
      if (!s || new Date(s.expira_en) < new Date()) throw new UnauthorizedException('Sesión expirada');
      const enGracia = s.revocado_en && s.reemplazado_por
        && Date.now() - new Date(s.revocado_en).getTime() < GRACIA_REUSO_MS;
      if (s.revocado_en && !enGracia) {
        // Token reutilizado fuera del periodo de gracia ⇒ posible robo: se revoca toda la familia
        await db().query(
          `UPDATE gestion.sesiones_refresh SET revocado_en = now() WHERE familia_id = $1 AND revocado_en IS NULL`,
          [s.familia_id]);
        throw new UnauthorizedException('Sesión comprometida; inicie sesión de nuevo');
      }
      const usuario = await this.usuarios.porId(s.usuario_id);
      if (!usuario?.activo) throw new UnauthorizedException('Usuario inactivo');
      const nuevo = await this.crearRefresh(usuario.id, s.familia_id, { ua: s.user_agent, ip: s.ip });
      await db().query(
        `UPDATE gestion.sesiones_refresh
            SET revocado_en = coalesce(revocado_en, now()),
                reemplazado_por = (SELECT id FROM gestion.sesiones_refresh WHERE token_hash = $2)
          WHERE id = $1`,
        [s.id, hash(nuevo)]);
      return { ...(await this.emitirAccess(usuario)), refreshToken: nuevo, usuario };
    });
  }

  async cerrar(refreshToken: string): Promise<void> {
    await db().query(
      `UPDATE gestion.sesiones_refresh SET revocado_en = now()
        WHERE familia_id = (SELECT familia_id FROM gestion.sesiones_refresh WHERE token_hash = $1)
          AND revocado_en IS NULL`,
      [hash(refreshToken)]);
  }

  private async emitirAccess(u: PerfilUsuario) {
    const ahora = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({ roles: u.roles, dep: u.departamentoId, nombre: u.nombre })
      .setProtectedHeader({ alg: 'RS256', kid: 'sierraflow-1' })
      .setSubject(u.id)
      .setIssuer(EMISOR())
      .setAudience(AUDIENCIA())
      .setIssuedAt(ahora)
      .setExpirationTime(ahora + DURACION_ACCESS_SEG)
      .sign(await clavePrivada());
    return { accessToken, expiraEn: (ahora + DURACION_ACCESS_SEG) * 1000 };
  }

  private async crearRefresh(usuarioId: string, familiaId: string, meta: { ua?: string; ip?: string }) {
    const token = randomBytes(48).toString('base64url');
    await db().query(
      `INSERT INTO gestion.sesiones_refresh(usuario_id, token_hash, familia_id, user_agent, ip, expira_en)
       VALUES ($1, $2, $3, $4, $5::inet, now() + make_interval(days => $6))`,
      [usuarioId, hash(token), familiaId, meta.ua ?? null, meta.ip ?? null, DURACION_REFRESH_DIAS]);
    return token;
  }
}
