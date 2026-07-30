import { notFound } from "next/navigation";
import { AgentRepositoryError, getAgent } from "@/modules/agents/repository";
import { AgentDetailClient } from "./agent-detail-client";

export default async function AgentPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  try {
    const agent = await getAgent(agentId);
    return <AgentDetailClient agent={agent} />;
  } catch (error) {
    if (error instanceof AgentRepositoryError && error.code === "AGENT_NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
