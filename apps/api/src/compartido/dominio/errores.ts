/** Violación de una regla de negocio. La capa de presentación la traduce a HTTP. */
export class ErrorDominio extends Error {
  constructor(public readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}

export class NoEncontrado extends ErrorDominio {
  constructor(entidad: string, id: string) {
    super('NO_ENCONTRADO', `${entidad} ${id} no existe`);
  }
}

export class SinPermiso extends ErrorDominio {
  constructor(mensaje: string) {
    super('SIN_PERMISO', mensaje);
  }
}

export class ConflictoConcurrencia extends ErrorDominio {
  constructor(entidad: string, id: string) {
    super('CONFLICTO_VERSION', `${entidad} ${id} fue modificada por otro usuario; recargue e intente de nuevo`);
  }
}
