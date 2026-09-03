from __future__ import annotations

from typing import Any


class PlannerError(Exception):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status: int,
        field: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.field = field
        self.details = details or {}

    def payload(self) -> dict[str, Any]:
        error: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
        }
        if self.field:
            error["field"] = self.field
            error["fields"] = {self.field: self.message}
        if self.details:
            error["details"] = self.details
        return {"error": error}
