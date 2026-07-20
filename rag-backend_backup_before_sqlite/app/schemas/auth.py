from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    password_confirm: str = Field(alias="passwordConfirm", min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=100)
    organization: str = Field(min_length=1, max_length=150)
    sido_code: str | None = Field(default=None, alias="sidoCode", max_length=10)
    sido_name: str | None = Field(default=None, alias="sidoName", max_length=50)
    sigungu_code: str | None = Field(default=None, alias="sigunguCode", max_length=10)
    sigungu_name: str | None = Field(default=None, alias="sigunguName", max_length=80)

    model_config = ConfigDict(populate_by_name=True)

    @model_validator(mode="after")
    def validate_password_match(self):
        if self.password != self.password_confirm:
            raise ValueError("비밀번호와 비밀번호 확인이 일치하지 않습니다.")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    name: str
    organization: str
    role: Literal["admin", "manager", "field"]
    is_active: bool = Field(alias="isActive")
    sido_code: str | None = Field(default=None, alias="sidoCode")
    sido_name: str | None = Field(default=None, alias="sidoName")
    sigungu_code: str | None = Field(default=None, alias="sigunguCode")
    sigungu_name: str | None = Field(default=None, alias="sigunguName")
    created_at: datetime | None = Field(default=None, alias="createdAt")
    last_login_at: datetime | None = Field(default=None, alias="lastLoginAt")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        serialize_by_alias=True,
    )


class AuthResponse(BaseModel):
    access_token: str = Field(alias="accessToken")
    token_type: Literal["bearer"] = Field(default="bearer", alias="tokenType")
    user: UserResponse

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)
