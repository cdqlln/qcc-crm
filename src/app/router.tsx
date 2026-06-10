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
import { PlaceholderPage } from '@/features/settings/PlaceholderPage';

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
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/company', element: <PlaceholderPage title="企业工商" /> },
      { path: 'sign', element: <PlaceholderPage title="外勤签到" /> },
      { path: 'tickets', element: <PlaceholderPage title="工单" /> },
      { path: 'approvals', element: <PlaceholderPage title="审批" /> },
      { path: 'qywx', element: <PlaceholderPage title="企微协同" /> },
      { path: '*', element: <PlaceholderPage title="页面不存在" /> },
        ],
      },
    ],
  },
]);
