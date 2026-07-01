import type { TenantMembership } from '../types'

type EditMemberDialogProps = {
  open: boolean
  member: TenantMembership | null
  canChangeRole: boolean
  title: string
  saveLabel: string
  cancelLabel: string
  nicknameLabel: string
  jobTitleLabel: string
  departmentLabel: string
  roleLabel: string
  nicknamePlaceholder: string
  jobTitlePlaceholder: string
  departmentPlaceholder: string
  roleOptions: Array<{ value: TenantMembership['role']; label: string }>
  nickname: string
  jobTitle: string
  department: string
  role: TenantMembership['role']
  onNicknameChange: (value: string) => void
  onJobTitleChange: (value: string) => void
  onDepartmentChange: (value: string) => void
  onRoleChange: (value: TenantMembership['role']) => void
  onSave: () => void
  onCancel: () => void
  isLoading?: boolean
  errorMessage?: string | null
}

export default function EditMemberDialog({
  open,
  member,
  canChangeRole,
  title,
  saveLabel,
  cancelLabel,
  nicknameLabel,
  jobTitleLabel,
  departmentLabel,
  roleLabel,
  nicknamePlaceholder,
  jobTitlePlaceholder,
  departmentPlaceholder,
  roleOptions,
  nickname,
  jobTitle,
  department,
  role,
  onNicknameChange,
  onJobTitleChange,
  onDepartmentChange,
  onRoleChange,
  onSave,
  onCancel,
  isLoading = false,
  errorMessage = null,
}: EditMemberDialogProps) {
  if (!open || !member) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-member-dialog-title"
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h3 id="edit-member-dialog-title" className="text-lg font-bold text-slate-950 dark:text-white">
          {title}
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {member.user?.name || member.user?.email || '-'}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{nicknameLabel}</span>
            <input
              value={nickname}
              onChange={(event) => onNicknameChange(event.target.value)}
              placeholder={nicknamePlaceholder}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{jobTitleLabel}</span>
            <input
              value={jobTitle}
              onChange={(event) => onJobTitleChange(event.target.value)}
              placeholder={jobTitlePlaceholder}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{departmentLabel}</span>
            <input
              value={department}
              onChange={(event) => onDepartmentChange(event.target.value)}
              placeholder={departmentPlaceholder}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          {canChangeRole && (
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{roleLabel}</span>
              <select
                value={role}
                onChange={(event) => onRoleChange(event.target.value as TenantMembership['role'])}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {errorMessage && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isLoading}
            className="rounded-md border border-blue-200 bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-900"
          >
            {isLoading ? `${saveLabel}...` : saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
