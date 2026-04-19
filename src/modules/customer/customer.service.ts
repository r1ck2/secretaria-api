import { Customer } from './customer.entity';
import { Op } from 'sequelize';

export class CustomerService {
  async findByPhone(phone: string, userId?: string): Promise<Customer | null> {
    const where: any = { phone };
    if (userId) where.user_id = userId;
    return Customer.findOne({ where });
  }

  async create(data: {
    name: string;
    phone: string;
    email?: string | null;
    document?: string | null;
    user_id: string;
    created_via?: string;
  }): Promise<Customer> {
    return Customer.create(data as any);
  }

  async findById(id: string): Promise<Customer | null> {
    return Customer.findByPk(id);
  }
}

export const customerService = new CustomerService();
