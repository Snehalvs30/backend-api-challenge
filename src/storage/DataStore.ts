import { Report } from '../models/Report';
import { User } from '../models/User';

export class DataStore {
  private static instance: DataStore;
  private reports: Map<string, Report> = new Map();
  private users: Map<string, User> = new Map();
  private attachments: Map<string, any> = new Map();

  private constructor() {}

  public static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  // Report operations
  createReport(report: Report): Report {
    this.reports.set(report.id, report);
    return report;
  }

  getReport(id: string): Report | undefined {
    return this.reports.get(id);
  }

  updateReport(id: string, report: Report): Report | undefined {
    if (!this.reports.has(id)) {
      return undefined;
    }
    this.reports.set(id, report);
    return report;
  }

  deleteReport(id: string): boolean {
    return this.reports.delete(id);
  }

  getAllReports(): Report[] {
    return Array.from(this.reports.values());
  }

  // User operations
  createUser(user: User): User {
    this.users.set(user.id, user);
    return user;
  }

  getUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  getUserById(id: string): User | undefined {
    return this.users.get(id);
  }

  // Attachment operations
  saveAttachment(id: string, metadata: any): void {
    this.attachments.set(id, metadata);
  }

  getAttachment(id: string): any | undefined {
    return this.attachments.get(id);
  }
}