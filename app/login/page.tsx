"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const supabase = createSupabaseBrowserClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      setBusy(false);
      if (error) {
        setMessage(error.message);
        return;
      }

      if (data.session) {
        router.push("/onboarding");
        router.refresh();
        return;
      }

      setMessage("Controleer je e-mail om je account te bevestigen. Daarna kun je verder.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (error) {
      setMessage("Inloggen lukte niet. Controleer je e-mailadres en wachtwoord.");
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand-link" href="/">AI Bedrijfsadministratie</Link>
        <div className="eyebrow">Veilig bedrijfsaccount</div>
        <h1>{mode === "login" ? "Welkom terug" : "Maak je account aan"}</h1>
        <p className="muted">
          {mode === "login"
            ? "Log in om verder te gaan met je bedrijfsadministratie."
            : "Start met je bedrijfsprofiel. We vragen alleen gegevens die nodig zijn voor je administratie."}
        </p>

        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">E-mailadres</label>
            <input className="input" id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Wachtwoord</label>
            <input className="input" id="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
            {mode === "signup" ? <div className="info">Gebruik minstens 8 tekens.</div> : null}
          </div>

          {message ? <div className="notice" role="status">{message}</div> : null}

          <button className="button" type="submit" disabled={busy}>
            {busy ? "Even controleren..." : mode === "login" ? "Inloggen" : "Account aanmaken"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login" ? "Nog geen account?" : "Heb je al een account?"}
          <button type="button" className="text-button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(null); }}>
            {mode === "login" ? "Account aanmaken" : "Inloggen"}
          </button>
        </div>

        <p className="privacy-note">We behandelen bedrijfsdata als gevoelige informatie en bouwen toegang per bedrijf afgeschermd op.</p>
      </section>
    </main>
  );
}
