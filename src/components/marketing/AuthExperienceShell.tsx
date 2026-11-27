import { Logo } from "@/components/marketing/Logo";
import { LanguageSwitcher } from "@/components/marketing/LanguageSwitcher";
import { AuthEditorialPortrait } from "@/components/marketing/AuthEditorialPortrait";

export function AuthExperienceShell({ title, subtitle, statement, statementSupport, imageAlt, children }: {
  title: string;
  subtitle: string;
  statement: string;
  statementSupport: string;
  imageAlt: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)]">
      <div className="relative flex items-center px-5 py-10 sm:px-10 lg:px-14 xl:px-20">
        <LanguageSwitcher className="absolute right-5 top-5 sm:right-10 sm:top-8" />
        <div className="mx-auto w-full max-w-md">
          <Logo className="h-9" />
          <div className="mt-10">
            <h1 className="text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">{title}</h1>
            <p className="mt-3 leading-7 text-text-secondary">{subtitle}</p>
          </div>
          <div className="mt-8">{children}</div>
        </div>
      </div>
      <aside className="relative hidden overflow-hidden lg:sticky lg:top-0 lg:h-dvh lg:self-start bg-[radial-gradient(circle_at_78%_18%,rgba(16,185,129,0.32),transparent_26%),linear-gradient(145deg,#123a7a_0%,#081a33_52%,#071629_100%)] lg:block">
        <div aria-hidden="true" className="absolute -right-20 top-12 size-72 rounded-full border border-white/12" />
        <div aria-hidden="true" className="absolute bottom-[18%] left-[10%] size-32 rounded-full bg-blue/25 blur-2xl" />
        <AuthEditorialPortrait alt={imageAlt} />
        <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/25 via-35% to-transparent to-60%" />
        <div className="absolute inset-x-0 bottom-0 p-10 xl:p-14">
          <blockquote className="max-w-lg text-balance text-2xl font-extrabold leading-tight text-white [@media(min-height:900px)]:xl:text-[2.125rem]">{statement}</blockquote>
          <p className="mt-4 max-w-md text-base leading-7 text-white/75">{statementSupport}</p>
        </div>
      </aside>
    </section>
  );
}
