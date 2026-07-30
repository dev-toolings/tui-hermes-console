import { RunScreen } from "@/components/run/run-screen";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <RunScreen runId={sessionId} surface="chat" />;
}
