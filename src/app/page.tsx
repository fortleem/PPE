import { AppShell } from "@/components/ppe/app-shell";
import { Providers } from "@/components/ppe/providers";

export default function Home() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}
