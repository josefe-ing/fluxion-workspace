import { obtenerColorMatriz, obtenerDescripcionMatriz, PRIORIDADES_MATRIZ } from '../../services/nivelObjetivoService';
import { HelpCircle } from 'lucide-react';
import { useState } from 'react';

interface MatrizABCXYZBadgeProps {
  matriz: string;
  mostrarTooltip?: boolean;
  mostrarPrioridad?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function MatrizABCXYZBadge({
  matriz,
  mostrarTooltip = true,
  mostrarPrioridad = false,
  size = 'md'
}: MatrizABCXYZBadgeProps) {
  const [mostrandoTooltip, setMostrandoTooltip] = useState(false);
  const colores = obtenerColorMatriz(matriz);
  const descripcion = obtenerDescripcionMatriz(matriz);
  const prioridad = PRIORIDADES_MATRIZ[matriz] || 99;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  };

  const sizeClass = sizeClasses[size];

  return (
    <div className="inline-flex items-center gap-1 relative">
      <span
        className={`
          ${colores.bg} ${colores.text}
          ${sizeClass}
          font-bold rounded border-2 ${colores.border}
          inline-flex items-center gap-1.5
        `}
      >
        {matriz}
        {mostrarPrioridad && (
          <span className="text-xs opacity-70">
            (P{prioridad})
          </span>
        )}
      </span>

      {mostrarTooltip && (
        <div className="relative">
          <button
            onMouseEnter={() => setMostrandoTooltip(true)}
            onMouseLeave={() => setMostrandoTooltip(false)}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {mostrandoTooltip && (
            <div className="absolute left-0 top-6 z-50 w-64 bg-white border-2 border-gray-200 rounded-lg shadow-xl p-3">
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className={`${colores.bg} ${colores.text} text-xs font-bold px-2 py-0.5 rounded border ${colores.border}`}>
                    {matriz}
                  </span>
                  <span className="text-xs font-semibold text-gray-700 flex-1">
                    {descripcion.nombre}
                  </span>
                </div>

                <p className="text-xs text-gray-600 leading-relaxed">
                  {descripcion.descripcion}
                </p>

                <div className="pt-2 border-t border-gray-200 text-xs text-gray-500">
                  <div className="flex justify-between">
                    <span>Prioridad:</span>
                    <span className="font-semibold">{prioridad} de 9</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Clase ABC:</span>
                    <span className="font-semibold">{matriz[0]} ({
                      matriz[0] === 'A' ? 'Alto' : matriz[0] === 'B' ? 'Medio' : 'Bajo'
                    } valor)</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span>Variabilidad:</span>
                    <span className="font-semibold">{matriz[1]} ({
                      matriz[1] === 'X' ? 'Estable' : matriz[1] === 'Y' ? 'Media' : 'Errática'
                    })</span>
                  </div>
                </div>
              </div>

              {/* Flecha del tooltip */}
              <div className="absolute -top-2 left-4 w-4 h-4 bg-white border-l-2 border-t-2 border-gray-200 transform rotate-45"></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
