import DuplicateResolutionButton from "@/app/facturen/[invoiceId]/duplicate-resolution-button";

export default function DuplicateResolutionFixturePage() {
  return (
    <main style={{ padding: 24 }}>
      <DuplicateResolutionButton invoiceId="invoice-duplicate-resolution-test" distinct />
    </main>
  );
}
