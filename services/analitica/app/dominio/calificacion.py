"""Reglas de calificación (lógica pura: sin base de datos, fácil de probar)."""
from dataclasses import dataclass


@dataclass(frozen=True)
class PuntajeCriterio:
    codigo: str
    peso: float  # 0..1
    puntaje: int  # 1..5

    def __post_init__(self) -> None:
        if not 1 <= self.puntaje <= 5:
            raise ValueError(f"Puntaje fuera de rango para {self.codigo}: {self.puntaje}")
        if self.peso <= 0:
            raise ValueError(f"Peso inválido para {self.codigo}: {self.peso}")


def nota_global(puntajes: list[PuntajeCriterio]) -> float:
    """Promedio ponderado (1–5) llevado a escala 0–10. Ej.: todo 5 → 10.0, todo 1 → 0.0."""
    total_peso = sum(p.peso for p in puntajes)
    if total_peso == 0:
        return 0.0
    promedio = sum(p.puntaje * p.peso for p in puntajes) / total_peso
    return round((promedio - 1) / 4 * 10, 2)


def letra(nota: float) -> str:
    """Debe coincidir con gestion.fn_letra_calificacion()."""
    for umbral, l in ((9.5, "A+"), (9.0, "A"), (8.0, "B+"), (7.0, "B"), (6.0, "C")):
        if nota >= umbral:
            return l
    return "D"


def avance_ponderado(tareas: list[tuple[float, int]]) -> float:
    """[(avance_pct, peso)] → avance total. Debe coincidir con gestion.fn_recalcular_avance()."""
    total = sum(peso for _, peso in tareas)
    if total == 0:
        return 0.0
    return round(sum(av * peso for av, peso in tareas) / total, 2)


LETRAS = ("A+", "A", "B+", "B", "C", "D")


def ordenar_letras(conteo: dict[str, int]) -> list[dict]:
    """Distribución de letras en orden de mejor a peor, incluyendo las que no tienen evaluaciones."""
    return [{"letra": l, "total": int(conteo.get(l, 0))} for l in LETRAS]
