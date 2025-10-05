const API_BASE_URL = 'http://localhost:8001';

// Simple HTTP client using native fetch
const http = {
  async get(url: string, options?: { params?: Record<string, any> }) {
    const queryParams = options?.params
      ? '?' + new URLSearchParams(options.params).toString()
      : '';

    const fullUrl = `${API_BASE_URL}${url}${queryParams}`;
    console.log('🌐 HTTP GET:', fullUrl);

    const response = await fetch(fullUrl);

    if (!response.ok) {
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
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return { data };
  },
};

export default http;
