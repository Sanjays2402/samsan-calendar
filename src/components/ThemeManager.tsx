import { useEffect } from 'react';
import { useStore } from '../store/calendar';

/** Apply current theme to <html data-theme="...">. Listens to system pref when theme='system'. */
export function ThemeManager() {
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: light)');

    const apply = () => {
      const effective =
        theme === 'system' ? (mq.matches ? 'light' : 'dark') : theme;
      root.setAttribute('data-theme', effective);
    };

    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  return null;
}
