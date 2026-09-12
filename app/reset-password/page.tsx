"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (password.length < 8) {
      setMessage("Gebruik een wachtwoord van minstens 8 tekens.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("De twee wachtwoorden zijn niet hetzelfde. Controleer ze en probeer opnieuw.");
      return;
    }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage("We konden je wachtwoord niet veilig wijzigen. Open de resetlink opnieuw of vraag een nieuwe link aan.");
      return;
    }

    router.push("/onboarding?password=updated");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand-link" href="/">AI Bedrijfsadministratie</Link>
        <div className="eyebrow">Accountbeveiliging</div>
        <h1>Kies een nieuw wachtwoord</h1>
        <p className="muted">
          Deze pagina werkt alleen nadat je de persoonlijke resetlink uit je e-mail hebt geopend.
        </p>

        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="password">Nieuw wachtwoord</label>
            <input
              className="input"
              id="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <div className="info">Gebruik minstens 8 tekens en kies iets dat je niet op andere websites gebruikt.</div>
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Herhaal je nieuwe wachtwoord</label>
            <input
              className="input"
              id="confirmPassword"
              type="password"
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
            <div className="info">Dit is alleen een controle zodat je geen typefout opslaat.</div>
          </div>

          {message ? <div className="notice" role="status">{message}</div> : null}

          <button className="button" type="submit" disabled={busy}>
            {busy ? "Wachtwoord veilig wijzigen..." : "Nieuw wachtwoord opslaan"}
          </button>
        </form>

        <p className="privacy-note">
          Een resetlink geeft tijdelijk toegang tot deze beveiligde stap. Deel die link niet met anderen.
        </p>
      </section>
    </main>
  );
}
