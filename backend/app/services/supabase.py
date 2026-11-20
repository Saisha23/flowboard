"""User-scoped Supabase PostgREST client.

Each instance is bound to a single access token at construction time. Headers are
not mutated afterwards, and this module never reads a service-role key.
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import Settings


class SupabaseUserClient:
    """httpx client for `/rest/v1` that authenticates as one end user.

    PostgreSQL RLS sees `auth.uid()` from the forwarded user JWT, not a shared role.
    """

    def __init__(self, *, settings: Settings, access_token: str) -> None:
        # Headers are frozen for the lifetime of this instance (one HTTP request).
        self._http = httpx.AsyncClient(
            base_url=settings.rest_url,
            headers={
                "apikey": settings.supabase_anon_key,
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
            timeout=httpx.Timeout(15.0),
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    async def get_profile(self, user_id: str) -> dict[str, Any] | None:
        """Fetch `profiles` for `user_id`. RLS must restrict rows to the JWT subject."""
        try:
            response = await self._http.get(
                "/profiles",
                params={"id": f"eq.{user_id}", "select": "*"},
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Could not reach the Supabase Data API.",
            ) from exc

        if response.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Supabase rejected the user token for Data API access.",
            )
        if response.status_code == 403:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not allowed to read this profile.",
            )
        if response.status_code >= 400:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=_safe_postgrest_message(response),
            )

        payload = response.json()
        if not isinstance(payload, list):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unexpected profiles response from Supabase.",
            )
        if not payload:
            return None
        row = payload[0]
        if not isinstance(row, dict):
            return None
        return row

    async def select(
        self,
        table: str,
        *,
        params: dict[str, str] | None = None,
        order: str | None = None,
    ) -> list[dict[str, Any]]:
        query = dict(params or {})
        if order:
            query["order"] = order
        try:
            response = await self._http.get(f"/{table}", params=query)
        except httpx.RequestError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach the Supabase Data API.") from exc
        self._raise_postgrest(response)
        payload = response.json()
        if not isinstance(payload, list):
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unexpected Supabase response.")
        return [row for row in payload if isinstance(row, dict)]

    async def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self._http.post(
                f"/{table}",
                json=row,
                headers={"Prefer": "return=representation"},
            )
        except httpx.RequestError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach the Supabase Data API.") from exc
        self._raise_postgrest(response)
        payload = response.json()
        if isinstance(payload, list) and payload and isinstance(payload[0], dict):
            return payload[0]
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unexpected Supabase insert response.")

    async def update(
        self,
        table: str,
        *,
        match: dict[str, str],
        changes: dict[str, Any],
    ) -> dict[str, Any]:
        params = {key: f"eq.{value}" for key, value in match.items()}
        try:
            response = await self._http.patch(
                f"/{table}",
                params=params,
                json=changes,
                headers={"Prefer": "return=representation"},
            )
        except httpx.RequestError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach the Supabase Data API.") from exc
        self._raise_postgrest(response)
        payload = response.json()
        if isinstance(payload, list) and payload and isinstance(payload[0], dict):
            return payload[0]
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found or not accessible.")

    async def delete(self, table: str, *, match: dict[str, str]) -> None:
        params = {key: f"eq.{value}" for key, value in match.items()}
        try:
            response = await self._http.delete(f"/{table}", params=params)
        except httpx.RequestError as exc:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not reach the Supabase Data API.") from exc
        self._raise_postgrest(response)

    async def rpc(self, function: str, arguments: dict[str, Any]) -> Any:
        try:
            response = await self._http.post(f"/rpc/{function}", json=arguments)
        except httpx.RequestError as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Could not reach the Supabase Data API.",
            ) from exc
        self._raise_postgrest(response)
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                "Unexpected Supabase RPC response.",
            ) from exc

    def _raise_postgrest(self, response: httpx.Response) -> None:
        if response.status_code in {401, 403}:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN if response.status_code == 403 else status.HTTP_401_UNAUTHORIZED,
                "Supabase denied this operation.",
            )
        if response.status_code >= 400:
            try:
                body = response.json()
            except ValueError:
                body = {}
            code = body.get("code") if isinstance(body, dict) else None
            if code == "42501":
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "Supabase denied this operation.",
                )
            if code in {"22023", "23503", "23505", "23514"}:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    _safe_postgrest_message(response),
                )
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, _safe_postgrest_message(response))


def _safe_postgrest_message(response: httpx.Response) -> str:
    """Return a short error string without leaking request tokens or internals."""
    try:
        body = response.json()
        message = body.get("message") or body.get("hint") or body.get("details")
        if isinstance(message, str) and message:
            return f"Supabase Data API error ({response.status_code}): {message}"
    except ValueError:
        pass
    return f"Supabase Data API error ({response.status_code})."
