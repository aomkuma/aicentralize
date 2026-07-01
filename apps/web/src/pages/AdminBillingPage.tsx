import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ExternalLink, Upload, X } from 'lucide-react'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import { formatPackageMoney } from '../lib/packagePricing'
import type { AdminBillingPeriod, TenantBillingPeriodStatus } from '../types'

const PERIOD_STATUSES: Array<TenantBillingPeriodStatus | ''> = [
  '',
  'AWAITING_PAYMENT',
  'OPEN',
  'PAID',
  'PAST_DUE',
  'VOID',
]

function formatDate(value?: string | null) {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '—'
  }
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function periodStatusClass(status: TenantBillingPeriodStatus) {
  switch (status) {
    case 'PAID':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
    case 'AWAITING_PAYMENT':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
    case 'PAST_DUE':
      return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
    case 'OPEN':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
  }
}

async function openSlipInNewTab(paymentId: string) {
  const token = localStorage.getItem('accessToken')
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
  const response = await fetch(`${baseURL}/admin/billing/payments/${paymentId}/slip`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    throw new Error('Unable to load slip')
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export default function AdminBillingPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const tenantFilter = searchParams.get('tenantId') ?? ''
  const { get, post, postFormData, isLoading, error } = useApi()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [periods, setPeriods] = useState<AdminBillingPeriod[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<TenantBillingPeriodStatus | ''>('AWAITING_PAYMENT')
  const [uploadPeriodId, setUploadPeriodId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const limit = 20

  const fetchPeriods = useCallback(async () => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    })
    if (statusFilter) {
      params.set('status', statusFilter)
    }
    if (tenantFilter) {
      params.set('tenantId', tenantFilter)
    }

    const data = await get<{ items: AdminBillingPeriod[]; total: number; page: number; limit: number }>(
      `/admin/billing/periods?${params.toString()}`,
    )

    if (data) {
      setPeriods(data.items)
      setTotal(data.total)
    }
  }, [get, limit, page, statusFilter, tenantFilter])

  useEffect(() => {
    fetchPeriods()
  }, [fetchPeriods])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit])

  const handleUploadClick = (periodId: string) => {
    setUploadPeriodId(periodId)
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !uploadPeriodId) {
      return
    }

    setActionError(null)
    setNotice(null)

    try {
      const formData = new FormData()
      formData.append('slip', file)
      await postFormData(`/admin/billing/periods/${uploadPeriodId}/payments`, formData)
      setNotice(t('adminBilling.slipUploaded'))
      await fetchPeriods()
    } catch (uploadError) {
      const message =
        uploadError && typeof uploadError === 'object' && 'message' in uploadError
          ? String((uploadError as { message: string }).message)
          : t('adminBilling.uploadFailed')
      setActionError(message)
    } finally {
      setUploadPeriodId(null)
    }
  }

  const handleApprove = async (paymentId: string) => {
    setActionError(null)
    setNotice(null)
    const result = await post(`/admin/billing/payments/${paymentId}/approve`, {})
    if (result) {
      setNotice(t('adminBilling.paymentApproved'))
      await fetchPeriods()
    }
  }

  const handleReject = async (paymentId: string) => {
    const reviewNote = window.prompt(t('adminBilling.rejectPrompt'))
    if (reviewNote === null) {
      return
    }

    setActionError(null)
    setNotice(null)
    const result = await post(`/admin/billing/payments/${paymentId}/reject`, {
      reviewNote: reviewNote.trim() || null,
    })
    if (result) {
      setNotice(t('adminBilling.paymentRejected'))
      await fetchPeriods()
    }
  }

  const handleViewSlip = async (paymentId: string) => {
    try {
      await openSlipInNewTab(paymentId)
    } catch {
      setActionError(t('adminBilling.slipOpenFailed'))
    }
  }

  return (
    <Layout>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
              {t('adminBilling.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t('adminBilling.description')}
            </p>
          </div>
          {tenantFilter && (
            <Link
              to="/admin/billing"
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              {t('adminBilling.clearTenantFilter')}
            </Link>
          )}
        </div>

        {(notice || actionError || error) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              notice
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
            }`}
          >
            {notice || actionError || error?.message}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-400">
            {t('adminBilling.statusFilter')}
            <select
              value={statusFilter}
              onChange={(event) => {
                setPage(1)
                setStatusFilter(event.target.value as TenantBillingPeriodStatus | '')
              }}
              className="ml-2 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            >
              <option value="">{t('adminBilling.allStatuses')}</option>
              {PERIOD_STATUSES.filter(Boolean).map((status) => (
                <option key={status} value={status}>
                  {t(`adminBilling.periodStatus.${status}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/60">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('adminBilling.organization')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('adminBilling.period')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('adminBilling.package')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('adminBilling.amount')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('adminBilling.status')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t('adminBilling.payments')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {periods.map((period) => {
                  const pendingPayment = period.payments.find((payment) => payment.status === 'PENDING')
                  const canUpload =
                    period.status !== 'PAID' &&
                    period.status !== 'VOID' &&
                    !pendingPayment

                  return (
                    <tr key={period.id} className="align-top">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{period.tenant.name}</div>
                        <div className="text-xs text-slate-500">{period.tenant.slug}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        <div>{formatDate(period.periodStart)}</div>
                        <div className="text-xs text-slate-500">
                          {t('adminBilling.periodEnd')}: {formatDate(period.periodEnd)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        <div>{period.packageName ?? period.packageCode}</div>
                        <div className="text-xs text-slate-500">{period.packageCode}</div>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatPackageMoney(period.amountCents, period.currency)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${periodStatusClass(period.status)}`}
                        >
                          {t(`adminBilling.periodStatus.${period.status}`)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="space-y-2">
                          {period.payments.length === 0 && (
                            <span className="text-xs text-slate-500">{t('adminBilling.noPayments')}</span>
                          )}
                          {period.payments.map((payment) => (
                            <div
                              key={payment.id}
                              className="rounded-md border border-slate-200 p-2 text-xs dark:border-slate-700"
                            >
                              <div className="font-medium">{payment.slipFileName}</div>
                              <div className="text-slate-500">
                                {t(`adminBilling.paymentStatus.${payment.status}`)} ·{' '}
                                {formatDate(payment.submittedAt)}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleViewSlip(payment.id)}
                                  className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  {t('adminBilling.viewSlip')}
                                </button>
                                {payment.status === 'PENDING' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApprove(payment.id)}
                                      disabled={isLoading}
                                      className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      <Check className="h-3 w-3" />
                                      {t('adminBilling.approve')}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleReject(payment.id)}
                                      disabled={isLoading}
                                      className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                      <X className="h-3 w-3" />
                                      {t('adminBilling.reject')}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                          {canUpload && (
                            <button
                              type="button"
                              onClick={() => handleUploadClick(period.id)}
                              disabled={isLoading}
                              className="inline-flex items-center gap-1 rounded-md border border-blue-300 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/40"
                            >
                              <Upload className="h-3 w-3" />
                              {t('adminBilling.uploadSlip')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!isLoading && periods.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                      {t('adminBilling.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
            <span>{t('adminBilling.pagination', { page, totalPages })}</span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-600"
              >
                {t('adminBilling.prev')}
              </button>
              <button
                type="button"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((current) => current + 1)}
                className="rounded border border-slate-300 px-3 py-1 disabled:opacity-50 dark:border-slate-600"
              >
                {t('adminBilling.next')}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
