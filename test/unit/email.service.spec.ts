/**
 * TD-008 — service d'envoi d'emails transactionnels.
 *
 * Couvre le contrat vis-à-vis du fournisseur (payload, pièces jointes,
 * erreurs) et la lecture de l'identité d'expédition dans les settings.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isEmailConfigured,
  getEmailSender,
  sendEmail,
  escapeHtml,
} from '@/server/services/email.service';

const SENDER = {
  fromName: 'ALVM',
  fromEmail: 'noreply@alvm.nc',
  replyTo: 'contact@alvm.nc',
};

function makePrisma(rows: Array<{ key: string; value: string | null }>) {
  return {
    appSetting: {
      findMany: vi.fn().mockResolvedValue(rows),
    },
  };
}

describe('email.service (TD-008)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.RESEND_API_KEY = 'resend_test_key';
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'email_123' }),
      text: async () => '',
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
  });

  describe('isEmailConfigured', () => {
    it('reflects the presence of the provider key', () => {
      expect(isEmailConfigured()).toBe(true);

      delete process.env.RESEND_API_KEY;
      expect(isEmailConfigured()).toBe(false);
    });
  });

  describe('getEmailSender', () => {
    it('reads the sender identity from the email settings', async () => {
      const prisma = makePrisma([
        { key: 'from_name', value: '"Association ALVM"' },
        { key: 'from_email', value: '"facturation@alvm.nc"' },
        { key: 'reply_to', value: '"contact@alvm.nc"' },
      ]);

      await expect(getEmailSender(prisma)).resolves.toEqual({
        fromName: 'Association ALVM',
        fromEmail: 'facturation@alvm.nc',
        replyTo: 'contact@alvm.nc',
      });
      expect(prisma.appSetting.findMany).toHaveBeenCalledWith({
        where: { category: 'email' },
        select: { key: true, value: true },
      });
    });

    it('falls back to the seeded defaults when settings are empty', async () => {
      await expect(getEmailSender(makePrisma([]))).resolves.toEqual({
        fromName: 'ALVM',
        fromEmail: 'noreply@alvm.nc',
        replyTo: undefined,
      });
    });

    it('accepts legacy values stored without JSON quotes', async () => {
      const sender = await getEmailSender(
        makePrisma([{ key: 'from_email', value: 'facturation@alvm.nc' }]),
      );

      expect(sender.fromEmail).toBe('facturation@alvm.nc');
    });
  });

  describe('sendEmail', () => {
    it('posts a well-formed payload to the provider', async () => {
      const result = await sendEmail(
        { to: 'parent@example.nc', subject: 'Votre facture', html: '<p>Bonjour</p>' },
        SENDER,
      );

      expect(result).toEqual({ id: 'email_123' });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('https://api.resend.com/emails');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer resend_test_key');

      const payload = JSON.parse(init.body);
      expect(payload).toMatchObject({
        from: 'ALVM <noreply@alvm.nc>',
        to: ['parent@example.nc'],
        reply_to: 'contact@alvm.nc',
        subject: 'Votre facture',
        html: '<p>Bonjour</p>',
      });
      expect(payload).not.toHaveProperty('attachments');
    });

    it('encodes attachments in base64', async () => {
      await sendEmail(
        {
          to: 'parent@example.nc',
          subject: 'Votre facture',
          html: '<p>Bonjour</p>',
          attachments: [
            { filename: 'facture-FAC-2026-0001.pdf', content: Buffer.from('%PDF-1.7') },
          ],
        },
        SENDER,
      );

      const payload = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(payload.attachments).toEqual([
        {
          filename: 'facture-FAC-2026-0001.pdf',
          content: Buffer.from('%PDF-1.7').toString('base64'),
        },
      ]);
    });

    it('omits reply_to when no reply address is configured', async () => {
      await sendEmail(
        { to: 'parent@example.nc', subject: 'Sujet', html: '<p>Corps</p>' },
        { fromName: 'ALVM', fromEmail: 'noreply@alvm.nc' },
      );

      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).not.toHaveProperty('reply_to');
    });

    it('fails explicitly when the provider key is missing', async () => {
      delete process.env.RESEND_API_KEY;

      await expect(
        sendEmail({ to: 'parent@example.nc', subject: 'S', html: '<p>C</p>' }, SENDER),
      ).rejects.toThrow('RESEND_API_KEY');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports the provider error status and body', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => 'domain is not verified',
        json: async () => ({}),
      });

      await expect(
        sendEmail({ to: 'parent@example.nc', subject: 'S', html: '<p>C</p>' }, SENDER),
      ).rejects.toThrow(/422.*domain is not verified/s);
    });
  });

  describe('escapeHtml', () => {
    it('neutralises markup coming from stored data', () => {
      expect(escapeHtml('Dupont & <b>Fils</b>')).toBe(
        'Dupont &amp; &lt;b&gt;Fils&lt;/b&gt;',
      );
    });
  });
});
