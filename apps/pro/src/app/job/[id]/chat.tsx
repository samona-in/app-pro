import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { openURL } from 'expo-linking';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { ChatFooter, MessageBubble, QuickChatPresets } from '@/components/chat';
import { EmptyState, LoadingState } from '@/components/feedback';
import { useMessages, useProJobs, useSession } from '@/hooks';
import { color } from '@/theme';

/**
 * The Pro's "call customer" control in the native header, styled like the
 * contact button on the job details screen: a circular muted surface with the
 * icon tinted brand.
 */
function ChatHeaderRight({ phone }: { phone: string | null | undefined }) {
  if (!phone) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Call customer"
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
 * The job thread between a pro and the customer on their assigned job.
 *
 * Messages stream in three ways into one cache: REST for history, the realtime
 * `message:new` event for live delivery, and the optimistic placeholder while a
 * send is in flight (clawed back on error). Receipt ticks advance via the
 * `message:delivered` / `message:read` events the server broadcasts to both
 * parties. The thread is rendered oldest-first through an inverted list, so new
 * messages pin to the bottom. Pro-only: quick-reply phrases list vertically at
 * the bottom of the thread body, dropping a phrase into the composer.
 */
export default function JobChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chat = useMessages(id);
  const { data: jobs } = useProJobs();
  const { user } = useSession();
  const [draft, setDraft] = useState('');

  const job = useMemo(() => (jobs ?? []).find((item) => item.id === id), [id, jobs]);
  const customerName = job?.customer?.displayName ?? 'Customer';
  const phone = job?.customer?.phone;

  // The thread is cached oldest-first; an inverted list needs newest first so
  // item 0 sits at the bottom and new arrivals pin in view.
  const reversed = useMemo(() => [...chat.messages].reverse(), [chat.messages]);

  if (chat.isPending) {
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
          title: customerName,
          headerBackTitle: 'Back',
          headerLargeTitle: false,
          headerTitleStyle: { fontSize: 16, color: color['text-primary'] },
          headerRight: () => <ChatHeaderRight phone={phone} />,
        }}
      />

      <FlatList
        data={reversed}
        inverted
        style={{ flex: 1 }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble message={item} isMine={item.senderId === user?.id} />
        )}
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
            <QuickChatPresets onSelect={setDraft} />
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubble-ellipses-outline"
            title="No messages yet"
            message={`Say hello to ${customerName} to get the job started.`}
          />
        }
      />

      <KeyboardStickyView>
        <ChatFooter
          draft={draft}
          onChangeDraft={setDraft}
          onSend={(content) => chat.send(content)}
          disabled={!id}
        />
      </KeyboardStickyView>
    </View>
  );
}