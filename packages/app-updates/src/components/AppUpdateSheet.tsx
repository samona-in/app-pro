import { useEffect, useRef, type ComponentRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal } from '@expo/ui/community/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppUpdateMode } from '../hooks/useAppUpdates';

/**
 * The copy the sheet renders. Every value has an English default, so the
 * Customer app can use the sheet as-is while Pro passes translated strings
 * from its i18n resources.
 */
export interface AppUpdateStrings {
  optionalTitle: string;
  optionalDescription: string;
  mandatoryTitle: string;
  mandatoryDescription: string;
  updateNow: string;
  maybeLater: string;
  readyTitle: string;
  readyDescription: string;
  restartNow: string;
  errorTitle: string;
  errorDescription: string;
  tryAgain: string;
  notNow: string;
  closeA11y: string;
}

/**
 * Colour tokens. Defaults match the shared SAMONA theme, so both apps get the
 * brand-blue sheet without importing each other's design system.
 */
export interface AppUpdateTheme {
  brand: string;
  brandContrast: string;
  surface: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  danger: string;
}

export const DEFAULT_APP_UPDATE_STRINGS: AppUpdateStrings = {
  optionalTitle: 'A new update is available!',
  optionalDescription:
    "We've made improvements to give you a better experience. Update now to enjoy the latest version of SAMONA.",
  mandatoryTitle: 'Update required',
  mandatoryDescription:
    'Please update SAMONA to continue using the app and enjoy a better, more reliable experience.',
  updateNow: 'Update Now',
  maybeLater: 'Maybe Later',
  readyTitle: 'Update ready to install',
  readyDescription:
    'The latest version has been downloaded. Restart SAMONA to finish installing it.',
  restartNow: 'Restart Now',
  errorTitle: 'Could not update SAMONA',
  errorDescription: 'Check your connection and try again, or update SAMONA from Google Play.',
  tryAgain: 'Try Again',
  notNow: 'Not now',
  closeA11y: 'Close update prompt',
};

export const DEFAULT_APP_UPDATE_THEME: AppUpdateTheme = {
  brand: '#054DFF',
  brandContrast: '#FFFFFF',
  surface: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  danger: '#DC2626',
};

export interface AppUpdateSheetProps {
  visible: boolean;
  mode: AppUpdateMode | null;
  isStarting: boolean;
  /** Stable reason key, e.g. `installFailed` or `notInstalledFromPlay`. */
  error: string | null;
  strings?: Partial<AppUpdateStrings>;
  theme?: Partial<AppUpdateTheme>;
  onUpdate: () => void;
  onDismiss: () => void;
  onRestart: () => void;
}

interface SheetButtonProps {
  label: string;
  theme: AppUpdateTheme;
  variant: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function SheetButton({
  label,
  theme,
  variant,
  loading = false,
  disabled = false,
  onPress,
}: SheetButtonProps) {
  const isPrimary = variant === 'primary';
  const labelColor = isPrimary ? theme.brandContrast : theme.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary
          ? { backgroundColor: theme.brand }
          : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : (
        <Text style={[styles.buttonLabel, { color: labelColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/**
 * SAMONA's Google Play update sheet.
 *
 * One component renders every state: optional prompt, mandatory prompt,
 * "download ready to install" and the retry state after a failure. The sheet is
 * deliberately non-dismissible for mandatory updates: no pan-to-close, no
 * backdrop tap, and the hook also swallows the Android back button.
 */
export function AppUpdateSheet({
  visible,
  mode,
  isStarting,
  error,
  strings: stringsProp,
  theme: themeProp,
  onUpdate,
  onDismiss,
  onRestart,
}: AppUpdateSheetProps) {
  const sheetRef = useRef<ComponentRef<typeof BottomSheetModal>>(null);
  const insets = useSafeAreaInsets();
  const strings = { ...DEFAULT_APP_UPDATE_STRINGS, ...stringsProp };
  const theme = { ...DEFAULT_APP_UPDATE_THEME, ...themeProp };

  useEffect(() => {
    if (visible) {
      sheetRef.current?.present();
    } else {
      sheetRef.current?.dismiss();
    }
  }, [visible]);

  const isMandatory = mode === 'mandatory';
  const isReady = mode === 'ready';
  const isError = mode === 'error';
  const dismissible = !isMandatory;

  const title = isReady
    ? strings.readyTitle
    : isError
      ? strings.errorTitle
      : isMandatory
        ? strings.mandatoryTitle
        : strings.optionalTitle;

  const description = isReady
    ? strings.readyDescription
    : isError
      ? strings.errorDescription
      : isMandatory
        ? strings.mandatoryDescription
        : strings.optionalDescription;

  // A failed mandatory or ready flow keeps its blocking/ready sheet, with the
  // failure explained inline instead of replacing the user's context.
  const inlineError = error != null && (isMandatory || isReady) ? strings.errorDescription : null;

  const primaryLabel = isReady
    ? strings.restartNow
    : isError
      ? strings.tryAgain
      : strings.updateNow;

  const primaryAction = isReady ? onRestart : onUpdate;

  return (
    <BottomSheetModal
      ref={sheetRef}
      enablePanDownToClose={dismissible}
      backgroundStyle={{ backgroundColor: theme.surface }}
      onClose={dismissible ? onDismiss : undefined}
    >
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        {dismissible ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={strings.closeA11y}
            onPress={onDismiss}
            hitSlop={10}
            style={styles.closeButton}
          >
            <Text style={[styles.closeGlyph, { color: theme.textSecondary }]}>×</Text>
          </Pressable>
        ) : null}

        <Text accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>
          {title}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>

        {inlineError != null ? (
          <Text style={[styles.inlineError, { color: theme.danger }]}>{inlineError}</Text>
        ) : null}

        <View style={styles.actions}>
          <SheetButton
            label={primaryLabel}
            theme={theme}
            variant="primary"
            loading={isStarting}
            onPress={primaryAction}
          />

          {mode === 'optional' || mode === 'ready' || mode === 'error' ? (
            <SheetButton
              label={mode === 'optional' ? strings.maybeLater : strings.notNow}
              theme={theme}
              variant="secondary"
              disabled={isStarting}
              onPress={onDismiss}
            />
          ) : null}
        </View>
      </View>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    top: 12,
    zIndex: 1,
    height: 32,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeGlyph: {
    fontSize: 26,
    lineHeight: 28,
    fontWeight: '400',
  },
  title: {
    paddingRight: 32,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
  },
  description: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
  },
  inlineError: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  actions: {
    marginTop: 24,
    gap: 10,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
});
