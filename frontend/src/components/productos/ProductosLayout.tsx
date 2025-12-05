import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';

const ProductosLayout: React.FC = () => {
  const location = useLocation();

  const tabs = [
    { path: '/productos/analisis-maestro', label: 'Analisis Maestro', icon: '👻' },
    { path: '/productos/abc', label: 'ABC', icon: '📊' },
    { path: '/productos/abc-xyz', label: 'ABC-XYZ', icon: '🔬' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">Productos</h1>
            <p className="mt-1 text-sm text-gray-500">
              Analisis integral de productos con clasificacion ABC
            </p>
          </div>

          {/* Tabs Navigation */}
          <nav className="flex space-x-8 -mb-px">
            {tabs.map((tab) => {
              const isActive = location.pathname.startsWith(tab.path);
              return (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  className={`
                    flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                    ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </div>
    </div>
  );
};

export default ProductosLayout;
