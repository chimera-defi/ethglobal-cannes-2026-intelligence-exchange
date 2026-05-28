export function isArcEnabled(): boolean {
  return import.meta.env.VITE_ENABLE_ARC === 'true';
}