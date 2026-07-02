import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RequireAuth } from './RequireAuth';
import { LoginPage } from '@/features/auth/LoginPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { LeadsPage } from '@/features/leads/LeadsPage';
import { CustomersPage } from '@/features/customers/CustomersPage';
import { CustomerDetailPage } from '@/features/customers/CustomerDetailPage';
import { OpportunitiesPage } from '@/features/opportunities/OpportunitiesPage';
import { QuotationsPage } from '@/features/quotations/QuotationsPage';
import { QuotationEditorPage } from '@/features/quotations/QuotationEditorPage';
import { ContractsPage } from '@/features/contracts/ContractsPage';
import { ContractDetailPage } from '@/features/contracts/ContractDetailPage';
import { PaymentsPage } from '@/features/payments/PaymentsPage';
import { InvoicesPage } from '@/features/payments/InvoicesPage';
import { PreCreditsPage } from '@/features/payments/PreCreditsPage';
import { TargetsPage } from '@/features/analytics/TargetsPage';
import { OpportunityAnalyticsPage } from '@/features/analytics/OpportunityAnalyticsPage';
import { LeadsAnalyticsPage } from '@/features/analytics/LeadsAnalyticsPage';
import { ActivityAnalyticsPage } from '@/features/analytics/ActivityAnalyticsPage';
import { ProductsPage } from '@/features/settings/ProductsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { RolesPage } from '@/features/settings/RolesPage';
import { OrgPage } from '@/features/settings/OrgPage';
import { DictPage } from '@/features/settings/DictPage';
import { AuditPage } from '@/features/settings/AuditPage';
import { PlaceholderPage } from '@/features/settings/PlaceholderPage';
import { SignPage } from '@/features/collab/SignPage';
import { TicketsPage } from '@/features/collab/TicketsPage';
import { ApprovalsPage } from '@/features/collab/ApprovalsPage';
import { QywxPage } from '@/features/collab/QywxPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RequireAuth />,
    children: [
      {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'leads', element: <LeadsPage /> },
      { path: 'leads/:id', element: <LeadsPage /> },
      { path: 'customers', element: <CustomersPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'opportunities', element: <OpportunitiesPage /> },
      { path: 'opportunities/:id', element: <OpportunitiesPage /> },
      { path: 'quotations', element: <QuotationsPage /> },
      { path: 'quotations/:id', element: <QuotationEditorPage /> },
      { path: 'contracts', element: <ContractsPage /> },
      { path: 'contracts/:id', element: <ContractDetailPage /> },
      { path: 'payments', element: <PaymentsPage /> },
      { path: 'invoices', element: <InvoicesPage /> },
      { path: 'pre-credits', element: <PreCreditsPage /> },
      { path: 'targets', element: <TargetsPage /> },
      { path: 'analytics/opportunity', element: <OpportunityAnalyticsPage /> },
      { path: 'analytics/leads', element: <LeadsAnalyticsPage /> },
      { path: 'analytics/activity', element: <ActivityAnalyticsPage /> },
      { path: 'settings/products', element: <ProductsPage /> },
      { path: 'settings/roles', element: <RolesPage /> },
      { path: 'settings/org', element: <OrgPage /> },
      { path: 'settings/dict', element: <DictPage /> },
      { path: 'settings/audit', element: <AuditPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/company', element: <PlaceholderPage title="企业工商" /> },
      { path: 'sign', element: <SignPage /> },
      { path: 'tickets', element: <TicketsPage /> },
      { path: 'approvals', element: <ApprovalsPage /> },
      { path: 'qywx', element: <QywxPage /> },
      { path: '*', element: <PlaceholderPage title="页面不存在" /> },
        ],
      },
    ],
  },
]);
