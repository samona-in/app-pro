import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Text } from '@/components/ui';
import { proDisplayName } from '@/components/booking/active-job-copy';
import { color } from '@/theme';
import { formatPhoneForCall } from '@/utils/phone';
import { openURL } from 'expo-linking';
import { Alert } from 'react-native';
import type { JobDetail } from '@samona/types';
import { useUnreadMessages } from '@/hooks';
import { UnreadBadge } from '@/components/chat';

type Props = {
  job: JobDetail;
};

export function ProfessionalCard({ job }: Props) {
  const unread = useUnreadMessages();
  const pro = job.pro;

  if (!pro || pro.isDeleted) {
    return (
      <View className="mx-5 mb-4 flex-row items-center rounded-2xl border border-border bg-surface p-4">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
          <Ionicons name="person-outline" size={22} color={color['text-secondary']} />
        </View>
        <View className="ml-3 flex-1">
          <Text variant="bodyStrong">Looking for a professional</Text>
          <Text variant="footnote" className="text-text-secondary">
            We'll notify you when someone accepts
          </Text>
        </View>
      </View>
    );
  }

  const callPro = () => {
    const formatted = formatPhoneForCall(pro.phone);
    if (!formatted) return;
    void openURL(`tel:${formatted}`).catch(() => {
      Alert.alert('Could not start the call', 'No app on this device can place calls.');
    });
  };

  const messagePro = () => {
    router.push({ pathname: '/booking/[id]/chat', params: { id: job.id } });
  };

  return (
    <View>
      <View className="h-px bg-border w-full" />
      <View className="flex-row items-center px-5 py-3">
        <Avatar name={proDisplayName(pro)} uri={pro.photoUrl} size="md" />
        <View className="ml-3 flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {proDisplayName(pro)}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1">
            {pro.rating !== null ? (
              <>
                <Ionicons name="star" size={14} color="#F59E0B" />
                <Text variant="footnote">{pro.rating.toFixed(1)}</Text>
              </>
            ) : (
              <Text variant="footnote" className="text-text-muted">
                Professional on this job
              </Text>
            )}
          </View>
        </View>
        <Pressable
          onPress={messagePro}
          className="mr-3 items-center"
          accessibilityRole="button"
          accessibilityLabel="Message professional"
        >
          <View className="relative h-10 w-10 items-center justify-center">
            <Ionicons name="chatbubble-ellipses-outline" size={22} color={color['text-primary']} />
            <UnreadBadge count={unread.countFor(job.id)} className="absolute -right-1 -top-1" />
          </View>
          <Text variant="caption" className="mt-0.5 text-text-primary">
            Chat
          </Text>
        </Pressable>
        {pro.phone ? (
          <Pressable
            onPress={callPro}
            className="items-center"
            accessibilityRole="button"
            accessibilityLabel="Call professional"
          >
            <View className="h-10 w-10 items-center justify-center">
              <Ionicons name="call" size={22} color={color['text-primary']} />
            </View>
            <Text variant="caption" className="text-text-primary">
              Call
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View className="h-px bg-border w-full" />
    </View>
  );
}
