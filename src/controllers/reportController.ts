import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { DataStore } from '../storage/DataStore';
import { Report, ReportStatus, CreateReportDTO } from '../models/Report';
import multer from 'multer';
import { fileStorageService } from '../services/fileStorage';
import { AsyncTaskQueue, TaskType, TaskStatus } from '../services/asyncTaskQueue';
import { reportValidator } from '../services/reportValidator';

const dataStore = DataStore.getInstance();

export const getReport = (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { view, include, page = '1', size = '10' } = req.query;

    const report = dataStore.getReport(id);

    if (!report) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Report not found'
        }
      });
    }

    if (view === 'summary') {
      return res.json({
        id: report.id,
        title: report.title,
        status: report.status,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        entryCount: report.entries.length,
        department: report.metadata.department
      });
    }

    const includeFields = include ? (include as string).split(',') : [];
    let response: any = {
      id: report.id,
      title: report.title,
      description: report.description,
      status: report.status,
      createdBy: report.createdBy,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      version: report.version
    };

    response.computed = {
      totalEntries: report.entries.length,
      highPriorityCount: report.entries.filter(e => e.priority === 'high').length,
      mediumPriorityCount: report.entries.filter(e => e.priority === 'medium').length,
      lowPriorityCount: report.entries.filter(e => e.priority === 'low').length,
      totalComments: report.entries.reduce((sum, entry) => sum + entry.comments.length, 0)
    };

    if (includeFields.length === 0 || includeFields.includes('entries')) {
      const pageNum = parseInt(page as string);
      const pageSize = parseInt(size as string);
      const startIndex = (pageNum - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      
      response.entries = {
        data: report.entries.slice(startIndex, endIndex),
        pagination: {
          page: pageNum,
          size: pageSize,
          total: report.entries.length,
          totalPages: Math.ceil(report.entries.length / pageSize)
        }
      };
    }

    if (includeFields.length === 0 || includeFields.includes('metadata')) {
      response.metadata = report.metadata;
    }

    if (includeFields.length === 0 || includeFields.includes('attachments')) {
      response.attachments = report.attachments;
    }

    res.json(response);
  } catch (error) {
    console.error('Error retrieving report:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve report'
      }
    });
  }
};

export const createReport = (req: Request, res: Response) => {
  try {
    const { title, description, metadata } = req.body as CreateReportDTO;

    if (!title || !description) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Title and description are required',
          details: {
            title: !title ? 'Title is required' : undefined,
            description: !description ? 'Description is required' : undefined
          }
        }
      });
    }

    const newReport: Report = {
      id: uuidv4(),
      title,
      description,
      status: ReportStatus.DRAFT,
      createdBy: req.user!.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
      entries: [],
      metadata: metadata || {
        department: 'General',
        confidentialityLevel: 'internal',
        estimatedReadTime: 0
      },
      attachments: []
    };

    dataStore.createReport(newReport);

    const taskQueue = AsyncTaskQueue.getInstance();
    
    taskQueue.enqueue({
      id: `${newReport.id}-notification`,
      type: TaskType.SEND_NOTIFICATION,
      payload: {
        reportId: newReport.id,
        reportTitle: newReport.title,
        createdBy: req.user!.username,
        recipients: ['manager@company.com', 'team@company.com']
      },
      status: TaskStatus.PENDING,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date()
    });

    taskQueue.enqueue({
      id: `${newReport.id}-cache`,
      type: TaskType.INVALIDATE_CACHE,
      payload: {
        cacheKey: `reports:${newReport.metadata.department}`,
        reportId: newReport.id
      },
      status: TaskStatus.PENDING,
      attempts: 0,
      maxAttempts: 2,
      createdAt: new Date()
    });

    taskQueue.enqueue({
      id: `${newReport.id}-preview`,
      type: TaskType.GENERATE_PREVIEW,
      payload: {
        reportId: newReport.id,
        title: newReport.title
      },
      status: TaskStatus.PENDING,
      attempts: 0,
      maxAttempts: 3,
      createdAt: new Date()
    });

    res.status(201)
      .location(`/reports/${newReport.id}`)
      .json(newReport);
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create report'
      }
    });
  }
};

export const updateReport = (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, status, metadata, entries, version } = req.body;

    if (version === undefined) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Version number is required for optimistic locking'
        }
      });
    }

    const existingReport = dataStore.getReport(id);
    if (!existingReport) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Report not found'
        }
      });
    }

    if (existingReport.version !== version) {
      return res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'Report has been modified by another user',
          details: {
            currentVersion: existingReport.version,
            providedVersion: version
          }
        }
      });
    }

    if (status !== undefined && status !== existingReport.status) {
      const reportForValidation = {
        ...existingReport,
        entries: entries !== undefined ? entries : existingReport.entries
      };

      const validationResult = reportValidator.validateStatusTransition(
        reportForValidation,
        status
      );

      if (!validationResult.valid) {
        return res.status(400).json({
          error: {
            code: validationResult.code || 'BUSINESS_RULE_VIOLATION',
            message: validationResult.error,
            details: {
              currentStatus: existingReport.status,
              attemptedStatus: status
            }
          }
        });
      }
    }

    const updatedReport: Report = {
      ...existingReport,
      title: title !== undefined ? title : existingReport.title,
      description: description !== undefined ? description : existingReport.description,
      status: status !== undefined ? status : existingReport.status,
      metadata: metadata !== undefined ? { ...existingReport.metadata, ...metadata } : existingReport.metadata,
      entries: entries !== undefined ? entries : existingReport.entries,
      updatedAt: new Date(),
      version: existingReport.version + 1
    };

    dataStore.updateReport(id, updatedReport);

    console.log(`📝 Report updated by ${req.user!.username}:`, {
      reportId: id,
      changes: {
        title: title !== undefined,
        description: description !== undefined,
        status: status !== undefined,
        metadata: metadata !== undefined,
        entries: entries !== undefined
      },
      oldVersion: existingReport.version,
      newVersion: updatedReport.version,
      timestamp: new Date().toISOString()
    });

    res.json(updatedReport);
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update report'
      }
    });
  }
};

// Multer configuration
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

export const uploadMiddleware = upload.single('file');

export const uploadAttachment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const file = req.file;

    console.log('📤 Upload attempt:', {
      reportId: id,
      hasFile: !!file,
      fileDetails: file ? {
        name: file.originalname,
        size: file.size,
        type: file.mimetype
      } : 'No file'
    });

    if (!file) {
      return res.status(400).json({
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded. Use "file" as the field name'
        }
      });
    }

    const report = dataStore.getReport(id);
    if (!report) {
      return res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Report not found'
        }
      });
    }

    if (!fileStorageService.validateFileType(file.mimetype)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FILE_TYPE',
          message: `File type '${file.mimetype}' is not allowed`,
          details: {
            allowedTypes: ['pdf', 'jpeg', 'png', 'gif', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'],
            receivedType: file.mimetype
          }
        }
      });
    }

    if (!fileStorageService.validateFileSize(file.size)) {
      return res.status(400).json({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'File size exceeds 5MB limit',
          details: {
            maxSize: '5MB',
            receivedSize: `${(file.size / (1024 * 1024)).toFixed(2)}MB`
          }
        }
      });
    }

    const metadata = await fileStorageService.storeFile(
      file,
      id,
      req.user!.id
    );

    report.attachments.push(metadata.id);
    report.updatedAt = new Date();
    dataStore.updateReport(id, report);

    const downloadUrl = fileStorageService.generateDownloadUrl(metadata.id, 3600);

    console.log(`✅ File uploaded successfully: ${metadata.originalName}`);

    res.status(201).json({
      id: metadata.id,
      fileName: metadata.originalName,
      size: metadata.size,
      mimeType: metadata.mimeType,
      uploadedAt: metadata.uploadedAt,
      uploadedBy: req.user!.username,
      downloadUrl,
      expiresIn: 3600
    });
  } catch (error) {
    console.error('❌ Error uploading attachment:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to upload attachment',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
};