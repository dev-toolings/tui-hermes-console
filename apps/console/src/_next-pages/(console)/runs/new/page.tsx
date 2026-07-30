import { RunForm } from "@/components/forms/run-form";
import { Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";

export default function NewRunPage() {
  return (
    <PageShell className="max-w-4xl">
      <SectionHeading
        title="Confier une mission"
        description="Choisissez un agent, décrivez le résultat attendu et ajoutez les fichiers nécessaires."
      />
      <Card>
        <CardSurface>
          <RunForm />
        </CardSurface>
      </Card>
    </PageShell>
  );
}
