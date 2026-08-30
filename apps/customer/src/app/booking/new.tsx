import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LoadingState } from '@/components/feedback';
import { Button, Card, Input, Screen, Text } from '@/components/ui';
import { useCreateRequest, useServices, useSubmitGuard } from '@/hooks';
import { color } from '@/theme';
import { cn } from '@/utils/cn';

/**
 * Files a new service request: pick a service, describe the task, set a
 * budget. The backend decides how the request is surfaced — dispatched as
 * offers or opened to interest — so the customer only states what they need.
 */
export default function NewBooking() {
  const { data: services, isPending } = useServices();
  const createRequest = useCreateRequest();
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [address, setAddress] = useState('');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState<string | null>(null);

  const budgetNumber = useMemo(() => {
    const parsed = Number.parseInt(budget.replace(/,/g, ''), 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }, [budget]);

  const { run, isSubmitting } = useSubmitGuard(async () => {
    if (!serviceId) {
      setError('Choose a service to continue.');
      return;
    }
    setError(null);
    try {
      const request = await createRequest.mutateAsync({
        serviceId,
        description: description.trim() || undefined,
        address: address.trim() || undefined,
        estimatedPrice: budgetNumber ?? undefined,
      });
      router.replace(`/booking/${request.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start this request.');
    }
  });

  if (isPending) {
    return (
      <Screen>
        <LoadingState message="Loading services" />
      </Screen>
    );
  }

  const catalogue = services ?? [];

  return (
    <Screen scrollable edges={['bottom']}>
      <Text variant="title" className="mt-2">
        What do you need?
      </Text>

      {catalogue.length > 0 ? (
        <View className="mt-4 flex-row flex-wrap gap-2">
          {catalogue.map((service) => {
            const isSelected = service.id === serviceId;
            return (
              <Pressable
                key={service.id}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setServiceId(service.id)}
                className={cn(
                  'flex-row items-center gap-1.5 rounded-full border px-4 py-2.5',
                  isSelected ? 'border-brand bg-brand' : 'border-border bg-surface',
                )}
              >
                {service.icon ? (
                  <Ionicons
                    name={service.icon as keyof typeof Ionicons.glyphMap}
                    size={16}
                    color={isSelected ? '#fff' : color.brand}
                  />
                ) : null}
                <Text
                  variant="footnote"
                  className={cn('font-semibold', isSelected ? 'text-white' : 'text-text-primary')}
                >
                  {service.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Card className="mt-4">
          <Text variant="body" className="text-text-secondary">
            No services are available yet. Please check back soon.
          </Text>
        </Card>
      )}

      <View className="mt-6 gap-4">
        <Input
          label="Describe the job"
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Kitchen sink is leaking and needs a new tap"
          multiline
          numberOfLines={3}
          className="min-h-[96px]"
          containerClassName="mt-0"
        />
        <Input
          label="Where should they come?"
          value={address}
          onChangeText={setAddress}
          placeholder="Address or area (optional)"
          containerClassName="mt-0"
        />
        <Input
          label="Budget (₹)"
          value={budget}
          onChangeText={(next) => setBudget(next.replace(/[^\d,]/g, ''))}
          placeholder="Optional estimate"
          keyboardType="number-pad"
          containerClassName="mt-0"
        />
      </View>

      <View className="mt-8 gap-3 pb-6">
        <Button
          label="Find a professional"
          size="lg"
          loading={isSubmitting}
          disabled={!serviceId}
          onPress={() => void run()}
        />
        {error ? (
          <Text variant="footnote" className="text-center text-danger">
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}