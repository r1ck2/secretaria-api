import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import * as fc from 'fast-check';
import { handleCallback } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { env } from '@/config/environment.config';

// Mock the CalendarService
vi.mock('./calendar.service');
vi.mock('@/config/environment.config', () => ({
  env: {
    APP_WEB_URL: 'https://app.example.com'
  }
}));

describe('Calendar Controller - Bug Condition Exploration', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockCalendarService: any;

  beforeEach(() => {
    mockRequest = {
      query: {}
    };
    
    mockResponse = {
      redirect: vi.fn()
    };

    mockCalendarService = {
      handleCallback: vi.fn().mockResolvedValue(undefined)
    };

    vi.mocked(CalendarService).mockImplementation(() => mockCalendarService);
  });

  /**
   * **Validates: Requirements 2.1**
   * 
   * Bug Condition Exploration Test - Calendar Route
   * 
   * This test SHOULD FAIL on unfixed code to confirm the bug exists.
   * The bug: system redirects to `/panel/calendar` but frontend expects `/panel/calendario`
   */
  it('should demonstrate calendar route bug - redirects to incorrect route causing 404', async () => {
    // Property-based test: for any valid callback parameters
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: fc.string({ minLength: 10, maxLength: 100 }),
          state: fc.string({ minLength: 10, maxLength: 50 })
        }),
        async (callbackParams) => {
          // Setup request with valid callback parameters
          mockRequest.query = {
            code: callbackParams.code,
            state: callbackParams.state
          };

          // Execute the callback handler
          await handleCallback(mockRequest as Request, mockResponse as Response);

          // Verify the service was called correctly
          expect(mockCalendarService.handleCallback).toHaveBeenCalledWith(
            callbackParams.state,
            callbackParams.code
          );

          // BUG CONDITION: The current code redirects to `/panel/calendar`
          // but the frontend expects `/panel/calendario` (Portuguese)
          // This assertion will FAIL on unfixed code, proving the bug exists
          expect(mockResponse.redirect).toHaveBeenCalledWith(
            `${env.APP_WEB_URL}/panel/calendario?connected=true`
          );

          // The actual redirect in unfixed code will be:
          // `${env.APP_WEB_URL}/panel/calendar?connected=true`
          // This causes a 404 error on the frontend
        }
      ),
      { numRuns: 10 }
    );
  });

  it('should demonstrate calendar route bug on error - redirects to incorrect error route', async () => {
    // Setup service to throw an error
    mockCalendarService.handleCallback.mockRejectedValue(new Error('Calendar service error'));

    // Property-based test: for any valid callback parameters that cause errors
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          code: fc.string({ minLength: 10, maxLength: 100 }),
          state: fc.string({ minLength: 10, maxLength: 50 })
        }),
        async (callbackParams) => {
          mockRequest.query = {
            code: callbackParams.code,
            state: callbackParams.state
          };

          // Execute the callback handler (will catch error internally)
          await handleCallback(mockRequest as Request, mockResponse as Response);

          // BUG CONDITION: Error redirect also uses incorrect route
          // This assertion will FAIL on unfixed code
          expect(mockResponse.redirect).toHaveBeenCalledWith(
            `${env.APP_WEB_URL}/panel/calendario?error=true`
          );
        }
      ),
      { numRuns: 5 }
    );
  });

  it('should demonstrate missing params redirect bug', async () => {
    // Test missing code parameter
    mockRequest.query = { state: 'valid-state' };
    
    await handleCallback(mockRequest as Request, mockResponse as Response);
    
    // BUG CONDITION: Missing params redirect also uses incorrect route
    expect(mockResponse.redirect).toHaveBeenCalledWith(
      `${env.APP_WEB_URL}/panel/calendario?error=missing_params`
    );
  });
});