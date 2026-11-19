from typing import Annotated

from fastapi import APIRouter, Depends, Query

from ..db import pool
from ..dominio.calificacion import ordenar_letras
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


@router.get("/tiempos")
async def tiempos_ciclo(_: Gestor, dias: Annotated[int, Query(ge=7, le=1825)] = 365):
    """Promedios en horas de las solicitudes cerradas en los últimos `dias`: respuesta (envío→aprobación),
    lead time (envío→cierre) y cycle time (inicio de desarrollo→cierre), total y por departamento."""
    filas = await pool().fetch(
        """
        SELECT coalesce(d.nombre, 'Total') AS departamento, d.color_hex,
               count(*)::int AS cerradas,
               round(avg(extract(epoch FROM t.tiempo_respuesta) / 3600)::numeric, 1)::float8 AS respuesta_horas,
               round(avg(extract(epoch FROM t.lead_time) / 3600)::numeric, 1)::float8        AS lead_time_horas,
               round(avg(extract(epoch FROM t.cycle_time) / 3600)::numeric, 1)::float8       AS cycle_time_horas
          FROM v_tiempos_ciclo t
          JOIN solicitudes s   ON s.id = t.id
          JOIN departamentos d ON d.id = t.departamento_id
         WHERE s.fecha_cierre > now() - make_interval(days => $1)
         GROUP BY GROUPING SETS ((d.nombre, d.color_hex), ())
         ORDER BY (d.nombre IS NULL) DESC, d.nombre
        """,
        dias,
    )
    return [dict(f) for f in filas]


@router.get("/tendencia")
async def tendencia(_: Gestor, meses: Annotated[int, Query(ge=3, le=24)] = 12):
    """Solicitudes creadas, cerradas y rechazadas por mes (incluye meses sin movimiento)."""
    filas = await pool().fetch(
        """
        WITH m AS (
          SELECT generate_series(date_trunc('month', now()) - make_interval(months => $1 - 1),
                                 date_trunc('month', now()), interval '1 month') AS mes
        )
        SELECT to_char(m.mes, 'YYYY-MM') AS mes,
               (SELECT count(*) FROM solicitudes s WHERE NOT s.eliminado AND date_trunc('month', s.creado_en) = m.mes)::int     AS creadas,
               (SELECT count(*) FROM solicitudes s WHERE NOT s.eliminado AND date_trunc('month', s.fecha_cierre) = m.mes)::int  AS cerradas,
               (SELECT count(*) FROM historial_estados h
                 WHERE h.estado_nuevo = 'RECHAZADA' AND date_trunc('month', h.fecha) = m.mes)::int                              AS rechazadas
          FROM m ORDER BY m.mes
        """,
        meses,
    )
    return [dict(f) for f in filas]


@router.get("/calificaciones")
async def calificaciones(_: Gestor):
    """Desempeño: nota promedio por ingeniero y por departamento, y distribución de letras (última evaluación)."""
    ingenieros = await pool().fetch(
        """SELECT usuario_id, nombre_completo, evaluaciones, promedio_1a5::float8, promedio_0a10::float8, ultima_evaluacion
             FROM v_calificaciones_ingenieros ORDER BY promedio_0a10 DESC, nombre_completo"""
    )
    departamentos = await pool().fetch(
        """SELECT departamento, color_hex, solicitudes_evaluadas, promedio_global::float8
             FROM v_calificaciones_departamento ORDER BY promedio_global DESC"""
    )
    letras = await pool().fetch(
        """SELECT calificacion_letra AS letra, count(*)::int AS total
             FROM v_ultima_evaluacion GROUP BY 1"""
    )
    return {
        "ingenieros": [dict(f) for f in ingenieros],
        "departamentos": [dict(f) for f in departamentos],
        "distribucion": ordenar_letras({f["letra"]: f["total"] for f in letras}),
    }
