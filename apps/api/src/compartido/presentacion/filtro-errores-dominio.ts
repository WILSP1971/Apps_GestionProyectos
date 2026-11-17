import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ConflictoConcurrencia, ErrorDominio } from '../dominio/errores';

const ESTADO_HTTP: Record<string, number> = {
  NO_ENCONTRADO: 404,
  SIN_PERMISO: 403,
  CONFLICTO_VERSION: 409,
};

/** Traduce errores de dominio a respuestas HTTP coherentes. */
@Catch(ErrorDominio)
export class FiltroErroresDominio implements ExceptionFilter {
  catch(error: ErrorDominio, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<FastifyReply>();
    const status = error instanceof ConflictoConcurrencia ? 409 : ESTADO_HTTP[error.codigo] ?? 422;
    res.status(status).send({ codigo: error.codigo, mensaje: error.message });
  }
}
