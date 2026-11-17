import { BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/** Valida y transforma el cuerpo de la petición con un esquema Zod (de @sierraflow/contratos). */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly esquema: ZodSchema<T>) {}

  transform(valor: unknown): T {
    const r = this.esquema.safeParse(valor);
    if (!r.success) {
      throw new BadRequestException({
        codigo: 'DATOS_INVALIDOS',
        mensaje: 'Los datos enviados no son válidos',
        errores: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
      });
    }
    return r.data;
  }
}
