import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useFeatureFlagStore } from './stores/featureFlagStore'
import { getSetupOnboardingStatus } from './lib/setupOnboarding'
import LoginPage from './pages/LoginPage'
import TenantSetupPage from './pages/TenantSetupPage'
import DashboardPage from './pages/DashboardPage'
import ContinuityPage from './pages/ContinuityPage'
import RemindersPage from './pages/RemindersPage'
import ProjectsPage from './pages/ProjectsPage'
import AiTracePage from './pages/AiTracePage'
import SystemSettingsPage from './pages/SystemSettingsPage'

// Load auth state immediately before rendering
useAuthStore.getState().loadFromLocalStorage()

function SetupRoute() {
  const user = useAuthStore((state) => state.user)
  const userId = useAuthStore((state) => state.user?.id)
  const setupStatus = getSetupOnboardingStatus(userId)

  if (user?.systemRole !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  if (setupStatus === 'skipped' || setupStatus === 'completed') {
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

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
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
      console.log('[AppContent] Navigating to /dashboard')
      navigate('/dashboard')
    }
    setPrevAuth(isAuthenticated)
  }, [isAuthenticated, prevAuth, navigate, location.pathname])

  return (
    <Routes>
      {!isAuthenticated ? (
        <>
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="*" element={<Navigate to="/auth/login" replace />} />
        </>
      ) : (
        <>
          <Route path="/setup" element={<SetupRoute />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/continuity" element={<ContinuityPage />} />
          <Route path="/continuity/:projectId" element={<ContinuityPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route
            path="/projects"
            element={<ProjectsPage />}
          />
          <Route path="/reminders/:projectId" element={<RemindersPage />} />
          <Route path="/ai-trace" element={<AiTracePage />} />
          <Route path="/ai-trace/:projectId" element={<AiTracePage />} />
          <Route path="/ai-trace/:projectId/:meetingId" element={<AiTracePage />} />
          <Route path="/settings" element={<SuperAdminRoute><SystemSettingsPage /></SuperAdminRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
