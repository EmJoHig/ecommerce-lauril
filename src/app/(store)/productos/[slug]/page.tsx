import { permanentRedirect } from "next/navigation";

export default async function LegacyProductPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; permanentRedirect(`/producto/${slug}`); }
