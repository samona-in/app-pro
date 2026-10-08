import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { getDocumentAsync } from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { DOCUMENT_TYPES, type DocumentType, type ProDocument } from '@samona/types';
import { DOCUMENT_CONTENT_TYPES } from '@samona/validation';
import { EmptyState, ErrorState, LoadingState } from '@/components/feedback';
import { DocumentRejectionReasonSheet } from '@/components/documents/DocumentRejectionReasonSheet';
import { Badge, Button, Card, Divider, Screen, Text } from '@/components/ui';
import { useDeleteDocument, useDocuments, useUploadDocument } from '@/hooks';
import { formatFileSize, formatRelativeTime } from '@/utils/format';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_PICKER_TYPES,
  documentRowModel,
  documentTypeLabelKey,
  messageForDocumentError,
} from '@/utils/documents';
import { color } from '@/theme';

/**
 * Documents — the pro's submitted verification documents, reached from Profile.
 *
 * The pro owns the list and the upload handshake; every verdict (approved,
 * rejected, the reason) belongs to the review team and is read back, never
 * written. Approved rows are locked on both sides: the server 409s, so this
 * screen drops the delete affordance rather than let it fail.
 *
 * Uploads stream device-to-bucket through the same three-step handshake as the
 * onboarding selfie: pick a file on-device (PDF/JPEG/PNG, 10 MB cap enforced
 * here as a courtesy — the server enforces it for real), choose its type, then
 * let the hook mint a ticket, PUT the bytes and confirm.
 */
export default function DocumentsScreen() {
  const { t } = useTranslation();
  const { data, isPending, isError, refetch } = useDocuments();
  const documents = data?.data ?? [];
  const upload = useUploadDocument();
  const remove = useDeleteDocument();
  const [selectedType, setSelectedType] = useState<DocumentType>(DOCUMENT_TYPES[0]!);
  const [reasonDocument, setReasonDocument] = useState<ProDocument | null>(null);

  async function onPickFile() {
    const result = await getDocumentAsync({
      type: DOCUMENT_PICKER_TYPES,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    if (!asset) return;

    const contentType = asset.mimeType?.toLowerCase() ?? '';
    if (!isAllowedContentType(contentType)) {
      Alert.alert(t('documents.errors.uploadFailedTitle'), t('documents.errors.unsupported'));
      return;
    }

    const size = asset.size ?? 0;
    if (size > DOCUMENT_MAX_BYTES) {
      Alert.alert(
        t('documents.errors.uploadFailedTitle'),
        t('documents.errors.tooLarge', {
          fileName: asset.name,
          size: formatFileSize(size),
          max: formatFileSize(DOCUMENT_MAX_BYTES),
        }),
      );
      return;
    }

    upload.mutate(
      { type: selectedType, localUri: asset.uri, fileName: asset.name, contentType },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        },
        onError: (error) => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
          Alert.alert(
            t('documents.errors.uploadFailedTitle'),
            messageForDocumentError(error, t),
          );
        },
      },
    );
  }

  function onDelete(document: ProDocument) {
    Alert.alert(
      t('documents.deleteTitle'),
      t('documents.deleteMessage', { fileName: document.fileName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('documents.deleteConfirm'),
          style: 'destructive',
          onPress: () => {
            remove.mutate(document.id, {
              onError: (error) => {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
                  () => {},
                );
                Alert.alert(
                  t('documents.errors.deleteFailedTitle'),
                  messageForDocumentError(error, t),
                );
              },
            });
          },
        },
      ],
    );
  }

  if (isPending) {
    return (
      <Screen>
        <LoadingState message={t('documents.loading')} />
      </Screen>
    );
  }

  if (isError) {
    return (
      <Screen>
        <ErrorState onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scrollable edges={['bottom']}>
      <View className="pt-2">
        <Text variant="titleLg">{t('documents.title')}</Text>
        <Text variant="footnote" className="mt-1 text-text-secondary">
          {t('documents.subtitle')}
        </Text>
      </View>

      <UploadCard
        selectedType={selectedType}
        onSelectType={setSelectedType}
        busy={upload.isPending}
        uploadingLabel={t('documents.uploading')}
        uploadButtonLabel={t('documents.uploadButton')}
        onPickFile={() => void onPickFile()}
      />

      {documents.length === 0 ? (
        <EmptyState
          icon="folder-open-outline"
          title={t('documents.emptyTitle')}
          message={t('documents.emptyMessage')}
          className="mt-10"
        />
      ) : (
        <DocumentGroups
          documents={documents}
          busy={remove.isPending}
          onDelete={onDelete}
          onViewReason={setReasonDocument}
        />
      )}
      <DocumentRejectionReasonSheet
        visible={reasonDocument !== null}
        document={reasonDocument}
        onClose={() => setReasonDocument(null)}
      />
    </Screen>
  );
}

/** The pick-and-upload card: type chips plus the file action. */
function UploadCard({
  selectedType,
  onSelectType,
  busy,
  uploadingLabel,
  uploadButtonLabel,
  onPickFile,
}: {
  selectedType: DocumentType;
  onSelectType: (type: DocumentType) => void;
  busy: boolean;
  uploadingLabel: string;
  uploadButtonLabel: string;
  onPickFile: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card className="mt-4">
      <Text variant="title">{t('documents.uploadCardTitle')}</Text>
      <Text variant="footnote" className="mt-1 text-text-secondary">
        {t('documents.uploadCardCaption')}
      </Text>
      <View className="mt-3 flex-row flex-wrap">
        {DOCUMENT_TYPES.map((type) => {
          const active = type === selectedType;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(documentTypeLabelKey(type))}
              onPress={() => onSelectType(type)}
              className={`mr-2 mb-2 rounded-full px-3 py-1.5 active:opacity-70 ${
                active ? 'bg-brand' : 'bg-surface-muted'
              }`}
            >
              <Text
                variant="footnote"
                className={active ? 'font-semibold text-inverse' : 'text-text-secondary'}
              >
                {t(documentTypeLabelKey(type))}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        label={busy ? uploadingLabel : uploadButtonLabel}
        loading={busy}
        disabled={busy}
        onPress={onPickFile}
        className="mt-3"
      />
    </Card>
  );
}

/** The caller's documents grouped by type, in the catalogue's order. */
function DocumentGroups({
  documents,
  busy,
  onDelete,
  onViewReason,
}: {
  documents: ProDocument[];
  busy: boolean;
  onDelete: (document: ProDocument) => void;
  onViewReason: (document: ProDocument) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {DOCUMENT_TYPES.map((type) => {
        const ofType = documents.filter((document) => document.type === type);
        if (ofType.length === 0) return null;
        return (
          <View key={type}>
            <Text variant="label" className="mb-2 mt-6 px-1">
              {t(documentTypeLabelKey(type))}
            </Text>
            <Card padded={false}>
              {ofType.map((document, index) => (
                <View key={document.id}>
                  {index > 0 ? <Divider /> : null}
                  <DocumentRow
                    document={document}
                    busy={busy}
                    onDelete={() => onDelete(document)}
                    onViewReason={() => onViewReason(document)}
                  />
                </View>
              ))}
            </Card>
          </View>
        );
      })}
    </>
  );
}

function DocumentRow({
  document,
  busy,
  onDelete,
  onViewReason,
}: {
  document: ProDocument;
  busy: boolean;
  onDelete: () => void;
  onViewReason: () => void;
}) {
  const { t } = useTranslation();
  const model = documentRowModel(document.status);
  const statusLabel = t(model.badgeLabelKey);

  const badge = <Badge label={statusLabel} tone={model.badgeTone} />;

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={t('documents.a11y.deleteRow', {
        fileName: document.fileName,
      })}
      className="min-h-[64px] flex-row items-center px-4 py-3"
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-surface-muted">
        <Ionicons name="document-text-outline" size={20} color={color.brand} />
      </View>
      <View className="ml-3 flex-1 pr-2">
        <Text variant="body" className="font-semibold" numberOfLines={1}>
          {document.fileName}
        </Text>
        <Text variant="footnote" className="mt-0.5">
          {formatFileSize(document.sizeBytes)} · {formatRelativeTime(document.createdAt, t)}
        </Text>
      </View>
      <View className="items-end">
        {model.canViewRejectionReason ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('documents.a11y.viewRejectionReason', {
              fileName: document.fileName,
            })}
            hitSlop={8}
            onPress={onViewReason}
            className="flex-row items-center active:opacity-70"
          >
            {badge}
            <View className="ml-1.5">
              <Ionicons name="information-circle-outline" size={16} color={color.danger} />
            </View>
          </Pressable>
        ) : (
          badge
        )}
        {model.canDelete ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('documents.a11y.deleteRow', { fileName: document.fileName })}
            hitSlop={8}
            disabled={busy}
            onPress={onDelete}
            className="mt-2 p-1 active:opacity-60"
          >
            <Ionicons name="trash-outline" size={18} color={color.danger} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Membership test against the shared allowlist (the schema source of truth). */
function isAllowedContentType(contentType: string): boolean {
  return (DOCUMENT_CONTENT_TYPES as readonly string[]).includes(contentType);
}