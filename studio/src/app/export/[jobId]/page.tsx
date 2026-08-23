import { notFound } from "next/navigation";
import { ExportConfirmationClient } from "./ExportConfirmationClient";

interface ExportPageProps {
  params: Promise<{ jobId: string }>;
}

export default async function ExportPage({ params }: ExportPageProps) {
  const { jobId } = await params;
  if (!jobId) notFound();
  return <ExportConfirmationClient jobId={jobId} />;
}
