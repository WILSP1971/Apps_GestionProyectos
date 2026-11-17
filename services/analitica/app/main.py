import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from . import db
from .config import config
from .rutas import evaluaciones, kpis
from .tareas.sla import revisar_sla

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def ciclo_vida(_: FastAPI):
    await db.iniciar_pool()
    planificador = AsyncIOScheduler(timezone=config.zona_horaria)
    planificador.add_job(revisar_sla, "interval", minutes=config.intervalo_sla_minutos, id="sla", max_instances=1, coalesce=True)
    planificador.start()
    yield
    planificador.shutdown(wait=False)
    await db.cerrar_pool()


# root_path: Nginx publica este servicio bajo /analitica
app = FastAPI(title="SierraFlow · Analítica", version="0.1.0", root_path="/analitica", lifespan=ciclo_vida)
app.include_router(kpis.router)
app.include_router(evaluaciones.router)


@app.get("/salud", tags=["Salud"])
async def salud():
    try:
        await db.pool().fetchval("SELECT 1")
        return {"estado": "ok", "baseDatos": "ok"}
    except Exception:  # noqa: BLE001
        return {"estado": "degradado", "baseDatos": "error"}
