import { useTranslation } from 'react-i18next';
import { ComingSoon } from '@/components/feedback';

/**
 * Earnings is not built yet. The shared Coming Soon placeholder stands in until
 * the earnings surface lands, keeping the tab destination stable.
 */
export default function Earnings() {
  const { t } = useTranslation();
  return (
    <ComingSoon
      icon="wallet-outline"
      description={t('comingSoon.earnings')}
      className="bg-surface"
    />
  );
}
