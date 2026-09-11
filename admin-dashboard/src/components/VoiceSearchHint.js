import { useLang } from '../lib/i18n';

// Inline feedback line for consumer voice search, rendered under the search bar.
// Shows a visible "Listening…" affordance while recognition is active, otherwise
// the auto-clearing message from useVoiceSearch (denied mic / nothing-heard /
// offline / iOS-not-supported). Renders nothing when idle with no message, so it
// never takes space on the happy path. aria-live so assistive tech announces it.
export default function VoiceSearchHint({ listening, hint }) {
  const { t } = useLang();
  if (!listening && !hint) return null;
  return (
    <div className="cpwa-voice-hint muted" role="status" aria-live="polite">
      {listening ? `🎧 ${t('voice.listening')}` : hint}
    </div>
  );
}
