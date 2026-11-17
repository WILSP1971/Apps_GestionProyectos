import pytest

from app.dominio.calificacion import PuntajeCriterio, avance_ponderado, letra, nota_global


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
