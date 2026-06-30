import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useApi } from '../hooks/useApi'
import {
  effectivePackagePriceCents,
  formatPackageMoney,
  packageDiscountLabel,
  packageFeatureLabels,
  sortPackagesByPrice,
} from '../lib/packagePricing'
import type { SubscriptionPackage } from '../types'

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
  feelingLogs: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
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
  'knowledge',
  'feelingLogs',
  'meetingStudio',
  'projects',
  'askAi',
  'reminders',
] as const

const HERO_HIGHLIGHT_KEYS = ['knowledgeHub', 'teamPulse', 'contextAi'] as const

const SPOTLIGHT_KEYS = ['knowledgeHub', 'feelingLogs'] as const

const SPOTLIGHT_POINT_KEYS = {
  knowledgeHub: ['onboarding', 'documents', 'askAi'],
  feelingLogs: ['private', 'insights', 'culture'],
} as const

function billingIntervalLabel(interval: string, t: (key: string) => string) {
  return t(`landing.packagesIntervals.${interval}`)
}

export default function WelcomePage() {
  const { t } = useTranslation()
  const { get } = useApi()
  const [packages, setPackages] = useState<SubscriptionPackage[]>([])
  const [packagesLoading, setPackagesLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      setPackagesLoading(true)
      const data = await get<SubscriptionPackage[]>('/packages')
      if (!cancelled && Array.isArray(data)) {
        setPackages(sortPackagesByPrice(data))
      }
      if (!cancelled) {
        setPackagesLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [get])

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
        <section className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 sm:pb-16 sm:pt-8 lg:px-8 lg:pb-20">
          <div className="mx-auto max-w-3xl space-y-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400 sm:text-sm">
              {t('landing.eyebrow')}
            </p>
            <h1 className="text-[1.75rem] font-bold leading-[1.2] tracking-tight sm:text-4xl lg:text-[2.65rem] lg:leading-[1.15]">
              {t('landing.heroTitle')}
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg sm:leading-8">
              {t('landing.heroSubtitle')}
            </p>
          </div>

          <div className="mt-8 overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-blue-950/60 ring-1 ring-white/10">
            <img
              src="/brand/kora-landing-banner.png"
              alt={t('landing.heroBannerAlt')}
              className="block h-auto w-full"
            />
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

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/auth/login"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-3 text-sm font-bold text-white shadow-xl shadow-blue-900/50 transition hover:from-blue-500 hover:to-cyan-400"
              >
                {t('landing.getStarted')}
              </Link>
              <a
                href="#packages"
                className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                {t('landing.exploreFeatures')}
              </a>
            </div>

            <p className="mt-5 text-center text-sm leading-relaxed text-slate-400 sm:text-[0.95rem]">
              {t('landing.heroOriginLine')}
            </p>

            <p className="mt-8 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100">
                <span className="text-cyan-400" aria-hidden>✦</span>
                {t('landing.heroBadge')}
              </span>
            </p>
          </div>
        </section>

        <section id="spotlight" className="border-t border-white/10 bg-gradient-to-b from-cyan-950/20 via-black/20 to-black/30 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400 sm:text-sm">
                {t('landing.spotlightTitle')}
              </p>
              <p className="mt-4 text-base leading-relaxed text-slate-300 sm:text-lg">
                {t('landing.spotlightSubtitle')}
              </p>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              {SPOTLIGHT_KEYS.map((key) => (
                <article
                  key={key}
                  className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 to-slate-950/90 p-6 shadow-2xl shadow-blue-950/30 sm:p-8"
                >
                  <div
                    className={`pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full blur-3xl ${
                      key === 'knowledgeHub' ? 'bg-cyan-500/20' : 'bg-rose-500/15'
                    }`}
                  />
                  <div className="relative">
                    <div className="mb-5 flex items-center gap-3">
                      <div
                        className={`inline-flex rounded-xl border p-3 ${
                          key === 'knowledgeHub'
                            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                            : 'border-rose-400/30 bg-rose-500/10 text-rose-300'
                        }`}
                      >
                        {key === 'knowledgeHub' ? FEATURE_ICONS.knowledge : FEATURE_ICONS.feelingLogs}
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                          key === 'knowledgeHub'
                            ? 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                            : 'border border-rose-400/30 bg-rose-500/10 text-rose-200'
                        }`}
                      >
                        {t(`landing.spotlight.${key}.badge`)}
                      </span>
                    </div>

                    <h3 className="text-2xl font-bold text-white sm:text-[1.65rem]">
                      {t(`landing.spotlight.${key}.title`)}
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">
                      {t(`landing.spotlight.${key}.description`)}
                    </p>

                    <ul className="mt-6 space-y-3">
                      {SPOTLIGHT_POINT_KEYS[key].map((pointKey) => (
                        <li key={pointKey} className="flex gap-3 text-sm text-slate-300 sm:text-[0.95rem]">
                          <span
                            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                              key === 'knowledgeHub'
                                ? 'bg-gradient-to-br from-blue-500 to-cyan-400'
                                : 'bg-gradient-to-br from-rose-500 to-orange-400'
                            }`}
                          >
                            ✓
                          </span>
                          <span>{t(`landing.spotlight.${key}.points.${pointKey}`)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="packages" className="border-t border-white/10 bg-black/20 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-400 sm:text-sm">
                {t('navigation.packages')}
              </p>
              <h2 className="mt-4 text-2xl font-bold sm:text-3xl">{t('landing.packagesTitle')}</h2>
            </div>

            {packagesLoading ? (
              <p className="mt-12 text-center text-sm text-slate-400">{t('landing.packagesLoading')}</p>
            ) : !packages.length ? (
              <p className="mt-12 text-center text-sm text-slate-400">{t('landing.packagesEmpty')}</p>
            ) : (
              <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
                {packages.map((pkg) => {
                  const effectivePrice = effectivePackagePriceCents(pkg)
                  const discountLabel = packageDiscountLabel(pkg)
                  const featurePreview = packageFeatureLabels(pkg, 4)
                  const remainingFeatures = Math.max(0, pkg.features.length - featurePreview.length)
                  const intervalLabel = billingIntervalLabel(pkg.billingInterval, t)

                  return (
                    <article
                      key={pkg.id}
                      className={`relative flex h-full flex-col rounded-3xl border bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-6 shadow-xl sm:p-7 ${
                        pkg.isDefault
                          ? 'border-cyan-500/40 shadow-cyan-950/30 ring-1 ring-cyan-500/20'
                          : 'border-white/10 shadow-blue-950/20'
                      }`}
                    >
                      {pkg.isDefault && (
                        <span className="absolute -top-3 left-6 rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                          {t('landing.packagesDefaultBadge')}
                        </span>
                      )}

                      <div className="mb-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{pkg.code}</p>
                        <h3 className="mt-2 text-2xl font-bold text-white">{pkg.name}</h3>
                        {pkg.description && (
                          <p className="mt-3 text-sm leading-relaxed text-slate-400">{pkg.description}</p>
                        )}
                      </div>

                      <div className="mb-6">
                        <div className="flex flex-wrap items-end gap-2">
                          {discountLabel && pkg.priceCents > 0 && (
                            <span className="text-sm text-slate-500 line-through">
                              {formatPackageMoney(pkg.priceCents, pkg.currency)}
                            </span>
                          )}
                          <span className="text-3xl font-bold text-white">
                            {effectivePrice === 0
                              ? t('landing.packagesFree')
                              : formatPackageMoney(effectivePrice, pkg.currency)}
                          </span>
                          {effectivePrice > 0 && (
                            <span className="pb-1 text-sm text-slate-400">{intervalLabel}</span>
                          )}
                        </div>
                        {discountLabel && (
                          <p className="mt-2 text-sm font-medium text-emerald-300">
                            {t('landing.packagesDiscount', { value: discountLabel })}
                          </p>
                        )}
                      </div>

                      <ul className="mb-6 space-y-2 text-sm text-slate-300">
                        <li className="flex gap-2">
                          <span className="text-cyan-400" aria-hidden>•</span>
                          <span>{t('landing.packagesProjects', { count: pkg.maxProjects })}</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-cyan-400" aria-hidden>•</span>
                          <span>{t('landing.packagesUsers', { count: pkg.maxUsers })}</span>
                        </li>
                        {pkg.additionalUserPriceCents > 0 && (
                          <li className="flex gap-2">
                            <span className="text-cyan-400" aria-hidden>•</span>
                            <span>
                              {t('landing.packagesAdditionalUser', {
                                price: formatPackageMoney(pkg.additionalUserPriceCents, pkg.currency),
                              })}
                            </span>
                          </li>
                        )}
                        {pkg.features.length > 0 && (
                          <li className="flex gap-2">
                            <span className="text-cyan-400" aria-hidden>•</span>
                            <span>{t('landing.packagesFeatures', { count: pkg.features.length })}</span>
                          </li>
                        )}
                      </ul>

                      {featurePreview.length > 0 && (
                        <ul className="mb-6 space-y-2 border-t border-white/10 pt-4">
                          {featurePreview.map((feature) => (
                            <li key={feature} className="flex gap-2 text-sm text-slate-400">
                              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-[10px] font-bold text-cyan-300">
                                ✓
                              </span>
                              <span>{feature}</span>
                            </li>
                          ))}
                          {remainingFeatures > 0 && (
                            <li className="text-xs text-slate-500">
                              {t('landing.packagesMoreFeatures', { count: remainingFeatures })}
                            </li>
                          )}
                        </ul>
                      )}

                      <div className="mt-auto">
                        <Link
                          to="/auth/login"
                          className={`inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold transition ${
                            pkg.isDefault
                              ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white hover:from-blue-500 hover:to-cyan-400'
                              : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                          }`}
                        >
                          {t('landing.packagesChoosePlan')}
                        </Link>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        <section id="features" className="border-t border-white/10 bg-black/30 py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold sm:text-3xl">{t('landing.featuresTitle')}</h2>
              <p className="mt-3 text-slate-400">{t('landing.featuresSubtitle')}</p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_KEYS.map((key) => (
                <article
                  key={key}
                  className={`group rounded-2xl border bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-5 transition hover:shadow-lg ${
                    key === 'knowledge' || key === 'feelingLogs'
                      ? 'border-cyan-500/30 hover:border-cyan-500/50 hover:shadow-cyan-950/30'
                      : 'border-white/10 hover:border-cyan-500/40 hover:shadow-cyan-950/30'
                  }`}
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

        <section id="our-story" className="border-t border-white/10 bg-gradient-to-b from-slate-100 via-[#eef2f7] to-slate-50 py-12 sm:py-16">
          <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-blue-700 sm:text-sm">
              {t('landing.story.eyebrow')}
            </p>

            <div className="mt-8 space-y-5 text-[0.98rem] leading-7 text-slate-600 sm:text-base">
              <p className="text-center text-slate-700">{t('landing.story.introNot')}</p>
              <p className="rounded-2xl border border-blue-100/80 bg-white/70 px-5 py-4 text-center font-medium text-slate-800 shadow-sm">
                {t('landing.story.introBut')}
              </p>

              <p>{t('landing.story.scene')}</p>
              <p>{t('landing.story.absence')}</p>

              <p className="text-lg font-semibold leading-snug text-slate-900 sm:text-xl">
                {t('landing.story.belief')}
              </p>

              <p className="text-slate-700">{t('landing.story.purpose')}</p>
            </div>

            <p className="mt-8 border-t border-slate-200/80 pt-8 text-center text-sm leading-relaxed text-slate-500 sm:text-[0.95rem]">
              {t('landing.story.tribute')}
            </p>
          </div>
        </section>

        <section className="border-y border-blue-100/60 bg-gradient-to-b from-blue-50/90 to-cyan-50/70 py-10 sm:py-14">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <blockquote className="space-y-3">
              <p className="text-xl font-semibold leading-snug text-slate-700 sm:text-2xl sm:leading-tight">
                {t('landing.story.quote.line1')}
              </p>
              <p className="text-xl font-semibold leading-snug text-blue-900 sm:text-2xl sm:leading-tight">
                {t('landing.story.quote.line2')}
              </p>
            </blockquote>
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
