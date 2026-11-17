import asyncpg

from .config import config

_pool: asyncpg.Pool | None = None


async def iniciar_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        config.url_bd, min_size=1, max_size=10, server_settings={"search_path": "gestion,public"}
    )


async def cerrar_pool() -> None:
    if _pool:
        await _pool.close()


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("El pool de base de datos no está inicializado")
    return _pool
