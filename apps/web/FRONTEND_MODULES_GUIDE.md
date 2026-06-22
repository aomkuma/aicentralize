# Frontend Feature Modules Implementation Guide

## Overview

This document describes the modular frontend implementation for three key features:
1. **Continuity Dashboard** - Project health monitoring with overdue tracking
2. **Reminder Operations** - Reminder digest inspection and escalation metrics
3. **Ask-AI Trace Panel** - AI run log inspection with retrieval evidence

All features are built with:
- ✅ Modular component architecture
- ✅ Feature flag/billing plan gating
- ✅ TypeScript type safety
- ✅ Reusable hooks for API calls
- ✅ Responsive design (Tailwind CSS)
- ✅ i18n support (English/Thai)
- ✅ Dark mode support

---

## Architecture

### Feature Flag System

**Location:** `src/types/features.ts` & `src/stores/featureFlagStore.ts`

Feature entitlements by plan:
```
FREE    -> AI_CHAT_BASIC, CONTINUITY_SUMMARY
STARTER -> ↑ + AI_CHAT_ADVANCED, CONTINUITY_FULL, REMINDERS_BASIC
PRO     -> ↑ + AI_TRACE_PANEL, REMINDERS_ESCALATION, OBSERVABILITY_BASIC
ENTERPRISE -> ↑ + OBSERVABILITY_FULL, CUSTOM_WORKFLOWS
```

**Usage in components:**
```typescript
const canAccessFeature = useFeatureFlagStore(state => state.canAccessFeature)

if (!canAccessFeature('CONTINUITY_FULL')) {
  return <UpgradePrompt />
}
```

### Module Structure

Each feature module is isolated under `src/components/features/`:

```
features/
├── continuity/                    # Continuity Dashboard
│   ├── ContinuityDashboard.tsx   # Main component with tabs
│   ├── ContinuitySummaryCard.tsx # Summary card display
│   ├── OverdueByOwner.tsx        # Expandable owner grouping
│   ├── OverdueItemsList.tsx      # Shared items list component
│   └── index.ts                  # Module exports
│
├── reminders/                     # Reminder Operations
│   ├── ReminderOperations.tsx    # Main split-view layout
│   ├── ReminderDigestCard.tsx    # Digest card in list
│   └── index.ts
│
└── aiTrace/                       # Ask-AI Trace Panel
    ├── AskAiTracePanel.tsx       # Main split-view layout
    ├── AiRunLogCard.tsx          # Log card in list
    ├── AiTraceDetail.tsx         # Detail panel with trace
    └── index.ts
```

### Custom Hooks

**Location:** `src/hooks/`

```typescript
// Continuity data fetching
useContinuity() -> {
  summary, overdueByOwner, overdueByProject, missingOwnerItems,
  recentMeetings, memorySnapshot,
  fetchSummary(), fetchOverdueByOwner(), ...
}

// Reminder digest fetching
useReminders() -> {
  digests, currentDigest,
  fetchDigests(), fetchDigestDetail(), fetchDigestsByDateRange()
}

// AI run log fetching
useAiRunLogs() -> {
  logs, currentLog,
  fetchLogs({ operation, status, projectId, ... }),
  fetchLogDetail(), fetchLogsByOperation()
}
```

### Type Definitions

**Location:** `src/types/index.ts`

- `ProjectContinuitySummary` - Project health metrics
- `OverdueItem`, `OverdueByOwner`, `OverdueByProject` - Overdue data
- `ReminderDigest`, `ReminderDigestDetail` - Reminder data
- `AiRunLog`, `AiRunLogWithContext` - AI run data

---

## Component Usage Examples

### Continuity Dashboard

```typescript
import { ContinuityDashboard } from '@/components/features/continuity'

export function ProjectPage() {
  const projectId = useParams().projectId
  
  return (
    <ContinuityDashboard projectId={projectId} />
  )
}
```

**Features:**
- Tabbed interface (Summary, By Owner, By Project, Missing Info)
- Risk level color coding (low/medium/high/critical)
- Feature-gated tabs based on plan
- Auto-fetches on projectId change

### Reminder Operations

```typescript
import { ReminderOperations } from '@/components/features/reminders'

export function RemindersPage() {
  return <ReminderOperations projectId={projectId} />
}
```

**Features:**
- Split-view (left: digest list, right: detail panel)
- Date range filtering
- Digest selection with active state
- Stats grid with escalation rates
- Overdue breakdown by owner

### Ask-AI Trace Panel

```typescript
import { AskAiTracePanel } from '@/components/features/aiTrace'

export function AiObservabilityPage() {
  return <AskAiTracePanel projectId={projectId} />
}
```

**Features:**
- Filter by operation type (Minute Extraction, Retrieval Query, Ask-AI Answer, Reminder Run)
- Filter by status (Success, Failed)
- Retrieved documents display
- Trace information as formatted JSON
- Error message display on failures

---

## Feature Flag Configuration

### For Development

Initialize in App or main layout:

```typescript
import { useFeatureFlagStore } from '@/stores/featureFlagStore'

export function App() {
  const setPlan = useFeatureFlagStore(state => state.setPlan)
  
  useEffect(() => {
    // TODO: Fetch user's plan from API
    setPlan('PRO')  // or 'FREE', 'STARTER', 'ENTERPRISE'
  }, [])
  
  return <Router>...</Router>
}
```

### For Production

Fetch plan from user profile:

```typescript
useEffect(() => {
  const fetchUserPlan = async () => {
    const user = await get('/users/me')
    setPlan(user.billingPlan)
  }
  fetchUserPlan()
}, [])
```

---

## Styling & Theming

All components use Tailwind CSS with:
- ✅ Dark mode support (`dark:` prefix)
- ✅ Responsive design (mobile-first)
- ✅ Glass-morphism cards
- ✅ Accessible color contrast
- ✅ Smooth transitions

Example color schemes:
- **Success**: `text-green-600 dark:text-green-400`
- **Warning**: `text-yellow-600 dark:text-yellow-400`
- **Error**: `text-red-600 dark:text-red-400`
- **Info**: `text-blue-600 dark:text-blue-400`

---

## i18n Support

Translations added to:
- `src/i18n/en.json` - English
- `src/i18n/th.json` - Thai

Key translation namespaces:
```
continuity.title
continuity.tabs.*
continuity.riskLevel.*
reminders.title
reminders.operations.*
aiTrace.title
```

Usage in components:
```typescript
const { t } = useTranslation()

<h2>{t('continuity.title')}</h2>
<span>{t(`aiTrace.operations.${operation.toLowerCase()}`)}</span>
```

---

## API Endpoints Required

### Continuity
- `GET /continuity/summary`
- `GET /continuity/overdue-by-owner`
- `GET /continuity/overdue-by-project`
- `GET /continuity/missing-owner-or-due-date`
- `GET /continuity/recent-approved-meetings`
- `GET /continuity/project-memory/:projectId`

### Reminders
- `GET /reminders/digests`
- `GET /reminders/digests/:digestId`
- `GET /reminders/digests/range`

### Observability
- `GET /observability/ai-runs`
- `GET /observability/ai-runs/:logId`

---

## State Management

### Zustand Stores

**Feature Flags** (`featureFlagStore`):
```typescript
interface FeatureFlagState {
  plan: BillingPlan
  enabledFeatures: Set<FeatureKey>
  setPlan(plan: BillingPlan): void
  isFeatureEnabled(feature: FeatureKey): boolean
  canAccessFeature(feature: FeatureKey): boolean
  getEnabledFeatures(): FeatureKey[]
  reset(): void
}
```

Persisted to localStorage with custom Set serialization.

### Local Component State

Each feature module manages its own local state:
- `selectedTabId` - Currently selected tab
- `selectedDigestId` - Currently inspected digest
- `filterOperation` - Log filter by operation
- `dateRange` - Date range for filtering

---

## Performance Considerations

1. **Lazy Fetching** - Data only fetched when needed (component mount)
2. **Memoization** - `useMemo` for filtered/sorted lists
3. **Virtual Scrolling** - `max-h-48 overflow-y-auto` for lists
4. **Debounced Filters** - Consider debouncing operation/status filters
5. **Pagination** - API supports limit/offset (future enhancement)

---

## Testing Considerations

### Unit Tests

Mock hooks and components:
```typescript
jest.mock('@/hooks/useContinuity', () => ({
  useContinuity: () => ({
    summary: mockSummary,
    isLoading: false,
    fetchSummary: jest.fn(),
  })
}))
```

### Integration Tests

Test full feature workflows:
1. Load digest list
2. Select digest
3. Verify detail panel updates
4. Apply filters
5. Verify list updates

### E2E Tests

Playwright scenarios:
1. Navigate to feature page
2. Check feature gate (upgr ade prompt if no access)
3. Interact with filters
4. Verify API calls with mock responses

---

## Future Enhancements

1. **Pagination** - Implement offset-based pagination for large lists
2. **Export** - Add CSV/PDF export for digests and logs
3. **Real-time Updates** - WebSocket integration for live digest updates
4. **Custom Dashboards** - Allow users to customize displayed metrics
5. **Advanced Filtering** - Multi-select filters, date range pickers
6. **Audit Logging** - Track user actions on features
7. **Performance Metrics** - Dashboard for operation latencies by time period
8. **Alerting** - Set thresholds for automated escalation

---

## Troubleshooting

### Feature not showing?
1. Check `useFeatureFlagStore` - is plan set correctly?
2. Check user's membership role - does it allow access?
3. Check console for API errors in network tab

### Data not loading?
1. Verify API endpoints are running
2. Check network tab for 401 (auth) or 404 (endpoint not found)
3. Verify JWT token is valid and present in Authorization header

### Styling issues?
1. Ensure Tailwind CSS build includes `src/components/**/*.tsx`
2. Clear browser cache and rebuild (vite)
3. Check dark mode class on HTML element

### i18n not working?
1. Verify translation key exists in `en.json` and `th.json`
2. Check `useTranslation()` is inside `<I18nextProvider>`
3. Reload page after language change

---

## Files Reference

```
✅ CREATED
src/
├── types/
│   ├── features.ts              # Feature flags & billing types
│   └── index.ts                 # Updated with API response types
├── stores/
│   └── featureFlagStore.ts      # Zustand feature flag store
├── hooks/
│   ├── useContinuity.ts         # Continuity API hook
│   ├── useReminders.ts          # Reminders API hook
│   └── useAiRunLogs.ts          # AI run logs API hook
├── components/features/
│   ├── index.ts                 # Feature module exports
│   ├── continuity/
│   │   ├── ContinuityDashboard.tsx
│   │   ├── ContinuitySummaryCard.tsx
│   │   ├── OverdueByOwner.tsx
│   │   ├── OverdueItemsList.tsx
│   │   └── index.ts
│   ├── reminders/
│   │   ├── ReminderOperations.tsx
│   │   ├── ReminderDigestCard.tsx
│   │   └── index.ts
│   └── aiTrace/
│       ├── AskAiTracePanel.tsx
│       ├── AiRunLogCard.tsx
│       ├── AiTraceDetail.tsx
│       └── index.ts
└── i18n/
    ├── en.json                  # Updated with feature strings
    └── th.json                  # Updated with feature strings
```
