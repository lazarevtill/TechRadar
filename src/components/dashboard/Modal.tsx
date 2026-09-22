import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useLanguage } from '@/lib/i18n'

/**
 * Plain dialog: backdrop, panel, Escape and backdrop-click to close, focus
 * moved in on open and restored on close. No transitions.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  width = 'max-w-2xl',
}: {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  width?: string
}) {
  const { t } = useLanguage()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previous = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/70"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${width} max-h-[92vh] flex flex-col bg-page border border-rule-strong rounded-md outline-none`}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-rule">
          <div>
            <h2 className="text-base font-medium text-fg">{title}</h2>
            {subtitle && <p className="text-xs text-fg-3 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-icon" aria-label={t.close}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}
