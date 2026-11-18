import type { DatabaseClient } from '@devsync/database';
import type { EventPublisher } from './events.service';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Outgoing email port (SMTP in infrastructure, in-memory in tests). */
export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface ServiceDeps {
  db: DatabaseClient;
  mailer: Mailer;
  publisher: EventPublisher;
  /** Public base URL of the web app, used in emailed links. */
  appUrl: string;
  now?: () => Date;
}

export const clock = (deps: Pick<ServiceDeps, 'now'>): Date => (deps.now ? deps.now() : new Date());
