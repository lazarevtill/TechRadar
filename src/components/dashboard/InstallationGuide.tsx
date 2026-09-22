import { useState } from 'react'
import { Download, Check } from 'lucide-react'
import { useLanguage } from '@/lib/i18n'
import { downloadExtensionFn } from '@/server/functions/extension-download'
import { Modal } from './Modal'

interface InstallationGuideProps {
  isOpen: boolean
  onClose: () => void
}

export function InstallationGuide({ isOpen, onClose }: InstallationGuideProps) {
  const { t } = useLanguage()
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)

  const handleDownload = async () => {
    if (isDownloading) return

    setIsDownloading(true)
    try {
      const result = await downloadExtensionFn()

      if (result.success && result.data) {
        // Convert base64 to blob
        const byteCharacters = atob(result.data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'application/zip' })

        // Create download link
        const url = window.URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        window.URL.revokeObjectURL(url)

        setDownloadComplete(true)
      }
    } catch (error) {
      console.error('Failed to download extension:', error)
    } finally {
      setIsDownloading(false)
    }
  }

  const steps = [
    { title: t.step1Title, description: t.step1Desc },
    { title: t.step2Title, description: t.step2Desc },
    {
      title: t.step3Title,
      description: t.step3Desc,
      code: 'chrome://extensions',
    },
    { title: t.step4Title, description: t.step4Desc },
    { title: t.step5Title, description: t.step5Desc },
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.installationGuide}
      subtitle={t.installationGuideSubtitle}
    >
      <ol className="divide-y divide-rule">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4 py-3">
            <span className="num text-xs text-fg-3 w-4 pt-0.5">
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm text-fg">{step.title}</h3>
              <p className="text-xs text-fg-2 mt-0.5">{step.description}</p>
              {step.code && (
                <code className="mt-1.5 inline-block font-mono text-xs text-fg-2 border border-rule rounded px-1.5 py-0.5">
                  {step.code}
                </code>
              )}
              {index === 0 && (
                <button
                  onClick={() => void handleDownload()}
                  disabled={isDownloading}
                  className={`mt-2 ${downloadComplete ? 'btn' : 'btn-primary'}`}
                >
                  {downloadComplete ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  {isDownloading
                    ? `${t.downloading}…`
                    : downloadComplete
                      ? t.downloaded
                      : t.downloadExtension}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-fg-2 border-l-2 border-rule-strong pl-3">
        <span className="text-fg">{t.proTip}: </span>
        {t.proTipText}
      </p>

      <div className="mt-4 flex justify-end">
        <button onClick={onClose} className="btn">
          {t.close}
        </button>
      </div>
    </Modal>
  )
}
