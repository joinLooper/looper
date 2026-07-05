export function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-TW").format(value);
}
