import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, MessagePage, MessageReceiptUpdate } from '@samona/types';
import { queryKeys } from '@/constants';
import { messagesApi } from '@/services/messages';
import { subscribe } from '@/services/realtime';
import { useSession } from './use-session';

const LIST_LIMIT = 50;

function newLocalId(): string {
  return `local:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * One job thread, from the customer's side.
 *
 * The cache holds the thread oldest → newest with `nextCursor` pointing at the
 * next older page; the list renders it reversed through an inverted FlatList so
 * the newest message pins to the bottom.
 *
 * Live delivery sits on top of REST: `message:new` appends the pro's message,
 * while `message:delivered` / `message:read` advance the receipt ticks on the
 * customer's own sent messages. Sends are optimistic — a local placeholder with
 * a clock icon is replaced by the server's copy on success (or dropped on error).
 *
 * Receipts are acknowledged opportunistically: opening the chat reads the
 * thread. The server dedupes, so repeated acks are no-ops.
 */
export function useMessages(jobId: string) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const threadKey = useMemo(() => queryKeys.messages.thread(jobId), [jobId]);
  const selfId = user?.id;

  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const query = useQuery({
    queryKey: threadKey,
    queryFn: () => messagesApi.list(jobId, { limit: LIST_LIMIT }),
    enabled: Boolean(jobId && selfId),
    staleTime: 30_000,
  });

  const applyIncoming = useCallback(
    (message: ChatMessage) => {
      if (message.senderId === selfId) return;
      queryClient.setQueryData<MessagePage>(threadKey, (old) => {
        if (!old || old.messages.some((m) => m.id === message.id)) return old;
        return { ...old, messages: [...old.messages, message] };
      });
    },
    [queryClient, selfId, threadKey],
  );

  const applyReceipts = useCallback(
    (kind: 'delivered' | 'read', update: MessageReceiptUpdate) => {
      if (update.jobId !== jobId || update.messageIds.length === 0) return;
      const now = new Date().toISOString();
      const ids = new Set(update.messageIds);
      queryClient.setQueryData<MessagePage>(threadKey, (old) => {
        if (!old) return old;
        const messages = old.messages.map((m) => {
          if (!ids.has(m.id)) return m;
          return kind === 'read'
            ? { ...m, deliveredAt: m.deliveredAt ?? now, readAt: now }
            : { ...m, deliveredAt: m.deliveredAt ?? now };
        });
        return { ...old, messages };
      });
    },
    [jobId, queryClient, threadKey],
  );

  useEffect(() => {
    const offs = [
      subscribe('message:new', applyIncoming),
      subscribe('message:delivered', (update) => applyReceipts('delivered', update)),
      subscribe('message:read', (update) => applyReceipts('read', update)),
    ];
    return () => {
      for (const off of offs) off();
    };
  }, [applyIncoming, applyReceipts]);

  // Receipt acks: opening the chat reads the thread. The server echoes its own
  // receipt event, which advances the ticks locally; `pendingAck` collapses
  // identical acks while we wait for that echo.
  const pendingAck = useRef('');
  useEffect(() => {
    if (!selfId || query.isPending || !jobId) return;
    const messages = query.data?.messages ?? [];
    const unackedDelivered = messages
      .filter((m) => m.senderId !== selfId && !m.deliveredAt)
      .map((m) => m.id);
    const unackedRead = messages
      .filter((m) => m.senderId !== selfId && !m.readAt)
      .map((m) => m.id);
    if (unackedDelivered.length === 0 && unackedRead.length === 0) {
      pendingAck.current = '';
      return;
    }
    const ackKey = JSON.stringify([unackedDelivered, unackedRead]);
    if (pendingAck.current === ackKey) return;
    pendingAck.current = ackKey;
    if (unackedDelivered.length > 0) void messagesApi.markDelivered(jobId).catch(() => {});
    if (unackedRead.length > 0) void messagesApi.markRead(jobId).catch(() => {});
  }, [query.data, query.isPending, selfId, jobId]);

  const loadOlder = useCallback(async () => {
    if (isLoadingOlder || !query.data?.nextCursor) return;
    setIsLoadingOlder(true);
    try {
      const page = await messagesApi.list(jobId, { limit: LIST_LIMIT, before: query.data.nextCursor });
      queryClient.setQueryData<MessagePage>(threadKey, (old) =>
        old ? { messages: [...page.messages, ...old.messages], nextCursor: page.nextCursor } : page,
      );
    } finally {
      setIsLoadingOlder(false);
    }
  }, [isLoadingOlder, jobId, query.data?.nextCursor, queryClient, threadKey]);

  const send = useMutation({
    mutationFn: (content: string) => messagesApi.send({ jobId, content }),
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: threadKey });
      const prev = queryClient.getQueryData<MessagePage>(threadKey);
      const localId = newLocalId();
      const placeholder: ChatMessage = {
        id: localId,
        jobId,
        senderId: selfId ?? '',
        content,
        sentAt: new Date().toISOString(),
        deliveredAt: null,
        readAt: null,
      };
      queryClient.setQueryData<MessagePage>(threadKey, (old) =>
        old
          ? { messages: [...old.messages, placeholder], nextCursor: old.nextCursor }
          : { messages: [placeholder], nextCursor: null },
      );
      return { prev, localId };
    },
    onSuccess: (saved, _content, ctx) => {
      if (!ctx) return;
      queryClient.setQueryData<MessagePage>(threadKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.map((m) => (m.id === ctx.localId ? saved : m)),
        };
      });
    },
    onError: (_error, _content, ctx) => {
      if (!ctx) return;
      queryClient.setQueryData<MessagePage>(threadKey, (old) =>
        old
          ? { messages: old.messages.filter((m) => m.id !== ctx.localId), nextCursor: old.nextCursor }
          : old,
      );
    },
  });

  return {
    messages: query.data?.messages ?? [],
    isPending: query.isPending,
    hasMore: Boolean(query.data?.nextCursor),
    isLoadingOlder,
    loadOlder,
    send: (content: string) => send.mutateAsync(content),
    isSending: send.isPending,
    selfId,
  };
}