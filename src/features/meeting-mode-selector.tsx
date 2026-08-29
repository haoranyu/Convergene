'use client';

import { IconCheck } from '@arco-design/web-react/icon';
import { useTranslations } from 'next-intl';

import type { MeetingMode } from '@/modules/meeting-domain';

import styles from './meeting-mode-selector.module.css';

const primaryModes = ['DECISION', 'BRAINSTORM', 'RETRO'] as const;

interface MeetingModeSelectorProps {
  disabled?: boolean;
  legend: string;
  onSelect: (mode: MeetingMode) => void;
  selectedMode: MeetingMode | null | undefined;
}

export function MeetingModeSelector({
  disabled = false,
  legend,
  onSelect,
  selectedMode,
}: MeetingModeSelectorProps) {
  const t = useTranslations('meetingCreation');

  return (
    <fieldset className={styles.fieldset} disabled={disabled}>
      <legend>{legend}</legend>
      <div className={styles.modeGrid}>
        {primaryModes.map((mode) => (
          <button
            aria-label={t(`modes.${mode.toLowerCase()}.title`)}
            aria-pressed={selectedMode === mode}
            className={`${styles.modeCard} ${selectedMode === mode ? styles.modeSelected : ''}`}
            key={mode}
            onClick={() => onSelect(mode)}
            type="button"
          >
            <span className={styles.modeCheck} aria-hidden="true">
              {selectedMode === mode ? <IconCheck /> : null}
            </span>
            <strong>{t(`modes.${mode.toLowerCase()}.title`)}</strong>
            <span>{t(`modes.${mode.toLowerCase()}.description`)}</span>
          </button>
        ))}
      </div>
      <button
        aria-label={t('modes.general.title')}
        aria-pressed={selectedMode === 'GENERAL'}
        className={`${styles.generalMode} ${selectedMode === 'GENERAL' ? styles.generalSelected : ''}`}
        onClick={() => onSelect('GENERAL')}
        type="button"
      >
        <span>
          <strong>{t('modes.general.title')}</strong>
          <span>{t('modes.general.description')}</span>
        </span>
        {selectedMode === 'GENERAL' ? <IconCheck aria-hidden="true" /> : null}
      </button>
    </fieldset>
  );
}
