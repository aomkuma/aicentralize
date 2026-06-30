import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'

const FEATURE_ICONS = {
  meetingStudio: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  ),
  projects: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  ),
  knowledge: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  askAi: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
    </svg>
  ),
  reminders: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  ),
} as const

const FEATURE_KEYS = [
  'meetingStudio',
  'projects',
  'knowledge',
  'askAi',
  'reminders',
] as const

const HERO_HIGHLIGHT_KEYS = ['meetings', 'knowledge', 'ai'] as const

export default function WelcomePage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-blue-900/30 blur-3xl" />
      </div>

      <header className="relative z-20 border-b border-white/10 bg-black/30 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center">
            <span className="rounded-lg bg-white/95 px-2.5 py-1.5 shadow-sm ring-1 ring-white/20">
              <img
                src="/brand/logo/kora-lockup.png"
                alt={t('common.appName')}
                className="h-7 w-auto sm:h-8"
              />
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <LanguageSwitcher compact />
            <Link
              to="/auth/login"
              className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/40 transition hover:from-blue-500 hover:to-cyan-400"
            >
              {t('landing.signIn')}
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 sm:pb-20 sm:pt-10 lg:px-8 lg:pb-24">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-12 xl:gap-16">
            <div className="order-2 space-y-5 lg:order-1">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400 sm:text-sm">
                {t('landing.eyebrow')}
              </p>
              <h1 className="text-[1.75rem] font-bold leading-[1.2] tracking-tight sm:text-4xl lg:text-[2.65rem] lg:leading-[1.15]">
                {t('landing.heroTitle')}
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg sm:leading-8">
                {t('landing.heroSubtitle')}
              </p>
            </div>

            <div className="order-1 flex w-full items-center justify-center lg:order-2">
              <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 to-blue-950/40 p-1 shadow-2xl shadow-blue-950/60 ring-1 ring-white/10">
                <img
                  src="/brand/kora-banner-visual.png"
                  alt=""
                  className="block h-auto w-full object-contain"
                />
              </div>
            </div>
          </div>

          <div className="mt-10 lg:mt-12">
            <ul className="grid gap-3 lg:grid-cols-3">
              {HERO_HIGHLIGHT_KEYS.map((key) => (
                <li
                  key={key}
                  className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 backdrop-blur-sm transition hover:border-cyan-500/25 hover:bg-cyan-500/[0.04]"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-xs font-bold text-white shadow shadow-cyan-900/40">
                    ✓
                  </span>
                  <div>
                    <p className="font-semibold text-white">{t(`landing.heroHighlights.${key}.title`)}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-slate-400">
                      {t(`landing.heroHighlights.${key}.description`)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link
                to="/auth/login"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-blue-900/50 transition hover:from-blue-500 hover:to-cyan-400"
              >
                {t('landing.getStarted')}
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                {t('landing.exploreFeatures')}
              </a>
            </div>

            <p className="mt-8 flex justify-center lg:justify-start">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100">
                <span className="text-cyan-400" aria-hidden>✦</span>
                {t('landing.heroBadge')}
              </span>
            </p>
          </div>
        </section>

        <section id="features" className="border-t border-white/10 bg-black/30 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold sm:text-3xl">{t('landing.featuresTitle')}</h2>
              <p className="mt-3 text-slate-400">{t('landing.featuresSubtitle')}</p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {FEATURE_KEYS.map((key) => (
                <article
                  key={key}
                  className="group rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-5 transition hover:border-cyan-500/40 hover:shadow-lg hover:shadow-cyan-950/30"
                >
                  <div className="mb-4 inline-flex rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-cyan-300 transition group-hover:bg-cyan-500/20">
                    {FEATURE_ICONS[key]}
                  </div>
                  <h3 className="font-semibold text-white">{t(`landing.features.${key}.title`)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {t(`landing.features.${key}.description`)}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-3xl border border-blue-500/30 bg-gradient-to-br from-blue-950/80 via-slate-900 to-cyan-950/50 p-8 text-center shadow-2xl shadow-blue-950/40 sm:p-12">
              <h2 className="text-2xl font-bold sm:text-3xl">{t('landing.ctaTitle')}</h2>
              <p className="mx-auto mt-4 max-w-xl text-slate-300">{t('landing.ctaSubtitle')}</p>
              <Link
                to="/auth/login"
                className="mt-8 inline-flex items-center justify-center rounded-xl bg-white px-8 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-100"
              >
                {t('landing.signInToWorkspace')}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-center text-sm text-slate-500 sm:flex-row sm:px-6 sm:text-left lg:px-8">
          <p>{t('landing.footer', { year: new Date().getFullYear() })}</p>
          <p className="text-slate-400">{t('landing.footerTagline')}</p>
        </div>
      </footer>
    </div>
  )
}
