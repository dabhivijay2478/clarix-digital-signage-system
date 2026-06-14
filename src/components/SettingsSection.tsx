'use client';

import React from 'react';
import styles from '../app/settings/page.module.css';

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  return (
    <section className="glass-card-static">
      <h2 className={styles.sectionTitle}>{title}</h2>
      {description && <p className={styles.sectionDesc}>{description}</p>}
      {children}
    </section>
  );
}

interface SettingsRowProps {
  label: string;
  description?: string;
  monoValue?: string | number;
  children?: React.ReactNode;
}

export function SettingsRow({ label, description, monoValue, children }: SettingsRowProps) {
  return (
    <div className={styles.settingRow}>
      <div>
        <div className={styles.settingLabel}>{label}</div>
        {description && <div className={styles.settingDesc}>{description}</div>}
        {monoValue !== undefined && <div className={styles.settingMono}>{monoValue}</div>}
      </div>
      {children}
    </div>
  );
}
