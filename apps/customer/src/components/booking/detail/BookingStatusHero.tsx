import { View } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@/components/ui';
import { JobStatus, type JobDetail } from '@samona/types';
import { formatClockTime } from '@/utils/format';

const STATUS_ASSETS: Partial<Record<JobStatus, any>> = {
  [JobStatus.REQUESTED]: require('../../../../assets/images/animations/samona_searching.gif'),
  [JobStatus.OFFERED]: require('../../../../assets/images/animations/samona_searching.gif'),
  [JobStatus.ARRIVED]: require('../../../../assets/images/animations/samona_arrived.gif'),
  [JobStatus.IN_PROGRESS]: require('../../../../assets/images/animations/samona_work_in_progress.gif'),
  [JobStatus.COMPLETED]: require('../../../../assets/images/animations/samona_payment.png'),
  [JobStatus.PAYMENT_PENDING]: require('../../../../assets/images/animations/samona_payment.png'),
  [JobStatus.PAID]: require('../../../../assets/images/animations/samona_complated.png'),
  [JobStatus.CANCELLED]: require('../../../../assets/images/animations/samona_cancelled.png'),
  [JobStatus.EXPIRED]: require('../../../../assets/images/animations/samona_expired.png'),
};

type Props = {
  job: JobDetail;
};

export function BookingStatusHero({ job }: Props) {
  const asset = STATUS_ASSETS[job.status];

  if (job.status === JobStatus.REQUESTED || job.status === JobStatus.OFFERED) {
    return (
      <View className="items-center px-5 py-6">
        {asset ? (
          <Image
            source={asset}
            style={{ width: 200, height: 200 }}
            contentFit="contain"
          />
        ) : null}
        <Text variant="title" className="mt-2 text-center">
          Finding the best professional near you...
        </Text>
        <Text variant="body" className="mt-1 text-center text-text-secondary">
          We're searching for available professionals in your area.
        </Text>
      </View>
    );
  }

  if (job.status === JobStatus.ARRIVED) {
    return (
      <View className="items-center px-5 py-6">
        {asset ? (
          <Image
            source={asset}
            style={{ width: 200, height: 200 }}
            contentFit="contain"
          />
        ) : null}
        <Text variant="title" className="mt-2 text-center">
          Professional has arrived
        </Text>
        <Text variant="body" className="mt-1 text-center text-text-secondary">
          Share your verification code with your professional to start the work.
        </Text>
        {job.verificationOtp ? (
          <View className="mt-4 items-center rounded-2xl bg-brand-soft px-6 py-3">
            <Text
              variant="display"
              className="font-semibold"
              style={{ color: '#054DFF', letterSpacing: 8 }}
            >
              {job.verificationOtp}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (job.status === JobStatus.IN_PROGRESS) {
    return (
      <View className="items-center px-5 py-6">
        {asset ? (
          <Image
            source={asset}
            style={{ width: 200, height: 200 }}
            contentFit="contain"
          />
        ) : null}
        <Text variant="title" className="mt-2 text-center">
          Work in progress
        </Text>
        <Text variant="body" className="mt-1 text-center text-text-secondary">
          Your professional is working on your service.
        </Text>
        {job.acceptedAt ? (
          <Text variant="footnote" className="mt-2 text-text-secondary">
            Started at {formatClockTime(job.acceptedAt)}
          </Text>
        ) : null}
      </View>
    );
  }

  if (job.status === JobStatus.COMPLETED || job.status === JobStatus.PAYMENT_PENDING) {
    return (
      <View className="items-center px-5 py-6">
        {asset ? (
          <Image
            source={asset}
            style={{ width: 200, height: 200 }}
            contentFit="contain"
          />
        ) : null}
        <Text variant="title" className="mt-2 text-center">
          Work completed!
        </Text>
        <Text variant="body" className="mt-1 text-center text-text-secondary">
          Your professional has finished the work. Please complete the payment for this booking.
        </Text>
      </View>
    );
  }

  if (job.status === JobStatus.PAID) {
    return (
      <View className="items-center px-5 py-6">
        {asset ? (
          <Image
            source={asset}
            style={{ width: 200, height: 200 }}
            contentFit="contain"
          />
        ) : null}
        <Text variant="title" className="mt-2 text-center">
          Booking completed!
        </Text>
        <Text variant="body" className="mt-1 text-center text-text-secondary">
          Thank you for choosing SAMONA.
        </Text>
      </View>
    );
  }

  if (job.status === JobStatus.CANCELLED) {
    return (
      <View className="items-center px-5 py-6">
        {asset ? (
          <Image
            source={asset}
            style={{ width: 200, height: 200 }}
            contentFit="contain"
          />
        ) : null}
        <Text variant="title" className="mt-2 text-center">
          Booking cancelled
        </Text>
        <Text variant="body" className="mt-1 text-center text-text-secondary">
          This booking was cancelled.
        </Text>
      </View>
    );
  }

  if (job.status === JobStatus.EXPIRED) {
    return (
      <View className="items-center px-5 py-6">
        {asset ? (
          <Image
            source={asset}
            style={{ width: 200, height: 200 }}
            contentFit="contain"
          />
        ) : null}
        <Text variant="title" className="mt-2 text-center">
          Request expired
        </Text>
        <Text variant="body" className="mt-1 text-center text-text-secondary">
          No professional accepted your request within the available time.
        </Text>
      </View>
    );
  }

  return null;
}
