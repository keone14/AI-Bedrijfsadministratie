"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "recovery">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const supabase = createSupabaseBrowserClient();

    if (mode === "recovery") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });

      setBusy(false);
      if (error) {
        setMessage("We konden de resetmail nu niet versturen. Probeer later opnieuw.");
        return;
      }

      setMessage("Als er een account met dit e-mailadres bestaat, ontvang je een persoonlijke resetlink. Controleer ook je spammap.");
      return;
    }

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
        setMessage("Account aanmaken lukte niet. Controleer je gegevens en probeer opnieuw.");
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

  const title = mode === "login" ? "Welkom terug" : mode === "signup" ? "Maak je account aan" : "Wachtwoord vergeten?";

  return (
    <main className="auth-page">
      <section className="auth-card">
        <Link className="brand-link" href="/">AI Bedrijfsadministratie</Link>
        <div className="eyebrow">Veilig bedrijfsaccount</div>
        <h1>{title}</h1>
        <p className="muted">
          {mode === "login"
            ? "Log in om verder te gaan met je bedrijfsadministratie."
            : mode === "signup"
              ? "Start met je bedrijfsprofiel. We vragen alleen gegevens die nodig zijn voor je administratie."
              : "Vul je e-mailadres in. Als daar een account bij hoort, sturen we een persoonlijke link waarmee je een nieuw wachtwoord kunt kiezen."}
        </p>

        <form className="form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">E-mailadres</label>
            <input className="input" id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {mode === "recovery" ? <div className="info">We zeggen bewust niet of een e-mailadres wel of niet geregistreerd is. Zo kan niemand accounts opzoeken.</div> : null}
          </div>

          {mode !== "recovery" ? (
            <div className="field">
              <label htmlFor="password">Wachtwoord</label>
              <input className="input" id="password" type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required />
              {mode === "signup" ? <div className="info">Gebruik minstens 8 tekens en liefst een uniek wachtwoord dat je nergens anders gebruikt.</div> : null}
              {mode === "login" ? <button type="button" className="text-button align-left" onClick={() => { setMode("recovery"); setPassword(""); setMessage(null); }}>Wachtwoord vergeten?</button> : null}
            </div>
          ) : null}

          {message ? <div className="notice" role="status">{message}</div> : null}

          <button className="button" type="submit" disabled={busy}>
            {busy
              ? "Even controleren..."
              : mode === "login"
                ? "Inloggen"
                : mode === "signup"
                  ? "Account aanmaken"
                  : "Stuur resetlink"}
          </button>
        </form>

        <div className="auth-switch">
          {mode === "login" ? (
            <>
              Nog geen account?
              <button type="button" className="text-button" onClick={() => { setMode("signup"); setMessage(null); }}>Account aanmaken</button>
            </>
          ) : (
            <>
              {mode === "signup" ? "Heb je al een account?" : "Weet je je wachtwoord weer?"}
              <button type="button" className="text-button" onClick={() => { setMode("login"); setMessage(null); }}>Inloggen</button>
            </>
          )}
        </div>

        <p className="privacy-note">We behandelen bedrijfsdata als gevoelige informatie en bouwen toegang per bedrijf afgeschermd op.</p>
      </section>
    </main>
  );
}
