import React from 'react';
import { getIconoMatriz, formatNumber, formatPercentage } from '../../services/productosService';

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
  const abc = ['A', 'B', 'C'];
  const xyz = ['X', 'Y', 'Z'];

  const getCellColor = (matriz: string) => {
    const colors: Record<string, string> = {
      'AX': 'bg-green-50 hover:bg-green-100 border-green-200',
      'AY': 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200',
      'AZ': 'bg-red-50 hover:bg-red-100 border-red-200',
      'BX': 'bg-blue-50 hover:bg-blue-100 border-blue-200',
      'BY': 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      'BZ': 'bg-orange-50 hover:bg-orange-100 border-orange-200',
      'CX': 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      'CY': 'bg-gray-50 hover:bg-gray-100 border-gray-200',
      'CZ': 'bg-gray-50 hover:bg-gray-100 border-gray-200',
    };
    return colors[matriz] || 'bg-gray-50 hover:bg-gray-100 border-gray-200';
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
              <td className="border border-gray-300 bg-gray-100 p-4 text-center font-bold">
                {a}
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
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✅</span>
          <span className="text-gray-700">IDEAL: Mantener stock óptimo</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">⚠️</span>
          <span className="text-gray-700">MONITOREAR: Revisar frecuentemente</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🚨</span>
          <span className="text-gray-700">CRÍTICO: Alto riesgo</span>
        </div>
      </div>
    </div>
  );
};

export default MatrizABCXYZ;
