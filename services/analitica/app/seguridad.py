"""Valida el mismo access token RS256 que emite la API NestJS (OAuth 2.0)."""
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import config

_bearer = HTTPBearer(auto_error=False)


def usuario_actual(cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]) -> dict:
    if cred is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falta el token de acceso")
    try:
        p = jwt.decode(
            cred.credentials,
            config.clave_publica_pem,
            algorithms=["RS256"],
            audience=config.jwt_audiencia,
            issuer=config.jwt_emisor,
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado") from e
    return {"id": p["sub"], "roles": p.get("roles", []), "departamento_id": p.get("dep")}


def requiere_rol(*roles: str):
    def _verificar(u: Annotated[dict, Depends(usuario_actual)]) -> dict:
        if "ADMIN" not in u["roles"] and not set(roles) & set(u["roles"]):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Su rol no permite esta operación")
        return u

    return _verificar
