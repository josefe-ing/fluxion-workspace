interface Props {
  modoConsultorActivo: boolean;
  onToggle: () => void;
  cargando?: boolean;
}

export default function ModoConsultorToggle({ modoConsultorActivo, onToggle, cargando = false }: Props) {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border-2 border-indigo-200 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="text-3xl">{cargando ? '⏳' : '🔬'}</div>
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              Modo Consultor IA
              {modoConsultorActivo && (
                <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold">
                  {cargando ? 'CARGANDO...' : 'ACTIVO'}
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-600 mt-0.5">
              {cargando
                ? "Cargando análisis XYZ desde el servidor..."
                : modoConsultorActivo
                ? "Comparando método ABC actual vs. XYZ mejorado con IA"
                : "Activa para ver análisis avanzado y comparación de metodologías"
              }
            </p>
          </div>
        </div>

        <button
          onClick={onToggle}
          className={`
            relative inline-flex h-10 w-20 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
            ${modoConsultorActivo ? 'bg-gradient-to-r from-indigo-600 to-purple-600' : 'bg-gray-300'}
          `}
        >
          <span
            className={`
              inline-block h-8 w-8 transform rounded-full bg-white shadow-lg transition-transform duration-200 ease-in-out flex items-center justify-center text-sm font-bold
              ${modoConsultorActivo ? 'translate-x-11' : 'translate-x-1'}
            `}
          >
            {modoConsultorActivo ? '✨' : '🔒'}
          </span>
        </button>
      </div>

      {modoConsultorActivo && (
        <div className="mt-3 pt-3 border-t border-indigo-200">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 bg-red-500 rounded-full"></span>
              <span className="text-gray-700"><strong>ABC:</strong> Clasificación actual (Rotación)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 bg-blue-500 rounded-full"></span>
              <span className="text-gray-700"><strong>XYZ:</strong> Variabilidad de demanda</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 bg-purple-500 rounded-full"></span>
              <span className="text-gray-700"><strong>Δ:</strong> Diferencia en sugerencia</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
