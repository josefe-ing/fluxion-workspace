import React from 'react';
import { getIconoMatriz, formatNumber, formatPercentage } from '../../services/productosService';
import { useABCModel } from '../../services/abcModelService';

interface MatrizABCXYZProps {
  data: Record<string, {
    count: number;
    porcentaje_productos: number;
    porcentaje_valor: number;
  }>;
  onCellClick: (matriz: string) => void;
  selectedCell?: string;
}

const MatrizABCXYZ: React.FC<MatrizABCXYZProps> = ({ data, onCellClick, selectedCell }) => {
  const { getCorta, nombreModelo } = useABCModel();
  const abc = ['A', 'B', 'C', 'D'];
  const xyz = ['X', 'Y', 'Z'];

  const getCellColor = (matriz: string) => {
    const colors: Record<string, string> = {
      'AX': 'bg-green-50 hover:bg-green-100 border-green-200',
      'AY': 'bg-green-50 hover:bg-green-100 border-green-200',
      'AZ': 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
      'BX': 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
      'BY': 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
      'BZ': 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      'CX': 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      'CY': 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      'CZ': 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      'DX': 'bg-purple-50 hover:bg-purple-100 border-purple-200',
      'DY': 'bg-purple-50 hover:bg-purple-100 border-purple-200',
      'DZ': 'bg-purple-50 hover:bg-purple-100 border-purple-200',
    };
    return colors[matriz] || 'bg-gray-50 hover:bg-gray-100 border-gray-200';
  };

  const getRowColor = (clase: string) => {
    const colors: Record<string, string> = {
      'A': 'bg-green-100',
      'B': 'bg-yellow-100',
      'C': 'bg-orange-100',
      'D': 'bg-purple-100',
    };
    return colors[clase] || 'bg-gray-100';
  };

  const getRowDescription = (clase: string) => {
    return getCorta(clase);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-300 bg-gray-100 p-4"></th>
            <th className="border border-gray-300 bg-green-100 p-4 text-center">
              <div className="font-bold text-gray-900">X (Estable)</div>
              <div className="text-xs text-gray-600 mt-1">CV &lt; 0.5</div>
            </th>
            <th className="border border-gray-300 bg-blue-100 p-4 text-center">
              <div className="font-bold text-gray-900">Y (Variable)</div>
              <div className="text-xs text-gray-600 mt-1">0.5 ≤ CV &lt; 1.0</div>
            </th>
            <th className="border border-gray-300 bg-red-100 p-4 text-center">
              <div className="font-bold text-gray-900">Z (Errático)</div>
              <div className="text-xs text-gray-600 mt-1">CV ≥ 1.0</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {abc.map((a) => (
            <tr key={a}>
              <td className={`border border-gray-300 ${getRowColor(a)} p-4 text-center`}>
                <div className="font-bold">{a}</div>
                <div className="text-xs text-gray-600">{getRowDescription(a)}</div>
              </td>
              {xyz.map((x) => {
                const matriz = `${a}${x}`;
                const cellData = data?.[matriz] || { count: 0, porcentaje_productos: 0, porcentaje_valor: 0 };
                const isSelected = selectedCell === matriz;

                return (
                  <td
                    key={matriz}
                    onClick={() => onCellClick(matriz)}
                    className={`
                      border border-gray-300 p-4 cursor-pointer transition-all
                      ${getCellColor(matriz)}
                      ${isSelected ? 'ring-2 ring-blue-500 ring-inset' : ''}
                    `}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">{getIconoMatriz(matriz)}</div>
                      <div className="font-bold text-lg text-gray-900">
                        {matriz}: {formatNumber(cellData.count)}
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatPercentage(cellData.porcentaje_productos)} productos
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatPercentage(cellData.porcentaje_valor)} valor
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Leyenda */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Guía de Clasificación ({nombreModelo}):</h3>
        <div className="grid grid-cols-4 gap-4 text-xs">
          {/* Columna 1: Alta rotación (A) */}
          <div className="space-y-2">
            <div className="font-semibold text-green-700 mb-1">A - {getCorta('A')}</div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⭐</span>
              <span className="text-gray-700"><strong>AX:</strong> Máxima prioridad</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚠️</span>
              <span className="text-gray-700"><strong>AY:</strong> Vigilar de cerca</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🚨</span>
              <span className="text-gray-700"><strong>AZ:</strong> Riesgo de faltante</span>
            </div>
          </div>

          {/* Columna 2: Rotación media (B) */}
          <div className="space-y-2">
            <div className="font-semibold text-yellow-700 mb-1">B - {getCorta('B')}</div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🔷</span>
              <span className="text-gray-700"><strong>BX:</strong> Confiable</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚪</span>
              <span className="text-gray-700"><strong>BY:</strong> Revisar stock</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🟠</span>
              <span className="text-gray-700"><strong>BZ:</strong> Evaluar</span>
            </div>
          </div>

          {/* Columna 3: Baja rotación (C) */}
          <div className="space-y-2">
            <div className="font-semibold text-orange-700 mb-1">C - {getCorta('C')}</div>
            <div className="flex items-center gap-2">
              <span className="text-xl">💤</span>
              <span className="text-gray-700"><strong>CX:</strong> Stock mínimo</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⚫</span>
              <span className="text-gray-700"><strong>CY:</strong> Marginal</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📉</span>
              <span className="text-gray-700"><strong>CZ:</strong> Minimizar</span>
            </div>
          </div>

          {/* Columna 4: Cola larga (D) */}
          <div className="space-y-2">
            <div className="font-semibold text-purple-700 mb-1">D - {getCorta('D')}</div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🟣</span>
              <span className="text-gray-700"><strong>DX:</strong> Cola larga estable</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🟣</span>
              <span className="text-gray-700"><strong>DY:</strong> Cola larga variable</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🟣</span>
              <span className="text-gray-700"><strong>DZ:</strong> Padre Prudente</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MatrizABCXYZ;
