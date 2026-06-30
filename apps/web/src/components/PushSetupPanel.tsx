import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePushSetup } from '../hooks/usePushSetup'

type PushSetupPanelProps = {
  pushEnabled: boolean
  isBusy: boolean
  onEnablePush: () => void
  onDisablePush: () => void
}

function StepBadge({ done, index }: { done: boolean; index: number }) {
  if (done) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        ✓
      </span>
    )
  }

  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {index}
    </span>
  )
}

export default function PushSetupPanel({
  pushEnabled,
  isBusy,
  onEnablePush,
  onDisablePush,
}: PushSetupPanelProps) {
  const { t } = useTranslation()
  const {
    isIos,
    isPwaInstalled,
    needsPwaInstall,
    isNativeInstallable,
    hasSubscription,
    permission,
    canRequestPush,
    installNative,
  } = usePushSetup()
  const [showIosGuide, setShowIosGuide] = useState(false)

  const notificationsReady = pushEnabled || hasSubscription || permission === 'granted'

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosGuide((current) => !current)
      return
    }

    if (isNativeInstallable) {
      await installNative()
    }
  }

  return (
    <div className="rounded-md border border-slate-200 p-4 dark:border-slate-700">
      <p className="text-sm font-medium text-gray-900 dark:text-white">{t('profile.notifications.pushLabel')}</p>
      <p className="mt-1 text-xs text-gray-600 dark:text-slate-400">{t('profile.notifications.pushHelp')}</p>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <StepBadge done={isPwaInstalled} index={1} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('profile.notifications.setupInstallTitle')}</p>
              <p className="mt-1 text-xs text-gray-600 dark:text-slate-400">
                {isIos
                  ? t('profile.notifications.setupInstallIosHelp')
                  : t('profile.notifications.setupInstallHelp')}
              </p>
            </div>
          </div>
          {!isPwaInstalled && (
            <button
              type="button"
              disabled={isBusy || (!isIos && !isNativeInstallable)}
              onClick={() => void handleInstallClick()}
              className="shrink-0 rounded-md border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
            >
              {isIos ? t('profile.notifications.setupInstallIosButton') : t('profile.notifications.setupInstallButton')}
            </button>
          )}
        </div>

        {showIosGuide && needsPwaInstall && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
            <p className="font-medium">{t('profile.notifications.iosInstallTitle')}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>{t('profile.notifications.iosInstallStep1')}</li>
              <li>{t('profile.notifications.iosInstallStep2')}</li>
              <li>{t('profile.notifications.iosInstallStep3')}</li>
            </ol>
            <p className="mt-2 text-amber-800 dark:text-amber-200">{t('profile.notifications.setupInstallIosReturn')}</p>
          </div>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <StepBadge done={notificationsReady} index={2} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">{t('profile.notifications.setupNotifyTitle')}</p>
              <p className="mt-1 text-xs text-gray-600 dark:text-slate-400">{t('profile.notifications.setupNotifyHelp')}</p>
              {needsPwaInstall && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('profile.notifications.setupNotifyWaitingInstall')}</p>
              )}
              {permission === 'denied' && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t('profile.notifications.iosPermissionDeniedHelp')}</p>
              )}
            </div>
          </div>
          {notificationsReady ? (
            <button
              type="button"
              disabled={isBusy}
              onClick={onDisablePush}
              className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t('profile.notifications.disablePush')}
            </button>
          ) : (
            <button
              type="button"
              disabled={isBusy || !canRequestPush}
              onClick={onEnablePush}
              className="shrink-0 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('profile.notifications.enablePush')}
            </button>
          )}
        </div>
      </div>

      <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">{t('profile.notifications.pushEvents')}</p>
    </div>
  )
}
