import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

import './index.css'
import { AuthProvider, RequireAuth } from './auth'
import Layout from './components/Layout'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import { ClientsList, ClientDetails } from './pages/Clients'
import LeadCapture, { LeadsList } from './pages/LeadCapture'
import { QuotationsList, QuotationCreate, QuotationEdit, QuotationDetails } from './pages/Quotations'
import { InstallationsList, InstallationDetails, InstallationCertification } from './pages/Installations'
import { SupportList, GrantsList, GrantSubmission } from './pages/Support'
import { ComplianceHub, StockInventory, VansTools, Engineers, DocumentsPage } from './pages/Operations'
import { Reports, Settings } from './pages/Misc'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Screen 5 doubles as the public website form -- no sign-in needed. */}
          <Route path="/lead-capture" element={<LeadCapture />} />

          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="clients" element={<ClientsList />} />
            <Route path="clients/:id" element={<ClientDetails />} />
            <Route path="leads" element={<LeadsList />} />
            <Route path="quotations" element={<QuotationsList />} />
            <Route path="quotations/new" element={<QuotationCreate />} />
            <Route path="quotations/:id" element={<QuotationDetails />} />
            <Route path="quotations/:id/edit" element={<QuotationEdit />} />
            <Route path="installations" element={<InstallationsList />} />
            <Route path="installations/:id" element={<InstallationDetails />} />
            <Route path="installations/:id/certification" element={<InstallationCertification />} />
            <Route path="support" element={<SupportList />} />
            <Route path="grants" element={<GrantsList />} />
            <Route path="grants/:id" element={<GrantSubmission />} />
            <Route path="engineers" element={<Engineers />} />
            <Route path="compliance" element={<ComplianceHub />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="stock" element={<StockInventory />} />
            <Route path="vans" element={<VansTools />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
