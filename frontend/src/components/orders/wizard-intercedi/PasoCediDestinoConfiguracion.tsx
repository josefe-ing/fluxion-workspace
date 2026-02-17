import { useState, useEffect } from 'react';
import type { ConfiguracionDiasCobertura } from '../../../services/pedidosInterCediService';

// Configuración fija para CEDI Caracas (único destino actual)
const CEDI_DESTINO = {
  id: 'cedi_caracas',
  nombre: 'CEDI Caracas',
  region: 'CARACAS',
  tiendas: ['Artigas', 'Paraíso']
};

const CEDIS_ORIGEN = [
  {
    id: 'cedi_seco',
    nombre: 'CEDI Seco',
    descripcion: 'Víveres, limpieza, cuidado personal',
    dotColor: 'bg-amber-500',
    borderActive: 'border-amber-500 bg-amber-50',
    borderInactive: 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/50',
    textColor: 'text-amber-800',
    checkColor: 'text-amber-600',
    disabled: false,
  },
  {
    id: 'cedi_frio',
    nombre: 'CEDI Frío',
    descripcion: 'Carnes, charcutería, lácteos, congelados',
    dotColor: 'bg-sky-500',
    borderActive: 'border-sky-500 bg-sky-50',
    borderInactive: 'border-gray-200 hover:border-sky-300 hover:bg-sky-50/50',
    textColor: 'text-sky-800',
    checkColor: 'text-sky-600',
    disabled: false,
  },
  {
    id: 'cedi_verde',
    nombre: 'CEDI Verde',
    descripcion: 'FRUVER — próximamente',
    dotColor: 'bg-emerald-500',
    borderActive: 'border-emerald-500 bg-emerald-50',
    borderInactive: 'border-gray-200',
    textColor: 'text-emerald-800',
    checkColor: 'text-emerald-600',
    disabled: true,
  },
];

export interface InterCediOrderConfig extends ConfiguracionDiasCobertura {
  cedi_destino_id: string;
  cedi_destino_nombre: string;
  cedi_origen_id: string;
  cedi_origen_nombre: string;
  frecuencia_viajes_dias: string;
  lead_time_dias: number;
}

interface Props {
  config: InterCediOrderConfig;
  updateConfig: (data: Partial<InterCediOrderConfig>) => void;
  onNext: () => void;
  onCancel: () => void;
  isCalculating: boolean;
}

export default function PasoCediDestinoConfiguracion({
  config,
  updateConfig,
  onNext,
  onCancel,
  isCalculating
}: Props) {
  const [localConfig, setLocalConfig] = useState<InterCediOrderConfig>(config);

  // Sincronizar cuando cambia config externa
  useEffect(() => {
    setLocalConfig(config);
  }, [config]);

  // Auto-seleccionar CEDI destino al montar
  useEffect(() => {
    if (!config.cedi_destino_id) {
      updateConfig({
        cedi_destino_id: CEDI_DESTINO.id,
        cedi_destino_nombre: CEDI_DESTINO.nombre,
      });
    }
  }, [config.cedi_destino_id, updateConfig]);

  const handleCediOrigenSelect = (cedi: typeof CEDIS_ORIGEN[0]) => {
    if (cedi.disabled || isCalculating) return;
    const updates = { cedi_origen_id: cedi.id, cedi_origen_nombre: cedi.nombre };
    setLocalConfig(prev => ({ ...prev, ...updates }));
    updateConfig(updates);
  };

  const handleDiasCoberturaChange = (clase: 'a' | 'b' | 'c' | 'd' | 'congelados', value: string) => {
    const numValue = parseInt(value) || 0;
    const key = `dias_cobertura_${clase}` as keyof ConfiguracionDiasCobertura;
    const newConfig = { ...localConfig, [key]: numValue };
    setLocalConfig(newConfig);
    updateConfig({ [key]: numValue });
  };

  const handleFrecuenciaChange = (value: string) => {
    setLocalConfig(prev => ({ ...prev, frecuencia_viajes_dias: value }));
    updateConfig({ frecuencia_viajes_dias: value });
  };

  const handleLeadTimeChange = (value: string) => {
    const numValue = parseFloat(value) || 2;
    setLocalConfig(prev => ({ ...prev, lead_time_dias: numValue }));
    updateConfig({ lead_time_dias: numValue });
  };

  const esCediFrio = localConfig.cedi_origen_id === 'cedi_frio';

  const canProceed = localConfig.cedi_destino_id &&
    !!localConfig.cedi_origen_id &&
    localConfig.dias_cobertura_a > 0 &&
    localConfig.dias_cobertura_b > 0 &&
    localConfig.dias_cobertura_c > 0 &&
    localConfig.dias_cobertura_d > 0;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="space-y-6">
          {/* Título */}
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Pedido Inter-CEDI</h2>
            <p className="mt-2 text-sm text-gray-500">
              Configure los parámetros de reposición desde CEDIs Valencia hacia CEDI Caracas.
            </p>
          </div>

          {/* Selector CEDI Origen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CEDI Origen <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Selecciona el CEDI desde donde salen los productos. Cada pedido corresponde a un único CEDI origen.
            </p>
            <div className="grid grid-cols-3 gap-3">
              {CEDIS_ORIGEN.map((cedi) => {
                const isSelected = localConfig.cedi_origen_id === cedi.id;
                return (
                  <button
                    key={cedi.id}
                    type="button"
                    onClick={() => handleCediOrigenSelect(cedi)}
                    disabled={cedi.disabled || isCalculating}
                    className={[
                      'relative flex flex-col items-start gap-1 rounded-lg border-2 px-4 py-3 text-left transition-all',
                      isSelected
                        ? cedi.borderActive
                        : cedi.disabled
                        ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                        : cedi.borderInactive + ' cursor-pointer',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${cedi.dotColor} ${cedi.disabled ? 'opacity-40' : ''}`}></div>
                        <span className={`text-sm font-semibold ${isSelected ? cedi.textColor : 'text-gray-700'}`}>
                          {cedi.nombre}
                        </span>
                      </div>
                      {isSelected && (
                        <svg className={`w-4 h-4 ${cedi.checkColor}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 pl-5">{cedi.descripcion}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Info CEDI Destino */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-blue-900">{CEDI_DESTINO.nombre}</h3>
                <p className="text-sm text-blue-700 mt-1">
                  Región {CEDI_DESTINO.region} - Surte a tiendas: {CEDI_DESTINO.tiendas.join(', ')}
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  La demanda se calcula agregando el P75 de todas las tiendas de la región.
                </p>
              </div>
            </div>
          </div>

          {/* Días de Cobertura por Clase ABC */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Días de Cobertura por Clasificación ABC
            </label>
            <p className="text-xs text-gray-500 mb-4">
              Define cuántos días de inventario mantener según la clasificación del producto.
              Productos clase A (alta rotación) requieren menos cobertura que clase D (baja rotación).
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Clase A */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800">
                    Clase A
                  </span>
                  <span className="text-xs text-green-600">Alta rotación</span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={localConfig.dias_cobertura_a}
                  onChange={(e) => handleDiasCoberturaChange('a', e.target.value)}
                  className="w-full px-3 py-2 border border-green-300 rounded-md text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-center text-green-600 mt-1">días</p>
              </div>

              {/* Clase B */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                    Clase B
                  </span>
                  <span className="text-xs text-blue-600">Media rotación</span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={localConfig.dias_cobertura_b}
                  onChange={(e) => handleDiasCoberturaChange('b', e.target.value)}
                  className="w-full px-3 py-2 border border-blue-300 rounded-md text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-center text-blue-600 mt-1">días</p>
              </div>

              {/* Clase C */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-yellow-100 text-yellow-800">
                    Clase C
                  </span>
                  <span className="text-xs text-yellow-600">Baja rotación</span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={localConfig.dias_cobertura_c}
                  onChange={(e) => handleDiasCoberturaChange('c', e.target.value)}
                  className="w-full px-3 py-2 border border-yellow-300 rounded-md text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
                <p className="text-xs text-center text-yellow-600 mt-1">días</p>
              </div>

              {/* Clase D */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800">
                    Clase D
                  </span>
                  <span className="text-xs text-gray-600">Muy baja rotación</span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={localConfig.dias_cobertura_d}
                  onChange={(e) => handleDiasCoberturaChange('d', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-gray-500"
                />
                <p className="text-xs text-center text-gray-600 mt-1">días</p>
              </div>
            </div>
          </div>

          {/* Días de Cobertura Congelados — solo visible para CEDI Frío */}
          {esCediFrio && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Días de Cobertura — Congelados / Refrigerados
              </label>
              <p className="text-xs text-gray-500 mb-4">
                Todos los productos del CEDI Frío usan este valor fijo (ignoran la clasificación ABC).
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-sky-100 text-sky-800">
                      🧊 Congelados
                    </span>
                    <span className="text-xs text-sky-600">CEDI Frío</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={localConfig.dias_cobertura_congelados}
                    onChange={(e) => handleDiasCoberturaChange('congelados', e.target.value)}
                    className="w-full px-3 py-2 border border-sky-300 rounded-md text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <p className="text-xs text-center text-sky-600 mt-1">días (máx 30)</p>
                </div>
              </div>
            </div>
          )}

          {/* Parámetros Logísticos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Frecuencia de Viajes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Frecuencia de Viajes
              </label>
              <select
                value={localConfig.frecuencia_viajes_dias}
                onChange={(e) => handleFrecuenciaChange(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900"
              >
                <option value="Mar,Jue,Sab">Martes, Jueves, Sábado (3x/semana)</option>
                <option value="Lun,Mie,Vie">Lunes, Miércoles, Viernes (3x/semana)</option>
                <option value="Mar,Vie">Martes, Viernes (2x/semana)</option>
                <option value="Diario">Diario</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Días en que salen camiones Valencia → Caracas
              </p>
            </div>

            {/* Lead Time */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Lead Time (días)
              </label>
              <input
                type="number"
                min="1"
                max="7"
                step="0.5"
                value={localConfig.lead_time_dias}
                onChange={(e) => handleLeadTimeChange(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">
                Tiempo desde que sale de Valencia hasta llegar a Caracas
              </p>
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="mt-8 flex justify-between">
          <button
            onClick={onCancel}
            disabled={isCalculating}
            className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onNext}
            disabled={!canProceed || isCalculating}
            className="px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCalculating ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Calculando...
              </>
            ) : (
              <>Calcular Pedido →</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
