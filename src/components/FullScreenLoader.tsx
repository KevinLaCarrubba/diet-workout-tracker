import { Center, Loader } from '@mantine/core';

export function FullScreenLoader() {
  return (
    <Center h="100dvh" aria-busy="true" aria-label="Loading">
      <Loader />
    </Center>
  );
}
