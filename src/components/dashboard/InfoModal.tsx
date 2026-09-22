import {
  useLanguage,
  getLocalizedMaturity,
  getLocalizedReasons,
} from '@/lib/i18n'
import { MATURITY_CONFIG } from '@/lib/tech-categories'
import { SIGNAL_WEIGHTS } from '@/lib/signal-model'
import { Modal } from './Modal'
import { CategoryDot } from './icons'

interface InfoModalProps {
  isOpen: boolean
  onClose: () => void
}

/** Methodology, stated as what the code actually does. */
export function InfoModal({ isOpen, onClose }: InfoModalProps) {
  const { t, language } = useLanguage()
  const localizedMaturity = getLocalizedMaturity(language)
  const reasons = getLocalizedReasons(language)

  const components: {
    key: keyof typeof SIGNAL_WEIGHTS
    label: string
    desc: string
  }[] = [
    { key: 'novelty', label: t.novelty, desc: t.infoNoveltyDesc },
    {
      key: 'convergence',
      label: t.reasonConverging,
      desc: t.infoConvergenceDesc,
    },
    { key: 'velocityRank', label: t.velocity, desc: t.infoVelocityDesc },
    { key: 'reach', label: t.reach, desc: t.infoReachDesc },
    { key: 'substance', label: t.substance, desc: t.infoSubstanceDesc },
    { key: 'recency', label: t.recency, desc: t.infoRecencyDesc },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.infoTitle}
      subtitle={t.infoSubtitle}
      width="max-w-2xl"
    >
      <div className="space-y-6 text-sm">
        <section>
          <h3 className="text-fg mb-1">{t.infoSourcesTitle}</h3>
          <p className="text-xs text-fg-2 leading-relaxed">
            {t.infoSourcesDesc}
          </p>
        </section>

        <section>
          <h3 className="text-fg mb-1">{t.infoCategoriesTitle}</h3>
          <p className="text-xs text-fg-2 leading-relaxed">
            {t.infoCategoriesDesc}
          </p>
        </section>

        <section>
          <h3 className="text-fg mb-1">{t.infoScoringTitle}</h3>
          <p className="text-xs text-fg-2 leading-relaxed mb-3">
            {t.infoScoringDesc}
          </p>
          <dl className="divide-y divide-rule border-y border-rule">
            {components.map((c) => (
              <div
                key={c.key}
                className="grid grid-cols-[6rem_2.5rem_1fr] gap-3 py-2"
              >
                <dt className="text-xs text-fg">{c.label}</dt>
                <dd className="num text-xs text-fg-3">
                  {SIGNAL_WEIGHTS[c.key].toFixed(2)}
                </dd>
                <dd className="text-xs text-fg-2">{c.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="text-fg mb-1">{t.infoHighlightsTitle}</h3>
          <p className="text-xs text-fg-2 leading-relaxed mb-2">
            {t.infoHighlightsDesc}
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {Object.values(reasons).map((r) => (
              <li key={r.label} className="text-xs">
                <span className="chip-reason">{r.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-fg mb-1">{t.infoMaturityTitle}</h3>
          <p className="text-xs text-fg-2 leading-relaxed mb-2">
            {t.infoMaturityDesc}
          </p>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {Object.entries(MATURITY_CONFIG).map(([key, config]) => (
              <li key={key} className="flex items-baseline gap-2 text-xs">
                <CategoryDot color={config.color} />
                <span className="text-fg">
                  {localizedMaturity[key as keyof typeof localizedMaturity]}
                </span>
                <span className="text-fg-3">{config.description}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-xs text-fg-3 border-t border-rule pt-3">
          {t.infoDisclaimer}
        </p>
      </div>
    </Modal>
  )
}
