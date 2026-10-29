import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

@Injectable()
export class AdminAuthProvider {
  private client?: SupabaseClient;
  private privileged() {
    if (
      process.env.ADMIN_ACCOUNT_INVITES_ENABLED !== 'true' ||
      !process.env.SUPABASE_URL ||
      !process.env.SUPABASE_SECRET_KEY
    )
      throw new ServiceUnavailableException({
        code: 'ADMIN_INVITES_NOT_CONFIGURED',
        detail:
          'Invite belum aktif. Operator perlu memverifikasi konfigurasi email dan Auth server.',
      });
    return (this.client ??= createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    ));
  }
  async invite(email: string, operationId: string): Promise<User> {
    const origin = process.env.ADMIN_AUTH_REDIRECT_ORIGIN;
    if (
      !origin ||
      !/^https?:\/\/[^/]+$/.test(origin) ||
      (process.env.NODE_ENV === 'production' && !origin.startsWith('https://'))
    )
      throw new ServiceUnavailableException({
        code: 'ADMIN_INVITES_NOT_CONFIGURED',
        detail: 'Origin callback invite belum dikonfigurasi.',
      });
    const client = this.privileged();
    // Reconcile a previous ambiguous send only against the same server-reserved operation.
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
      if (error)
        throw new ServiceUnavailableException({
          code: 'ADMIN_AUTH_UNAVAILABLE',
          detail: 'Provider Auth belum dapat diperiksa.',
        });
      const user = data.users.find((u) => u.email?.toLowerCase() === email);
      if (user) {
        if (!user.invited_at || user.user_metadata.numoraInvitationId !== operationId)
          throw new ServiceUnavailableException({
            code: 'ADMIN_AUTH_IDENTITY_CONFLICT',
            detail: 'Identitas Auth sudah ada dan tidak berasal dari operasi invite ini.',
          });
        return user;
      }
      if (data.users.length < 1000) break;
      if (page === 100)
        throw new ServiceUnavailableException({
          code: 'ADMIN_AUTH_LOOKUP_LIMIT',
          detail: 'Pencarian Auth perlu rekonsiliasi operator.',
        });
    }
    const { data, error } = await client.auth.admin.inviteUserByEmail(email, {
      redirectTo: origin + '/admin/auth/confirm',
      data: { numoraInvitationId: operationId },
    });
    if (error || !data.user)
      throw new ServiceUnavailableException({
        code: 'ADMIN_INVITE_DELIVERY_UNCONFIRMED',
        detail:
          'Pengiriman invite belum terkonfirmasi. Periksa status dan retry operasi yang sama.',
      });
    return data.user;
  }
  async recover(email: string) {
    const origin = process.env.ADMIN_AUTH_REDIRECT_ORIGIN;
    if (
      !origin ||
      !/^https?:\/\/[^/]+$/.test(origin) ||
      (process.env.NODE_ENV === 'production' && !origin.startsWith('https://'))
    )
      throw new ServiceUnavailableException({
        code: 'ADMIN_INVITES_NOT_CONFIGURED',
        detail: 'Origin recovery belum dikonfigurasi.',
      });
    const { error } = await this.privileged().auth.resetPasswordForEmail(email, {
      redirectTo: origin + '/admin/auth/confirm?type=recovery',
    });
    if (error)
      throw new ServiceUnavailableException({
        code: 'ADMIN_RECOVERY_DELIVERY_UNCONFIRMED',
        detail: 'Pengiriman recovery belum terkonfirmasi.',
      });
  }
}
