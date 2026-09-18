import { motion, AnimatePresence } from 'motion/react'
import {
  X,
  FileText,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  Layers,
  BarChart3,
  Zap,
  Target,
  Clock,
  Database,
  Cpu,
  ArrowRight,
} from 'lucide-react'
import { GithubIcon } from '@/components/ui/brand-icons'
import { useLanguage } from '@/lib/i18n'
import { MATURITY_CONFIG } from '@/lib/tech-categories'

interface InfoModalProps {
  isOpen: boolean
  onClose: () => void
}

export function InfoModal({ isOpen, onClose }: InfoModalProps) {
  const { language } = useLanguage()

  const content = {
    en: {
      title: 'How Tech Evolution Radar Works',
      subtitle: 'Understanding our trend detection methodology',
      sections: [
        {
          id: 'sources',
          icon: <Database className="w-5 h-5" />,
          title: 'Data Sources',
          description:
            'We aggregate signals from three primary sources in real-time:',
          items: [
            {
              icon: <GithubIcon className="w-4 h-4" />,
              name: 'GitHub',
              color: '#f0f6fc',
              desc: 'Trending repositories, star velocity, fork patterns, and release activity. We track repos gaining unusual traction.',
            },
            {
              icon: <FileText className="w-4 h-4" />,
              name: 'arXiv',
              color: '#b31b1b',
              desc: 'Latest research papers in CS, AI/ML, Physics, and related fields. We monitor citation patterns and cross-references.',
            },
            {
              icon: <MessageSquare className="w-4 h-4" />,
              name: 'Hacker News',
              color: '#ff6600',
              desc: 'Community discussions, upvote velocity, and comment sentiment. Early indicator of developer interest.',
            },
          ],
        },
        {
          id: 'scoring',
          icon: <BarChart3 className="w-5 h-5" />,
          title: 'Scoring Methodology',
          description: 'Each signal is evaluated using multiple metrics:',
          metrics: [
            {
              name: 'Impact Score',
              range: '1-10',
              icon: <Target className="w-4 h-4" />,
              desc: 'Potential to disrupt or transform industries. Based on novelty, applicability, and market size.',
            },
            {
              name: 'Hype Volume',
              range: '0-∞',
              icon: <TrendingUp className="w-4 h-4" />,
              desc: 'Total engagement: stars, upvotes, citations, comments. Raw measure of attention.',
            },
            {
              name: 'Weekly Growth',
              range: '%',
              icon: <Zap className="w-4 h-4" />,
              desc: 'Week-over-week change in activity. Identifies accelerating trends.',
            },
          ],
        },
        {
          id: 'anomalies',
          icon: <AlertTriangle className="w-5 h-5" />,
          title: 'Anomaly Detection',
          description:
            'Anomalies are flagged when signals deviate significantly from expected patterns:',
          criteria: [
            'Sudden spike in engagement (>3x normal)',
            'Unusual cross-category interest',
            'Rapid maturity stage progression',
            'High impact + low current hype (hidden gems)',
          ],
        },
        {
          id: 'maturity',
          icon: <Layers className="w-5 h-5" />,
          title: 'Maturity Stages',
          description: 'Technologies progress through four stages:',
          stages: Object.entries(MATURITY_CONFIG).map(([key, config]) => ({
            key,
            ...config,
          })),
        },
        {
          id: 'evolution',
          icon: <ArrowRight className="w-5 h-5" />,
          title: 'Evolution Chains',
          description:
            'We track how technologies evolve from research to mass adoption:',
          process: [
            {
              step: 1,
              label: 'Signal Detection',
              desc: 'New paper, repo, or discussion identified',
            },
            {
              step: 2,
              label: 'Categorization',
              desc: 'AI classifies into tech category',
            },
            {
              step: 3,
              label: 'Chain Linking',
              desc: 'Connected to related signals',
            },
            {
              step: 4,
              label: 'Trajectory Analysis',
              desc: 'Rising, stable, or declining trend',
            },
          ],
        },
      ],
      footer: {
        refresh: 'Data refreshes every 10 minutes',
        disclaimer:
          'Insights are algorithmic and should inform, not replace, human judgment.',
      },
    },
    ru: {
      title: 'Как работает Радар Эволюции Технологий',
      subtitle: 'Понимание нашей методологии обнаружения трендов',
      sections: [
        {
          id: 'sources',
          icon: <Database className="w-5 h-5" />,
          title: 'Источники данных',
          description:
            'Мы агрегируем сигналы из трёх основных источников в реальном времени:',
          items: [
            {
              icon: <GithubIcon className="w-4 h-4" />,
              name: 'GitHub',
              color: '#f0f6fc',
              desc: 'Трендовые репозитории, скорость роста звёзд, паттерны форков и активность релизов.',
            },
            {
              icon: <FileText className="w-4 h-4" />,
              name: 'arXiv',
              color: '#b31b1b',
              desc: 'Последние научные статьи по CS, AI/ML, физике. Мониторинг цитирований и перекрёстных ссылок.',
            },
            {
              icon: <MessageSquare className="w-4 h-4" />,
              name: 'Hacker News',
              color: '#ff6600',
              desc: 'Обсуждения сообщества, скорость голосования, тональность комментариев.',
            },
          ],
        },
        {
          id: 'scoring',
          icon: <BarChart3 className="w-5 h-5" />,
          title: 'Методология оценки',
          description: 'Каждый сигнал оценивается по нескольким метрикам:',
          metrics: [
            {
              name: 'Оценка влияния',
              range: '1-10',
              icon: <Target className="w-4 h-4" />,
              desc: 'Потенциал трансформации индустрии. На основе новизны, применимости и размера рынка.',
            },
            {
              name: 'Объём хайпа',
              range: '0-∞',
              icon: <TrendingUp className="w-4 h-4" />,
              desc: 'Общее вовлечение: звёзды, голоса, цитирования, комментарии.',
            },
            {
              name: 'Недельный рост',
              range: '%',
              icon: <Zap className="w-4 h-4" />,
              desc: 'Изменение активности неделя к неделе. Выявляет ускоряющиеся тренды.',
            },
          ],
        },
        {
          id: 'anomalies',
          icon: <AlertTriangle className="w-5 h-5" />,
          title: 'Обнаружение аномалий',
          description:
            'Аномалии отмечаются при значительном отклонении от ожидаемых паттернов:',
          criteria: [
            'Внезапный всплеск вовлечения (>3x нормы)',
            'Необычный межкатегорийный интерес',
            'Быстрое продвижение по стадиям зрелости',
            'Высокое влияние + низкий хайп (скрытые жемчужины)',
          ],
        },
        {
          id: 'maturity',
          icon: <Layers className="w-5 h-5" />,
          title: 'Стадии зрелости',
          description: 'Технологии проходят четыре стадии:',
          stages: [
            {
              key: 'research',
              label: 'Исследование',
              color: '#a855f7',
              description: 'Научные статьи и теоретические основы',
            },
            {
              key: 'prototype',
              label: 'Прототип',
              color: '#00f0ff',
              description: 'Рабочие демо и доказательства концепции',
            },
            {
              key: 'early-adopter',
              label: 'Ранние последователи',
              color: '#ffaa00',
              description: 'Использование инноваторами в продакшене',
            },
            {
              key: 'mass-market',
              label: 'Массовый рынок',
              color: '#22c55e',
              description: 'Широкое внедрение в индустрии',
            },
          ],
        },
        {
          id: 'evolution',
          icon: <ArrowRight className="w-5 h-5" />,
          title: 'Цепочки эволюции',
          description:
            'Мы отслеживаем эволюцию технологий от исследований до массового внедрения:',
          process: [
            {
              step: 1,
              label: 'Обнаружение сигнала',
              desc: 'Новая статья, репозиторий или обсуждение',
            },
            {
              step: 2,
              label: 'Категоризация',
              desc: 'ИИ классифицирует по категории',
            },
            {
              step: 3,
              label: 'Связывание цепочки',
              desc: 'Соединение с похожими сигналами',
            },
            {
              step: 4,
              label: 'Анализ траектории',
              desc: 'Растущий, стабильный или падающий тренд',
            },
          ],
        },
      ],
      footer: {
        refresh: 'Данные обновляются каждые 10 минут',
        disclaimer:
          'Инсайты алгоритмические и должны информировать, а не заменять человеческое суждение.',
      },
    },
  }

  const t = content[language]

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed inset-4 sm:inset-8 md:inset-12 lg:inset-16 xl:inset-24 z-50 flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="relative w-full max-w-4xl max-h-full overflow-hidden rounded-2xl bg-[#0d0d14] border border-white/10 shadow-2xl shadow-violet-500/10">
              {/* Header gradient */}
              <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-violet-600/20 to-transparent pointer-events-none" />

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>

              {/* Content */}
              <div className="relative overflow-y-auto max-h-[calc(100vh-8rem)] p-6 sm:p-8">
                {/* Title */}
                <div className="mb-8">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white">
                        {t.title}
                      </h2>
                      <p className="text-sm text-white/50">{t.subtitle}</p>
                    </div>
                  </div>
                </div>

                {/* Sections */}
                <div className="space-y-8">
                  {t.sections.map((section, idx) => (
                    <motion.div
                      key={section.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="relative"
                    >
                      {/* Section header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-violet-400">
                          {section.icon}
                        </div>
                        <h3 className="text-lg font-semibold text-white">
                          {section.title}
                        </h3>
                      </div>

                      <p className="text-sm text-white/60 mb-4 ml-11">
                        {section.description}
                      </p>

                      {/* Sources section */}
                      {'items' in section && section.items && (
                        <div className="grid gap-3 ml-11">
                          {section.items.map((item) => (
                            <div
                              key={item.name}
                              className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5"
                            >
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                style={{ backgroundColor: `${item.color}15` }}
                              >
                                <span style={{ color: item.color }}>
                                  {item.icon}
                                </span>
                              </div>
                              <div>
                                <h4 className="text-sm font-medium text-white">
                                  {item.name}
                                </h4>
                                <p className="text-xs text-white/50 mt-0.5">
                                  {item.desc}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Metrics section */}
                      {'metrics' in section && section.metrics && (
                        <div className="grid sm:grid-cols-3 gap-3 ml-11">
                          {section.metrics.map((metric) => (
                            <div
                              key={metric.name}
                              className="p-3 rounded-xl bg-white/[0.02] border border-white/5"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-cyan-400">
                                  {metric.icon}
                                </span>
                                <span className="text-sm font-medium text-white">
                                  {metric.name}
                                </span>
                                <span className="text-xs text-white/55 font-mono ml-auto">
                                  {metric.range}
                                </span>
                              </div>
                              <p className="text-xs text-white/50">
                                {metric.desc}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Anomaly criteria */}
                      {'criteria' in section && section.criteria && (
                        <ul className="space-y-2 ml-11">
                          {section.criteria.map((criterion, i) => (
                            <li
                              key={i}
                              className="flex items-center gap-2 text-sm text-white/60"
                            >
                              <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                              {criterion}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Maturity stages */}
                      {'stages' in section && section.stages && (
                        <div className="flex flex-wrap gap-2 ml-11">
                          {section.stages.map((stage) => (
                            <div
                              key={stage.key}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                              style={{
                                backgroundColor: `${stage.color}10`,
                                borderColor: `${stage.color}30`,
                              }}
                            >
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: stage.color }}
                              />
                              <div>
                                <span
                                  className="text-sm font-medium"
                                  style={{ color: stage.color }}
                                >
                                  {stage.label}
                                </span>
                                <p className="text-[10px] text-white/60">
                                  {stage.description}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Evolution process */}
                      {'process' in section && section.process && (
                        <div className="flex flex-col sm:flex-row gap-2 ml-11">
                          {section.process.map((step, i) => (
                            <div
                              key={step.step}
                              className="flex items-center gap-2 flex-1"
                            >
                              <div className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5 flex-1">
                                <div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-400">
                                  {step.step}
                                </div>
                                <div>
                                  <div className="text-xs font-medium text-white">
                                    {step.label}
                                  </div>
                                  <div className="text-[10px] text-white/60">
                                    {step.desc}
                                  </div>
                                </div>
                              </div>
                              {i < section.process.length - 1 && (
                                <ArrowRight className="w-4 h-4 text-white/45 hidden sm:block flex-shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>

                {/* Footer */}
                <div className="mt-8 pt-6 border-t border-white/5">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/60">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      {t.footer.refresh}
                    </div>
                    <div className="text-center sm:text-right">
                      {t.footer.disclaimer}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
