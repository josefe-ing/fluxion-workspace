// Detect production environment at runtime
const isProduction =
  window.location.hostname.includes('cloudfront.net') ||
  window.location.hostname.includes('s3-website') ||
  window.location.hostname.includes('amazonaws.com');

// Use environment variable for backend URL, fallback to hardcoded values
const API_BASE_URL = import.meta.env.VITE_API_URL ?? (
  isProduction
    ? 'https://d276pm86hqqrs8.cloudfront.net' // Backend CloudFront with HTTPS
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
  async get(url: string, options?: { params?: Record<string, any> }) {
    const queryParams = options?.params
      ? '?' + new URLSearchParams(options.params).toString()
      : '';

    const fullUrl = `${API_BASE_URL}${url}${queryParams}`;
    console.log('🌐 HTTP GET:', fullUrl);

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
    console.log('✅ Response:', data);

    return { data };
  },

  async post(url: string, body: any) {
    const fullUrl = `${API_BASE_URL}${url}`;
    console.log('🌐 HTTP POST:', fullUrl);

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
};

export default http;
