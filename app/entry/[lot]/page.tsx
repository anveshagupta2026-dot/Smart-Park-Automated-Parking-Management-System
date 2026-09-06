import { SmartPark } from "@/components/smart-park"

export default async function EntryPage({ params }: { params: Promise<{ lot: string }> }) {
  const { lot } = await params
  return <SmartPark lotId={lot} />
}
