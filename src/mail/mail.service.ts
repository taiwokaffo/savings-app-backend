import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly fromAddress: string;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('MAIL_HOST');
    const port = this.configService.get<string>('MAIL_PORT');
    const user = this.configService.get<string>('MAIL_USER');
    const pass = this.configService.get<string>('MAIL_PASS');

    this.fromAddress =
      this.configService.get<string>('MAIL_FROM') ||
      'Savings App <no-reply@savings-app.local>';

    if (host && port) {
      this.isConfigured = true;
      this.transporter = nodemailer.createTransport({
        host,
        port: parseInt(port, 10),
        secure: this.configService.get<string>('MAIL_SECURE') === 'true',
        auth: user && pass ? { user, pass } : undefined,
      });
    } else {
      this.isConfigured = false;
      this.logger.warn(
        'MAIL_HOST/MAIL_PORT are not set. Emails will be logged to the ' +
          'console instead of actually being sent. Configure SMTP in .env ' +
          'to send real emails.',
      );
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const appUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:3000',
    );
    const verifyLink = `${appUrl}/api/auth/verify-email?token=${token}`;

    const subject = 'Confirm your email address';
    const text =
      `Welcome! Please confirm your email address by visiting the link ` +
      `below (valid for 24 hours):\n\n${verifyLink}\n\n` +
      `If you didn't create this account, you can ignore this email.`;

    await this.send(to, subject, text);
  }

  private async send(to: string, subject: string, text: string) {
    if (!this.isConfigured || !this.transporter) {
      this.logger.log(
        `[dev-mode email] To: ${to} | Subject: ${subject}\n${text}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        text,
      });
    } catch (err) {
      // Never let a mail-delivery failure break registration/resend flows;
      // log it and let the caller decide how to inform the user.
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
    }
  }
}
