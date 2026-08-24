import { View } from 'react-native';
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
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-black px-8">
      <Text variant="title" className="text-white">
        Camera not available
      </Text>
      <Text variant="body" className="text-center text-text-secondary">
        Face verification uses your phone's camera. Please continue in the SAMONA Pro mobile app.
      </Text>
    </View>
  );
}
