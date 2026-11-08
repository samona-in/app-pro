import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DocumentStatus } from '@samona/types';
import { DocumentList, DocumentUploadCard } from '@/components/documents';
import { ErrorState, LoadingState } from '@/components/feedback';
import { OnboardingStepLayout } from '@/components/onboarding';
import { Text } from '@/components/ui';
import { useDocuments } from '@/hooks';

/**
 * Documents step — asked before the face check, which is the final question.
 *
 * At least one document is mandatory: the review team cannot verify anyone
 * from an empty file, so Continue stays disabled until a document has been
 * submitted. A rejected document no longer counts (it was refused), so the
 * hint asks for another upload rather than letting a refused file through.
 * The upload card and list are shared with Profile > Documents.
 */
export default function OnboardingDocuments() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useDocuments();
  const documents = data?.data ?? [];
  const hasUsableDocument = documents.some(
    (document) => document.status !== DocumentStatus.REJECTED,
  );

  if (isPending) {
    return <LoadingState message={t('documents.loading')} />;
  }

  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  return (
    <OnboardingStepLayout
      title={t('onboarding.documents.title')}
      subtitle={t('onboarding.documents.subtitle')}
      onPrimary={() => router.push('/onboarding/face')}
      primaryDisabled={!hasUsableDocument}
      footer={
        <Text variant="caption" className="text-center text-text-muted">
          {hasUsableDocument
            ? t('onboarding.documents.ready')
            : t('onboarding.documents.requiredHint')}
        </Text>
      }
    >
      <DocumentUploadCard />
      <DocumentList documents={documents} />
    </OnboardingStepLayout>
  );
}
