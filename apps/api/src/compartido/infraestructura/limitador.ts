/**
 * Límite de peticiones por cliente con ventana fija (en memoria, sin dependencias).
 * Suficiente para una sola instancia de la API detrás de Nginx; Nginx aplica además su propio límite.
 */
export interface Resultado {
  permitido: boolean;
  restantes: number;
  reintentarEnSeg: number;
}

export class LimitadorVentana {
  private readonly ventanas = new Map<string, { inicio: number; cuenta: number }>();

  constructor(private readonly limite: number, private readonly ventanaMs: number, private readonly maxClaves = 50_000) {}

  permitir(clave: string, ahora = Date.now()): Resultado {
    let v = this.ventanas.get(clave);
    if (!v || ahora - v.inicio >= this.ventanaMs) {
      if (!v && this.ventanas.size >= this.maxClaves) this.limpiar(ahora);
      v = { inicio: ahora, cuenta: 0 };
      this.ventanas.set(clave, v);
    }
    v.cuenta++;
    const permitido = v.cuenta <= this.limite;
    return {
      permitido,
      restantes: Math.max(0, this.limite - v.cuenta),
      reintentarEnSeg: permitido ? 0 : Math.ceil((v.inicio + this.ventanaMs - ahora) / 1000),
    };
  }

  /** Elimina ventanas vencidas (y, si aún sobran, las más antiguas) para acotar la memoria. */
  limpiar(ahora = Date.now()): void {
    for (const [k, v] of this.ventanas) if (ahora - v.inicio >= this.ventanaMs) this.ventanas.delete(k);
    if (this.ventanas.size >= this.maxClaves) {
      const sobrantes = this.ventanas.size - Math.floor(this.maxClaves / 2);
      let i = 0;
      for (const k of this.ventanas.keys()) { if (i++ >= sobrantes) break; this.ventanas.delete(k); }
    }
  }

  get tamano() { return this.ventanas.size; }
}

/** Peticiones internas (Next.js en el mismo servidor) no se limitan: no pasan por Nginx. */
export const esInterna = (ip: string | undefined) => ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
