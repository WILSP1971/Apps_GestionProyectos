import pytest

from app.dominio.calificacion import PuntajeCriterio, avance_ponderado, letra, nota_global, ordenar_letras


def test_nota_global_extremos():
    assert nota_global([PuntajeCriterio("A", 0.5, 5), PuntajeCriterio("B", 0.5, 5)]) == 10.0
    assert nota_global([PuntajeCriterio("A", 1, 1)]) == 0.0


def test_nota_global_ponderada():
    n = nota_global([PuntajeCriterio("A", 0.5, 5), PuntajeCriterio("B", 0.5, 4)])
    assert n == 8.75
    assert letra(n) == "B+"


def test_letras():
    assert [letra(x) for x in (9.6, 9.0, 8.2, 7.1, 6.0, 3.0)] == ["A+", "A", "B+", "B", "C", "D"]


def test_puntaje_invalido():
    with pytest.raises(ValueError):
        PuntajeCriterio("A", 0.5, 6)


def test_avance_ponderado_igual_al_trigger_de_bd():
    # Backend 90% (peso 3), Frontend 70% (peso 2), QA 10% (peso 1) → 70.0 (verificado en PostgreSQL)
    assert avance_ponderado([(90, 3), (70, 2), (10, 1)]) == 70.0


def test_distribucion_de_letras_completa_y_ordenada():
    d = ordenar_letras({"B": 2, "A+": 1})
    assert [x["letra"] for x in d] == ["A+", "A", "B+", "B", "C", "D"]
    assert [x["total"] for x in d] == [1, 0, 0, 2, 0, 0]


def test_nota_con_pesos_de_la_semilla_coincide_con_la_web():
    # Mismo caso que packages/contratos/test/calificacion.test.ts → 7.38 (B)
    n = nota_global([PuntajeCriterio("CRITERIOS", 0.35, 4), PuntajeCriterio("CODIGO_DOC", 0.20, 4),
                     PuntajeCriterio("PLAZOS", 0.25, 3), PuntajeCriterio("IMPACTO_PROD", 0.20, 5)])
    assert n == 7.38 and letra(n) == "B"
