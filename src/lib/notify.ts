import { notifications } from '@mantine/notifications';

export const notifySaved = (message = 'Saved') =>
  notifications.show({ message, color: 'lime', autoClose: 2000 });

export const notifyError = (error: unknown) =>
  notifications.show({
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : String(error),
    color: 'red',
  });
