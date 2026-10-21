from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from security.service import AuthService

bearer = HTTPBearer(auto_error=False)


def service(request: Request) -> AuthService:
    return request.app.state.auth


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    auth: AuthService = Depends(service),
):
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            401, "Invalid or expired session", headers={"WWW-Authenticate": "Bearer"}
        )
    return auth.authenticate(credentials.credentials)


def sysadmin(principal=Depends(current_user)):
    if principal["user"]["role"] != "sysadmin":
        raise HTTPException(403, "Sysadmin access required")
    return principal
