import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ErrorDominio } from '../../../compartido/dominio/errores';
import { UsuarioActual } from '../../../compartido/dominio/usuario-actual';
import { Usuario } from '../../../compartido/presentacion/decoradores';
import { enTransaccion } from '../../../compartido/infraestructura/base-datos';
import { JwtGuard } from '../../identidad/presentacion/jwt.guard';
import { RepositorioAdjuntos, type Destino } from '../infraestructura/repositorio-adjuntos';

const opcional = new ParseUUIDPipe({ optional: true });

function destino(solicitud?: string, tarea?: string, avance?: string): Destino {
  if (!!solicitud === !!tarea) throw new ErrorDominio('DESTINO_INVALIDO', 'Indica ?solicitud=<id> o ?tarea=<id>');
  if (avance && !tarea) throw new ErrorDominio('DESTINO_INVALIDO', 'El avance requiere ?tarea=<id>');
  return solicitud ? { solicitudId: solicitud } : { tareaId: tarea!, avanceId: avance ?? null };
}

/**
 * Adjuntos (imágenes, PDF, documentos, código). Se suben en binario (application/octet-stream,
 * máx. 10 MB) con el nombre en la cabecera X-Nombre-Archivo (codificado con encodeURIComponent).
 */
@Controller('adjuntos')
@UseGuards(JwtGuard)
export class AdjuntosController {
  constructor(private readonly repo: RepositorioAdjuntos) {}

  @Get()
  listar(
    @Query('solicitud', opcional) solicitud: string | undefined,
    @Query('tarea', opcional) tarea: string | undefined,
    @Usuario() u: UsuarioActual,
  ) {
    return this.repo.listar(destino(solicitud, tarea), u);
  }

  @Post()
  subir(
    @Query('solicitud', opcional) solicitud: string | undefined,
    @Query('tarea', opcional) tarea: string | undefined,
    @Query('avance', opcional) avance: string | undefined,
    @Headers('x-nombre-archivo') nombreCodificado: string | undefined,
    @Body() cuerpo: unknown,
    @Usuario() u: UsuarioActual,
  ) {
    if (!Buffer.isBuffer(cuerpo)) throw new ErrorDominio('ADJUNTO_INVALIDO', 'Envía el archivo como application/octet-stream');
    let nombre = '';
    try { nombre = decodeURIComponent(nombreCodificado ?? ''); } catch { /* nombre inválido: lo rechaza la validación */ }
    nombre = nombre.replace(/[\\/\u0000-\u001f]/g, '_'); // sin rutas ni caracteres de control
    return enTransaccion(u.id, () => this.repo.subir(destino(solicitud, tarea, avance), nombre, cuerpo, u));
  }

  @Get(':id/contenido')
  async descargar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual, @Res() respuesta: FastifyReply) {
    const a = await this.repo.contenido(id, u);
    const enLinea = a.mime.startsWith('image/') || a.mime === 'application/pdf';
    respuesta
      .header('Content-Type', a.mime)
      .header('Content-Length', String(a.contenido.length))
      .header('Content-Disposition', `${enLinea ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.nombre)}`)
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Security-Policy', "default-src 'none'; sandbox")
      .header('Cache-Control', 'private, no-store')
      .send(a.contenido);
  }

  @Delete(':id')
  @HttpCode(204)
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @Usuario() u: UsuarioActual) {
    await enTransaccion(u.id, () => this.repo.eliminar(id, u));
  }
}
