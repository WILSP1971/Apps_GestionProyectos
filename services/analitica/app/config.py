from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

RAIZ = Path(__file__).resolve().parents[3]  # raíz del monorepo


class Config(BaseSettings):
    """Lee el mismo .env de la raíz del monorepo que la API y la web."""

    model_config = SettingsConfigDict(env_file=(RAIZ / ".env", ".env"), extra="ignore")

    # Usuario de solo lectura + publicación de eventos (ver database/seguridad/roles_seguridad.sql)
    database_url_analitica: str = ""
    database_url: str = ""
    jwt_clave_publica: str = ""
    jwt_emisor: str = "https://proyectos.sierrainnova.tech"
    jwt_audiencia: str = "sierraflow-api"
    zona_horaria: str = "America/Bogota"
    intervalo_sla_minutos: int = 15

    @property
    def url_bd(self) -> str:
        url = self.database_url_analitica or self.database_url
        # asyncpg no entiende el prefijo postgresql+driver
        return url.replace("postgresql+asyncpg://", "postgresql://")

    @property
    def clave_publica_pem(self) -> str:
        return self.jwt_clave_publica.replace("\\n", "\n").strip()


config = Config()
