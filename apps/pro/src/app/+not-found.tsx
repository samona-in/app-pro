import { Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/feedback';
import { Screen } from '@/components/ui';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <>
      <Stack.Screen options={{ title: t('notFound.stackTitle'), headerShown: true }} />
      <Screen edges={[]}>
        <ErrorState
          title={t('notFound.title')}
          message={t('notFound.message')}
          retryLabel={t('notFound.goHome')}
          onRetry={() => router.replace('/')}
        />
      </Screen>
    </>
  );
}