import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getDocumentAsync } from 'expo-document-picker';
import { useTranslation } from 'react-i18next';
import { DOCUMENT_TYPES, type DocumentType } from '@samona/types';
import { Button, Text } from '@/components/ui';
import { useUploadDocument } from '@/hooks';
import { formatFileSize } from '@/utils/format';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_PICKER_TYPES,
  documentTypeLabelKey,
  isAllowedDocumentContentType,
  messageForDocumentError,
} from '@/utils/documents';

/**
 * The pick-and-upload card: document type chips plus the file action.
 *
 * Used by the Profile > Documents screen: pick a file on-device (PDF/JPEG/PNG,
 * 10 MB cap enforced here as a courtesy — the server enforces it for real),
 * choose its type, then let the hook mint a ticket, PUT the bytes and confirm.
 */
export function DocumentUploadCard() {
  const { t } = useTranslation();
  const upload = useUploadDocument();
  const [selectedType, setSelectedType] = useState<DocumentType>(DOCUMENT_TYPES[0]!);

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
    if (!isAllowedDocumentContentType(contentType)) {
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
          Alert.alert(t('documents.errors.uploadFailedTitle'), messageForDocumentError(error, t));
        },
      },
    );
  }

  return (
    <View className="mt-4">
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
              onPress={() => setSelectedType(type)}
              className={`mr-2 mb-2 rounded-full px-3 py-1.5 active:opacity-70 ${
                active ? 'bg-brand' : 'bg-surface-muted'
              }`}
            >
              <Text
                variant="footnote"
                className={active ? 'font-semibold text-text-inverse' : 'text-text-secondary'}
              >
                {t(documentTypeLabelKey(type))}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        label={upload.isPending ? t('documents.uploading') : t('documents.uploadButton')}
        loading={upload.isPending}
        disabled={upload.isPending}
        onPress={() => void onPickFile()}
        className="mt-3"
      />
    </View>
  );
}
