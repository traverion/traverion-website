import React, { createContext, useContext } from 'react';
import { en } from '../translations/en';

type Language = 'en';

interface TranslationContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: typeof en;
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined);

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};

interface TranslationProviderProps {
  children: React.ReactNode;
}

/** English only for now. Other languages can be added later. */
export const TranslationProvider: React.FC<TranslationProviderProps> = ({ children }) => {
  const value: TranslationContextType = {
    language: 'en',
    setLanguage: () => {},
    t: en,
  };

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
};



