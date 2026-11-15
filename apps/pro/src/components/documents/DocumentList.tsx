import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { DOCUMENT_TYPES, type ProDocument } from '@samona/types';
import { DocumentRejectionReasonSheet } from '@/components/documents/DocumentRejectionReasonSheet';
import { Badge, Divider, Text } from '@/components/ui';
import { useDeleteDocument } from '@/hooks';
import { color } from '@/theme';
import { formatFileSize, formatRelativeTime } from '@/utils/format';
import { documentRowModel, documentTypeLabelKey, messageForDocumentError } from '@/utils/documents';

/**
 * The caller's submitted documents, grouped by type in the catalogue's order.
 *
 * Every verdict (approved, rejected, the reason) belongs to the review team and
 * is read back, never written. Approved rows are locked on both sides: the
 * server 409s, so the row drops the delete affordance rather than let it fail.
 */
export function DocumentList({ documents }: { documents: ProDocument[] }) {
  const { t } = useTranslation();
  const remove = useDeleteDocument();
  const [reasonDocument, setReasonDocument] = useState<ProDocument | null>(null);

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

  if (documents.length === 0) return null;

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
            <View>
              {ofType.map((document, index) => (
                <View key={document.id}>
                  {index > 0 ? <Divider className="-mx-5" /> : null}
                  <DocumentRow
                    document={document}
                    busy={remove.isPending}
                    onDelete={() => onDelete(document)}
                    onViewReason={() => setReasonDocument(document)}
                  />
                </View>
              ))}
            </View>
          </View>
        );
      })}
      <DocumentRejectionReasonSheet
        visible={reasonDocument !== null}
        document={reasonDocument}
        onClose={() => setReasonDocument(null)}
      />
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
