import { describe, test, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { SessionManager } from '../session-manager';
import { FlowSession } from '../../flowEngine/flowSession.entity';
import { Customer } from '../../customer/customer.entity';

// Mock dependencies
vi.mock('../../flowEngine/flowSession.entity');
vi.mock('../../customer/customer.entity');

describe('Feature: ai-scheduling-refactoring - Session Manager Property Tests', () => {
  let sessionManager: SessionManager;
  let mockLogService: any;

  beforeEach(() => {
    mockLogService = {
      log: vi.fn(),
    };

    sessionManager = new SessionManager({
      logService: mockLogService,
    });

    // Reset all mocks before each test
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  // Property 7: Session Context Field Completeness
  test('Property 7: Session Context Field Completeness - required fields present', () => {
    fc.assert(
      fc.property(
        fc.record({
          id: fc.uuid(),
          phone_number: fc.string({ minLength: 10, maxLength: 15 }).filter(s => s.replace(/\D/g, '').length >= 10),
          flow_id: fc.uuid(),
          context_json: fc.record({
            user_id: fc.uuid(),
            flow_id: fc.uuid(),
            phone: fc.string(),
            time_of_day: fc.constantFrom('bom dia', 'boa tarde', 'boa noite'),
          }).map(obj => JSON.stringify(obj)),
          history_json: fc.constant('[]'),
        }),
        async (sessionData) => {
          // Mock FlowSession methods
          const mockSession = {
            ...sessionData,
            getContext: vi.fn().mockReturnValue(JSON.parse(sessionData.context_json)),
            getHistory: vi.fn().mockReturnValue([]),
            save: vi.fn().mockResolvedValue(undefined),
          } as any;

          // Mock Customer.findOne to return null (no existing customer)
          vi.mocked(Customer.findOne).mockResolvedValue(null);

          const enrichedContext = await sessionManager.enrichContext(mockSession);

          // The context SHALL contain all required fields
          expect(enrichedContext).toHaveProperty('phone');
          expect(enrichedContext).toHaveProperty('user_id');
          expect(enrichedContext).toHaveProperty('flow_id');
          expect(enrichedContext).toHaveProperty('time_of_day');
          expect(enrichedContext).toHaveProperty('is_returning_customer');
          expect(enrichedContext).toHaveProperty('last_user_message');

          // Required fields should have valid values
          expect(typeof enrichedContext.phone).toBe('string');
          expect(typeof enrichedContext.user_id).toBe('string');
          expect(typeof enrichedContext.flow_id).toBe('string');
          expect(['bom dia', 'boa tarde', 'boa noite']).toContain(enrichedContext.time_of_day);
          expect(typeof enrichedContext.is_returning_customer).toBe('boolean');
          expect(typeof enrichedContext.last_user_message).toBe('string');
        }
      ),
      { numRuns: 20 }
    );
  });

  // Property 8: Session Retrieval by Phone
  test('Property 8: Session Retrieval by Phone - existing session retrieval', () => {
    fc.assert(
      fc.property(
        fc.record({
          phoneNumber: fc.string({ minLength: 10, maxLength: 15 }).filter(s => s.replace(/\D/g, '').length >= 10),
          flowId: fc.uuid(),
          professionalUserId: fc.uuid(),
        }),
        async (params) => {
          const normalizedPhone = params.phoneNumber.replace(/\D/g, '');
          
          // Mock existing session
          const existingSession = {
            id: fc.sample(fc.uuid(), 1)[0],
            phone_number: normalizedPhone,
            flow_id: params.flowId,
            status: 'active',
            updated_at: new Date(),
          };

          // Mock FlowSession.findOne to return existing session
          vi.mocked(FlowSession.findOne).mockResolvedValue(existingSession as any);

          const result = await sessionManager.findOrCreateSession(params);

          // Should retrieve existing session rather than creating new one
          expect(FlowSession.findOne).toHaveBeenCalledWith({
            where: {
              phone_number: normalizedPhone,
              flow_id: params.flowId,
              status: ['active', 'waiting_input'],
            },
            order: [['updated_at', 'DESC']],
          });

          expect(result).toBe(existingSession);
          expect(FlowSession.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 20 }
    );
  });

  // Property 9: Multi-Professional Session Isolation
  test('Property 9: Multi-Professional Session Isolation - different user_id sessions', () => {
    fc.assert(
      fc.property(
        fc.record({
          phoneNumber: fc.string({ minLength: 10, maxLength: 15 }).filter(s => s.replace(/\D/g, '').length >= 10),
          flowId1: fc.uuid(),
          flowId2: fc.uuid(),
          professionalUserId1: fc.uuid(),
          professionalUserId2: fc.uuid(),
        }).filter(params => 
          params.professionalUserId1 !== params.professionalUserId2 && 
          params.flowId1 !== params.flowId2
        ),
        async (params) => {
          const normalizedPhone = params.phoneNumber.replace(/\D/g, '');

          // Reset mocks for this test
          vi.clearAllMocks();

          // Mock no existing sessions found
          vi.mocked(FlowSession.findOne).mockResolvedValue(null);

          // Mock FlowSession.create
          const mockCreate = vi.mocked(FlowSession.create);
          mockCreate.mockImplementation((data: any) => ({
            id: fc.sample(fc.uuid(), 1)[0],
            ...data,
          }) as any);

          // Create session for first professional
          await sessionManager.findOrCreateSession({
            phoneNumber: params.phoneNumber,
            flowId: params.flowId1,
            professionalUserId: params.professionalUserId1,
          });

          // Create session for second professional
          await sessionManager.findOrCreateSession({
            phoneNumber: params.phoneNumber,
            flowId: params.flowId2,
            professionalUserId: params.professionalUserId2,
          });

          // Should create separate sessions with different user_id values
          expect(mockCreate).toHaveBeenCalledTimes(2);

          const firstCall = mockCreate.mock.calls[0][0];
          const secondCall = mockCreate.mock.calls[1][0];

          // Both should have same phone but different flow contexts
          expect(firstCall.phone_number).toBe(normalizedPhone);
          expect(secondCall.phone_number).toBe(normalizedPhone);

          const firstContext = JSON.parse(firstCall.context_json);
          const secondContext = JSON.parse(secondCall.context_json);

          expect(firstContext.user_id).toBe(params.professionalUserId1);
          expect(secondContext.user_id).toBe(params.professionalUserId2);
          expect(firstContext.user_id).not.toBe(secondContext.user_id);
        }
      ),
      { numRuns: 10 }
    );
  });

  // Property 57: Context Round-Trip Preservation (from design document)
  test('Property 57: Context Round-Trip Preservation - serialization consistency', () => {
    fc.assert(
      fc.property(
        fc.record({
          phone: fc.string({ minLength: 1 }),
          customer_id: fc.uuid(),
          user_id: fc.uuid(),
          name: fc.string({ minLength: 1 }),
          slots: fc.array(fc.record({
            index: fc.integer({ min: 1, max: 4 }),
            label: fc.string({ minLength: 1 }),
            start: fc.date().map(d => d.toISOString()),
            end: fc.date().map(d => d.toISOString()),
          })),
          is_returning_customer: fc.boolean(),
        }),
        async (context) => {
          const sessionId = fc.sample(fc.uuid(), 1)[0];

          // Mock session
          const mockSession = {
            id: sessionId,
            getContext: vi.fn().mockReturnValue({}),
            setContext: vi.fn(),
            save: vi.fn().mockResolvedValue(undefined),
          } as any;

          vi.mocked(FlowSession.findByPk).mockResolvedValue(mockSession);

          // Update context
          await sessionManager.updateContext(sessionId, context);

          // Verify setContext was called
          expect(mockSession.setContext).toHaveBeenCalled();
          const serializedContext = mockSession.setContext.mock.calls[0][0];

          // Round-trip test: serialize and deserialize should produce equivalent object
          const roundTripContext = JSON.parse(JSON.stringify(serializedContext));
          expect(roundTripContext).toEqual(serializedContext);

          // All original fields should be preserved
          Object.keys(context).forEach(key => {
            expect(serializedContext).toHaveProperty(key);
            expect(serializedContext[key]).toEqual(context[key]);
          });
        }
      ),
      { numRuns: 20 }
    );
  });
});