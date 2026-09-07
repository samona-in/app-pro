import { useMemo } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { openURL } from 'expo-linking';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ChatFooter, MessageBubble } from '@/components/chat';
import { EmptyState, LoadingState } from '@/components/feedback';
import { useBooking, useMessages, useSession } from '@/hooks';
import { color } from '@/theme';

/**
 * The Customer's "call professional" control in the native header, styled like
 * the contact button on the booking details screen: a circular muted surface
 * with the icon tinted brand.
 */
function ChatHeaderRight({
  phone,
  label,
}: {
  phone: string | null | undefined;
  label: string;
}) {
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
 * one accepts, the thread is a placeholder.
 */
export default function BookingChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const chat = useMessages(id);
  const { data: job, isPending: bookingPending } = useBooking(id);
  const { user } = useSession();

  const proName = useMemo(() => job?.pro?.displayName ?? 'Professional', [job]);
  const phone = job?.pro?.phone;

  const reversed = useMemo(() => [...chat.messages].reverse(), [chat.messages]);

  if (bookingPending || chat.isPending) {
    return (
      <View className="flex-1 bg-surface">
        <LoadingState message="Loading messages" />
      </View>
    );
  }

  if (!job) {
    return (
      <View className="flex-1 bg-surface">
        <EmptyState
          icon="chatbubble-ellipses-outline"
          title="No conversation yet"
          message="Messages will appear here once your booking is active."
        />
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

      <KeyboardAvoidingView behavior="translate-with-padding" style={{ flex: 1 }}>
        {job.pro ? (
          <>
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
                  message={`Say hello to ${proName}.`}
                />
              }
            />

            <ChatFooter onSend={(content) => chat.send(content)} disabled={!id} />
          </>
        ) : (
          <View className="flex-1 justify-center">
            <EmptyState
              icon="people-outline"
              title="Waiting for a professional"
              message="You can chat with them the moment your booking is accepted."
            />
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}