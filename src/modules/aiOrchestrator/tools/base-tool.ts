import { SessionContext } from '../types';

export interface BaseTool {
  execute(args: Record<string, any>, context: SessionContext): Promise<any>;
}

export abstract class AbstractTool implements BaseTool {
  constructor(protected logService: any) {}

  abstract execute(args: Record<string, any>, context: SessionContext): Promise<any>;

  protected log(action: string, message: string, metadata?: Record<string, any>) {
    if (this.logService && typeof this.logService.log === 'function') {
      this.logService.log({
        level: 'info',
        action,
        message,
        metadata,
        timestamp: new Date().toISOString(),
      });
    }
  }

  protected logError(action: string, error: Error, metadata?: Record<string, any>) {
    if (this.logService && typeof this.logService.log === 'function') {
      this.logService.log({
        level: 'error',
        action,
        message: error.message,
        metadata: {
          ...metadata,
          stack_trace: error.stack,
        },
        timestamp: new Date().toISOString(),
      });
    }
  }
}