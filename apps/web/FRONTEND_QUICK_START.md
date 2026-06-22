# Frontend Modules - Quick Reference

## Feature Modules Quick Start

### 1. **Continuity Dashboard**
Shows project health, overdue items, and action item progress.

**Import:**
```typescript
import { ContinuityDashboard } from '@/components/features/continuity'
```

**Usage:**
```tsx
<ContinuityDashboard projectId={projectId} />
```

**Features:**
- Summary tab with risk levels
- By Owner tab (expandable owner grouping)
- By Project tab (projects with overdue items)
- Missing Info tab (items needing owner/dueDate)

**Required Plan:** `CONTINUITY_SUMMARY` (FREE+) or `CONTINUITY_FULL` (STARTER+)

---

### 2. **Reminder Operations**
Inspect reminder digests and escalation metrics.

**Import:**
```typescript
import { ReminderOperations } from '@/components/features/reminders'
```

**Usage:**
```tsx
<ReminderOperations projectId={projectId} />
```

**Features:**
- List of digests with escalation rates
- Date range filtering
- Digest detail view with stats
- Overdue breakdown by owner

**Required Plan:** `REMINDERS_ESCALATION` (PRO+)

---

### 3. **Ask-AI Trace Panel**
Inspect AI run logs with retrieval evidence and debugging info.

**Import:**
```typescript
import { AskAiTracePanel } from '@/components/features/aiTrace'
```

**Usage:**
```tsx
<AskAiTracePanel projectId={projectId} meetingId={meetingId} />
```

**Features:**
- Filter by operation (Minute Extraction, Retrieval Query, Ask-AI Answer, Reminder Run)
- Filter by status (Success, Failed)
- View retrieved documents
- View trace information as formatted JSON
- Display error messages for failed runs

**Required Plan:** `AI_TRACE_PANEL` (PRO+)

---

## Feature Flags

### Get Access Information

```typescript
import { useFeatureFlagStore } from '@/stores/featureFlagStore'

export function MyComponent() {
  const { canAccessFeature, getEnabledFeatures, plan } = useFeatureFlagStore()
  
  // Check single feature
  if (!canAccessFeature('CONTINUITY_FULL')) {
    return <UpgradePrompt plan="STARTER" />
  }
  
  // Get all enabled features
  const features = getEnabledFeatures()
  
  // Get current plan
  console.log(plan) // 'FREE' | 'STARTER' | 'PRO' | 'ENTERPRISE'
  
  return <div>Features available</div>
}
```

### Set User Plan

```typescript
import { useFeatureFlagStore } from '@/stores/featureFlagStore'

export function App() {
  const setPlan = useFeatureFlagStore(s => s.setPlan)
  
  useEffect(() => {
    // TODO: Fetch from API
    const userPlan = await get('/users/me')
    setPlan(userPlan.billingPlan)
  }, [])
  
  return <Routes>...</Routes>
}
```

### Available Features

**FREE Plan:**
- `AI_CHAT_BASIC` - Basic text prompt generation
- `CONTINUITY_SUMMARY` - Basic project metrics

**STARTER Plan:** ↑ +
- `AI_CHAT_ADVANCED` - Audio recording, speaker grouping
- `CONTINUITY_FULL` - Full overdue tracking, audit
- `REMINDERS_BASIC` - Standard reminders

**PRO Plan:** ↑ +
- `AI_TRACE_PANEL` - Citations and evidence
- `REMINDERS_ESCALATION` - Escalation rules and digests
- `OBSERVABILITY_BASIC` - Basic AI run logs

**ENTERPRISE Plan:** ↑ +
- `OBSERVABILITY_FULL` - Advanced diagnostics
- `CUSTOM_WORKFLOWS` - Automation workflows

---

## Custom Hooks

### `useContinuity()`

```typescript
const {
  summary,              // ProjectContinuitySummary | null
  overdueByOwner,       // OverdueByOwner[]
  overdueByProject,     // OverdueByProject[]
  missingOwnerItems,    // MissingOwnerItem[]
  recentMeetings,       // RecentApprovedMeeting[]
  memorySnapshot,       // ProjectMemorySnapshot | null
  isLoading,            // boolean
  error,                // ApiError | null
  
  // Fetch functions
  fetchSummary(projectId),
  fetchOverdueByOwner(projectId),
  fetchOverdueByProject(),
  fetchMissingOwnerItems(projectId),
  fetchRecentMeetings(projectId, days),
  fetchMemorySnapshot(projectId),
} = useContinuity()
```

### `useReminders()`

```typescript
const {
  digests,              // ReminderDigest[]
  currentDigest,        // ReminderDigestDetail | null
  isLoading,            // boolean
  error,                // ApiError | null
  
  // Fetch functions
  fetchDigests(projectId, limit),
  fetchDigestDetail(digestId),
  fetchDigestsByDateRange(startDate, endDate, projectId),
} = useReminders()
```

### `useAiRunLogs()`

```typescript
const {
  logs,                 // AiRunLog[]
  currentLog,           // AiRunLog | null
  isLoading,            // boolean
  error,                // ApiError | null
  
  // Fetch functions
  fetchLogs({
    operation,          // 'MINUTE_EXTRACTION' | 'RETRIEVAL_QUERY' | 'ASK_AI_ANSWER' | 'REMINDER_RUN'
    status,             // 'SUCCESS' | 'FAILED'
    projectId,
    meetingId,
    limit,              // default 50
    offset,
  }),
  fetchLogDetail(logId),
  fetchLogsByOperation(operation, limit),
} = useAiRunLogs()
```

---

## Translations

All components use i18n. Add translations in `src/i18n/`:

```json
{
  "continuity": {
    "title": "Project Continuity Dashboard",
    "tabs": {
      "summary": "Summary",
      "byOwner": "By Owner"
    }
  },
  "reminders": {
    "title": "Reminder Operations"
  },
  "aiTrace": {
    "title": "Ask-AI Trace Panel"
  }
}
```

---

## Styling

All components use Tailwind CSS with dark mode support:

```tsx
<div className="bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
  <h1 className="text-2xl font-bold">Title</h1>
  <p className="text-gray-600 dark:text-slate-400">Description</p>
</div>
```

---

## Routes

**Frontend Pages:**
- `/continuity` - Project continuity dashboard
- `/continuity/:projectId` - Project-specific continuity
- `/reminders` - Reminder digest operations
- `/reminders/:projectId` - Project-specific reminders
- `/ai-trace` - AI run log inspection
- `/ai-trace/:projectId` - Project-specific traces
- `/ai-trace/:projectId/:meetingId` - Meeting-specific traces

**Sidebar Navigation:**
Add items in `src/config/navigation.ts`

```typescript
{
  id: 'continuity',
  to: '/continuity',
  labelKey: 'continuity.title',
  icon: 'continuity',
}
```

---

## Error Handling

All hooks include error state:

```typescript
const { error, isLoading } = useContinuity()

if (error) {
  return <div>Error: {error.message}</div>
}

if (isLoading) {
  return <Spinner />
}

return <ContinuityDashboard />
```

---

## Common Patterns

### Conditional Rendering by Plan

```tsx
function Dashboard() {
  const can = useFeatureFlagStore(s => s.canAccessFeature)
  
  return (
    <div>
      {can('CONTINUITY_FULL') && <ContinuityDashboard />}
      {can('REMINDERS_ESCALATION') && <ReminderOperations />}
      {can('AI_TRACE_PANEL') && <AskAiTracePanel />}
      
      {!can('CONTINUITY_FULL') && (
        <UpgradePrompt feature="Continuity Dashboard" plan="STARTER" />
      )}
    </div>
  )
}
```

### Tab Navigation with Feature Gating

```tsx
const [tab, setTab] = useState('summary')

const tabs = [
  { id: 'summary', label: t('continuity.tabs.summary'), feature: 'CONTINUITY_SUMMARY' },
  { id: 'byOwner', label: t('continuity.tabs.byOwner'), feature: 'CONTINUITY_FULL' },
]

const availableTabs = tabs.filter(t => can(t.feature))

return (
  <>
    <div className="flex gap-2 border-b">
      {availableTabs.map(t => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={tab === t.id ? 'active' : ''}
        >
          {t.label}
        </button>
      ))}
    </div>
    
    {/* Render active tab */}
  </>
)
```

---

## Performance Tips

1. **Memoize Callbacks**
   ```typescript
   const handleSelect = useCallback((id) => {
     setSelectedId(id)
   }, [])
   ```

2. **Use useMemo for Sorted/Filtered Data**
   ```typescript
   const sorted = useMemo(() => 
     [...items].sort((a, b) => b.count - a.count),
     [items]
   )
   ```

3. **Virtualize Long Lists**
   ```typescript
   <div className="max-h-96 overflow-y-auto">
     {items.map(item => <Item key={item.id} {...item} />)}
   </div>
   ```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Feature not showing | Check `useFeatureFlagStore().plan` is set correctly |
| Data not loading | Verify API endpoints, check network tab for errors |
| Styling broken | Clear cache, rebuild vite, check Tailwind paths |
| i18n keys missing | Add keys to both `en.json` and `th.json` |
| Dark mode not working | Ensure `dark` class on `<html>` element |

---

## Contact

For issues, refer to `FRONTEND_MODULES_GUIDE.md` for comprehensive documentation.
