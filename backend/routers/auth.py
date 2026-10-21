"""Password authentication and sysadmin-controlled account lifecycle."""

from uuid import UUID
from fastapi import APIRouter, Depends, Request, Response
from schemas.auth import (
    AuditOut,
    LoginIn,
    MessageOut,
    RoleIn,
    SignupIn,
    StatusIn,
    TokenOut,
    UserOut,
)
from security.dependencies import current_user, service, sysadmin
from security.service import AuthService

router = APIRouter(tags=["authentication"])
admin_router = APIRouter(tags=["administration"], dependencies=[Depends(sysadmin)])


@router.post("/signup", response_model=MessageOut, status_code=202)
def signup(body: SignupIn, request: Request, auth: AuthService = Depends(service)):
    auth.signup(
        str(body.email),
        body.name,
        body.password.get_secret_value(),
        request.client.host if request.client else "unknown",
    )
    return {
        "message": "If eligible, your request will be reviewed by an administrator."
    }


@router.post("/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, auth: AuthService = Depends(service)):
    return auth.login(
        str(body.email),
        body.password.get_secret_value(),
        request.client.host if request.client else "unknown",
    )


@router.get("/me", response_model=UserOut)
def me(principal=Depends(current_user)):
    return principal["user"]


@router.post("/logout", status_code=204)
def logout(principal=Depends(current_user), auth: AuthService = Depends(service)):
    auth.logout(principal["token"])
    return Response(status_code=204)


@admin_router.get("/users", response_model=list[UserOut])
def users(principal=Depends(sysadmin), auth: AuthService = Depends(service)):
    return auth.list_users(principal["token"])


@admin_router.post("/users/{user_id}/approve", response_model=UserOut)
def approve(
    user_id: UUID,
    body: RoleIn,
    principal=Depends(sysadmin),
    auth: AuthService = Depends(service),
):
    return auth.change_user(principal["token"], str(user_id), "approve", role=body.role)


@admin_router.post("/users/{user_id}/reject", response_model=UserOut)
def reject(
    user_id: UUID, principal=Depends(sysadmin), auth: AuthService = Depends(service)
):
    return auth.change_user(principal["token"], str(user_id), "reject")


@admin_router.patch("/users/{user_id}/role", response_model=UserOut)
def change_role(
    user_id: UUID,
    body: RoleIn,
    principal=Depends(sysadmin),
    auth: AuthService = Depends(service),
):
    return auth.change_user(
        principal["token"], str(user_id), "role_change", role=body.role
    )


@admin_router.patch("/users/{user_id}/status", response_model=UserOut)
def change_status(
    user_id: UUID,
    body: StatusIn,
    principal=Depends(sysadmin),
    auth: AuthService = Depends(service),
):
    return auth.change_user(
        principal["token"], str(user_id), "status_change", status=body.status
    )


@admin_router.get("/audit", response_model=list[AuditOut])
def audit(principal=Depends(sysadmin), auth: AuthService = Depends(service)):
    return auth.audit_log(principal["token"])
