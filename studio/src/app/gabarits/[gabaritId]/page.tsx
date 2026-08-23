import { notFound } from "next/navigation";
import { GABARITS } from "@/components/gabarits/registry";
import { GabaritPreviewClient } from "./GabaritPreviewClient";

interface GabaritPreviewPageProps {
  params: Promise<{ gabaritId: string }>;
}

export default async function GabaritPreviewPage({ params }: GabaritPreviewPageProps) {
  const { gabaritId } = await params;
  if (!GABARITS[gabaritId]) notFound();
  return <GabaritPreviewClient gabaritId={gabaritId} />;
}
