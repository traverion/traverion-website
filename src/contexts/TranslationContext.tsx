import React, { createContext, useContext, useState, useEffect } from 'react';
import { en } from '../translations/en';
import { fi } from '../translations/fi';

type Language = 'en' | 'fi';

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

export const TranslationProvider: React.FC<TranslationProviderProps> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('fi'); // Default to Finnish

  const translations = {
    en,
    fi,
  };

  const t = translations[language];

  // Save language preference to localStorage
  useEffect(() => {
    const savedLanguage = localStorage.getItem('traverion-language') as Language;
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'fi')) {
      setLanguage(savedLanguage);
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('traverion-language', lang);
  };

  return (
    <TranslationContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </TranslationContext.Provider>
  );
};



