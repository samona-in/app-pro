import { useAppUpdates } from '../hooks/useAppUpdates';
import { AppUpdateSheet, type AppUpdateStrings, type AppUpdateTheme } from './AppUpdateSheet';

export interface AppUpdateGateProps {
  /** Pro passes translated copy; Customer omits this and uses defaults. */
  strings?: Partial<AppUpdateStrings>;
  /** Optional token override; defaults already match the SAMONA palette. */
  theme?: Partial<AppUpdateTheme>;
}

/**
 * Mounts the update hook and its sheet once at the app root.
 *
 * It renders nothing until Play reports an actionable update, so the gate is
 * safe to leave mounted for the whole app lifetime. It sits inside the
 * provider tree (safe area + gesture root) and above the navigator, so the
 * sheet is available from every screen.
 */
export function AppUpdateGate({ strings, theme }: AppUpdateGateProps) {
  const updates = useAppUpdates();

  return (
    <AppUpdateSheet
      visible={updates.visible}
      mode={updates.mode}
      isStarting={updates.isStarting}
      error={updates.error}
      strings={strings}
      theme={theme}
      onUpdate={updates.startUpdate}
      onDismiss={updates.dismiss}
      onRestart={updates.restart}
    />
  );
}
