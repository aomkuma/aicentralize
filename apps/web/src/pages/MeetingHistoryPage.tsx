import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import { useApi } from '../hooks/useApi'

type MinuteEntry = {
  id?: string
  section: string
  content: string
}

type MeetingListItem = {
  id: string
  projectId: string
  title: string
  summary: string
  transcript?: string | null
  sessionAt: string
  updatedAt: string
  project?: {
    id: string
    code: string
    name: string
  }
  minutes: MinuteEntry[]
  actionItems?: Array<{ id: string }>
}

type MeetingDetail = MeetingListItem & {
  createdAt: string
  createdBy?: {
    id: string
    name: string
    email: string
  }
}

type MeetingForm = {
  title: string
  sessionAt: string
  summary: string
  transcript: string
  minutes: MinuteEntry[]
}

function toDatetimeLocal(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function toIsoFromLocal(value: string) {
  const date = new Date(value)
  return date.toISOString()
}

function makeForm(meeting: MeetingDetail): MeetingForm {
  return {
    title: meeting.title,
    sessionAt: toDatetimeLocal(meeting.sessionAt),
    summary: meeting.summary,
    transcript: meeting.transcript ?? '',
    minutes: meeting.minutes?.length
      ? meeting.minutes.map((minute) => ({
          id: minute.id,
          section: minute.section,
          content: minute.content,
        }))
      : [{ section: 'Executive summary', content: meeting.summary }],
  }
}

export default function MeetingHistoryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { meetingId } = useParams<{ meetingId?: string }>()
  const { get, patch, isLoading, error } = useApi()
  const [meetings, setMeetings] = useState<MeetingListItem[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<MeetingDetail | null>(null)
  const [form, setForm] = useState<MeetingForm | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')

  const selectedId = meetingId || meetings[0]?.id

  useEffect(() => {
    let mounted = true

    async function loadMeetings() {
      const data = await get<MeetingListItem[]>('/meetings')
      if (!mounted || !data) return

      setMeetings(data)
      if (!meetingId && data[0]?.id) {
        navigate(`/meetings/history/${data[0].id}`, { replace: true })
      }
    }

    loadMeetings()

    return () => {
      mounted = false
    }
  }, [get, meetingId, navigate])

  useEffect(() => {
    if (!selectedId) {
      setSelectedMeeting(null)
      setForm(null)
      return
    }

    let mounted = true

    async function loadMeetingDetail() {
      const data = await get<MeetingDetail>(`/meetings/${selectedId}`)
      if (!mounted || !data) return

      setSelectedMeeting(data)
      setForm(makeForm(data))
      setIsEditing(false)
      setStatus('')
    }

    loadMeetingDetail()

    return () => {
      mounted = false
    }
  }, [get, selectedId])

  const filteredMeetings = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return meetings

    return meetings.filter((meeting) => {
      return [
        meeting.title,
        meeting.summary,
        meeting.project?.name,
        meeting.project?.code,
      ].some((value) => value?.toLowerCase().includes(needle))
    })
  }, [meetings, query])

  const updateMinute = (index: number, key: keyof MinuteEntry, value: string) => {
    setForm((current) => {
      if (!current) return current
      const minutes = current.minutes.map((minute, itemIndex) =>
        itemIndex === index ? { ...minute, [key]: value } : minute
      )
      return { ...current, minutes }
    })
  }

  const addMinute = () => {
    setForm((current) => current
      ? { ...current, minutes: [...current.minutes, { section: '', content: '' }] }
      : current
    )
  }

  const removeMinute = (index: number) => {
    setForm((current) => {
      if (!current) return current
      const minutes = current.minutes.filter((_, itemIndex) => itemIndex !== index)
      return {
        ...current,
        minutes: minutes.length ? minutes : [{ section: '', content: '' }],
      }
    })
  }

  const saveMeeting = async () => {
    if (!selectedMeeting || !form) return

    const cleanedMinutes = form.minutes
      .map((minute) => ({
        section: minute.section.trim(),
        content: minute.content.trim(),
      }))
      .filter((minute) => minute.section && minute.content)

    if (!form.title.trim() || !form.sessionAt || !form.summary.trim() || cleanedMinutes.length === 0) {
      setStatus(t('meetingHistory.validation', { defaultValue: 'Please complete the title, date, summary, and at least one minute section.' }))
      return
    }

    setStatus(t('meetingHistory.saving', { defaultValue: 'Saving changes...' }))
    const updated = await patch<MeetingDetail>(`/meetings/${selectedMeeting.id}`, {
      title: form.title.trim(),
      sessionAt: toIsoFromLocal(form.sessionAt),
      summary: form.summary.trim(),
      transcript: form.transcript,
      minutes: cleanedMinutes,
    })

    if (!updated) {
      setStatus(t('meetingHistory.saveFailed', { defaultValue: 'Unable to save changes.' }))
      return
    }

    setSelectedMeeting(updated)
    setForm(makeForm(updated))
    setMeetings((current) => current.map((meeting) => (
      meeting.id === updated.id ? { ...meeting, ...updated } : meeting
    )))
    setIsEditing(false)
    setStatus(t('meetingHistory.saved', { defaultValue: 'Minutes updated successfully.' }))
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
              {t('meetingHistory.eyebrow', { defaultValue: 'Minutes archive' })}
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950 dark:text-white">
              {t('meetingHistory.title', { defaultValue: 'Meeting Minutes History' })}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
              {t('meetingHistory.description', { defaultValue: 'Review saved meeting minutes and update the stored sections when follow-up corrections are needed.' })}
            </p>
          </div>
          <Link
            to="/meetings"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            {t('meetingHistory.newMeeting', { defaultValue: 'New meeting' })}
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              {t('meetingHistory.search', { defaultValue: 'Search' })}
            </label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-900/40"
              placeholder={t('meetingHistory.searchPlaceholder', { defaultValue: 'Title, project, or summary' })}
            />

            <div className="mt-4 max-h-[68vh] space-y-2 overflow-y-auto pr-1">
              {filteredMeetings.map((meeting) => {
                const active = meeting.id === selectedId
                return (
                  <button
                    key={meeting.id}
                    type="button"
                    onClick={() => navigate(`/meetings/history/${meeting.id}`)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      active
                        ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/40'
                        : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                          {meeting.title}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                          {meeting.project?.code ? `${meeting.project.code} - ` : ''}{meeting.project?.name}
                        </p>
                      </div>
                      <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {meeting.minutes?.length ?? 0}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      {new Date(meeting.sessionAt).toLocaleString()}
                    </p>
                  </button>
                )
              })}

              {!filteredMeetings.length && (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {isLoading
                    ? t('common.loading')
                    : t('meetingHistory.empty', { defaultValue: 'No saved meetings found.' })}
                </div>
              )}
            </div>
          </aside>

          <main className="min-h-[560px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
            {!selectedMeeting || !form ? (
              <div className="grid h-full min-h-[420px] place-items-center text-center text-sm text-slate-500 dark:text-slate-400">
                {isLoading
                  ? t('common.loading')
                  : t('meetingHistory.selectMeeting', { defaultValue: 'Select a meeting to view its minutes.' })}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-slate-700 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    {isEditing ? (
                      <input
                        value={form.title}
                        onChange={(event) => setForm({ ...form, title: event.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xl font-bold text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    ) : (
                      <h2 className="text-2xl font-bold text-slate-950 dark:text-white">
                        {selectedMeeting.title}
                      </h2>
                    )}
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      {selectedMeeting.project?.code ? `${selectedMeeting.project.code} - ` : ''}{selectedMeeting.project?.name}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setForm(makeForm(selectedMeeting))
                            setIsEditing(false)
                            setStatus('')
                          }}
                          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          {t('meetingHistory.cancel', { defaultValue: 'Cancel' })}
                        </button>
                        <button
                          type="button"
                          onClick={saveMeeting}
                          disabled={isLoading}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t('meetingHistory.save', { defaultValue: 'Save changes' })}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                      >
                        {t('meetingHistory.edit', { defaultValue: 'Edit minutes' })}
                      </button>
                    )}
                  </div>
                </div>

                {(status || error) && (
                  <div className={`rounded-lg border px-4 py-3 text-sm ${
                    error
                      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300'
                      : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300'
                  }`}>
                    {error?.message || status}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {t('meetingHistory.sessionAt', { defaultValue: 'Meeting date and time' })}
                    </span>
                    {isEditing ? (
                      <input
                        type="datetime-local"
                        value={form.sessionAt}
                        onChange={(event) => setForm({ ...form, sessionAt: event.target.value })}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    ) : (
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                        {new Date(selectedMeeting.sessionAt).toLocaleString()}
                      </p>
                    )}
                  </label>
                  <div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {t('meetingHistory.updatedAt', { defaultValue: 'Last updated' })}
                    </span>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                      {new Date(selectedMeeting.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                <section>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                    {t('meetingHistory.summary', { defaultValue: 'Executive summary' })}
                  </label>
                  {isEditing ? (
                    <textarea
                      value={form.summary}
                      onChange={(event) => setForm({ ...form, summary: event.target.value })}
                      rows={4}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                      {selectedMeeting.summary}
                    </p>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-950 dark:text-white">
                      {t('meetingHistory.minuteSections', { defaultValue: 'Minute sections' })}
                    </h3>
                    {isEditing && (
                      <button
                        type="button"
                        onClick={addMinute}
                        className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/30"
                      >
                        {t('meetingHistory.addSection', { defaultValue: 'Add section' })}
                      </button>
                    )}
                  </div>

                  {form.minutes.map((minute, index) => (
                    <div key={minute.id || index} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                      {isEditing ? (
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <input
                              value={minute.section}
                              onChange={(event) => updateMinute(index, 'section', event.target.value)}
                              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                              placeholder={t('meetingHistory.sectionPlaceholder', { defaultValue: 'Section title' })}
                            />
                            <button
                              type="button"
                              onClick={() => removeMinute(index)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 dark:border-red-900/70 dark:text-red-300 dark:hover:bg-red-950/30"
                            >
                              {t('meetingHistory.remove', { defaultValue: 'Remove' })}
                            </button>
                          </div>
                          <textarea
                            value={minute.content}
                            onChange={(event) => updateMinute(index, 'content', event.target.value)}
                            rows={5}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                            placeholder={t('meetingHistory.contentPlaceholder', { defaultValue: 'Minute content' })}
                          />
                        </div>
                      ) : (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-950 dark:text-white">
                            {minute.section}
                          </h4>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-300">
                            {minute.content}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </section>

                {(isEditing || selectedMeeting.transcript) && (
                  <section>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                      {t('meetingHistory.transcript', { defaultValue: 'Transcript' })}
                    </label>
                    {isEditing ? (
                      <textarea
                        value={form.transcript}
                        onChange={(event) => setForm({ ...form, transcript: event.target.value })}
                        rows={8}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    ) : (
                      <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                        {selectedMeeting.transcript}
                      </p>
                    )}
                  </section>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </Layout>
  )
}
