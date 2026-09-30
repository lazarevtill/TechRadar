import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { translations, type Language, type Translations } from './translations'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: Translations
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
)

interface LanguageProviderProps {
  children: ReactNode
  defaultLanguage?: Language
}

export function LanguageProvider({
  children,
  defaultLanguage = 'en',
}: LanguageProviderProps) {
  // The initial client render must match SSR; restore browser preferences
  // only after hydration, when the server text has been attached.
  const [language, setLanguageState] = useState<Language>(defaultLanguage)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tech-radar-language')
      if (saved === 'en' || saved === 'ru') {
        setLanguageState(saved)
      }
    } catch {
      // Storage can be denied; the current page still supports switching.
    }
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('tech-radar-language', lang)
      } catch {
        // Keep the preference for this page even when persistence is denied.
      }
    }
  }, [])

  const t = translations[language]

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
