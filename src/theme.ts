import { Platform } from 'react-native';
export const C = { bg: '#F8F7F2', paper: '#FFFFFF', ink: '#203D38', muted: '#7A837B', green: '#284F46', light: '#E9EDE3', line: '#E5E6DD', rust: '#B87650', cream: '#F0E8DA' };
export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' });
