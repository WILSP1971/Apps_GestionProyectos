from typing import Annotated

from fastapi import APIRouter, Depends

from ..db import pool
from ..seguridad import requiere_rol

router = APIRouter(prefix="/kpis", tags=["KPIs"])
Gestor = Annotated[dict, Depends(requiere_rol("LIDER", "DIRECTOR"))]


@router.get("/resumen")
async def resumen(_: Gestor):
    f = await pool().fetchrow(
        """
        SELECT count(*)                                                           AS total,
               count(*) FILTER (WHERE estado IN ('ASIGNADA','EN_DESARROLLO','EN_VALIDACION')) AS en_ejecucion,
               count(*) FILTER (WHERE prioridad IN ('ALTA','CRITICA')
                                  AND estado NOT IN ('CERRADA','CANCELADA','RECHAZADA')) AS prioritarias,
               count(*) FILTER (WHERE estado = 'CERRADA')                        AS cerradas,
               round(avg(extract(epoch FROM fecha_cierre - fecha_envio) / 3600)::numeric, 1) AS lead_time_horas
          FROM solicitudes WHERE NOT eliminado
        """
    )
    return dict(f)


@router.get("/departamentos")
async def por_departamento(_: Gestor):
    filas = await pool().fetch("SELECT departamento, color_hex, estado, total FROM v_kpi_departamento_estado ORDER BY departamento")
    return [dict(f) for f in filas]


@router.get("/carga-mensual")
async def carga_mensual(_: Gestor):
    filas = await pool().fetch(
        """
        SELECT to_char(date_trunc('month', creado_en), 'YYYY-MM') AS mes, count(*)::int AS solicitudes
          FROM solicitudes
         WHERE creado_en > now() - interval '12 months' AND NOT eliminado
         GROUP BY 1 ORDER BY 1
        """
    )
    return [dict(f) for f in filas]


@router.get("/sla")
async def cumplimiento_sla(_: Gestor):
    f = await pool().fetchrow(
        """
        SELECT round(100.0 * count(*) FILTER (WHERE fecha_aprobacion <= fecha_envio + make_interval(hours => sla_horas))
                     / nullif(count(*), 0), 1) AS cumplimiento_pct,
               count(*) FILTER (WHERE fecha_aprobacion IS NULL AND estado IN ('ENVIADA','EN_REVISION')
                                  AND now() > fecha_envio + make_interval(hours => sla_horas))::int AS vencidas_abiertas
          FROM solicitudes
         WHERE fecha_envio IS NOT NULL AND NOT eliminado
        """
    )
    return dict(f)


@router.get("/carga-ingenieros")
async def carga_ingenieros(_: Gestor):
    filas = await pool().fetch("SELECT * FROM v_carga_ingenieros ORDER BY carga_pct DESC")
    return [dict(f) for f in filas]
