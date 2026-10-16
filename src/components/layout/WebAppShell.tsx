import { Fragment, type ReactNode } from 'react';

export function WebAppShell({ children }: { children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}
