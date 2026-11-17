"""Job periódico: publica eventos sla.en_riesgo (≥80 % del SLA) y sla.vencido en el outbox.
La API los convierte en notificaciones (in-app, push, email)."""
import json
import logging

from ..db import pool

log = logging.getLogger("sierraflow.sla")

CONSULTA = """
WITH candidatas AS (
  SELECT s.id, s.codigo, s.titulo, s.solicitante_id,
         extract(epoch FROM now() - s.fecha_envio) / 3600 / s.sla_horas AS consumo
    FROM solicitudes s
   WHERE s.estado IN ('ENVIADA','EN_REVISION') AND s.fecha_envio IS NOT NULL AND NOT s.eliminado
)
SELECT c.*, CASE WHEN c.consumo >= 1 THEN 'sla.vencido' ELSE 'sla.en_riesgo' END AS tipo
  FROM candidatas c
 WHERE c.consumo >= 0.8
   AND NOT EXISTS (SELECT 1 FROM eventos_outbox o
                    WHERE o.agregado_id = c.id
                      AND o.tipo_evento = CASE WHEN c.consumo >= 1 THEN 'sla.vencido' ELSE 'sla.en_riesgo' END)
"""


async def revisar_sla() -> int:
    publicados = 0
    async with pool().acquire() as con, con.transaction():
        for f in await con.fetch(CONSULTA):
            await con.execute(
                "INSERT INTO eventos_outbox(agregado, agregado_id, tipo_evento, payload) VALUES ('Solicitud', $1, $2, $3)",
                f["id"],
                f["tipo"],
                json.dumps({
                    "codigo": f["codigo"],
                    "titulo": f["titulo"],
                    "solicitanteId": str(f["solicitante_id"]),
                    "consumoPct": round(float(f["consumo"]) * 100),
                }),
            )
            publicados += 1
    if publicados:
        log.info("SLA: %s eventos publicados", publicados)
    return publicados
