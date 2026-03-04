import type {
  XMPTMessage,
  XMPTPeer,
  XMPTDeliveryResult,
  XMPTSendOptions,
  XMPTContent,
} from '../types/index.js';

/**
 * Resolves the base URL from a peer reference.
 */
export function resolvePeerUrl(peer: XMPTPeer): string {
  if ('url' in peer) {
    return peer.url;
  }
  if ('card' in peer && peer.card.url) {
    return peer.card.url;
  }
  throw new Error(
    'XMPT_PEER_NO_URL: Cannot resolve URL from peer — provide { url } or { card: { url } }'
  );
}

/**
 * Sends an XMPT message to a remote peer using the agentm (A2A task) transport.
 *
 * Builds a POST /tasks request in A2A format with the XMPT envelope embedded
 * in the message content. Returns a delivery result immediately.
 */
export async function sendViaAgentm(
  peer: XMPTPeer,
  message: XMPTMessage,
  options?: XMPTSendOptions,
  fetchImpl?: typeof fetch
): Promise<XMPTDeliveryResult> {
  const baseUrl = resolvePeerUrl(peer);
  const fetchFn = fetchImpl ?? globalThis.fetch;

  const inboxKey = options?.metadata?.inboxKey ?? 'xmpt-inbox';

  const body = {
    message: {
      role: 'user',
      content: {
        text: JSON.stringify(message),
        mime: 'application/json+xmpt',
      },
    },
    skillId: inboxKey,
    contextId: message.threadId,
    metadata: {
      xmpt: true,
      messageId: message.id,
      ...options?.metadata,
    },
  };

  const response = await fetchFn(`${baseUrl}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: options?.timeoutMs
      ? AbortSignal.timeout(options.timeoutMs)
      : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `XMPT_SEND_FAILED: ${response.status} ${response.statusText}${text ? ': ' + text : ''}`
    );
  }

  const result = (await response.json()) as {
    taskId?: string;
    status?: string;
  };

  return {
    taskId: result.taskId ?? 'unknown',
    status: result.status ?? 'submitted',
    messageId: message.id,
  };
}

/**
 * Sends an XMPT message via direct HTTP POST to the peer's inbox endpoint.
 * Simpler than agentm — posts the XMPT envelope directly.
 */
export async function sendViaHttp(
  peer: XMPTPeer,
  message: XMPTMessage,
  inboxKey: string,
  options?: XMPTSendOptions,
  fetchImpl?: typeof fetch
): Promise<XMPTDeliveryResult> {
  const baseUrl = resolvePeerUrl(peer);
  const fetchFn = fetchImpl ?? globalThis.fetch;

  const response = await fetchFn(`${baseUrl}/xmpt/inbox`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-XMPT-Inbox-Key': inboxKey,
    },
    body: JSON.stringify(message),
    signal: options?.timeoutMs
      ? AbortSignal.timeout(options.timeoutMs)
      : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `XMPT_SEND_FAILED: ${response.status} ${response.statusText}${text ? ': ' + text : ''}`
    );
  }

  const result = (await response.json()) as {
    taskId?: string;
    messageId?: string;
    status?: string;
  };

  return {
    taskId: result.taskId ?? `http-${message.id}`,
    status: result.status ?? 'delivered',
    messageId: message.id,
  };
}

/**
 * Polls a task until it completes or times out.
 * Used by sendAndWait when transport = agentm.
 */
export async function pollTaskUntilComplete(
  baseUrl: string,
  taskId: string,
  timeoutMs = 30_000,
  fetchImpl?: typeof fetch
): Promise<{ status: string; output?: XMPTContent }> {
  const fetchFn = fetchImpl ?? globalThis.fetch;
  const deadline = Date.now() + timeoutMs;
  const pollIntervalMs = 200;

  while (Date.now() < deadline) {
    const response = await fetchFn(`${baseUrl}/tasks/${taskId}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `XMPT_POLL_FAILED: task/${taskId} returned ${response.status}`
      );
    }

    const task = (await response.json()) as {
      status: string;
      result?: { output?: unknown };
      error?: { message?: string };
    };

    if (task.status === 'completed') {
      // Try to extract reply from output
      const output = task.result?.output;
      let reply: XMPTContent | undefined;
      if (output && typeof output === 'object') {
        const o = output as Record<string, unknown>;
        if (o.content && typeof o.content === 'object') {
          reply = o.content as XMPTContent;
        } else if (o.text !== undefined || o.data !== undefined) {
          reply = o as XMPTContent;
        }
      }
      return { status: 'completed', output: reply };
    }

    if (task.status === 'failed') {
      throw new Error(
        `XMPT_TASK_FAILED: ${task.error?.message ?? 'task failed'}`
      );
    }

    if (task.status === 'cancelled') {
      throw new Error('XMPT_TASK_CANCELLED: task was cancelled');
    }

    await new Promise(res => setTimeout(res, pollIntervalMs));
  }

  throw new Error(
    `XMPT_TIMEOUT: sendAndWait timed out after ${timeoutMs}ms for task ${taskId}`
  );
}
