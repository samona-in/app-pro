import { Alert } from 'react-native';
import { openURL } from 'expo-linking';

/**
 * Opens an external URL, surfacing the caller's alert when no app can handle
 * it rather than failing silently.
 */
export function openExternalUrl(url: string, failTitle: string, failMessage: string): void {
  void openURL(url).catch(() => Alert.alert(failTitle, failMessage));
}
