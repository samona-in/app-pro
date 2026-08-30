import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  isSelectableStatus,
  ServiceRequestStatus,
  SERVICE_REQUEST_TRANSITIONS,
} from '@samona/types';
import { EmptyState } from '@/components/feedback';
import { Button, Card, Divider, Screen, Text } from '@/components/ui';
import { RespondingProRow, RequestStatusBadge } from '@/components/requests';
import { useCancelRequest, useMarkPaid, useRequest, useSelectPro, useSubmitGuard } from '@/hooks';
import { cn } from '@/utils/cn';
import { formatInr, formatRelativeTime } from '@/utils/format';

const TIMELINE: { status: ServiceRequestStatus; label: string }[] = [
  { status: ServiceRequestStatus.REQUESTED, label: 'Requested' },
  { status: ServiceRequestStatus.CONFIRMED, label: 'Professional confirmed' },
  { status: ServiceRequestStatus.TRAVELLING, label: 'On the way' },
  { status: ServiceRequestStatus.ARRIVED, label: 'Arrived' },
  { status: ServiceRequestStatus.IN_PROGRESS, label: 'Work in progress' },
  { status: ServiceRequestStatus.COMPLETED, label: 'Completed' },
  { status: ServiceRequestStatus.PAID, label: 'Paid' },
];

function isTerminal(status: ServiceRequestStatus): boolean {
  return (
    status === ServiceRequestStatus.PAID ||
    status === ServiceRequestStatus.CANCELLED ||
    status === ServiceRequestStatus.EXPIRED
  );
}

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const requestId = id ?? '';

  const { data: request, isPending, error } = useRequest(requestId);
  const selectPro = useSelectPro(requestId);
  const cancel = useCancelRequest(requestId);
  const markPaid = useMarkPaid(requestId);

  const [actionError, setActionError] = useState<string | null>(null);

  const { run: runSelect, isSubmitting: isSelecting } = useSubmitGuard(
    async (respondType: 'offer' | 'interest', responderId: string) => {
      setActionError(null);
      try {
        await selectPro.mutateAsync({ respondType, responderId });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not select this professional.');
      }
    },
  );

  const { run: runCancel, isSubmitting: isCancelling } = useSubmitGuard(async () => {
    setActionError(null);
    try {
      await cancel.mutateAsync();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not cancel this request.');
    }
  });

  const { run: runPay, isSubmitting: isPaying } = useSubmitGuard(async () => {
    setActionError(null);
    try {
      await markPaid.mutateAsync();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not confirm the payment.');
    }
  });

  const shortlist = useMemo(() => {
    if (!request) return [];
    if (!(request.selectedProId !== null)) return request.respondingPros;
    return request.respondingPros.filter((p) => p.proId === request.selectedProId);
  }, [request]);

  const selectedPro = request?.respondingPros.find((p) => p.proId === request.selectedProId) ?? null;

  if (isPending) {
    return (
      <Screen edges={[]}>
        <EmptyState icon="hourglass-outline" title="Loading your booking" message="Fetching the latest status." />
      </Screen>
    );
  }

  if (!request) {
    return (
      <Screen edges={[]}>
        <EmptyState
          icon="alert-circle-outline"
          title="Booking not found"
          message={error instanceof Error ? error.message : 'This booking no longer exists.'}
        />
      </Screen>
    );
  }

  const canSelect = isSelectableStatus(request.status);
  const canCancel =
    !isTerminal(request.status) &&
    (SERVICE_REQUEST_TRANSITIONS[request.status].includes(ServiceRequestStatus.CANCELLED) ||
      request.status === ServiceRequestStatus.REQUESTED);

  const reached = (status: ServiceRequestStatus): boolean => {
    const order = TIMELINE.map((t) => t.status);
    const currentIdx = order.indexOf(request.status);
    return order.indexOf(status) <= currentIdx;
  };

  return (
    <Screen scrollable edges={[]}>
      {/* Status header */}
      <View className="flex-row items-center gap-3 pt-4">
        <RequestStatusBadge status={request.status} />
        <Text variant="footnote" className="text-text-muted">
          {formatRelativeTime(request.updatedAt)}
        </Text>
      </View>

      {/* Request summary */}
      <Card className="mt-4">
        <Text variant="titleLg">{request.service.name}</Text>
        {request.description ? (
          <Text variant="body" className="mt-2 text-text-secondary">
            {request.description}
          </Text>
        ) : null}
        {request.address ? (
          <Text variant="footnote" className="mt-2 text-text-muted">
            {request.address}
          </Text>
        ) : null}
        <Divider spaced />
        <View className="flex-row items-center justify-between">
          <Text variant="label">Price</Text>
          <Text variant="bodyStrong">
            {request.finalPrice !== null ? formatInr(request.finalPrice) : formatInr(request.estimatedPrice)}
          </Text>
        </View>
      </Card>

      {/* Shortlist / chosen professional */}
      {request.selectedProId !== null && selectedPro ? (
        <Card className="mt-4">
          <Text variant="label">Your professional</Text>
          <RespondingProRow
            className="mt-3"
            displayName={selectedPro.displayName}
            rating={selectedPro.rating}
            completedJobs={selectedPro.completedJobs}
            distanceKm={selectedPro.distanceKm}
            estimatedEtaMinutes={selectedPro.estimatedEtaMinutes}
            responderType={selectedPro.respondType}
            isSelected
          />
        </Card>
      ) : canSelect ? (
        <Card className="mt-4">
          <Text variant="label">Choose your professional</Text>
          {shortlist.length > 0 ? (
            <Card padded={false} className="mt-3">
              {shortlist.map((pro, index) => {
                const inProgress = isSelecting;
                return (
                  <View key={pro.responderId}>
                    {index > 0 ? <Divider /> : null}
                    <View className="px-4 py-4">
                      <RespondingProRow
                        displayName={pro.displayName}
                        rating={pro.rating}
                        completedJobs={pro.completedJobs}
                        distanceKm={pro.distanceKm}
                        estimatedEtaMinutes={pro.estimatedEtaMinutes}
                        responderType={pro.respondType}
                        isSelected={false}
                      />
                      <Button
                        className="mt-3 self-end"
                        label="Select"
                        size="sm"
                        variant="secondary"
                        loading={inProgress}
                        onPress={() => void runSelect(pro.respondType, pro.responderId)}
                      />
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : (
            <Text variant="body" className="mt-3 text-text-secondary">
              Waiting for professionals to respond…
            </Text>
          )}
        </Card>
      ) : null}

      {/* Progress timeline */}
      <Text variant="title" className="mt-8">
        Progress
      </Text>
      <Card className="mt-3" padded={false}>
        {TIMELINE.map((step, index) => {
          const isReached = reached(step.status);
          const isCurrent = step.status === request.status;
          return (
            <View key={step.status}>
              {index > 0 ? <Divider /> : null}
              <View className="flex-row items-center px-4 py-4">
                <View
                  className={cn(
                    'mr-3 h-2.5 w-2.5 rounded-full',
                    isReached ? 'bg-success' : 'bg-border-strong',
                  )}
                />
                <Text
                  variant={isCurrent ? 'bodyStrong' : 'body'}
                  className={isReached ? undefined : 'text-text-secondary'}
                >
                  {step.label}
                </Text>
              </View>
            </View>
          );
        })}
      </Card>

      {/* Actions */}
      <View className="mt-8 gap-3 pb-6">
        {request.status === ServiceRequestStatus.COMPLETED ? (
          <Button
            label={`Pay ${formatInr(request.finalPrice)}`}
            size="lg"
            loading={isPaying}
            onPress={() => void runPay()}
          />
        ) : null}

        {canCancel ? (
          <Button
            label="Cancel request"
            variant="ghost"
            size="lg"
            loading={isCancelling}
            onPress={() => void runCancel()}
          />
        ) : null}

        {isTerminal(request.status) ? (
          <Text variant="footnote" className="text-center text-text-secondary">
            {request.status === ServiceRequestStatus.PAID
              ? 'Payment received. Thanks for using SAMONA.'
              : request.status === ServiceRequestStatus.CANCELLED
                ? 'This request has been cancelled.'
                : 'This request expired before a professional was confirmed.'}
          </Text>
        ) : null}

        {actionError ? (
          <Text variant="footnote" className="text-center text-danger">
            {actionError}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}