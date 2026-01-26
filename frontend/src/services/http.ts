// Detect production environment at runtime
const isProduction =
  window.location.hostname.includes('cloudfront.net') ||
  window.location.hostname.includes('s3-website') ||
  window.location.hostname.includes('amazonaws.com') ||
  window.location.hostname.includes('fluxionia.co');

// Use environment variable for backend URL, fallback to hardcoded values
const API_BASE_URL = import.meta.env.VITE_API_URL ?? (
  isProduction
    ? 'https://api.fluxionia.co' // Backend API domain
    : 'http://localhost:8001'
);

// Debug log to verify which URL is being used
console.log('🔧 Environment:', {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  isProduction,
  API_BASE_URL,
});

// Helper to get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
};

// Simple HTTP client using native fetch
const http = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async get(url: string, options?: { params?: Record<string, any> }) {
    // Filter out undefined/null values from params
    const cleanParams = options?.params
      ? Object.fromEntries(
          Object.entries(options.params).filter(([_, v]) => v !== undefined && v !== null)
        )
      : {};

    const queryParams = Object.keys(cleanParams).length > 0
      ? '?' + new URLSearchParams(cleanParams).toString()
      : '';

    const fullUrl = `${API_BASE_URL}${url}${queryParams}`;

    const response = await fetch(fullUrl, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      // Si es 401, limpiar token y redirigir a login
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');
        localStorage.removeItem('nombre_completo');
        window.location.reload();
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { data };
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async post(url: string, body: any) {
    const fullUrl = `${API_BASE_URL}${url}`;

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Si es 401, limpiar token y redirigir a login
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');
        localStorage.removeItem('nombre_completo');
        window.location.reload();
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { data };
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async put(url: string, body: any) {
    const fullUrl = `${API_BASE_URL}${url}`;

    const response = await fetch(fullUrl, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Si es 401, limpiar token y redirigir a login
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');
        localStorage.removeItem('nombre_completo');
        window.location.reload();
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { data };
  },

  async delete(url: string) {
    const fullUrl = `${API_BASE_URL}${url}`;

    const response = await fetch(fullUrl, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      // Si es 401, limpiar token y redirigir a login
      if (response.status === 401) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('username');
        localStorage.removeItem('nombre_completo');
        window.location.reload();
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { data };
  },
};

export default http;
