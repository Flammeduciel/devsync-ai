import { envelopeSchema, type Envelope } from '@devsync/protocol';
import { eventCatalog, isEventType, type EventPayload, type EventType } from './catalog';

export type TypedEnvelope<T extends EventType = EventType> = {
  [K in T]: Envelope<EventPayload<K>> & { type: K };
}[T];

export type ParseEventResult =
  | { ok: true; event: TypedEnvelope }
  | {
      ok: false;
      code: 'INVALID_ENVELOPE' | 'UNKNOWN_EVENT_TYPE' | 'INVALID_PAYLOAD';
      message: string;
    };

/** Validates the envelope, then the payload against the catalog entry for its type. */
export function parseEvent(raw: unknown): ParseEventResult {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return { ok: false, code: 'INVALID_ENVELOPE', message: envelope.error.message };
  }
  const { type } = envelope.data;
  if (!isEventType(type)) {
    return { ok: false, code: 'UNKNOWN_EVENT_TYPE', message: `Unknown event type "${type}"` };
  }
  const payload = eventCatalog[type].safeParse(envelope.data.payload);
  if (!payload.success) {
    return { ok: false, code: 'INVALID_PAYLOAD', message: payload.error.message };
  }
  return { ok: true, event: { ...envelope.data, type, payload: payload.data } as TypedEnvelope };
}
