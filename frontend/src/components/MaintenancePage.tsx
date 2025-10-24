import React from 'react';
import './MaintenancePage.css';

interface MaintenancePageProps {
  estimatedEndTime?: string;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({
  estimatedEndTime = "6:00 AM"
}) => {
  return (
    <div className="maintenance-container">
      <div className="maintenance-card">
        {/* Icon de construcción */}
        <div className="maintenance-icon">
          🔧
        </div>

        {/* Título principal */}
        <h1 className="maintenance-title">
          Estamos Recolectando la Data
        </h1>

        {/* Mensaje informativo */}
        <p className="maintenance-subtitle">
          Fluxion AI está procesando los datos del día para ofrecerte
          insights precisos y actualizados.
        </p>

        {/* Barra de progreso */}
        <div className="progress-bar-container">
          <div className="progress-bar"></div>
        </div>

        {/* Hora estimada */}
        <div className="estimated-time">
          <span className="clock-icon">🕐</span>
          <span className="estimated-time-text">
            Sistema disponible después de las {estimatedEndTime}
          </span>
        </div>

        {/* Información adicional */}
        <div className="info-box">
          <div className="info-header">
            <span className="trending-icon">📈</span>
            <span className="info-title">¿Por qué este mantenimiento?</span>
          </div>
          <p className="info-text">
            Cada noche, Fluxion AI extrae y procesa datos de ventas,
            inventario y productos de todas las tiendas para mantener
            tus dashboards actualizados con información precisa.
          </p>
        </div>

        {/* Pie de página */}
        <p className="maintenance-footer">
          Ventana de mantenimiento: 1:00 AM - 6:00 AM (diaria)
        </p>
      </div>
    </div>
  );
};

export default MaintenancePage;
