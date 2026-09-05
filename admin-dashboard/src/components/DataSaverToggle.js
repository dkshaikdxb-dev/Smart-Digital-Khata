import { useDataSaver } from '../lib/useDataSaver';
import { useLang } from '../lib/i18n';

// A "Data saver" switch. When on, product images are not fetched app-wide (see
// ProductThumb), saving bytes on weak/expensive rural connections. Per-device,
// stored in localStorage. Rendered on the owner Settings page and in the
// consumer khata (settings) area. `variant="cpwa"` scopes styling to the
// customer PWA; the default suits the owner dashboard cards.
export default function DataSaverToggle({ variant = 'owner' }) {
  const { dataSaver, setDataSaver } = useDataSaver();
  const { t } = useLang();
  return (
    <div className={variant === 'cpwa' ? 'ds-toggle ds-cpwa' : 'ds-toggle'}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={dataSaver}
          onChange={(e) => setDataSaver(e.target.checked)}
        />
        <span>
          {t('ds.title')}
          {dataSaver && <span className="badge" style={{ marginLeft: 8 }}>{t('ds.on')}</span>}
        </span>
      </label>
      <p className="muted" style={{ marginTop: 6, marginBottom: 0 }}>{t('ds.desc')}</p>
    </div>
  );
}
