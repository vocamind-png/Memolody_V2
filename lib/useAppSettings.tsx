// src/hooks/useAppSettings.ts
import React, { createContext, useContext, useState, useEffect } from 'react';

type EngineOption = 'core' | 'tiger' | 'fish';

interface SettingsContextProps {
  vocalEngine: EngineOption;
  setVocalEngine: (engine: EngineOption) => void;
}

const SettingsContext = createContext<SettingsContextProps | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [vocalEngine, setVocalEngine] = useState<EngineOption>('core');

  // Persist selection in localStorage
  useEffect(() => {
    const stored = localStorage.getItem('vocal_engine');
    if (stored && ['core', 'tiger', 'fish'].includes(stored)) {
      setVocalEngine(stored as EngineOption);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('vocal_engine', vocalEngine);
  }, [vocalEngine]);

  return (
    <SettingsContext.Provider value={{ vocalEngine, setVocalEngine }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useAppSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useAppSettings must be used within SettingsProvider');
  }
  return ctx;
};
