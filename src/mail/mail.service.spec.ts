import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  const buildService = async (
    envValues: Record<string, string | undefined>,
  ) => {
    const configService = {
      get: (key: string, defaultValue?: string) =>
        envValues[key] ?? defaultValue,
    } as unknown as ConfigService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    return module.get(MailService);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to logging when MAIL_HOST/MAIL_PORT are not set', async () => {
    const service = await buildService({});
    const logSpy = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation();

    await service.sendVerificationEmail('user@example.com', 'raw-token');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[dev-mode email]'),
    );
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('includes the verification link and token in the dev-mode log', async () => {
    const service = await buildService({ APP_URL: 'http://localhost:3000' });
    const logSpy = jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation();

    await service.sendVerificationEmail('user@example.com', 'raw-token-123');

    const loggedText = logSpy.mock.calls[0][0] as string;
    expect(loggedText).toContain('raw-token-123');
    expect(loggedText).toContain(
      'http://localhost:3000/api/auth/verify-email?token=raw-token-123',
    );
  });

  it('sends via SMTP transporter when MAIL_HOST/MAIL_PORT are configured', async () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const service = await buildService({
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
      MAIL_USER: 'user',
      MAIL_PASS: 'pass',
      MAIL_FROM: 'Savings App <no-reply@example.com>',
      APP_URL: 'http://localhost:3000',
    });

    await service.sendVerificationEmail('user@example.com', 'raw-token');

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'smtp.example.com', port: 587 }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Confirm'),
        text: expect.stringContaining('raw-token'),
      }),
    );
  });

  it('does not throw when SMTP delivery fails, and logs the error instead', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP down'));
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const service = await buildService({
      MAIL_HOST: 'smtp.example.com',
      MAIL_PORT: '587',
    });
    const errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();

    await expect(
      service.sendVerificationEmail('user@example.com', 'raw-token'),
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
  });
});
