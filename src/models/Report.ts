export enum ReportStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived'
}

export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export interface Comment {
  id: string;
  text: string;
  author: string;
  createdAt: Date;
}

export interface ReportEntry {
  id: string;
  content: string;
  priority: Priority;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  comments: Comment[];
}

export interface ReportMetadata {
  department: string;
  confidentialityLevel: 'public' | 'internal' | 'confidential';
  estimatedReadTime: number; // in minutes
  lastReviewedBy?: string;
  lastReviewedAt?: Date;
}

export interface Report {
  id: string;
  title: string;
  description: string;
  status: ReportStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number; // For optimistic locking
  entries: ReportEntry[];
  metadata: ReportMetadata;
  attachments: string[]; // Array of attachment IDs
}

export interface CreateReportDTO {
  title: string;
  description: string;
  metadata: ReportMetadata;
}

export interface UpdateReportDTO {
  title?: string;
  description?: string;
  status?: ReportStatus;
  metadata?: Partial<ReportMetadata>;
  entries?: ReportEntry[];
  version: number; // Required for optimistic locking
}