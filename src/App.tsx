import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@/hooks/useApp';
import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider, ProtectedRoute } from '@/components/auth/AuthProvider';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { PasswordRecoveryPage } from '@/pages/PasswordRecoveryPage';
import { AppLayout } from '@/layouts/AppLayout';
import { LandingPage } from '@/pages/LandingPage';

const DashboardPage = lazy(() => import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const MyTasksPage = lazy(() => import('@/pages/MyTasksPage').then((m) => ({ default: m.MyTasksPage })));
const BoardsPage = lazy(() => import('@/pages/BoardsPage').then((m) => ({ default: m.BoardsPage })));
const BoardPage = lazy(() => import('@/pages/BoardPage').then((m) => ({ default: m.BoardPage })));
const AISummaryPage = lazy(() => import('@/pages/AISummaryPage').then((m) => ({ default: m.AISummaryPage })));
const DriftRadarPage = lazy(() => import('@/pages/DriftRadarPage').then((m) => ({ default: m.DriftRadarPage })));
const TeamPage = lazy(() => import('@/pages/TeamPage').then((m) => ({ default: m.TeamPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const WorkspaceOnboardingPage = lazy(() => import('@/pages/WorkspaceOnboardingPage').then((m) => ({ default: m.WorkspaceOnboardingPage })));

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="skeleton h-8 w-8 rounded-full" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/reset-password" element={<PasswordRecoveryPage />} />
            <Route path="/app" element={<ProtectedRoute><AppProvider><AppLayout /></AppProvider></ProtectedRoute>}>
              <Route index element={<Suspense fallback={<RouteFallback />}><DashboardPage /></Suspense>} />
              <Route path="tasks" element={<Suspense fallback={<RouteFallback />}><MyTasksPage /></Suspense>} />
              <Route path="boards" element={<Suspense fallback={<RouteFallback />}><BoardsPage /></Suspense>} />
              <Route path="boards/:boardId" element={<Suspense fallback={<RouteFallback />}><BoardPage /></Suspense>} />
              <Route path="insights" element={<Suspense fallback={<RouteFallback />}><AISummaryPage /></Suspense>} />
              <Route path="radar" element={<Suspense fallback={<RouteFallback />}><DriftRadarPage /></Suspense>} />
              <Route path="team" element={<Suspense fallback={<RouteFallback />}><TeamPage /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<RouteFallback />}><SettingsPage /></Suspense>} />
              <Route path="onboarding" element={<Suspense fallback={<RouteFallback />}><WorkspaceOnboardingPage /></Suspense>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
