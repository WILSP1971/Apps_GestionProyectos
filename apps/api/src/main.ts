import './cargar-entorno'; // debe ser el primer import
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import { AppModule } from './app.module';
import { FiltroErroresDominio } from './compartido/presentacion/filtro-errores-dominio';

async function iniciar() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 2 * 1024 * 1024 }),
  );
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new FiltroErroresDominio());
  app.enableCors({ origin: [process.env.WEB_URL ?? 'http://localhost:3000'], credentials: true });
  await app.register(helmet);
  app.enableShutdownHooks();

  const puerto = Number(process.env.API_PORT ?? 4000);
  await app.listen(puerto, '127.0.0.1');
  console.log(`API SierraFlow escuchando en http://127.0.0.1:${puerto}/api`);
}
iniciar();
