import { useState } from 'react';
import SyncLogsModal from './SyncLogsModal';

interface SyncButtonProps {
  ubicacionId?: string;  // Si no se especifica, sincroniza todas
  onSyncComplete?: () => void;
}

export default function SyncButton({ ubicacionId, onSyncComplete }: SyncButtonProps) {
  const [showLogsModal, setShowLogsModal] = useState(false);

  const handleSync = () => {
    setShowLogsModal(true);
  };

  return (
    <>
      <div className="space-y-3">
        <button
          onClick={handleSync}
          className="flex items-center px-4 py-2 rounded-md font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700"
        >
          <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {ubicacionId ? 'Sincronizar Tienda' : 'Sincronizar Todas'}
        </button>
      </div>

      {/* Modal de logs de sincronización */}
      <SyncLogsModal
        isOpen={showLogsModal}
        onClose={() => {
          setShowLogsModal(false);
          if (onSyncComplete) {
            onSyncComplete();
          }
        }}
        ubicacionId={ubicacionId}
      />
    </>
  );
}
