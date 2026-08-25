import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import PublicScanPage from './pages/PublicScanPage'
import ScanPage from './pages/ScanPage'
import ContainerPage from './pages/ContainerPage'
import ActionPage from './pages/ActionPage'
import DashboardPage from './pages/DashboardPage'
import { CircularityPage, OverduePage, StatusListPage } from './pages/CircularityPage'
import { CreateContainersPage, GlossaryPage, ReportPage } from './pages/AdminPages'
import './styles/index.css'

/** Routing - Architecture section 7.
 * /c/:code is the QR landing route. Until auth arrives (Stage 3 completion),
 * it renders the staff container card in demo mode and the public page in
 * live mode without a session. The auth gate slots in here, not in pages. */

const staffMode = () =>
  new URLSearchParams(location.search).has('demo') ||
  !import.meta.env.VITE_SUPABASE_URL // no backend yet -> demo staff preview

const router = createBrowserRouter([
  { path: '/', element: staffMode() ? <DashboardPage /> : <PublicScanPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/dashboard/circularity', element: <CircularityPage /> },
  { path: '/dashboard/overdue', element: <OverduePage /> },
  { path: '/dashboard/status/:status', element: <StatusListPage /> },
  { path: '/admin/new-containers', element: <CreateContainersPage /> },
  { path: '/report', element: <ReportPage /> },
  { path: '/glossary', element: <GlossaryPage /> },
  { path: '/scan', element: <ScanPage /> },
  { path: '/c/:code', element: staffMode() ? <ContainerPage /> : <PublicScanPage /> },
  { path: '/c/:code/action/:event', element: <ActionPage /> },
  { path: '/public/c/:code', element: <PublicScanPage /> },
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
