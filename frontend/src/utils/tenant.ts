/**
 * Tenant Detection and Configuration
 * Fluxion AI - Multi-Tenant System
 */

export interface TenantConfig {
  id: string;
  name: string;
  logo?: string;
  primaryColor: string;
  secondaryColor: string;
  features: string[];
  customSettings?: Record<string, any>;
}

/**
 * Tenant configurations
 */
const TENANT_CONFIGS: Record<string, TenantConfig> = {
  granja: {
    id: 'granja',
    name: 'La Granja Mercado',
    logo: '/logos/granja.png',
    primaryColor: '#10b981', // verde
    secondaryColor: '#059669',
    features: ['inventory', 'sales', 'ai-insights', 'forecasting', 'reports'],
    customSettings: {
      showVenezuelanTaxes: true,
      currency: 'VES',
      timezone: 'America/Caracas',
      language: 'es',
    },
  },
  cliente2: {
    id: 'cliente2',
    name: 'Cliente 2 S.A.',
    logo: '/logos/cliente2.png',
    primaryColor: '#3b82f6', // azul
    secondaryColor: '#2563eb',
    features: ['inventory', 'sales'],
    customSettings: {
      currency: 'USD',
      timezone: 'UTC',
      language: 'es',
    },
  },
  admin: {
    id: 'admin',
    name: 'Fluxion AI Admin',
    logo: '/logos/fluxion-admin.png',
    primaryColor: '#8b5cf6', // morado
    secondaryColor: '#7c3aed',
    features: ['inventory', 'sales', 'ai-insights', 'forecasting', 'reports', 'admin-panel'],
    customSettings: {
      currency: 'USD',
      timezone: 'UTC',
      language: 'es',
    },
  },
};

/**
 * Extract tenant ID from current hostname
 * @returns tenant_id or null if no tenant
 */
export function getTenantId(): string | null {
  const hostname = window.location.hostname;

  // Development: use query param for testing
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const params = new URLSearchParams(window.location.search);
    const tenantParam = params.get('tenant');
    if (tenantParam) {
      console.log(`[Tenant] Using tenant from query param: ${tenantParam}`);
      return tenantParam;
    }

    // Default for development
    console.log('[Tenant] Using default tenant for development: granja');
    return 'granja';
  }

  // Production: extract from subdomain
  // Pattern: {tenant}.fluxionia.co
  const match = hostname.match(/^([a-z0-9-]+)\.fluxionia\.co$/);

  if (match) {
    const subdomain = match[1];

    // Ignore special subdomains (not tenants)
    if (['www', 'api'].includes(subdomain)) {
      console.log(`[Tenant] Ignoring special subdomain: ${subdomain}`);
      return null;
    }

    console.log(`[Tenant] Detected tenant from hostname: ${subdomain}`);
    return subdomain;
  }

  // Main domain (landing page)
  console.log('[Tenant] Main domain detected (landing page)');
  return null;
}

/**
 * Get tenant configuration
 */
export function getTenantConfig(tenantId: string | null): TenantConfig | null {
  if (!tenantId) {
    return null;
  }
  const config = TENANT_CONFIGS[tenantId];
  if (!config) {
    console.error(`[Tenant] Configuration not found for tenant: ${tenantId}`);
    return null;
  }
  return config;
}

/**
 * Validate if tenant exists and is configured
 */
export function validateTenant(tenantId: string): boolean {
  return tenantId in TENANT_CONFIGS;
}

/**
 * Get list of all configured tenants
 */
export function getAllTenants(): string[] {
  return Object.keys(TENANT_CONFIGS);
}

/**
 * React hook to get current tenant config
 * Throws error if no tenant or tenant not configured
 */
export function useTenantConfig(): TenantConfig {
  const tenantId = getTenantId();

  if (!tenantId) {
    throw new Error('No tenant found in hostname. This page requires a tenant subdomain.');
  }

  const config = getTenantConfig(tenantId);

  if (!config) {
    throw new Error(`Tenant '${tenantId}' is not configured. Please contact support.`);
  }

  return config;
}
