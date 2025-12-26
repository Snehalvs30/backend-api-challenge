export enum TaskType {
  SEND_NOTIFICATION = 'SEND_NOTIFICATION',
  INVALIDATE_CACHE = 'INVALIDATE_CACHE',
  GENERATE_PREVIEW = 'GENERATE_PREVIEW'
}

export enum TaskStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER'
}

export interface Task {
  id: string;
  type: TaskType;
  payload: any;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processedAt?: Date;
  error?: string;
}

export class AsyncTaskQueue {
  private static instance: AsyncTaskQueue;
  private queue: Task[] = [];
  private processing: boolean = false;
  private deadLetterQueue: Task[] = [];

  private constructor() {}

  public static getInstance(): AsyncTaskQueue {
    if (!AsyncTaskQueue.instance) {
      AsyncTaskQueue.instance = new AsyncTaskQueue();
    }
    return AsyncTaskQueue.instance;
  }

  enqueue(task: Task): void {
    this.queue.push(task);
    console.log(`📥 Task enqueued: ${task.type} (ID: ${task.id})`);
    
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const task = this.queue.shift()!;

    try {
      task.status = TaskStatus.PROCESSING;
      console.log(`⚙️  Processing task: ${task.type} (Attempt ${task.attempts + 1}/${task.maxAttempts})`);

      await this.executeTask(task);

      task.status = TaskStatus.COMPLETED;
      task.processedAt = new Date();
      console.log(`✅ Task completed: ${task.type} (ID: ${task.id})`);

    } catch (error) {
      task.attempts++;
      task.error = error instanceof Error ? error.message : 'Unknown error';

      if (task.attempts >= task.maxAttempts) {
        task.status = TaskStatus.DEAD_LETTER;
        this.deadLetterQueue.push(task);
        console.error(`💀 Task moved to dead letter queue: ${task.type} (ID: ${task.id})`);
      } else {
        task.status = TaskStatus.FAILED;
        const backoffDelay = Math.pow(2, task.attempts) * 1000;
        console.warn(`⚠️  Task failed, retrying in ${backoffDelay}ms: ${task.type}`);
        
        setTimeout(() => {
          this.queue.unshift(task);
        }, backoffDelay);
      }
    }

    setTimeout(() => this.processQueue(), 100);
  }

  private async executeTask(task: Task): Promise<void> {
    switch (task.type) {
      case TaskType.SEND_NOTIFICATION:
        await this.sendNotification(task.payload);
        break;
      case TaskType.INVALIDATE_CACHE:
        await this.invalidateCache(task.payload);
        break;
      case TaskType.GENERATE_PREVIEW:
        await this.generatePreview(task.payload);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  private async sendNotification(payload: any): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`📧 Notification sent for report: ${payload.reportId}`);
  }

  private async invalidateCache(payload: any): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(`🗑️  Cache invalidated for: ${payload.cacheKey}`);
  }

  private async generatePreview(payload: any): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log(`🖼️  Preview generated for report: ${payload.reportId}`);
  }

  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      deadLetterQueueLength: this.deadLetterQueue.length
    };
  }

  getDeadLetterQueue(): Task[] {
    return this.deadLetterQueue;
  }
}