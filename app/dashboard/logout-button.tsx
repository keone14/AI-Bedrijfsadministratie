"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      setBusy(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <button className="button secondary" type="button" onClick={signOut} disabled={busy}>
      {busy ? "Uitloggen..." : "Uitloggen"}
    </button>
  );
}
