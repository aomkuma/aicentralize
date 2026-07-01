import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useFeatureFlagStore } from './stores/featureFlagStore'
import TenantSetupPage from './pages/TenantSetupPage'
import DashboardPage from './pages/DashboardPage'
import ContinuityPage from './pages/ContinuityPage'
import RemindersPage from './pages/RemindersPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectKnowledgePage from './pages/ProjectKnowledgePage'
import PersonalKnowledgePage from './pages/PersonalKnowledgePage'
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
import AdminPackagesPage from './pages/AdminPackagesPage'
import AdminBillingPage from './pages/AdminBillingPage'
import FeelingLogsPage from './pages/FeelingLogsPage'
import AcceptInvitePage from './pages/AcceptInvitePage'
import WelcomePage from './pages/WelcomePage'
import MyTasksPage from './pages/MyTasksPage'
import StarterTourPage from './pages/StarterTourPage'
import IndividualTourPage from './pages/IndividualTourPage'
import { canAccessFeelingLogs, canAccessMeetingStudio, isIndividualPackage, canAccessAiChatHistory } from './lib/packageAccess'
import FeatureRoute from './components/FeatureRoute'
import LoginPage from './pages/LoginPage'

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

function FeelingLogsRoute({ children }: { children: JSX.Element }) {
  const user = useAuthStore((state) => state.user)
  const packageCode = useFeatureFlagStore((state) => state.packageCode)

  if (isPlatformAdmin(user)) {
    return <Navigate to="/admin/organizations" replace />
  }

  if (!canAccessFeelingLogs(packageCode)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function MeetingStudioRoute({ children }: { children: JSX.Element }) {
  const user = useAuthStore((state) => state.user)
  const packageCode = useFeatureFlagStore((state) => state.packageCode)

  if (isPlatformAdmin(user)) {
    return <Navigate to="/admin/organizations" replace />
  }

  if (!canAccessMeetingStudio(packageCode)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function AiChatHistoryRoute({ children }: { children: JSX.Element }) {
  const user = useAuthStore((state) => state.user)
  const packageCode = useFeatureFlagStore((state) => state.packageCode)
  const canAccessFeature = useFeatureFlagStore((state) => state.canAccessFeature)

  if (isPlatformAdmin(user)) {
    return <Navigate to="/admin/organizations" replace />
  }

  if (!canAccessAiChatHistory(packageCode, canAccessFeature)) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

function KnowledgeRoute() {
  const packageCode = useFeatureFlagStore((state) => state.packageCode)

  if (isIndividualPackage(packageCode)) {
    return <PersonalKnowledgePage />
  }

  return <ProjectKnowledgePage />
}

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const user = useAuthStore((state) => state.user)
  const [prevAuth, setPrevAuth] = useState(isAuthenticated)

  // Load token from localStorage on mount
  useEffect(() => {
    useAuthStore.getState().loadFromLocalStorage()
  }, [])

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
          <Route path="/" element={<WelcomePage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
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
          <Route path="/admin/packages" element={<SuperAdminRoute><AdminPackagesPage /></SuperAdminRoute>} />
          <Route path="/admin/billing" element={<SuperAdminRoute><AdminBillingPage /></SuperAdminRoute>} />
          <Route path="/dashboard" element={<WorkflowRoute><FeatureRoute feature="AI_CHAT_BASIC"><DashboardPage /></FeatureRoute></WorkflowRoute>} />
          <Route path="/starter-tour" element={<WorkflowRoute><StarterTourPage /></WorkflowRoute>} />
          <Route path="/individual-tour" element={<WorkflowRoute><IndividualTourPage /></WorkflowRoute>} />
          <Route path="/my-tasks" element={<WorkflowRoute><MyTasksPage /></WorkflowRoute>} />
          <Route path="/continuity" element={<WorkflowRoute><FeatureRoute feature="CONTINUITY_SUMMARY"><ContinuityPage /></FeatureRoute></WorkflowRoute>} />
          <Route path="/continuity/:projectId" element={<WorkflowRoute><FeatureRoute feature="CONTINUITY_SUMMARY"><ContinuityPage /></FeatureRoute></WorkflowRoute>} />
          <Route path="/action-items/:actionItemId" element={<WorkflowRoute><ActionItemRedirectPage /></WorkflowRoute>} />
          <Route path="/reminders" element={<WorkflowRoute><FeatureRoute feature="REMINDERS_BASIC"><RemindersPage /></FeatureRoute></WorkflowRoute>} />
          <Route path="/meetings/history" element={<WorkflowRoute><MeetingStudioRoute><FeatureRoute feature="AI_CHAT_ADVANCED"><MeetingHistoryPage /></FeatureRoute></MeetingStudioRoute></WorkflowRoute>} />
          <Route path="/meetings/history/:meetingId" element={<WorkflowRoute><MeetingStudioRoute><FeatureRoute feature="AI_CHAT_ADVANCED"><MeetingHistoryPage /></FeatureRoute></MeetingStudioRoute></WorkflowRoute>} />
          <Route path="/meetings" element={<WorkflowRoute><MeetingStudioRoute><FeatureRoute feature="AI_CHAT_ADVANCED"><MeetingStudioPage /></FeatureRoute></MeetingStudioRoute></WorkflowRoute>} />
          <Route path="/meetings/:projectId" element={<WorkflowRoute><MeetingStudioRoute><FeatureRoute feature="AI_CHAT_ADVANCED"><MeetingStudioPage /></FeatureRoute></MeetingStudioRoute></WorkflowRoute>} />
          <Route
            path="/projects"
            element={<WorkflowRoute><ProjectsPage /></WorkflowRoute>}
          />
          <Route path="/projects/:projectId/knowledge" element={<WorkflowRoute><KnowledgeRoute /></WorkflowRoute>} />
          <Route path="/projects/:projectId/notes" element={<WorkflowRoute><ProjectGeneralNotesPage /></WorkflowRoute>} />
          <Route path="/general-notes" element={<WorkflowRoute><ProjectGeneralNotesPage /></WorkflowRoute>} />
          <Route path="/feeling-logs" element={<FeelingLogsRoute><FeelingLogsPage /></FeelingLogsRoute>} />
          <Route path="/reminders/:projectId" element={<WorkflowRoute><FeatureRoute feature="REMINDERS_BASIC"><RemindersPage /></FeatureRoute></WorkflowRoute>} />
          <Route path="/ai-trace" element={<WorkflowRoute><AiChatHistoryRoute><AiTracePage /></AiChatHistoryRoute></WorkflowRoute>} />
          <Route path="/ai-trace/:projectId" element={<WorkflowRoute><AiChatHistoryRoute><AiTracePage /></AiChatHistoryRoute></WorkflowRoute>} />
          <Route path="/ai-trace/:projectId/:meetingId" element={<WorkflowRoute><AiChatHistoryRoute><AiTracePage /></AiChatHistoryRoute></WorkflowRoute>} />
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
