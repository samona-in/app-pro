import { useEffect, useRef } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheet,
} from '@expo/ui/community/bottom-sheet';
import type { ProDocument } from '@samona/types';
import { color } from '@/theme';
import { Text } from '../ui/Text';

export interface DocumentRejectionReasonSheetProps {
  visible: boolean;
  document: ProDocument | null;
  onClose: () => void;
}

/**
 * Reveals why SAMONA rejected a verification document.
 *
 * The reason stays off the row so rows hold their height however the verdict
 * reads; the pro asks for it explicitly by tapping the rejected badge or its
 * info icon. There is deliberately no re-upload action here — a rejected
 * document is editable by deleting it from the list and uploading again.
 */
export function DocumentRejectionReasonSheet({
  visible,
  document,
  onClose,
}: DocumentRejectionReasonSheetProps) {
  const { t } = useTranslation();
  const sheetRef = useRef<BottomSheet>(null);
  const { height } = useWindowDimensions();

  useEffect(() => {
    if (!visible) return;
    sheetRef.current?.present();
  }, [visible]);

  useEffect(() => {
    const sheet = sheetRef.current;
    return () => {
      sheet?.dismiss();
    };
  }, []);

  function handleSheetClosed() {
    onClose();
  }

  const reason = document?.rejectionReason?.trim();

  return (
    <BottomSheetModal
      ref={sheetRef}
      enablePanDownToClose
      backgroundStyle={{ backgroundColor: color.surface }}
      onClose={handleSheetClosed}
    >
      <BottomSheetScrollView
        style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, maxHeight: height * 0.7 }}
      >
        {document && document.status === 'REJECTED' ? (
          <>
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-xl bg-danger-surface">
                <Ionicons name="close-circle-outline" size={24} color={color.danger} />
              </View>
              <View className="flex-1">
                <Text variant="title">{t('documents.sheet.title')}</Text>
              </View>
            </View>

            <Text variant="body" className="mt-4 font-semibold">
              {document.fileName}
            </Text>

            <Text variant="footnote" className="mt-4 text-text-secondary">
              {t('documents.sheet.reasonLabel')}
            </Text>
            <Text variant="body" className="mt-1 text-text-secondary">
              {reason || t('documents.sheet.noReason')}
            </Text>
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}