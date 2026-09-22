import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/ui';

export interface FaceCameraProps {
  /**
   * Called once with a `file://` URI when a steady, centred face was detected
   * and the frame auto-captured. The caller owns everything after that.
   */
  onCaptured: (localUri: string) => void;
}

/**
 * Web fallback.
 *
 * Live camera capture is native-only. This twin of `FaceCamera.native.tsx`
 * keeps the web bundle free of Nitro modules while preserving the same API —
 * TypeScript checks callers against this file's signature.
 */
export function FaceCamera(_props: FaceCameraProps) {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-black px-8">
      <Text variant="title" className="text-white">
        {t('faceCore.cameraUnavailable')}
      </Text>
      <Text variant="body" className="text-center text-text-secondary">
        {t('faceCore.webFallback')}
      </Text>
    </View>
  );
}
