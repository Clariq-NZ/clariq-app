import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import PublicScanPage from './pages/PublicScanPage'
import ScanPage from './pages/ScanPage'
import ContainerPage from './pages/ContainerPage'
import ActionPage from './pages/ActionPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import { CircularityPage, OverduePage, StatusListPage } from './pages/CircularityPage'
import { CreateContainersPage, GlossaryPage, ReportPage } from './pages/AdminPages'
import { AuthProvider, RequireStaff } from './lib/auth'
import { hasBackend } from './lib/supabase'
import './styles/index.css'

/** Routing - Architecture sections 5 and 7.
 * Staff routes sit behind RequireStaff. In demo mode (?demo=1, or no backend
 * configured) the gate passes everyone through so walkthroughs need no
 * account. /c/:code is the QR landing route: the gate decides whether the
 * visitor sees the staff card or the public page. */

const demo = new URLSearchParams(location.search).has('demo') || !hasBackend
const staff = (el: React.ReactNode) => <RequireStaff>{el}</RequireStaff>

const router = createBrowserRouter([
  { path: '/', element: demo ? <DashboardPage /> : <PublicScanPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/dashboard', element: staff(<DashboardPage />) },
  { path: '/dashboard/circularity', element: staff(<CircularityPage />) },
  { path: '/dashboard/overdue', element: staff(<OverduePage />) },
  { path: '/dashboard/status/:status', element: staff(<StatusListPage />) },
  { path: '/admin/new-containers', element: staff(<CreateContainersPage />) },
  { path: '/report', element: staff(<ReportPage />) },
  { path: '/glossary', element: <GlossaryPage /> },
  { path: '/scan', element: staff(<ScanPage />) },
  { path: '/c/:code', element: <ScanLanding /> },
  { path: '/c/:code/action/:event', element: staff(<ActionPage />) },
  { path: '/public/c/:code', element: <PublicScanPage /> },
])

/** Signed-in staff get the container card; everyone else the public page.
 * Decided at render time from the session, not the URL. */
function ScanLanding() {
  return demo ? <ContainerPage /> : <SessionSwitch staff={<ContainerPage />} other={<PublicScanPage />} />
}

import { useAuth } from './lib/auth'
function SessionSwitch({ staff: s, other }: { staff: React.ReactNode; other: React.ReactNode }) {
  const { loading, user } = useAuth()
  if (loading) return null
  return <>{user && user.role_code !== 'CUSTOMER' ? s : other}</>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
)
