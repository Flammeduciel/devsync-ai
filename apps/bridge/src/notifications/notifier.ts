import { execFile } from 'node:child_process';

export interface DesktopNotification {
  title: string;
  body?: string;
  sound?: boolean;
}

type Runner = (file: string, args: string[]) => Promise<void>;

const defaultRunner: Runner = (file, args) =>
  new Promise((resolve) => {
    // Notifications are best effort: a missing notifier must never crash the daemon.
    execFile(file, args, { timeout: 5000 }, () => resolve());
  });

/** AppleScript string literal: escape backslashes and quotes, drop control characters. */
const appleString = (value: string) =>
  `"${value
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')}"`;

/** Builds the platform command. Arguments are passed as an array (no shell), so content cannot inject commands. */
export function notificationCommands(
  n: DesktopNotification,
  platform: NodeJS.Platform = process.platform,
): [string, string[]][] {
  const body = (n.body ?? '').slice(0, 300);
  const title = n.title.slice(0, 120);
  switch (platform) {
    case 'darwin':
      return [
        [
          'osascript',
          ['-e', `display notification ${appleString(body)} with title ${appleString(title)}`],
        ],
        ...(n.sound
          ? ([['afplay', ['/System/Library/Sounds/Glass.aiff']]] as [string, string[]][])
          : []),
      ];
    case 'linux':
      return [
        ['notify-send', ['--app-name=DevSync', title, body]],
        ...(n.sound
          ? ([['canberra-gtk-play', ['--id=message-new-instant']]] as [string, string[]][])
          : []),
      ];
    case 'win32': {
      const ps = (v: string) => `'${v.replace(/'/g, "''")}'`;
      const script = [
        '[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]',
        '$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
        `$x = $t.GetElementsByTagName('text'); $x.Item(0).InnerText = ${ps(title)}; $x.Item(1).InnerText = ${ps(body)}`,
        "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('DevSync').Show([Windows.UI.Notifications.ToastNotification]::new($t))",
      ].join('; ');
      return [['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]]];
    }
    default:
      return [];
  }
}

export function createNotifier(runner: Runner = defaultRunner) {
  return async (notification: DesktopNotification) => {
    for (const [file, args] of notificationCommands(notification)) await runner(file, args);
  };
}
export type Notifier = ReturnType<typeof createNotifier>;
