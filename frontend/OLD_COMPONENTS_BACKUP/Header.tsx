import React, { useState } from 'react';
import { Settings, User, Zap, X } from 'lucide-react';
import { currentUser } from '../data/mockData';
import SmartNotifications from './SmartNotifications';
import SettingsComponent from './Settings';

const Header: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-[1600px] mx-auto px-8 py-4">
        <div className="flex items-center justify-between">
          {/* Logo and Title */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-navy-900 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-navy-900">FLUXION AI</h1>
            </div>
            <div className="hidden md:block">
              <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                Demo Dashboard
              </span>
            </div>
          </div>

          {/* User Profile and Actions */}
          <div className="flex items-center space-x-4">
            {/* Smart Notifications */}
            <SmartNotifications />

            {/* Settings */}
            <button 
              onClick={() => setShowSettings(true)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <Settings className="w-6 h-6" />
            </button>

            {/* User Profile */}
            <div className="flex items-center space-x-3 pl-4 border-l border-gray-200">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{currentUser.name}</p>
                <p className="text-xs text-gray-500">{currentUser.role}</p>
              </div>
              <div className="w-10 h-10 bg-navy-900 rounded-full flex items-center justify-center">
                {currentUser.avatar ? (
                  <span className="text-white font-medium">{currentUser.avatar}</span>
                ) : (
                  <User className="w-6 h-6 text-white" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>

    {/* Settings Modal */}
    {showSettings && (
      <div className="fixed inset-0 z-50 overflow-hidden">
        <div className="absolute inset-0 bg-black/50" onClick={() => setShowSettings(false)}></div>
        
        <div className="absolute right-0 top-0 h-full w-full max-w-6xl bg-white shadow-xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <Settings className="w-6 h-6 text-navy-600" />
              <h2 className="text-xl font-semibold text-gray-900">Configuración</h2>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 h-full overflow-y-auto pb-20">
            <SettingsComponent />
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default Header;