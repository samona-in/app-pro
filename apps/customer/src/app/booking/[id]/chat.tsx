import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { openURL } from 'expo-linking';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { isChatClosed, type ChatMessage } from '@samona/types';
import {
  ChatFooter,
  ConversationClosed,
  MessageBubble,
  QuickChatPresets,
} from '@/components/chat';
import { LoadingState } from '@/components/feedback';
import { useBooking, useMessages, useSession } from '@/hooks';
import { color } from '@/theme';

/**
 * The Customer's "call professional" control in the native header, styled like
 * the contact button on the booking details screen: a circular muted surface
 * with the icon tinted brand.
 */
function ChatHeaderRight({ phone, label }: { phone: string | null | undefined; label: string }) {
  if (!phone) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Call ${label}`}
      onPress={() => {
        void openURL(`tel:${phone}`).catch(() => {
          Alert.alert('Could not start the call', 'No app on this device can place calls.');
        });
      }}
      className="h-11 w-11 items-center justify-center rounded-full bg-surface-muted active:opacity-70"
    >
      <Ionicons name="call" size={22} color={color.brand} />
    </Pressable>
  );
}

/**
 * The job thread between a customer and the professional on their booking.
 *
 * Messages stream in three ways into one cache: REST for history, the realtime
 * `message:new` event for live delivery, and the optimistic placeholder while a
 * send is in flight (clawed back on error). Receipt ticks advance via the
 * `message:delivered` / `message:read` events the server broadcasts to both
 * parties. The thread is rendered oldest-first through an inverted list, so new
 * messages pin to the bottom. Messaging needs an assigned professional — until
 * one accepts, the composer stays disabled. Quick-reply phrases list vertically
 * at the bottom of the thread body, dropping a phrase into the composer.
 */
export default function BookingChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chat = useMessages(id);
  const { data: job, isPending: bookingPending } = useBooking(id);
  const { user } = useSession();
  const [draft, setDraft] = useState('');

  const proName = useMemo(() => job?.pro?.displayName ?? 'Professional', [job]);
  const phone = job?.pro?.phone;
  // Once the job is paid, cancelled or expired the conversation is frozen —
  // history stays readable but nobody can send (the server enforces the same).
  const closed = job ? isChatClosed(job.status) : false;

  // Mine vs theirs is decided by the surface's role, not by id — the same
  // account can be both sides of a job (same phone on two apps), and then the
  // customer and pro share one userId.
  const isMine = (item: ChatMessage) =>
    item.senderRole ? item.senderRole === user?.role : item.senderId === user?.id;

  const reversed = useMemo(() => [...chat.messages].reverse(), [chat.messages]);

  if (bookingPending || chat.isPending) {
    return (
      <View className="flex-1 bg-surface">
        <LoadingState message="Loading messages" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface">
      <Stack.Screen
        options={{
          title: proName,
          headerBackTitle: 'Back',
          headerLargeTitle: false,
          headerTitleStyle: { fontSize: 16, color: color['text-primary'] },
          headerRight: () => <ChatHeaderRight phone={phone} label={proName} />,
        }}
      />

      <KeyboardStickyView style={{ flex: 1 }}>
        <FlatList
          data={reversed}
          inverted
          style={{ flex: 1 }}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} isMine={isMine(item)} />}
          contentContainerClassName="px-4 py-3"
          keyboardShouldPersistTaps="handled"
          onEndReached={() => void chat.loadOlder()}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            <>
              {chat.isLoadingOlder ? (
                <View className="items-center py-3">
                  <ActivityIndicator size="small" color={color['text-muted']} />
                </View>
              ) : null}
              {!closed ? <QuickChatPresets onSelect={setDraft} /> : null}
            </>
          }
        />

        {closed ? (
          <ConversationClosed />
        ) : (
          <ChatFooter
            draft={draft}
            onChangeDraft={setDraft}
            onSend={(content) => chat.send(content)}
            disabled={!id || !job?.pro}
          />
        )}
      </KeyboardStickyView>
    </View>
  );
}
