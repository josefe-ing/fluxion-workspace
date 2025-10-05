import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';

interface ForecastDiario {
  dia: number;
  fecha: string;
  fecha_display: string;
  dia_semana: string;
  forecast_unidades: number;
  forecast_bultos: number;
}

interface ForecastDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  codigoProducto: string;
  descripcionProducto: string;
  forecasts: ForecastDiario[];
  cantidadBultos?: number; // Optional - for future use
}

export default function ForecastDetailModal({
  isOpen,
  onClose,
  codigoProducto,
  descripcionProducto,
  forecasts
}: ForecastDetailModalProps) {
  const totalUnidades = forecasts.reduce((sum, f) => sum + f.forecast_unidades, 0);
  const totalBultos = forecasts.reduce((sum, f) => sum + f.forecast_bultos, 0);

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <Dialog.Title
                      as="h3"
                      className="text-xl font-bold text-gray-900 flex items-center gap-2"
                    >
                      <span className="text-2xl">🔮</span>
                      Forecast Detallado por Día
                    </Dialog.Title>
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700">
                        Código: <span className="font-mono">{codigoProducto}</span>
                      </p>
                      <p className="text-sm text-gray-600">{descripcionProducto}</p>
                    </div>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Info card */}
                <div className="bg-purple-50 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-purple-900">Modelo: Promedio Móvil Ponderado (PMP)</span>
                  </div>
                  <p className="text-xs text-purple-700 ml-7">
                    Predicción basada en las últimas 8 semanas de ventas con mayor peso a semanas recientes
                  </p>
                </div>

                {/* Tabla de forecasts diarios */}
                <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Día
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Fecha
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Día Semana
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Forecast (Unidades)
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Forecast (Bultos)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {forecasts.map((forecast, index) => (
                        <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center">
                              <span className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-purple-100 text-purple-800 text-sm font-semibold">
                                {forecast.dia}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">{forecast.fecha_display}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              forecast.dia_semana === 'Sábado' || forecast.dia_semana === 'Domingo'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {forecast.dia_semana}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="text-sm font-semibold text-purple-900">
                              {forecast.forecast_unidades.toFixed(1)}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="text-sm font-semibold text-purple-900">
                              {forecast.forecast_bultos.toFixed(1)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-purple-50">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-sm font-bold text-purple-900">
                          TOTAL ({forecasts.length} días)
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="text-sm font-bold text-purple-900">
                            {totalUnidades.toFixed(1)} unid
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          <div className="text-sm font-bold text-purple-900">
                            {totalBultos.toFixed(1)} bultos
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Gráfico visual simple */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Distribución Visual (Bultos/Día)</h4>
                  <div className="space-y-2">
                    {forecasts.map((forecast, index) => {
                      const maxBultos = Math.max(...forecasts.map(f => f.forecast_bultos));
                      const percentage = (forecast.forecast_bultos / maxBultos) * 100;

                      return (
                        <div key={index} className="flex items-center gap-2">
                          <div className="w-20 text-xs text-gray-600 font-medium">
                            Día {forecast.dia}
                          </div>
                          <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                            <div
                              className="bg-purple-600 h-6 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            >
                              <span className="absolute inset-0 flex items-center justify-end pr-2 text-xs font-semibold text-white">
                                {forecast.forecast_bultos.toFixed(1)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Ayuda */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-blue-800">
                        ¿Cómo usar este forecast?
                      </h3>
                      <div className="mt-2 text-sm text-blue-700">
                        <ul className="list-disc list-inside space-y-1">
                          <li>Si vas a pedir para <strong>2 días</strong>: suma Día 1 + Día 2</li>
                          <li>Si vas a pedir para <strong>3 días</strong>: suma Día 1 + Día 2 + Día 3</li>
                          <li>Considera el stock actual para ajustar la cantidad final a pedir</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
                    onClick={onClose}
                  >
                    Cerrar
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
