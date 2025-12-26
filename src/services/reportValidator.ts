import { Report, ReportStatus, Priority } from '../models/Report';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

export class ReportValidator {
  /**
   * Custom Business Rule: Archive Validation
   * 
   * Rule: Published reports must have at least 3 high-priority entries 
   * before they can be archived.
   * 
   * Justification:
   * - Ensures quality control before archival
   * - Prevents incomplete reports from being archived
   * - High-priority entries indicate important content that justifies publication
   * 
   * Impact:
   * - Affects PUT /reports/:id when status changes to 'archived'
   * - Adds validation layer to data model
   * - Provides clear error messages for API consumers
   */
  validateArchiveTransition(report: Report, newStatus: ReportStatus): ValidationResult {
    if (newStatus !== ReportStatus.ARCHIVED) {
      return { valid: true };
    }

    if (report.status === ReportStatus.PUBLISHED) {
      const highPriorityCount = report.entries.filter(
        entry => entry.priority === Priority.HIGH
      ).length;

      if (highPriorityCount < 3) {
        return {
          valid: false,
          code: 'INSUFFICIENT_HIGH_PRIORITY_ENTRIES',
          error: `Cannot archive published report: requires at least 3 high-priority entries (currently has ${highPriorityCount})`
        };
      }
    }

    return { valid: true };
  }

  validatePublishTransition(report: Report, newStatus: ReportStatus): ValidationResult {
    if (newStatus !== ReportStatus.PUBLISHED) {
      return { valid: true };
    }

    if (report.entries.length === 0) {
      return {
        valid: false,
        code: 'NO_ENTRIES',
        error: 'Cannot publish report: must have at least one entry'
      };
    }

    return { valid: true };
  }

  validateStatusTransition(report: Report, newStatus: ReportStatus): ValidationResult {
    const archiveResult = this.validateArchiveTransition(report, newStatus);
    if (!archiveResult.valid) {
      return archiveResult;
    }

    const publishResult = this.validatePublishTransition(report, newStatus);
    if (!publishResult.valid) {
      return publishResult;
    }

    return { valid: true };
  }
}

export const reportValidator = new ReportValidator();