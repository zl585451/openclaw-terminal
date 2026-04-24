import styles from '../../styles/scriptAdapter.module.css';

interface Props {
  label: string;
  value: string | number;
  sub?: string;
}

export function MetricCard({ label, value, sub }: Props) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricLabel}>{label}</div>
      <div className={styles.metricValue}>{value}</div>
      {sub ? <div className={styles.metricSub}>{sub}</div> : null}
    </div>
  );
}
