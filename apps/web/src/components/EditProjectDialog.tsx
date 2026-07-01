type EditProjectDialogProps = {
  open: boolean
  projectName: string
  projectCode: string
  projectDescription: string
  title: string
  saveLabel: string
  cancelLabel: string
  codeLabel: string
  nameLabel: string
  descriptionLabel: string
  codePlaceholder: string
  namePlaceholder: string
  descriptionPlaceholder: string
  onProjectNameChange: (value: string) => void
  onProjectCodeChange: (value: string) => void
  onProjectDescriptionChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  isLoading?: boolean
  errorMessage?: string | null
  noticeMessage?: string | null
}

export default function EditProjectDialog({
  open,
  projectName,
  projectCode,
  projectDescription,
  title,
  saveLabel,
  cancelLabel,
  codeLabel,
  nameLabel,
  descriptionLabel,
  codePlaceholder,
  namePlaceholder,
  descriptionPlaceholder,
  onProjectNameChange,
  onProjectCodeChange,
  onProjectDescriptionChange,
  onSave,
  onCancel,
  isLoading = false,
  errorMessage = null,
  noticeMessage = null,
}: EditProjectDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-project-dialog-title"
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <h3 id="edit-project-dialog-title" className="text-lg font-bold text-slate-950 dark:text-white">
          {title}
        </h3>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{codeLabel}</span>
            <input
              value={projectCode}
              onChange={(event) => onProjectCodeChange(event.target.value)}
              placeholder={codePlaceholder}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{nameLabel}</span>
            <input
              value={projectName}
              onChange={(event) => onProjectNameChange(event.target.value)}
              placeholder={namePlaceholder}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{descriptionLabel}</span>
            <textarea
              value={projectDescription}
              onChange={(event) => onProjectDescriptionChange(event.target.value)}
              placeholder={descriptionPlaceholder}
              rows={3}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        </div>

        {noticeMessage && (
          <p className="mt-3 text-sm text-blue-700 dark:text-blue-300">{noticeMessage}</p>
        )}
        {errorMessage && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isLoading}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
