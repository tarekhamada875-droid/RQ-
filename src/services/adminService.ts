import { adminCoreService } from './adminCoreService';
import { adminPackageService } from './adminPackageService';
import { adminSubscriberService } from './adminSubscriberService';
import { adminActivityService } from './adminActivityService';
import { adminBillingService } from './adminBillingService';
import { adminAnnouncementService } from './adminAnnouncementService';
import { adminSystemConfigService } from './adminSystemConfigService';

export type { FinancialReportData, CreditActivityMetrics, FinancialReportFilters, AdminSummary, SubscriberPageCursor, SubscriberPageInfo, SubscriberPage } from './adminServiceTypes';

export const adminService = {
  ...adminCoreService,
  ...adminPackageService,
  ...adminSubscriberService,
  ...adminActivityService,
  ...adminBillingService,
  ...adminAnnouncementService,
  ...adminSystemConfigService,
};
