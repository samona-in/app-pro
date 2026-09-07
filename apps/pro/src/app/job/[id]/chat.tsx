import { useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { openURL } from 'expo-linking';
import { ChatFooter, MessageBubble } from '@/components/chat';
import { EmptyState, LoadingState } from '@/components/feedback';
import { IconButton } from '@/components/ui';
import { useMessages, useProJobs, useSession } from '@/hooks';
import { color } from '@/theme';

function ChatHeaderRight({ phone }: { phone: string | null | undefined }) {
  if (!phone) return null;
  return (
    <IconButton
      name="call"
      size={20}
      tint={color.brand}
      accessibilityLabel="Call customer"
      onPress={() => {
        void openURL(`tel:${phone}`).catch(() => {
          Alert.alert('Could not start the call', 'No app on this device can place calls.');
        });
      }}
    />
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
 * messages pin to the bottom. Pro-only: quick-reply chips above the composer.
 */
export default function JobChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chat = useMessages(id);
  const { data: jobs } = useProJobs();
  const { user } = useSession();

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
          headerRight: () => <ChatHeaderRight phone={phone} />,
        }}
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={reversed}
          inverted
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble message={item} isMine={item.senderId === user?.id} />
          )}
          contentContainerClassName="px-4 py-3"
          keyboardShouldPersistTaps="handled"
          onEndReached={() => void chat.loadOlder()}
          onEndReachedThreshold={0.4}
          ListHeaderComponent={
            chat.isLoadingOlder ? (
              <View className="items-center py-3">
                <ActivityIndicator size="small" color={color['text-muted']} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              icon="chatbubble-ellipses-outline"
              title="No messages yet"
              message={`Say hello to ${customerName} to get the job started.`}
            />
          }
        />

        <ChatFooter onSend={(content) => chat.send(content)} quickReplies disabled={!id} />
      </KeyboardAvoidingView>
    </View>
  );
}