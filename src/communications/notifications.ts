export async function enablePush(_userId: string): Promise<string> { return 'Background notifications are available in the Android and iOS app. This browser still receives live chat updates while open.'; }
export async function removeDevicePush(): Promise<void> {}
export function setActiveConversation(_id: string | null): void {}
export async function listenForNotifications(_userId: string, _open: (conversation: string) => void): Promise<() => void> { return () => {}; }
