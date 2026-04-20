import { AbstractTool } from './base-tool';
import { SessionContext } from '../types';
import { LogAction } from '../types';
import { ServicePrice } from '@/modules/servicePrice/servicePrice.entity';

export class GetPricingTool extends AbstractTool {
  constructor(logService: any) {
    super(logService);
  }

  async execute(_args: Record<string, any>, context: SessionContext): Promise<{
    services: Array<{ name: string; price: string; details?: string; duration_minutes?: number }>;
    message: string;
  }> {
    this.log(LogAction.TOOL_EXECUTION_START, 'Starting get_pricing execution', {
      user_id: context.user_id,
    });

    try {
      const services = await ServicePrice.findAll({
        where: { user_id: context.user_id, status: true },
        order: [['name', 'ASC']],
        attributes: ['name', 'price', 'details', 'duration_minutes'],
      });

      if (!services.length) {
        return {
          services: [],
          message: 'Nenhum serviço cadastrado no momento.',
        };
      }

      const formatted = services.map((s: any) => ({
        name: s.name,
        price: `R$ ${Number(s.price).toFixed(2).replace('.', ',')}`,
        details: s.details || undefined,
        duration_minutes: s.duration_minutes || undefined,
      }));

      this.log(LogAction.TOOL_EXECUTION_COMPLETE, 'get_pricing completed', {
        user_id: context.user_id,
        services_count: formatted.length,
      });

      return {
        services: formatted,
        message: `${formatted.length} serviço(s) encontrado(s).`,
      };
    } catch (error) {
      this.logError(LogAction.TOOL_ERROR, error as Error, {
        user_id: context.user_id,
        tool_name: 'get_pricing',
      });
      throw new Error(`Erro ao buscar tabela de preços: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
}
