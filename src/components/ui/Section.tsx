import { cn } from "@/lib/utils";
import { Container } from "@/components/ui/Container";

export function Section({
  className,
  containerClassName,
  children,
  id,
  ariaLabelledby,
}: {
  className?: string;
  containerClassName?: string;
  children: React.ReactNode;
  id?: string;
  ariaLabelledby?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={ariaLabelledby}
      className={cn("py-14 md:py-24", className)}
    >
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}
