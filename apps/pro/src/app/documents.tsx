import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { DocumentList, DocumentUploadCard } from '@/components/documents';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { Screen, Text } from '@/components/ui';
import { useDocuments } from '@/hooks';

/**
 * Documents — the pro's submitted verification documents, reached from Profile.
 *
 * The pro owns the list and the upload handshake; every verdict (approved,
 * rejected, the reason) belongs to the review team and is read back, never
 * written. The pick-and-upload card and the grouped list are shared with the
 * onboarding documents step so the two surfaces cannot drift.
 */
export default function DocumentsScreen() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useDocuments();
  const documents = data?.data ?? [];

  if (isPending) {
    return (
      <Screen className="bg-surface">
        <LoadingState message={t('documents.loading')} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen className="bg-surface">
        <ErrorState onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scrollable edges={['bottom']} className="bg-surface">
      <View className="pt-2">
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('documents.subtitle')}
        </Text>
      </View>

      <DocumentUploadCard />

      {documents.length === 0 ? (
        <EmptyState
          icon="folder-open-outline"
          title={t('documents.emptyTitle')}
          message={t('documents.emptyMessage')}
          className="mt-10"
        />
      ) : (
        <DocumentList documents={documents} />
      )}
    </Screen>
  );
}
