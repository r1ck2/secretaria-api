import { Appointment } from './appointment.entity';
import { Customer } from '../customer/customer.entity';
import { Op } from 'sequelize';

export class AppointmentService {
  async create(data: {
    customer_id: string;
    user_id: string;
    customer_phone: string;
    calendar_event_id: string;
    title: string;
    start_at: string;
    end_at: string;
    status?: string;
    created_via?: string;
  }): Promise<Appointment> {
    return Appointment.create(data as any);
  }

  async findById(id: string): Promise<Appointment | null> {
    return Appointment.findByPk(id, { include: [{ association: 'customer', attributes: ['name', 'phone'] }] });
  }

  async findActiveByCustomer(params: {
    customer_id: string;
    user_id: string;
    status?: string;
  }): Promise<Appointment[]> {
    // Include appointments from last 24h onwards (not just future)
    const since = new Date();
    since.setHours(since.getHours() - 24);

    return Appointment.findAll({
      where: {
        customer_id: params.customer_id,
        user_id: params.user_id,
        status: params.status || 'confirmed',
        start_at: { [Op.gte]: since },
      },
      order: [['start_at', 'ASC']],
      include: [{ association: 'customer', attributes: ['name', 'phone'] }],
    });
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await Appointment.update({ status }, { where: { id } });
  }

  async findByUser(userId: string, params?: {
    status?: string;
    from?: Date;
    to?: Date;
  }): Promise<Appointment[]> {
    const where: any = { user_id: userId };
    if (params?.status) where.status = params.status;
    if (params?.from || params?.to) {
      where.start_at = {};
      if (params.from) where.start_at[Op.gte] = params.from;
      if (params.to) where.start_at[Op.lte] = params.to;
    }
    return Appointment.findAll({
      where,
      order: [['start_at', 'ASC']],
      include: [{ association: 'customer', attributes: ['name', 'phone', 'email'] }],
    });
  }
}

export const appointmentService = new AppointmentService();
