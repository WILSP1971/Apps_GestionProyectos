import './cargar-entorno'; // debe ser el primer import
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { FiltroErroresDominio } from './compartido/presentacion/filtro-errores-dominio';
import { validarEntorno } from './compartido/infraestructura/entorno';
import { esInterna, LimitadorVentana } from './compartido/infraestructura/limitador';

async function iniciar() {
  const { errores, avisos } = validarEntorno(process.env);
  avisos.forEach((a) => console.warn(`⚠ Configuración: ${a}`));
  if (errores.length && process.env.NODE_ENV === 'production') {
    console.error(`✖ La API no puede iniciar:\n  - ${errores.join('\n  - ')}\nRevise /opt/sierraflow/.env`);
    process.exit(1);
  }
  errores.forEach((e) => console.warn(`⚠ Configuración incompleta (desarrollo): ${e}`));

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Solo se confía en el proxy local (Nginx): la IP del cliente es la que Nginx agrega al final de
    // X-Forwarded-For, y un cliente no puede hacerse pasar por 127.0.0.1 enviando esa cabecera.
    new FastifyAdapter({ trustProxy: ['127.0.0.1', '::1'], bodyLimit: 2 * 1024 * 1024 }),
  );
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new FiltroErroresDominio());
  app.enableCors({ origin: [process.env.WEB_URL ?? 'http://localhost:3000'], credentials: true });
  await app.register(helmet);

  // Límite de peticiones por IP (las llamadas internas de Next.js no cuentan)
  const general = new LimitadorVentana(Number(process.env.LIMITE_PETICIONES_MIN ?? 1200), 60_000);
  const sensibles = new LimitadorVentana(Number(process.env.LIMITE_AUTH_MIN ?? 30), 60_000);
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook('onRequest', (req, reply, listo) => {
    if (esInterna(req.ip) || req.url.startsWith('/api/salud')) return listo();
    const r = (req.url.startsWith('/api/auth/') ? sensibles : general).permitir(req.ip);
    if (r.permitido) return listo();
    reply.header('Retry-After', String(r.reintentarEnSeg)).code(429)
      .send({ codigo: 'DEMASIADAS_PETICIONES', mensaje: `Demasiadas peticiones. Intente de nuevo en ${r.reintentarEnSeg} s.` });
  });
  // Respuestas con datos privados: que ningún proxy ni navegador las guarde en caché
  fastify.addHook('onSend', (_req, reply, cuerpo, listo) => {
    if (!reply.hasHeader('cache-control')) reply.header('Cache-Control', 'no-store');
    listo(null, cuerpo);
  });
  app.enableShutdownHooks();

  const puerto = Number(process.env.API_PORT ?? 4000);
  await app.listen(puerto, '127.0.0.1');
  console.log(`API SierraFlow escuchando en http://127.0.0.1:${puerto}/api`);
}
iniciar();
