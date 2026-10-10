export function selectFirebaseConfig<T>(
  target: string | undefined,
  productionConfig: T,
  previewConfig: T,
): T {
  return target === 'preview' ? previewConfig : productionConfig;
}
