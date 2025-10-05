import { useNavigate } from 'react-router-dom';

export default function SuggestedOrder() {
  const navigate = useNavigate();

  const handleCrearPedido = () => {
    navigate('/pedidos-sugeridos/nuevo');
  };

  return (
    <div className="space-y-6">
      {/* Título y Acción */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pedidos Sugeridos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona y crea pedidos sugeridos para reabastecer inventario
          </p>
        </div>
        <button
          onClick={handleCrearPedido}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
        >
          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Crear Pedido Sugerido
        </button>
      </div>

      {/* Estado vacío */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Pedidos Creados</h2>
        </div>

        <div className="p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No hay pedidos sugeridos</h3>
          <p className="mt-1 text-sm text-gray-500">
            Comienza creando un nuevo pedido sugerido haciendo clic en el botón de arriba.
          </p>
          <div className="mt-6">
            <button
              onClick={handleCrearPedido}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800"
            >
              <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Crear Primer Pedido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
