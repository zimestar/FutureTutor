import { Header } from "@/components/marketing/Header";
import { Footer } from "@/components/marketing/Footer";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
