from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..db import pool
from ..dominio.calificacion import PuntajeCriterio, letra, nota_global
from ..seguridad import requiere_rol

router = APIRouter(prefix="/evaluaciones", tags=["Evaluación"])


class EntradaCalificacion(BaseModel):
    puntajes: dict[str, Annotated[int, Field(ge=1, le=5)]] = Field(
        ..., examples=[{"CRITERIOS": 4, "CODIGO_DOC": 4, "PLAZOS": 3, "IMPACTO_PROD": 5}]
    )


@router.post("/calcular")
async def calcular(e: EntradaCalificacion, _: Annotated[dict, Depends(requiere_rol("LIDER", "DIRECTOR"))]):
    pesos = {r["codigo"]: float(r["peso"]) for r in await pool().fetch(
        "SELECT codigo, peso FROM criterios_calificacion WHERE activo")}
    desconocidos = set(e.puntajes) - set(pesos)
    if desconocidos:
        raise HTTPException(422, f"Criterios desconocidos: {', '.join(sorted(desconocidos))}")
    faltantes = set(pesos) - set(e.puntajes)
    if faltantes:
        raise HTTPException(422, f"Faltan criterios: {', '.join(sorted(faltantes))}")
    n = nota_global([PuntajeCriterio(c, pesos[c], p) for c, p in e.puntajes.items()])
    return {"calificacion_global": n, "calificacion_letra": letra(n)}
