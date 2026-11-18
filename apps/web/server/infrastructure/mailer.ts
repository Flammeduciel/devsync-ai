import 'server-only';
import nodemailer from 'nodemailer';
import type { Mailer, MailMessage } from '../services/ports';
import { serverEnv } from '../env';
import { logger } from './logger';

class SmtpMailer implements Mailer {
  private readonly transport = (() => {
    const env = serverEnv();
    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? '' } } : {}),
    });
  })();

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: serverEnv().EMAIL_FROM, ...message });
    logger.info({ to: message.to, subject: message.subject }, 'email sent');
  }
}

const globalForMailer = globalThis as unknown as { __devsyncMailer?: Mailer };

export function mailer(): Mailer {
  globalForMailer.__devsyncMailer ??= new SmtpMailer();
  return globalForMailer.__devsyncMailer;
}
