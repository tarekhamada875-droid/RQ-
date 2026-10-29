import { adminCoreService } from './adminCoreService';
import { adminSubscriberService } from './adminSubscriberService';
import { adminActivityService } from './adminActivityService';
import { adminBillingService } from './adminBillingService';
import { adminSystemConfigService } from './adminSystemConfigService';

export type { FinancialReportData, CreditActivityMetrics, FinancialReportFilters, AdminSummary, SubscriberPageCursor, SubscriberPageInfo, SubscriberPage } from './adminServiceTypes';

export const adminService = {
  ...adminCoreService,
  ...adminSubscriberService,
  ...adminActivityService,
  ...adminBillingService,
  ...adminSystemConfigService,
};
