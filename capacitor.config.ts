import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.titarenkoba.ritm',
  appName: 'Ритм',
  webDir: 'dist/to-do/browser',
  android: {
    backgroundColor: '#0e0e13',
  },
  plugins: {
    SystemBars: {
      // index.html uses viewport-fit=cover; telling Capacitor up front avoids a layout jump
      initialViewportFitValueHint: 'cover',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_ritm',
      iconColor: '#7c5cff',
    },
  },
};

export default config;
