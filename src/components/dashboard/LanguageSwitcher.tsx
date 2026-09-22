import { useLanguage, type Language } from '@/lib/i18n'

const languages: { code: Language; label: string; flag: string }[] = [
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'ru', label: 'RU', flag: '🇷🇺' },
]

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage()
  const activeIndex = Math.max(
    languages.findIndex((l) => l.code === language),
    0,
  )

  return (
    <div className="relative grid grid-cols-2 gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
      {/* One sliding pill, moved with a CSS transform: equal-width grid
          columns make each step exactly one column plus the gap. */}
      <div
        aria-hidden
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-0.375rem)] rounded-md bg-white/10 transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 0.25}rem))`,
        }}
      />
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => setLanguage(lang.code)}
          aria-pressed={language === lang.code}
          className={`relative px-2.5 py-1 rounded-md text-xs font-mono transition-colors flex items-center justify-center gap-1.5 ${
            language === lang.code
              ? 'text-white'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          <span>{lang.flag}</span>
          <span>{lang.label}</span>
        </button>
      ))}
    </div>
  )
}
