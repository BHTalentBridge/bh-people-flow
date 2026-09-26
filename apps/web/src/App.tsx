import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './lib/auth';
import { AppShell } from './components/layout/AppShell';
import type { Role } from './lib/types';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import Clients from './pages/Clients';
import ServiceProviders from './pages/ServiceProviders';
import Resources from './pages/Resources';
import ResourceDetail from './pages/ResourceDetail';
import Attendance from './pages/Attendance';
import Tasks from './pages/Tasks';
import Invoices from './pages/Invoices';
import AssignmentRequests from './pages/AssignmentRequests';
import Leave from './pages/Leave';
import MyProjects from './pages/MyProjects';
import Audit from './pages/Audit';
import NotFound from './pages/NotFound';

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Loader2 className="text-muted h-5 w-5 animate-spin" />
    </div>
  );
}

/** Blocks a route until the session resolves, then enforces the role list. */
function Guard({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  // Admin is unrestricted by design.
  if (roles && user.role !== 'ADMIN' && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <Splash /> : user ? <Navigate to="/" replace /> : <Login />}
      />

      <Route
        element={
          <Guard>
            <AppShell />
          </Guard>
        }
      >
        <Route index element={<Dashboard />} />

        {/* Admin / PM / EM management surfaces */}
        <Route path="projects" element={<Guard roles={['PM', 'EM']}><Projects /></Guard>} />
        <Route path="projects/:id" element={<Guard roles={['PM', 'EM']}><ProjectDetail /></Guard>} />
        {/* Client register is Admin-only; PMs still coin clients from the project form. */}
        <Route path="clients" element={<Guard roles={[]}><Clients /></Guard>} />
        {/* ServiceProvider register is Admin-only; PMs coin serviceProviders from the resource form. */}
        <Route path="service-providers" element={<Guard roles={[]}><ServiceProviders /></Guard>} />
        <Route path="resources" element={<Guard roles={['PM', 'EM']}><Resources /></Guard>} />
        <Route path="resources/:id" element={<Guard roles={['PM', 'EM']}><ResourceDetail /></Guard>} />
        <Route path="attendance" element={<Guard roles={['PM', 'EM']}><Attendance /></Guard>} />
        <Route path="tasks" element={<Guard roles={['PM', 'EM']}><Tasks /></Guard>} />
        <Route path="invoices" element={<Guard roles={['PM', 'EM']}><Invoices /></Guard>} />
        {/* The approval queue: an EM decides here, a PM watches their own. */}
        <Route
          path="assignment-requests"
          element={<Guard roles={['PM', 'EM']}><AssignmentRequests /></Guard>}
        />
        {/* Leave: EM/Admin decide, PM reads. Resources use /my-leave below. */}
        <Route path="leave" element={<Guard roles={['PM', 'EM']}><Leave /></Guard>} />
        <Route path="audit" element={<Guard roles={['PM', 'EM']}><Audit /></Guard>} />

        {/* Resource-facing views reuse the same screens in "own data" mode */}
        <Route path="my-attendance" element={<Attendance />} />
        <Route path="my-tasks" element={<Tasks />} />
        {/* Removed screens. Old links land somewhere useful rather than on a 404:
            Managers folded into Resources; Teams removed outright, since a
            person's role on a project now lives on the placement itself. */}
        <Route path="managers" element={<Navigate to="/resources" replace />} />
        <Route path="teams" element={<Navigate to="/projects" replace />} />

        <Route path="my-projects" element={<MyProjects />} />
        <Route path="my-leave" element={<Leave />} />
        <Route path="my-invoices" element={<Invoices />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
