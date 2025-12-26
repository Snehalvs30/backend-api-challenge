import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export interface FileMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: string;
  reportId: string;
  storageKey: string;
}

export class FileStorageService {
  private files: Map<string, { metadata: FileMetadata; buffer: Buffer }> = new Map();

  private allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ];

  validateFileType(mimeType: string): boolean {
    return this.allowedMimeTypes.includes(mimeType);
  }

  validateFileSize(size: number): boolean {
    const maxSize = 5 * 1024 * 1024; // 5MB
    return size <= maxSize;
  }

  async storeFile(
    file: Express.Multer.File,
    reportId: string,
    userId: string
  ): Promise<FileMetadata> {
    const fileId = uuidv4();
    const storageKey = `reports/${reportId}/attachments/${fileId}`;

    const metadata: FileMetadata = {
      id: fileId,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date(),
      uploadedBy: userId,
      reportId,
      storageKey
    };

    this.files.set(fileId, {
      metadata,
      buffer: file.buffer
    });

    console.log(`📎 File stored: ${file.originalname} (${fileId})`);
    return metadata;
  }

  generateDownloadUrl(fileId: string, expiresIn: number = 3600): string {
    const expiryTime = Date.now() + expiresIn * 1000;
    
    const signature = crypto
      .createHash('sha256')
      .update(`${fileId}-${expiryTime}-${process.env.JWT_SECRET || 'secret'}`)
      .digest('hex')
      .substring(0, 16);
    
    return `/api/files/${fileId}/download?token=${signature}&expires=${expiryTime}`;
  }

  verifyDownloadUrl(fileId: string, token: string, expires: number): boolean {
    if (Date.now() > expires) {
      return false;
    }

    const expectedSignature = crypto
      .createHash('sha256')
      .update(`${fileId}-${expires}-${process.env.JWT_SECRET || 'secret'}`)
      .digest('hex')
      .substring(0, 16);

    return token === expectedSignature;
  }

  getFile(fileId: string): { metadata: FileMetadata; buffer: Buffer } | undefined {
    return this.files.get(fileId);
  }

  getFilesByReport(reportId: string): FileMetadata[] {
    const files: FileMetadata[] = [];
    this.files.forEach(({ metadata }) => {
      if (metadata.reportId === reportId) {
        files.push(metadata);
      }
    });
    return files;
  }
}

export const fileStorageService = new FileStorageService();