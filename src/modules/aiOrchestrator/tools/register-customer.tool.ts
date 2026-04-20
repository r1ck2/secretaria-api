import { AbstractTool } from './base-tool';
import { SessionContext } from '../types';
import { LogAction } from '../types';

export class RegisterCustomerTool extends AbstractTool {
  constructor(
    private customerService: any,
    logService: any
  ) {
    super(logService);
  }

  async execute(args: Record<string, any>, context: SessionContext): Promise<{
    customer: any;
    message: string;
  }> {
    const { name, email, document } = args;

    this.log(LogAction.TOOL_EXECUTION_START, 'Starting register_customer execution', {
      user_id: context.user_id,
      phone: context.phone,
      name,
      has_email: !!email,
      has_document: !!document,
    });

    try {
      // Validate required fields
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('Nome é obrigatório e deve ser uma string não vazia.');
      }

      // Check if customer already exists with this phone FOR THIS PROFESSIONAL
      const existingCustomer = await this.customerService.findByPhone(context.phone, context.user_id);
      if (existingCustomer) {
        // Already registered for this professional — update context and return success
        return {
          customer: existingCustomer,
          message: `Bem-vindo(a) de volta, ${existingCustomer.name}! Seu cadastro já existe.`,
        };
      }

      // Create new customer
      const customerData = {
        name: name.trim(),
        phone: context.phone,
        email: email?.trim() || null,
        document: document?.trim() || null,
        created_via: 'ai_orchestrator',
        user_id: context.user_id, // Associate with professional
      };

      const customer = await this.customerService.create(customerData);

      // Update context so subsequent tools (book_appointment etc.) know the customer
      context.customer_id = customer.id;
      context.name = customer.name;
      context.email = customer.email;
      context.is_returning_customer = true;

      this.log(LogAction.TOOL_EXECUTION_COMPLETE, 'register_customer completed successfully', {
        user_id: context.user_id,
        phone: context.phone,
        customer_id: customer.id,
        name: customer.name,
      });

      return {
        customer,
        message: `Cadastro realizado com sucesso! Bem-vindo(a), ${customer.name}. Agora você pode agendar consultas.`,
      };

    } catch (error) {
      this.logError(LogAction.TOOL_ERROR, error as Error, {
        user_id: context.user_id,
        phone: context.phone,
        tool_name: 'register_customer',
        name,
      });

      throw new Error(`Erro ao cadastrar cliente: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
}