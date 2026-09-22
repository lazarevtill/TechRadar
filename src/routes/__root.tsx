import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { LazyMotion, MotionConfig } from 'motion/react'
import { LanguageProvider } from '@/lib/i18n'

const loadMotionFeatures = () =>
  import('@/lib/motion-features').then((mod) => mod.default)

interface MyRouterContext {
  queryClient: QueryClient
}

const scripts: React.DetailedHTMLProps<
  React.ScriptHTMLAttributes<HTMLScriptElement>,
  HTMLScriptElement
>[] = []

if (import.meta.env.VITE_INSTRUMENTATION_SCRIPT_SRC) {
  scripts.push({
    src: import.meta.env.VITE_INSTRUMENTATION_SCRIPT_SRC,
    type: 'module',
  })
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Tech Evolution Radar',
      },
      {
        name: 'description',
        content: 'Track how tech noise becomes trends and industry standards',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap',
      },
    ],
    scripts: [...scripts],
  }),

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <LanguageProvider defaultLanguage="en">
            {/* Honour the OS "reduce motion" setting: entrance animations jump
                straight to their final state instead of fading in. */}
            <MotionConfig reducedMotion="user">
              {/* `m` components + the domAnimation feature set (loaded async)
                  instead of the full `motion` component; `strict` throws if a
                  full `motion.*` sneaks back in and re-adds the whole library. */}
              <LazyMotion features={loadMotionFeatures} strict>
                {children}
              </LazyMotion>
            </MotionConfig>
          </LanguageProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
