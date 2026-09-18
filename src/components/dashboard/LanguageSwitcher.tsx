import { motion } from 'motion/react'
import { useLanguage, type Language } from '@/lib/i18n'

const languages: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'ru', label: 'RU', flag: '🇷🇺' },
]

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          className={`relative px-2.5 py-1 rounded-md text-xs font-mono transition-all flex items-center gap-1.5 ${
            language === lang.code
              ? 'text-white'
              : 'text-white/60 hover:text-white/60'
          }`}
        >
          {language === lang.code && (
            <motion.div
              layoutId="language-indicator"
              className="absolute inset-0 bg-white/10 rounded-md"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            />
          )}
          <span className="relative z-10">{lang.flag}</span>
          <span className="relative z-10">{lang.label}</span>
        </button>
      ))}
    </div>
  )
}
