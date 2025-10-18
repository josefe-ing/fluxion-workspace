import ConnectivityPanel from './ConnectivityPanel';
import InventarioETLPanel from './InventarioETLPanel';

export default function ETLControlCenter() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">ETL Control Center</h1>
          <p className="mt-2 text-sm text-gray-600">
            Centro de control y monitoreo de sincronizaciones de datos
          </p>
        </div>

        {/* Panels Stack */}
        <div className="space-y-6">
          {/* 1. Connectivity Panel */}
          <ConnectivityPanel />

          {/* 2. Inventario ETL Panel */}
          <InventarioETLPanel />

          {/* 3. TODO: Ventas ETL Panel */}
          {/* <VentasETLPanel /> */}
        </div>
      </div>
    </div>
  );
}
