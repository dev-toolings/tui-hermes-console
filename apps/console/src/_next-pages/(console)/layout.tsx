import { ConsoleShell } from "@/components/shell/console-shell";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <ConsoleShell>{children}</ConsoleShell>;
}
