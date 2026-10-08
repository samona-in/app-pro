import { useEffect, useRef } from 'react';
import { Alert, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheet,
} from '@expo/ui/community/bottom-sheet';
import { useRequestProService } from '@/hooks';
import { messageForRequestError } from '@/utils/manage-services';
import { color } from '@/theme';
import { Button } from '../ui/Button';
import { Text } from '../ui/Text';

/** The parts of a service this sheet renders — fits list rows and profile cards alike. */
export interface RejectionReasonSheetService {
  id: string;
  name: string;
  rejectionReason: string | null;
}

export interface RejectionReasonSheetProps {
  visible: boolean;
  service: RejectionReasonSheetService | null;
  onClose: () => void;
}

/**
 * Reveals why SAMONA rejected a pro's service request.
 *
 * The list rows keep the reason hidden so they stay the same height whatever
 * the verdict; the pro asks for it explicitly by tapping the rejected badge.
 * Re-requesting runs the same mutation as the row's own button — the server
 * flips REJECTED → PENDING, and the hook's cache invalidation refreshes both
 * the list and the home services card.
 */
export function RejectionReasonSheet({ visible, service, onClose }: RejectionReasonSheetProps) {
  const { t } = useTranslation();
  const request = useRequestProService();
  const sheetRef = useRef<BottomSheet>(null);
  const { height } = useWindowDimensions();

  // The native sheet always starts closed; open it the moment the parent asks
  // for it. Closing is driven here — pan-down, scrim or a successful re-request
  // — so we never double-dismiss against the platform.
  useEffect(() => {
    if (!visible) return;
    sheetRef.current?.present();
  }, [visible]);

  // A presented sheet must not outlive its host screen (e.g. user navigates
  // back while reading the reason): tear it down with the component.
  useEffect(() => {
    const sheet = sheetRef.current;
    return () => {
      sheet?.dismiss();
    };
  }, []);

  function handleSheetClosed() {
    onClose();
  }

  function handleRequestAgain() {
    if (!service || request.isPending) return;
    request.mutate(service.id, {
      onSuccess: () => {
        // Close here rather than waiting on the platform callback: if it never
        // fires the parent would stay `visible` and the sheet could not reopen.
        sheetRef.current?.dismiss();
        onClose();
      },
      onError: (error) => {
        Alert.alert(t('manageServices.requestFailedTitle'), messageForRequestError(error, t));
      },
    });
  }

  const reason = service?.rejectionReason?.trim();

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
        {service ? (
          <>
            <View className="flex-row items-center gap-3">
              <View className="h-11 w-11 items-center justify-center rounded-xl bg-danger-surface">
                <Ionicons name="close-circle-outline" size={24} color={color.danger} />
              </View>
              <View className="flex-1">
                <Text variant="title">{t('rejectionSheet.title')}</Text>
              </View>
            </View>

            <Text variant="body" className="mt-4 font-semibold">
              {service.name}
            </Text>

            <Text variant="footnote" className="mt-4 text-text-secondary">
              {t('rejectionSheet.reasonLabel')}
            </Text>
            <Text variant="body" className="mt-1 text-text-secondary">
              {reason || t('rejectionSheet.noReason')}
            </Text>

            <View className="mt-6">
              <Button
                label={t('manageServices.action.requestAgain')}
                size="lg"
                disabled={request.isPending}
                loading={request.isPending}
                onPress={handleRequestAgain}
              />
            </View>
          </>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
