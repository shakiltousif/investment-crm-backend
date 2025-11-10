import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../middleware/errorHandler';

export interface SupportSettingsInput {
  key: string;
  value: string;
  label?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export interface UpdateSupportSettingsInput {
  value?: string;
  label?: string;
  displayOrder?: number;
  isActive?: boolean;
}

export class SupportService {
  /**
   * Get all active support settings
   */
  async getSupportSettings(): Promise<
    Array<{
      key: string;
      value: string;
      label: string | null;
      displayOrder: number;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const settings = await prisma.supportSettings.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });

    return settings;
  }

  /**
   * Get all support settings (including inactive) - Admin only
   */
  async getAllSupportSettings(): Promise<Array<unknown>> {
    const settings = await prisma.supportSettings.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return settings;
  }

  /**
   * Get a specific support setting by key
   */
  async getSupportSettingByKey(key: string): Promise<unknown> {
    const setting = await prisma.supportSettings.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundError(`Support setting with key "${key}" not found`);
    }

    return setting;
  }

  /**
   * Create a new support setting - Admin only
   */
  async createSupportSetting(data: SupportSettingsInput): Promise<unknown> {
    // Check if key already exists
    const existing = await prisma.supportSettings.findUnique({
      where: { key: data.key },
    });

    if (existing) {
      throw new ValidationError(`Support setting with key "${data.key}" already exists`);
    }

    const setting = await prisma.supportSettings.create({
      data: {
        key: data.key,
        value: data.value,
        label: data.label ?? data.key,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true,
      },
    });

    return setting;
  }

  /**
   * Update a support setting - Admin only
   */
  async updateSupportSetting(key: string, data: UpdateSupportSettingsInput): Promise<unknown> {
    const setting = await prisma.supportSettings.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundError(`Support setting with key "${key}" not found`);
    }

    const updated = await prisma.supportSettings.update({
      where: { key },
      data: {
        value: data.value,
        label: data.label,
        displayOrder: data.displayOrder,
        isActive: data.isActive,
      },
    });

    return updated;
  }

  /**
   * Delete a support setting - Admin only
   */
  async deleteSupportSetting(key: string): Promise<{ message: string }> {
    const setting = await prisma.supportSettings.findUnique({
      where: { key },
    });

    if (!setting) {
      throw new NotFoundError(`Support setting with key "${key}" not found`);
    }

    await prisma.supportSettings.delete({
      where: { key },
    });

    return { message: 'Support setting deleted successfully' };
  }

  /**
   * Get formatted support information for client display
   */
  async getFormattedSupportInfo(): Promise<{
    formatted: Record<string, string>;
    ordered: Array<{ key: string; label: string; value: string }>;
  }> {
    const settings = await this.getSupportSettings();

    // Format as key-value pairs for easy display
    const formatted: Record<string, string> = {};
    const ordered: Array<{ label: string; value: string; key: string }> = [];

    settings.forEach((setting: { key: string; value: string; label: string | null }) => {
      formatted[setting.key] = setting.value;
      ordered.push({
        key: setting.key,
        label: setting.label ?? setting.key,
        value: setting.value,
      });
    });

    return {
      formatted,
      ordered,
    };
  }
}

export const supportService = new SupportService();
