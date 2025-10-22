"""
Multi-Tenant Middleware
Extracts tenant_id from hostname or headers
"""

import re
import os
from fastapi import Request, HTTPException
from typing import Optional

# Load configuration
DOMAIN = os.getenv("DOMAIN", "fluxionia.co")
ALLOWED_TENANTS = os.getenv("ALLOWED_TENANTS", "granja,cliente2,admin").split(",")
SPECIAL_SUBDOMAINS = ["api", "www", "etl"]


class TenantMiddleware:
    """
    Middleware that extracts tenant_id from each request
    """

    @staticmethod
    def extract_tenant_from_host(host: str) -> Optional[str]:
        """
        Extract tenant from hostname

        Examples:
        - granja.fluxionia.co → "granja"
        - api.fluxionia.co → None (special subdomain)
        - fluxionia.co → None (main domain)
        - localhost → None (development)
        """
        # Development: localhost
        if "localhost" in host or "127.0.0.1" in host:
            return None

        # Production: extract from subdomain
        pattern = rf"^([a-z0-9-]+)\.{re.escape(DOMAIN)}"
        match = re.match(pattern, host)

        if not match:
            return None

        subdomain = match.group(1)

        # Ignore special subdomains
        if subdomain in SPECIAL_SUBDOMAINS:
            return None

        return subdomain

    @staticmethod
    def extract_tenant_from_header(request: Request) -> Optional[str]:
        """
        Extract tenant from X-Tenant-ID header
        """
        return request.headers.get("X-Tenant-ID") or request.headers.get("x-tenant-id")

    @staticmethod
    def extract_tenant(request: Request) -> Optional[str]:
        """
        Extract tenant from request (header or hostname)

        Priority:
        1. X-Tenant-ID header (explicit)
        2. Hostname (subdomain extraction)
        3. Default to None (will use 'granja' as default tenant in queries)
        """
        # Option 1: From header (highest priority)
        tenant_id = TenantMiddleware.extract_tenant_from_header(request)

        # Option 2: From hostname
        if not tenant_id:
            host = request.headers.get("host", "")
            tenant_id = TenantMiddleware.extract_tenant_from_host(host)

        # Validate tenant if present
        if tenant_id and tenant_id not in ALLOWED_TENANTS:
            return None  # Invalid tenant, treat as default

        return tenant_id

    @classmethod
    async def __call__(cls, request: Request, call_next):
        """
        Middleware execution

        Priority:
        1. X-Tenant-ID header (explicit)
        2. Hostname (subdomain extraction)
        """
        # Option 1: From header (highest priority)
        tenant_id = cls.extract_tenant_from_header(request)

        # Option 2: From hostname
        if not tenant_id:
            host = request.headers.get("host", "")
            tenant_id = cls.extract_tenant_from_host(host)

        # Validate tenant
        if tenant_id and tenant_id not in ALLOWED_TENANTS:
            raise HTTPException(
                status_code=404,
                detail=f"Tenant '{tenant_id}' not found or not active"
            )

        # Store in request state
        request.state.tenant_id = tenant_id

        # Log for debugging (optional)
        if tenant_id:
            print(f"[Tenant] Request for tenant: {tenant_id} | Path: {request.url.path}")

        # Continue with request
        response = await call_next(request)

        # Add response header (useful for debugging)
        if tenant_id:
            response.headers["X-Tenant-ID"] = tenant_id

        return response


# Dependency for FastAPI endpoints
def require_tenant(request: Request) -> str:
    """
    Dependency that ensures the request has a tenant
    Use in endpoints that require tenant context

    Example:
        @app.get("/api/v1/inventory")
        async def get_inventory(tenant_id: str = Depends(require_tenant)):
            # tenant_id is guaranteed to exist here
    """
    tenant_id = request.state.tenant_id
    if not tenant_id:
        raise HTTPException(
            status_code=400,
            detail="Tenant required. Please access via tenant subdomain or provide X-Tenant-ID header."
        )
    return tenant_id


# Optional: Dependency that allows null tenant (for public endpoints)
def get_tenant(request: Request) -> Optional[str]:
    """
    Dependency that returns tenant if available, None otherwise
    Use in endpoints that work with or without tenant

    Example:
        @app.get("/api/v1/public/stats")
        async def get_stats(tenant_id: Optional[str] = Depends(get_tenant)):
            if tenant_id:
                # Tenant-specific stats
            else:
                # Global stats
    """
    return request.state.tenant_id
