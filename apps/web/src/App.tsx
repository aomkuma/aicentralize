import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useFeatureFlagStore } from './stores/featureFlagStore'
import LoginPage from './pages/LoginPage'
import TenantSetupPage from './pages/TenantSetupPage'
import DashboardPage from './pages/DashboardPage'
import ContinuityPage from './pages/ContinuityPage'
import RemindersPage from './pages/RemindersPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectKnowledgePage from './pages/ProjectKnowledgePage'
import ProjectGeneralNotesPage from './pages/ProjectGeneralNotesPage'
import AiTracePage from './pages/AiTracePage'
import MeetingStudioPage from './pages/MeetingStudioPage'
import MeetingHistoryPage from './pages/MeetingHistoryPage'
import ActionItemRedirectPage from './pages/ActionItemRedirectPage'
import SystemSettingsPage from './pages/SystemSettingsPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import ProfilePage from './pages/ProfilePage'
import AdminOrganizationsPage from './pages/AdminOrganizationsPage'
import AdminPlatformUsersPage from './pages/AdminPlatformUsersPage'
import FeelingLogsPage from './pages/FeelingLogsPage'
import AcceptInvitePage from './pages/AcceptInvitePage'

// Load auth state immediately before rendering
useAuthStore.getState().loadFromLocalStorage()

function isPlatformAdmin(user: ReturnType<typeof useAuthStore.getState>['user']) {
  return user?.systemRole === 'SUPER_ADMIN' || user?.systemRole === 'MODERATOR'
}

function SetupRoute() {
  const user = useAuthStore((state) => state.user)

  if (user?.systemRole !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  return <TenantSetupPage />
}

function SuperAdminRoute({ children }: { children: JSX.Element }) {
  const user = useAuthStore((state) => state.user)

  if (user?.systemRole !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function AdminManagementRoute({ children }: { children: JSX.Element }) {
  const user = useAuthStore((state) => state.user)

  if (!isPlatformAdmin(user)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function WorkflowRoute({ children }: { children: JSX.Element }) {
  const user = useAuthStore((state) => state.user)

  if (isPlatformAdmin(user)) {
    return <Navigate to="/admin/organizations" replace />
  }

  return children
}

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const setPlan = useFeatureFlagStore((state) => state.setPlan)
  const [prevAuth, setPrevAuth] = useState(isAuthenticated)

  // Load token from localStorage on mount
  useEffect(() => {
    useAuthStore.getState().loadFromLocalStorage()
  }, [])

  // Initialize feature flags (TODO: fetch from user profile API)
  useEffect(() => {
    if (isAuthenticated) {
      // For now, set to PRO for development
      // In production, fetch from /users/me or similar endpoint
      setPlan('PRO')
    }
  }, [isAuthenticated, setPlan])

  useEffect(() => {
    console.log('[AppContent] isAuthenticated:', isAuthenticated)
  }, [isAuthenticated, prevAuth])

  // Handle navigation when auth state changes
  useEffect(() => {
    if (!prevAuth && isAuthenticated && (location.pathname === '/auth/login' || location.pathname === '/')) {
      const target = isPlatformAdmin(user)
        ? '/admin/organizations'
        : '/dashboard'
      console.log('[AppContent] Navigating to', target)
      navigate(target)
    }
    setPrevAuth(isAuthenticated)
  }, [isAuthenticated, prevAuth, navigate, location.pathname, user?.role, user?.systemRole])

  return (
    <Routes>
      {!isAuthenticated ? (
        <>
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="*" element={<Navigate to="/auth/login" replace />} />
        </>
      ) : user?.mustChangePassword && location.pathname !== '/change-password' ? (
        <>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="*" element={<Navigate to="/change-password" replace />} />
        </>
      ) : (
        <>
          <Route path="/change-password" element={<ChangePasswordPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/setup" element={<SetupRoute />} />
          <Route path="/admin/organizations" element={<AdminManagementRoute><AdminOrganizationsPage /></AdminManagementRoute>} />
          <Route path="/admin/platform-users" element={<SuperAdminRoute><AdminPlatformUsersPage /></SuperAdminRoute>} />
          <Route path="/dashboard" element={<WorkflowRoute><DashboardPage /></WorkflowRoute>} />
          <Route path="/continuity" element={<WorkflowRoute><ContinuityPage /></WorkflowRoute>} />
          <Route path="/continuity/:projectId" element={<WorkflowRoute><ContinuityPage /></WorkflowRoute>} />
          <Route path="/action-items/:actionItemId" element={<WorkflowRoute><ActionItemRedirectPage /></WorkflowRoute>} />
          <Route path="/reminders" element={<WorkflowRoute><RemindersPage /></WorkflowRoute>} />
          <Route path="/meetings/history" element={<WorkflowRoute><MeetingHistoryPage /></WorkflowRoute>} />
          <Route path="/meetings/history/:meetingId" element={<WorkflowRoute><MeetingHistoryPage /></WorkflowRoute>} />
          <Route path="/meetings" element={<WorkflowRoute><MeetingStudioPage /></WorkflowRoute>} />
          <Route path="/meetings/:projectId" element={<WorkflowRoute><MeetingStudioPage /></WorkflowRoute>} />
          <Route
            path="/projects"
            element={<WorkflowRoute><ProjectsPage /></WorkflowRoute>}
          />
          <Route path="/projects/:projectId/knowledge" element={<WorkflowRoute><ProjectKnowledgePage /></WorkflowRoute>} />
          <Route path="/projects/:projectId/notes" element={<WorkflowRoute><ProjectGeneralNotesPage /></WorkflowRoute>} />
          <Route path="/general-notes" element={<WorkflowRoute><ProjectGeneralNotesPage /></WorkflowRoute>} />
          <Route path="/feeling-logs" element={<WorkflowRoute><FeelingLogsPage /></WorkflowRoute>} />
          <Route path="/reminders/:projectId" element={<WorkflowRoute><RemindersPage /></WorkflowRoute>} />
          <Route path="/ai-trace" element={<WorkflowRoute><AiTracePage /></WorkflowRoute>} />
          <Route path="/ai-trace/:projectId" element={<WorkflowRoute><AiTracePage /></WorkflowRoute>} />
          <Route path="/ai-trace/:projectId/:meetingId" element={<WorkflowRoute><AiTracePage /></WorkflowRoute>} />
          <Route path="/settings" element={<SuperAdminRoute><SystemSettingsPage /></SuperAdminRoute>} />
          <Route path="/" element={<Navigate to={isPlatformAdmin(user) ? '/admin/organizations' : '/dashboard'} replace />} />
        </>
      )}
    </Routes>
  )
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

export default App
