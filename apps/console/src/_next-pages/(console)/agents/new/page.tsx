import { AgentForm } from "@/components/forms/agent-form";
import { Card, CardSurface, PageShell, SectionHeading } from "@/components/ui/boardui";

export default function NewAgentPage() {
  return (
    <PageShell className="max-w-4xl">
      <SectionHeading
        title="Définir un agent"
        description="La configuration appartient à Hermes Console. Elle sera injectée dans le prompt système lors du lancement."
      />
      <Card>
        <CardSurface>
          <AgentForm />
        </CardSurface>
      </Card>
    </PageShell>
  );
}
