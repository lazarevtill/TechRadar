import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { LanguageProvider } from '@/lib/i18n'

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
      { name: 'color-scheme', content: 'dark' },
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
        // CJK fallback only: the UI itself uses the system font stack. Google
        // serves these families in unicode-range slices, so a viewer whose
        // machine lacks Chinese or Japanese fonts downloads just the slices
        // that an original-language title actually needs, and nobody else
        // downloads anything.
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500&family=Noto+Sans+JP:wght@400;500&display=swap',
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
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          forcedTheme="dark"
          disableTransitionOnChange
        >
          <LanguageProvider defaultLanguage="en">{children}</LanguageProvider>
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
