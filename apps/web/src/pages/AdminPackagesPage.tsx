import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Plus, Save, Trash2 } from 'lucide-react'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'
import type { SubscriptionPackage } from '../types'
import { FEATURES } from '../types/features'

type PackageDiscountType = 'FIXED' | 'PERCENT' | ''

type PackageForm = {
  code: string
  name: string
  description: string
  price: string
  currency: string
  billingInterval: string
  discountType: PackageDiscountType
  discount: string
  maxProjects: string
  maxUsers: string
  additionalUserPrice: string
  features: string[]
  customFeatures: string
  isActive: boolean
  isDefault: boolean
}

const emptyForm: PackageForm = {
  code: '',
  name: '',
  description: '',
  price: '0',
  currency: 'THB',
  billingInterval: 'MONTHLY',
  discountType: '',
  discount: '0',
  maxProjects: '1',
  maxUsers: '5',
  additionalUserPrice: '0',
  features: [],
  customFeatures: '',
  isActive: true,
  isDefault: false,
}

const knownFeatures = Object.values(FEATURES)

function moneyFromCents(value: number) {
  return (value / 100).toString()
}

function centsFromMoney(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0
}

function discountFromPackage(item: SubscriptionPackage): string {
  if (!item.discountType || item.discountValue <= 0) {
    return '0'
  }

  if (item.discountType === 'FIXED') {
    return moneyFromCents(item.discountValue)
  }

  return String(item.discountValue)
}

function formatDiscountLabel(item: SubscriptionPackage, noDiscountLabel: string): string {
  if (!item.discountType || item.discountValue <= 0) {
    return noDiscountLabel
  }

  if (item.discountType === 'PERCENT') {
    return `${item.discountValue}%`
  }

  return `${moneyFromCents(item.discountValue)} ${item.currency}`
}

function formFromPackage(item: SubscriptionPackage): PackageForm {
  const knownFeatureIds = new Set<string>(knownFeatures.map((feature) => feature.id))
  const customFeatures = item.features.filter((feature) => !knownFeatureIds.has(feature)).join('\n')

  return {
    code: item.code,
    name: item.name,
    description: item.description ?? '',
    price: moneyFromCents(item.priceCents),
    currency: item.currency,
    billingInterval: item.billingInterval,
    discountType: item.discountType ?? '',
    discount: discountFromPackage(item),
    maxProjects: String(item.maxProjects),
    maxUsers: String(item.maxUsers),
    additionalUserPrice: moneyFromCents(item.additionalUserPriceCents),
    features: item.features.filter((feature) => knownFeatureIds.has(feature)),
    customFeatures,
    isActive: item.isActive,
    isDefault: item.isDefault,
  }
}

function packagePayload(form: PackageForm) {
  const customFeatures = form.customFeatures
    .split(/[\n,]/)
    .map((feature) => feature.trim())
    .filter(Boolean)

  return {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
    description: form.description.trim() || null,
    priceCents: centsFromMoney(form.price),
    currency: form.currency.trim().toUpperCase() || 'THB',
    billingInterval: form.billingInterval,
    discountType: form.discountType || null,
    discountValue: !form.discountType
      ? 0
      : form.discountType === 'FIXED'
        ? centsFromMoney(form.discount)
        : Math.min(100, Math.max(0, Number.parseInt(form.discount, 10) || 0)),
    maxProjects: Math.max(0, Number.parseInt(form.maxProjects, 10) || 0),
    maxUsers: Math.max(0, Number.parseInt(form.maxUsers, 10) || 0),
    additionalUserPriceCents: centsFromMoney(form.additionalUserPrice),
    features: Array.from(new Set([...form.features, ...customFeatures])),
    isActive: form.isActive,
    isDefault: form.isDefault,
  }
}

export default function AdminPackagesPage() {
  const { t } = useTranslation()
  const { get, post, patch, delete: deletePackage, isLoading, error } = useApi()
  const [packages, setPackages] = useState<SubscriptionPackage[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState<PackageForm>(emptyForm)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedPackage = packages.find((item) => item.id === selectedId) ?? null
  const enabledFeatureCount = useMemo(
    () => Array.from(new Set([...form.features, ...form.customFeatures.split(/[\n,]/).map((item) => item.trim()).filter(Boolean)])).length,
    [form.customFeatures, form.features],
  )

  const fetchPackages = useCallback(async () => {
    const data = await get<SubscriptionPackage[]>('/admin/packages')
    if (Array.isArray(data)) {
      setPackages(data)
      setSelectedId((current) => current ?? data[0]?.id ?? null)
      if (!selectedId && data[0]) {
        setForm(formFromPackage(data[0]))
      }
    }
  }, [get, selectedId])

  useEffect(() => {
    fetchPackages()
  }, [fetchPackages])

  const selectPackage = (item: SubscriptionPackage) => {
    setSelectedId(item.id)
    setForm(formFromPackage(item))
    setNotice(null)
  }

  const createNew = () => {
    setSelectedId(null)
    setForm(emptyForm)
    setNotice(null)
  }

  const savePackage = async () => {
    setNotice(null)
    const payload = packagePayload(form)
    const saved = selectedPackage
      ? await patch<SubscriptionPackage>(`/admin/packages/${selectedPackage.id}`, payload)
      : await post<SubscriptionPackage>('/admin/packages', payload)

    if (!saved) {
      return
    }

    setPackages((items) => {
      const exists = items.some((item) => item.id === saved.id)
      const next = exists ? items.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...items]
      return saved.isDefault ? next.map((item) => ({ ...item, isDefault: item.id === saved.id })) : next
    })
    setSelectedId(saved.id)
    setForm(formFromPackage(saved))
    setNotice(t('adminPackages.saved'))
  }

  const removePackage = async () => {
    if (!selectedPackage || !window.confirm(t('adminPackages.confirmDelete', { name: selectedPackage.name }))) {
      return
    }

    setNotice(null)
    const deleted = await deletePackage<{ id: string; deleted: boolean }>(`/admin/packages/${selectedPackage.id}`)
    if (!deleted?.deleted) {
      return
    }

    setPackages((items) => {
      const next = items.filter((item) => item.id !== selectedPackage.id)
      const nextSelected = next[0] ?? null
      setSelectedId(nextSelected?.id ?? null)
      setForm(nextSelected ? formFromPackage(nextSelected) : emptyForm)
      return next
    })
    setNotice(t('adminPackages.deleted'))
  }

  const toggleFeature = (featureId: string) => {
    setForm((current) => ({
      ...current,
      features: current.features.includes(featureId)
        ? current.features.filter((item) => item !== featureId)
        : [...current.features, featureId],
    }))
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-300">
              {t('adminPackages.platformConsole')}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{t('adminPackages.title')}</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-slate-400">
              {t('adminPackages.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={createNew}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            {t('adminPackages.newPackage')}
          </button>
        </div>

        {(notice || error) && (
          <div className={`mb-4 rounded-md px-3 py-2 text-sm ${
            error
              ? 'border border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
          }`}>
            {error?.message || notice}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">{t('adminPackages.packages')}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-slate-700">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-slate-300">{t('adminPackages.packageColumn')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">{t('adminPackages.price')}</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-slate-300">{t('adminPackages.discount')}</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-slate-300">{t('adminPackages.projects')}</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-slate-300">{t('adminPackages.users')}</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-slate-300">{t('adminPackages.features')}</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-slate-300">{t('adminPackages.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {packages.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => selectPackage(item)}
                      className={`cursor-pointer ${selectedId === item.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-slate-800/60'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white">{item.name}</p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">{item.code}</p>
                          </div>
                          {item.isDefault && (
                            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
                              {t('adminPackages.default')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-slate-300">
                        {moneyFromCents(item.priceCents)} {item.currency}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-slate-300">
                        {formatDiscountLabel(item, t('adminPackages.noDiscount'))}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-slate-300">{item.maxProjects}</td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-slate-300">{item.maxUsers}</td>
                      <td className="px-4 py-3 text-center text-gray-700 dark:text-slate-300">{item.features.length}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          item.isActive
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                            : 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {item.isActive ? t('adminPackages.active') : t('adminPackages.inactive')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!packages.length && (
              <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                {isLoading ? t('adminPackages.loading') : t('adminPackages.empty')}
              </p>
            )}
          </section>

          <aside className="rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-700">
              <h2 className="font-semibold text-gray-900 dark:text-white">
                {selectedPackage ? t('adminPackages.editPackage') : t('adminPackages.newPackage')}
              </h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                {t('adminPackages.enabledFeatures', { count: enabledFeatureCount })}
              </p>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.code')}
                  <input
                    value={form.code}
                    onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    placeholder="PRO"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.name')}
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    placeholder="Pro"
                  />
                </label>
              </div>

              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                {t('adminPackages.descriptionField')}
                <textarea
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.price')}
                  <input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.currency')}
                  <input
                    value={form.currency}
                    onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.interval')}
                  <select
                    value={form.billingInterval}
                    onChange={(event) => setForm((current) => ({ ...current, billingInterval: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="MONTHLY">{t('adminPackages.intervals.MONTHLY')}</option>
                    <option value="YEARLY">{t('adminPackages.intervals.YEARLY')}</option>
                    <option value="ONE_TIME">{t('adminPackages.intervals.ONE_TIME')}</option>
                    <option value="CUSTOM">{t('adminPackages.intervals.CUSTOM')}</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.discountType')}
                  <select
                    value={form.discountType}
                    onChange={(event) => {
                      const discountType = event.target.value as PackageDiscountType
                      setForm((current) => ({
                        ...current,
                        discountType,
                        discount: discountType ? current.discount : '0',
                      }))
                    }}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">{t('adminPackages.discountNone')}</option>
                    <option value="FIXED">{t('adminPackages.discountFixed')}</option>
                    <option value="PERCENT">{t('adminPackages.discountPercent')}</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.discountValue')}
                  <input
                    type="number"
                    min="0"
                    max={form.discountType === 'PERCENT' ? 100 : undefined}
                    step={form.discountType === 'PERCENT' ? 1 : '0.01'}
                    value={form.discount}
                    disabled={!form.discountType}
                    onChange={(event) => setForm((current) => ({ ...current, discount: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                    placeholder={
                      form.discountType === 'PERCENT'
                        ? t('adminPackages.discountPercentHint')
                        : t('adminPackages.discountFixedHint')
                    }
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.maxProjects')}
                  <input
                    type="number"
                    min="0"
                    value={form.maxProjects}
                    onChange={(event) => setForm((current) => ({ ...current, maxProjects: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.includedUsers')}
                  <input
                    type="number"
                    min="0"
                    value={form.maxUsers}
                    onChange={(event) => setForm((current) => ({ ...current, maxUsers: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
                <label className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('adminPackages.additionalUser')}
                  <input
                    type="number"
                    min="0"
                    value={form.additionalUserPrice}
                    onChange={(event) => setForm((current) => ({ ...current, additionalUserPrice: event.target.value }))}
                    className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </label>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">{t('adminPackages.featureAccess')}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {knownFeatures.map((feature) => {
                    const checked = form.features.includes(feature.id)
                    return (
                      <button
                        key={feature.id}
                        type="button"
                        onClick={() => toggleFeature(feature.id)}
                        className={`flex min-h-[3rem] items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                          checked
                            ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-200'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
                          checked ? 'border-blue-500 bg-blue-600 text-white' : 'border-gray-300 dark:border-slate-600'
                        }`}>
                          {checked && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold">{feature.name}</span>
                          <span className="block truncate text-xs opacity-75">{feature.id}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                {t('adminPackages.customFeatures')}
                <textarea
                  value={form.customFeatures}
                  onChange={(event) => setForm((current) => ({ ...current, customFeatures: event.target.value }))}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  placeholder="CUSTOM_REPORTS"
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {t('adminPackages.activeLabel')}
                </label>
                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.isDefault}
                    onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {t('adminPackages.defaultLabel')}
                </label>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 dark:border-slate-700">
              <button
                type="button"
                onClick={removePackage}
                disabled={!selectedPackage || selectedPackage.isDefault}
                className="inline-flex items-center gap-2 rounded-md border border-red-300 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/20"
              >
                <Trash2 className="h-4 w-4" />
                {t('adminPackages.delete')}
              </button>
              <button
                type="button"
                onClick={savePackage}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Save className="h-4 w-4" />
                {t('adminPackages.savePackage')}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  )
}
