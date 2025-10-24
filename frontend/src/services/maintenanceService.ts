import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface MaintenanceStatus {
  is_maintenance: boolean;
  current_time: string;
  maintenance_window: string;
  timezone: string;
  estimated_end_time: string;
  minutes_remaining: number | null;
  message: string;
}

/**
 * Verifica si el sistema está en ventana de mantenimiento
 */
export const checkMaintenanceStatus = async (): Promise<MaintenanceStatus> => {
  try {
    const response = await axios.get<MaintenanceStatus>(
      `${API_BASE_URL}/maintenance-status`,
      {
        timeout: 5000 // 5 segundos timeout
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error checking maintenance status:', error);
    // Si no podemos verificar el estado, asumimos que NO está en mantenimiento
    // para no bloquear el acceso por errores de red
    return {
      is_maintenance: false,
      current_time: new Date().toLocaleTimeString(),
      maintenance_window: '1:00 AM - 6:00 AM',
      timezone: 'America/Caracas (UTC-4)',
      estimated_end_time: '6:00 AM',
      minutes_remaining: null,
      message: 'Sistema operativo'
    };
  }
};
