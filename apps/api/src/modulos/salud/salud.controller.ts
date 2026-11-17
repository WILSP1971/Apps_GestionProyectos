import { Controller, Get } from '@nestjs/common';
import { pool } from '../../compartido/infraestructura/base-datos';

@Controller('salud')
export class SaludController {
  @Get()
  async salud() {
    const inicio = Date.now();
    let baseDatos = 'ok';
    try {
      await pool.query('SELECT 1');
    } catch {
      baseDatos = 'error';
    }
    return { estado: baseDatos === 'ok' ? 'ok' : 'degradado', baseDatos, latenciaMs: Date.now() - inicio, version: '0.1.0' };
  }
}
