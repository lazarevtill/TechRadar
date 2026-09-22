import { useLanguage, type Language } from '@/lib/i18n'

const languages: { code: Language; label: string; name: string }[] = [
  { code: 'en', label: 'EN', name: 'English' },
  { code: 'ru', label: 'RU', name: 'Русский' },
]

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()

  return (
    <div className="segment" role="group" aria-label="Language">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          aria-pressed={language === lang.code}
          aria-label={lang.name}
          className="font-mono"
        >
          {lang.label}
        </button>
      ))}
    </div>
  )
}
